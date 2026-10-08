import { Team, Match, User, ModalityType } from '../types';
import { DEFAULT_OFFICIAL_SUBADMINS } from './constants';
import { EMBLEM_PRESETS } from './emblems';
import { saveImageToIndexedDb, imageMemoryCache, getAllImagesFromIndexedDb } from './indexedDbStorage';
import initialTournamentJson from '../../data/tournament.json';
import {
  sorteioAleatorio,
  resetChaveamento,
  limparChaveamento,
  propagateBracketWinners,
  exportBracketTreeAsJson,
} from './bracketGenerator';

export {
  sorteioAleatorio,
  resetChaveamento,
  limparChaveamento,
  propagateBracketWinners,
  exportBracketTreeAsJson,
};

const STORAGE_KEYS = {
  USER: 'interclasse_user',
  TEAMS: 'interclasse_teams_v3',
  MATCHES: 'interclasse_matches_v2',
  DELETED_TEAMS: 'interclasse_deleted_team_ids_v1',
};

export const getDeletedTeamIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_TEAMS);
    if (!raw) return new Set<string>();
    const parsed: string[] = JSON.parse(raw);
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
};

export const markTeamAsDeleted = (teamId: string) => {
  try {
    const ids = getDeletedTeamIds();
    ids.add(teamId);
    localStorage.setItem(STORAGE_KEYS.DELETED_TEAMS, JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.warn('Error saving deleted team id:', err);
  }
};

export const unmarkTeamAsDeleted = (teamId: string) => {
  try {
    const ids = getDeletedTeamIds();
    ids.delete(teamId);
    localStorage.setItem(STORAGE_KEYS.DELETED_TEAMS, JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.warn('Error unmarking deleted team id:', err);
  }
};

export const clearDeletedTeamIds = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.DELETED_TEAMS);
  } catch (err) {
    console.warn('Error clearing deleted team ids:', err);
  }
};

export const filterDeletedTeams = (teams: Team[]): Team[] => {
  const deletedIds = getDeletedTeamIds();
  if (deletedIds.size === 0) return teams;
  return teams.filter((t) => !deletedIds.has(t.id));
};

// Initial Seed Data from tournament.json
const DEFAULT_TEAMS: Team[] = ((initialTournamentJson as any)?.teams as Team[]) || [];
const DEFAULT_MATCHES: Match[] = ((initialTournamentJson as any)?.matches as Match[]) || [];

export const getStoredUser = (): User | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: User | null) => {
  if (user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.USER);
  }
};

export const getStoredTeams = (): Team[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.TEAMS);
    if (!data) {
      // Check legacy teams key
      const legacyData = localStorage.getItem('interclasse_teams');
      if (legacyData) {
        const parsedLegacy: any[] = JSON.parse(legacyData);
        const upgraded: Team[] = parsedLegacy.map((t) => ({
          ...t,
          modality: t.modality === 'futsal' ? 'futsal_masc' : t.modality === 'volei' ? 'volei_misto' : t.modality,
          players: t.players || [],
        }));
        setStoredTeams(upgraded);
        return upgraded;
      }
      setStoredTeams(DEFAULT_TEAMS);
      return DEFAULT_TEAMS;
    }
    const parsed: Team[] = JSON.parse(data);

    // 1. Clean any legacy 'idb://' invalid URLs by checking memory cache or restoring safe state
    const normalized: Team[] = parsed.map((t) => {
      if (t.imageUrl && t.imageUrl.startsWith('idb://')) {
        const cached = imageMemoryCache.get(t.id);
        return {
          ...t,
          imageUrl: cached || undefined,
        };
      }
      if (t.imageUrl && !imageMemoryCache.has(t.id)) {
        imageMemoryCache.set(t.id, t.imageUrl);
      }
      return t;
    });

    const activeTeams = filterDeletedTeams(normalized);

    // 2. Strict rule for Futsal Feminino: Exactly 2 teams (Disputa Direta em Ida e Volta)
    const femTeams = activeTeams.filter((t) => t.modality === 'futsal_fem');
    if (femTeams.length > 2) {
      const allowedFemIds = new Set(femTeams.slice(0, 2).map((t) => t.id));
      const cleaned = activeTeams.filter((t) => t.modality !== 'futsal_fem' || allowedFemIds.has(t.id));
      setStoredTeams(cleaned);
      return cleaned;
    }

    return activeTeams;
  } catch {
    return DEFAULT_TEAMS;
  }
};

export const setStoredTeams = (teams: Team[]) => {
  // 1. Immediately cache and persist images to high-capacity IndexedDB memory cache
  if (typeof window !== 'undefined') {
    teams.forEach((t) => {
      if (t.imageUrl && t.imageUrl.length > 0 && !t.imageUrl.startsWith('idb://')) {
        imageMemoryCache.set(t.id, t.imageUrl);
        saveImageToIndexedDb(t.id, t.imageUrl).catch(() => {});
      }
    });
  }

  // 2. Safely persist to localStorage with quota protection (never using broken idb:// schemes)
  try {
    localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams));
  } catch (err) {
    console.warn('LocalStorage quota limit detected! Preserving images in IndexedDB and optimizing localStorage copy.', err);
    try {
      const safeTeams = teams.map((t) => {
        if (t.imageUrl && t.imageUrl.length > 5000) {
          return {
            ...t,
            imageUrl: undefined, // Will be hydrated seamlessly from IndexedDB/Supabase on load
          };
        }
        return t;
      });
      localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(safeTeams));
    } catch (innerErr) {
      console.error('Critical LocalStorage Error', innerErr);
    }
  }
};

/**
 * Force manual save of all application state into IndexedDB, localStorage and Memory Cache.
 */
export const forceSaveAllData = async (teams: Team[], matches: Match[], user?: User | null) => {
  let imagesSavedCount = 0;
  // 1. Flush all images to IndexedDB and cache
  if (typeof window !== 'undefined') {
    for (const t of teams) {
      if (t.imageUrl && t.imageUrl.length > 0 && !t.imageUrl.startsWith('idb://')) {
        imageMemoryCache.set(t.id, t.imageUrl);
        await saveImageToIndexedDb(t.id, t.imageUrl);
        imagesSavedCount++;
      }
    }
  }

  // 2. Persist teams
  setStoredTeams(teams);

  // 3. Persist matches
  setStoredMatches(matches);

  // 4. Persist user if logged in
  if (user) {
    setStoredUser(user);
  }

  return {
    success: true,
    teamsCount: teams.length,
    imagesCount: imagesSavedCount,
    timestamp: new Date().toLocaleTimeString(),
  };
};

/**
 * Generates and downloads a complete standalone JSON backup containing all teams,
 * players, full-resolution images, matches, scores, and settings.
 */
export const exportFullBackup = async (teams: Team[], matches: Match[]) => {
  const images = await getAllImagesFromIndexedDb();

  const fullTeams = teams.map((t) => ({
    ...t,
    imageUrl: t.imageUrl || images[t.id] || imageMemoryCache.get(t.id) || undefined,
  }));

  const backupData = {
    version: '2.0',
    appName: 'Torneio Interclasse 2026',
    exportDate: new Date().toISOString(),
    teams: fullTeams,
    matches,
    subadmins: (() => {
      try {
        const d = localStorage.getItem('interclasse_subadmins');
        return d ? JSON.parse(d) : DEFAULT_OFFICIAL_SUBADMINS;
      } catch {
        return DEFAULT_OFFICIAL_SUBADMINS;
      }
    })(),
    imagesMap: images,
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_interclasse_completo_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Restores all teams, custom high-resolution images, and tournament matches from a JSON backup file.
 */
export const importFullBackup = async (
  jsonString: string,
  onSuccess: (teams: Team[], matches: Match[]) => void
) => {
  try {
    const data = JSON.parse(jsonString);
    if (!data.teams || !Array.isArray(data.teams)) {
      throw new Error('Arquivo de backup inválido: lista de equipes ausente.');
    }

    const importedTeams: Team[] = data.teams;
    const importedMatches: Match[] = Array.isArray(data.matches) ? data.matches : [];

    // Hydrate all team images to IndexedDB and memory cache
    for (const t of importedTeams) {
      if (t.imageUrl && (t.imageUrl.startsWith('data:') || t.imageUrl.startsWith('http'))) {
        imageMemoryCache.set(t.id, t.imageUrl);
        await saveImageToIndexedDb(t.id, t.imageUrl);
      }
    }

    if (data.imagesMap && typeof data.imagesMap === 'object') {
      for (const [id, url] of Object.entries(data.imagesMap)) {
        if (typeof url === 'string') {
          imageMemoryCache.set(id, url);
          await saveImageToIndexedDb(id, url);
        }
      }
    }

    if (data.subadmins && Array.isArray(data.subadmins)) {
      localStorage.setItem('interclasse_subadmins', JSON.stringify(data.subadmins));
    }

    setStoredTeams(importedTeams);
    setStoredMatches(importedMatches);

    onSuccess(importedTeams, importedMatches);
    return true;
  } catch (err) {
    console.error('Falha ao restaurar backup:', err);
    throw err;
  }
};

const autoResolveByes = (matches: Match[], teams: Team[]): Match[] => {
  return propagateBracketWinners(matches, teams);
};

export const generateDoubleEliminationBracket = (teams: Team[]): Match[] => {
  const modality = 'tenis_mesa_fem';
  const modalityTeams = teams.filter((t) => t.modality === modality);
  if (modalityTeams.length < 2) return [];

  const shuffled = [...modalityTeams].sort(() => Math.random() - 0.5);
  const N = shuffled.length;
  const timestamp = Date.now();

  const getDisplayName = (team?: Team) => {
    if (!team) return 'A definir';
    if (team.playerClass && team.playerName) {
      return `${team.playerName} (${team.playerClass})`;
    }
    return team.name;
  };

  const matches: Match[] = [];

  if (N <= 2) {
    // 2-player Double Elimination
    matches.push({
      id: `match_tm_fem_w1_${timestamp}`,
      modality,
      roundName: 'Final da Chave Superior',
      roundIndex: 1,
      matchNumber: 1,
      teamAId: shuffled[0]?.id,
      teamAName: getDisplayName(shuffled[0]),
      teamBId: shuffled[1]?.id,
      teamBName: getDisplayName(shuffled[1]),
      nextMatchId: `match_tm_fem_f1_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_f1_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_f1_${timestamp}`,
      modality,
      roundName: 'Grande Final',
      roundIndex: 2,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f2_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'grand_final',
    });

    matches.push({
      id: `match_tm_fem_f2_${timestamp}`,
      modality,
      roundName: 'Grande Final (Jogo de Desempate)',
      roundIndex: 3,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      bracketType: 'grand_final',
      isResetMatch: true,
      isActive: false,
    });
  } else if (N <= 4) {
    // 4-player Double Elimination
    const T0 = shuffled[0];
    const T1 = shuffled[1];
    const T2 = shuffled[2];
    const T3 = shuffled[3];

    matches.push({
      id: `match_tm_fem_w1_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Semifinal 1',
      roundIndex: 1,
      matchNumber: 1,
      teamAId: T0?.id,
      teamAName: getDisplayName(T0),
      teamBId: T1?.id,
      teamBName: getDisplayName(T1),
      nextMatchId: `match_tm_fem_w3_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l1_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w2_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Semifinal 2',
      roundIndex: 1,
      matchNumber: 2,
      teamAId: T2?.id,
      teamAName: getDisplayName(T2),
      teamBId: T3?.id,
      teamBName: getDisplayName(T3),
      nextMatchId: `match_tm_fem_w3_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l1_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w3_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Final',
      roundIndex: 2,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f1_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l2_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_l1_${timestamp}`,
      modality,
      roundName: 'Repescagem - Semifinal',
      roundIndex: 3,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l2_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l2_${timestamp}`,
      modality,
      roundName: 'Repescagem - Final',
      roundIndex: 4,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f1_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_f1_${timestamp}`,
      modality,
      roundName: 'Grande Final',
      roundIndex: 5,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f2_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'grand_final',
    });

    matches.push({
      id: `match_tm_fem_f2_${timestamp}`,
      modality,
      roundName: 'Grande Final (Jogo de Desempate)',
      roundIndex: 6,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      bracketType: 'grand_final',
      isResetMatch: true,
      isActive: false,
    });
  } else if (N <= 8) {
    // 8-player Double Elimination
    const padded = [...shuffled];
    while (padded.length < 8) {
      padded.push(undefined as any);
    }

    matches.push({
      id: `match_tm_fem_w1_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 1',
      roundIndex: 1,
      matchNumber: 1,
      teamAId: padded[0]?.id,
      teamAName: getDisplayName(padded[0]),
      teamBId: padded[1]?.id,
      teamBName: getDisplayName(padded[1]),
      nextMatchId: `match_tm_fem_w5_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l1_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w2_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 2',
      roundIndex: 1,
      matchNumber: 2,
      teamAId: padded[2]?.id,
      teamAName: getDisplayName(padded[2]),
      teamBId: padded[3]?.id,
      teamBName: getDisplayName(padded[3]),
      nextMatchId: `match_tm_fem_w5_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l1_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w3_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 3',
      roundIndex: 1,
      matchNumber: 3,
      teamAId: padded[4]?.id,
      teamAName: getDisplayName(padded[4]),
      teamBId: padded[5]?.id,
      teamBName: getDisplayName(padded[5]),
      nextMatchId: `match_tm_fem_w6_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l2_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w4_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 4',
      roundIndex: 1,
      matchNumber: 4,
      teamAId: padded[6]?.id,
      teamAName: getDisplayName(padded[6]),
      teamBId: padded[7]?.id,
      teamBName: getDisplayName(padded[7]),
      nextMatchId: `match_tm_fem_w6_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l2_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w5_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Semifinal 1',
      roundIndex: 2,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w7_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l3_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w6_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Semifinal 2',
      roundIndex: 2,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w7_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l4_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w7_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Final',
      roundIndex: 3,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f1_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l6_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_l1_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 1 - Jogo 1',
      roundIndex: 4,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l3_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l2_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 1 - Jogo 2',
      roundIndex: 4,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l4_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l3_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 2 - Jogo 1',
      roundIndex: 5,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l5_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l4_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 2 - Jogo 2',
      roundIndex: 5,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l5_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l5_${timestamp}`,
      modality,
      roundName: 'Repescagem - Semifinal',
      roundIndex: 6,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l6_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l6_${timestamp}`,
      modality,
      roundName: 'Repescagem - Final',
      roundIndex: 7,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f1_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_f1_${timestamp}`,
      modality,
      roundName: 'Grande Final',
      roundIndex: 8,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f2_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'grand_final',
    });

    matches.push({
      id: `match_tm_fem_f2_${timestamp}`,
      modality,
      roundName: 'Grande Final (Jogo de Desempate)',
      roundIndex: 9,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      bracketType: 'grand_final',
      isResetMatch: true,
      isActive: false,
    });
  } else {
    // 16-player Double Elimination
    const padded = [...shuffled];
    while (padded.length < 16) {
      padded.push(undefined as any);
    }

    // Winners - Round 1 (roundIndex: 1)
    matches.push({
      id: `match_tm_fem_w1_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 1',
      roundIndex: 1,
      matchNumber: 1,
      teamAId: padded[0]?.id,
      teamAName: getDisplayName(padded[0]),
      teamBId: padded[1]?.id,
      teamBName: getDisplayName(padded[1]),
      nextMatchId: `match_tm_fem_w9_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l1_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w2_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 2',
      roundIndex: 1,
      matchNumber: 2,
      teamAId: padded[2]?.id,
      teamAName: getDisplayName(padded[2]),
      teamBId: padded[3]?.id,
      teamBName: getDisplayName(padded[3]),
      nextMatchId: `match_tm_fem_w9_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l1_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w3_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 3',
      roundIndex: 1,
      matchNumber: 3,
      teamAId: padded[4]?.id,
      teamAName: getDisplayName(padded[4]),
      teamBId: padded[5]?.id,
      teamBName: getDisplayName(padded[5]),
      nextMatchId: `match_tm_fem_w10_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l2_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w4_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 4',
      roundIndex: 1,
      matchNumber: 4,
      teamAId: padded[6]?.id,
      teamAName: getDisplayName(padded[6]),
      teamBId: padded[7]?.id,
      teamBName: getDisplayName(padded[7]),
      nextMatchId: `match_tm_fem_w10_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l2_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w5_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 5',
      roundIndex: 1,
      matchNumber: 5,
      teamAId: padded[8]?.id,
      teamAName: getDisplayName(padded[8]),
      teamBId: padded[9]?.id,
      teamBName: getDisplayName(padded[9]),
      nextMatchId: `match_tm_fem_w11_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l3_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w6_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 6',
      roundIndex: 1,
      matchNumber: 6,
      teamAId: padded[10]?.id,
      teamAName: getDisplayName(padded[10]),
      teamBId: padded[11]?.id,
      teamBName: getDisplayName(padded[11]),
      nextMatchId: `match_tm_fem_w11_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l3_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w7_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 7',
      roundIndex: 1,
      matchNumber: 7,
      teamAId: padded[12]?.id,
      teamAName: getDisplayName(padded[12]),
      teamBId: padded[13]?.id,
      teamBName: getDisplayName(padded[13]),
      nextMatchId: `match_tm_fem_w12_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l4_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w8_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Oitavas 8',
      roundIndex: 1,
      matchNumber: 8,
      teamAId: padded[14]?.id,
      teamAName: getDisplayName(padded[14]),
      teamBId: padded[15]?.id,
      teamBName: getDisplayName(padded[15]),
      nextMatchId: `match_tm_fem_w12_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l4_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    // Winners - Round 2 (roundIndex: 2)
    matches.push({
      id: `match_tm_fem_w9_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 1',
      roundIndex: 2,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w13_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l5_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w10_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 2',
      roundIndex: 2,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w13_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l6_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w11_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 3',
      roundIndex: 2,
      matchNumber: 3,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w14_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l7_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w12_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Quartas 4',
      roundIndex: 2,
      matchNumber: 4,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w14_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l8_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    // Winners - Round 3 (roundIndex: 3)
    matches.push({
      id: `match_tm_fem_w13_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Semifinal 1',
      roundIndex: 3,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w15_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l11_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    matches.push({
      id: `match_tm_fem_w14_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Semifinal 2',
      roundIndex: 3,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_w15_${timestamp}`,
      nextMatchSlot: 'B',
      loserNextMatchId: `match_tm_fem_l12_${timestamp}`,
      loserNextMatchSlot: 'B',
      bracketType: 'winners',
    });

    // Winners - Round 4 (roundIndex: 4) - Final da Chave Superior
    matches.push({
      id: `match_tm_fem_w15_${timestamp}`,
      modality,
      roundName: 'Chave Superior - Final',
      roundIndex: 4,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f1_${timestamp}`,
      nextMatchSlot: 'A',
      loserNextMatchId: `match_tm_fem_l14_${timestamp}`,
      loserNextMatchSlot: 'A',
      bracketType: 'winners',
    });

    // Losers - Round 1 (roundIndex: 5)
    matches.push({
      id: `match_tm_fem_l1_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 1 - Jogo 1',
      roundIndex: 5,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l5_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l2_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 1 - Jogo 2',
      roundIndex: 5,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l6_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l3_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 1 - Jogo 3',
      roundIndex: 5,
      matchNumber: 3,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l7_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l4_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 1 - Jogo 4',
      roundIndex: 5,
      matchNumber: 4,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l8_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    // Losers - Round 2 (roundIndex: 6)
    matches.push({
      id: `match_tm_fem_l5_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 2 - Jogo 1',
      roundIndex: 6,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l9_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l6_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 2 - Jogo 2',
      roundIndex: 6,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l9_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l7_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 2 - Jogo 3',
      roundIndex: 6,
      matchNumber: 3,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l10_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l8_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 2 - Jogo 4',
      roundIndex: 6,
      matchNumber: 4,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l10_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    // Losers - Round 3 (roundIndex: 7)
    matches.push({
      id: `match_tm_fem_l9_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 3 - Jogo 1',
      roundIndex: 7,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l11_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l10_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 3 - Jogo 2',
      roundIndex: 7,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l12_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    // Losers - Round 4 (roundIndex: 8)
    matches.push({
      id: `match_tm_fem_l11_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 4 - Jogo 1',
      roundIndex: 8,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l13_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'losers',
    });

    matches.push({
      id: `match_tm_fem_l12_${timestamp}`,
      modality,
      roundName: 'Repescagem - Rodada 4 - Jogo 2',
      roundIndex: 8,
      matchNumber: 2,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l13_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    // Losers - Round 5 (roundIndex: 9) - Semifinal da Repescagem
    matches.push({
      id: `match_tm_fem_l13_${timestamp}`,
      modality,
      roundName: 'Repescagem - Semifinal',
      roundIndex: 9,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_l14_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    // Losers - Round 6 (roundIndex: 10) - Final da Repescagem
    matches.push({
      id: `match_tm_fem_l14_${timestamp}`,
      modality,
      roundName: 'Repescagem - Final',
      roundIndex: 10,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f1_${timestamp}`,
      nextMatchSlot: 'B',
      bracketType: 'losers',
    });

    // Grande Final (roundIndex: 11)
    matches.push({
      id: `match_tm_fem_f1_${timestamp}`,
      modality,
      roundName: 'Grande Final',
      roundIndex: 11,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      nextMatchId: `match_tm_fem_f2_${timestamp}`,
      nextMatchSlot: 'A',
      bracketType: 'grand_final',
    });

    // Grande Final - Jogo de Desempate (roundIndex: 12)
    matches.push({
      id: `match_tm_fem_f2_${timestamp}`,
      modality,
      roundName: 'Grande Final (Jogo de Desempate)',
      roundIndex: 12,
      matchNumber: 1,
      teamAName: 'A definir',
      teamBName: 'A definir',
      bracketType: 'grand_final',
      isResetMatch: true,
      isActive: false,
    });
  }

  return autoResolveByes(matches, modalityTeams);
};

export const getStoredMatches = (): Match[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.MATCHES);
    if (!data) {
      if (DEFAULT_MATCHES.length > 0) {
        setStoredMatches(DEFAULT_MATCHES);
        return DEFAULT_MATCHES;
      }
      // Generate initial brackets for default teams (all normal knockout)
      const allMatches: Match[] = [];
      const modalities: ModalityType[] = [
        'futsal_masc',
        'futsal_fem',
        'volei_misto',
        'tenis_mesa_masc',
        'tenis_mesa_fem',
      ];
      modalities.forEach((mod) => {
        const matchesForMod = generateAutomaticBracket(mod, DEFAULT_TEAMS);
        allMatches.push(...matchesForMod);
      });
      setStoredMatches(allMatches);
      return allMatches;
    }
    const parsed: Match[] = JSON.parse(data);

    // Migration check 1: Enforce strictly 2 matches for futsal_fem (Jogo de Ida e Jogo de Volta)
    const femMatches = parsed.filter((m) => m.modality === 'futsal_fem');
    const isInvalidFemMatches =
      femMatches.length !== 2 ||
      femMatches.some(
        (m) =>
          m.roundName.includes('Semifinal') ||
          m.roundName.includes('Quartas') ||
          m.roundName.includes('Rodada') ||
          m.id.includes('_r1_') ||
          m.id.includes('_r2_')
      );

    if (isInvalidFemMatches) {
      const currentTeams = getStoredTeams();
      const newFemMatches = generateFutsalFemFinalIdaEVolta(currentTeams);
      const migrated = [
        ...parsed.filter((m) => m.modality !== 'futsal_fem'),
        ...newFemMatches,
      ];
      setStoredMatches(migrated);
      return migrated;
    }

    // Migration check 2: If tenis_mesa_fem has old double elimination matches, migrate to normal mata-mata
    const hasOldDoubleElimTmFem = parsed.some(
      (m) => m.modality === 'tenis_mesa_fem' && (m.bracketType === 'losers' || m.isResetMatch)
    );
    if (hasOldDoubleElimTmFem) {
      const currentTeams = getStoredTeams();
      const newTmFemMatches = generateAutomaticBracket('tenis_mesa_fem', currentTeams);
      const migrated = [
        ...parsed.filter((m) => m.modality !== 'tenis_mesa_fem'),
        ...newTmFemMatches,
      ];
      setStoredMatches(migrated);
      return migrated;
    }

    // Migration check 3: Strip trailing numbers from round names (e.g. "Quartas de Final 1" -> "Quartas de Final")
    let hasCleanedNames = false;
    const sanitized = parsed.map((m) => {
      if (m.roundName && /\s+\d+$/.test(m.roundName) && !m.roundName.includes('Jogo de')) {
        hasCleanedNames = true;
        return {
          ...m,
          roundName: m.roundName.replace(/\s+\d+$/, '').trim(),
        };
      }
      return m;
    });

    if (hasCleanedNames) {
      setStoredMatches(sanitized);
      return sanitized;
    }

    const currentTeams = getStoredTeams();
    const cleanMatches = sanitizeFutsalFemMatches(parsed, currentTeams);
    return cleanMatches;
  } catch {
    return [];
  }
};

export const setStoredMatches = (matches: Match[]) => {
  localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(matches));
};

// Final Ida e Volta Generator for Futsal Feminino (2 Equipes Finalistas)
export const generateFutsalFemFinalIdaEVolta = (teams: Team[]): Match[] => {
  const modality = 'futsal_fem';
  const modalityTeams = teams.filter((t) => t.modality === modality);

  const teamA = modalityTeams[0];
  const teamB = modalityTeams[1] || modalityTeams[0];

  const getDisplayName = (team?: Team) => {
    if (!team) return 'A definir';
    return team.name;
  };

  const matches: Match[] = [
    {
      id: 'match_futsal_fem_ida_official',
      modality,
      roundName: 'Grande Final - Jogo de Ida',
      roundIndex: 1,
      matchNumber: 1,
      teamAId: teamA?.id,
      teamAName: getDisplayName(teamA),
      teamBId: teamB?.id,
      teamBName: getDisplayName(teamB),
      bracketType: 'grand_final',
      date: '14 de Outubro',
      time: '14:00',
      location: 'Quadra Central',
    },
    {
      id: 'match_futsal_fem_volta_official',
      modality,
      roundName: 'Grande Final - Jogo de Volta',
      roundIndex: 2,
      matchNumber: 2,
      teamAId: teamB?.id,
      teamAName: getDisplayName(teamB),
      teamBId: teamA?.id,
      teamBName: getDisplayName(teamA),
      bracketType: 'grand_final',
      date: '14 de Outubro',
      time: '15:30',
      location: 'Quadra Central',
    },
  ];

  return matches;
};

/**
 * Ensures futsal_fem matches array contains STRICTLY EXACTLY 2 matches (Jogo de Ida & Jogo de Volta),
 * purging any duplicate or old matches that accumulated.
 */
export const sanitizeFutsalFemMatches = (allMatches: Match[], teams: Team[]): Match[] => {
  const nonFemMatches = allMatches.filter((m) => m.modality !== 'futsal_fem');
  const femMatches = allMatches.filter((m) => m.modality === 'futsal_fem');

  if (femMatches.length === 0) {
    const generated = generateFutsalFemFinalIdaEVolta(teams);
    return [...nonFemMatches, ...generated];
  }

  const idaExisting = femMatches.find((m) => m.roundName?.includes('Ida')) || femMatches[0];
  const voltaExisting = femMatches.find((m) => m.roundName?.includes('Volta')) || femMatches[1] || femMatches[0];

  const femTeams = teams.filter((t) => t.modality === 'futsal_fem');
  const teamA = femTeams[0];
  const teamB = femTeams[1] || femTeams[0];

  const getDisplayName = (team?: Team) => (team ? team.name : 'A definir');

  const idaMatch: Match = {
    id: 'match_futsal_fem_ida_official',
    modality: 'futsal_fem',
    roundName: 'Grande Final - Jogo de Ida',
    roundIndex: 1,
    matchNumber: 1,
    teamAId: teamA?.id || idaExisting?.teamAId,
    teamAName: teamA ? teamA.name : idaExisting?.teamAName || 'A definir',
    teamBId: teamB?.id || idaExisting?.teamBId,
    teamBName: teamB ? teamB.name : idaExisting?.teamBName || 'A definir',
    scoreA: idaExisting?.scoreA,
    scoreB: idaExisting?.scoreB,
    winnerId: idaExisting?.winnerId,
    bracketType: 'grand_final',
    date: idaExisting?.date || '14 de Outubro',
    time: idaExisting?.time || '14:00',
    location: idaExisting?.location || 'Quadra Central',
  };

  const voltaMatch: Match = {
    id: 'match_futsal_fem_volta_official',
    modality: 'futsal_fem',
    roundName: 'Grande Final - Jogo de Volta',
    roundIndex: 2,
    matchNumber: 2,
    teamAId: teamB?.id || voltaExisting?.teamAId,
    teamAName: teamB ? teamB.name : voltaExisting?.teamAName || 'A definir',
    teamBId: teamA?.id || voltaExisting?.teamBId,
    teamBName: teamA ? teamA.name : voltaExisting?.teamBName || 'A definir',
    scoreA: voltaExisting?.scoreA,
    scoreB: voltaExisting?.scoreB,
    winnerId: voltaExisting?.winnerId,
    bracketType: 'grand_final',
    date: voltaExisting?.date || '14 de Outubro',
    time: voltaExisting?.time || '15:30',
    location: voltaExisting?.location || 'Quadra Central',
  };

  return [...nonFemMatches, idaMatch, voltaMatch];
};

// Automatic Tournament Bracket Generator with dynamic round capacity, Byes, and automatic advancement
export const generateAutomaticBracket = (modality: ModalityType, teams: Team[]): Match[] => {
  const modalityTeams = teams.filter((t) => t.modality === modality);
  if (modalityTeams.length < 2) return [];

  // If Futsal Feminino has exactly 2 teams, generate the two-legged final (Jogo de Ida e Volta)
  if (modality === 'futsal_fem' && modalityTeams.length === 2) {
    return generateFutsalFemFinalIdaEVolta(teams);
  }

  // All other modalities or futsal_fem with >2 teams: generate dynamic single-elimination bracket with Byes
  return sorteioAleatorio(modality, teams);
};

export const clearAllRegisteredTeams = async (): Promise<boolean> => {
  try {
    localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify([]));
    localStorage.removeItem('interclasse_teams');
    localStorage.removeItem('interclasse_matches');
    return true;
  } catch (err) {
    console.error('Error clearing registered teams', err);
    return false;
  }
};
