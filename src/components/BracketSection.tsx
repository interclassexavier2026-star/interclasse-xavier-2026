import React, { useState, useRef } from 'react';
import { Match, ModalityType, User, Team } from '../types';
import { MODALITY_CONFIGS } from '../utils/constants';
import { getFutsalFemFinalSummary } from '../utils/futsalFemUtils';
import { MatchupConfigModal } from './MatchupConfigModal';
import { downloadBackupJson, restoreBackupFromJson } from '../utils/jsonBackup';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Zap,
  Sparkles,
  Crown,
  Flame,
  Star,
  Clock,
  Shirt,
  Swords,
  School,
  ChevronLeft,
  ChevronRight,
  Layers,
  MapPin,
  CheckCircle2,
  Search,
  Pencil,
  Download,
  RotateCcw,
  Trash2,
  FileJson,
} from 'lucide-react';
import { exportBracketTreeAsJson } from '../utils/bracketGenerator';

interface BracketSectionProps {
  matches: Match[];
  teams: Team[];
  activeModality: ModalityType;
  user: User | null;
  theme?: 'light' | 'dark';
  onUpdateMatchScore: (
    matchId: string,
    scoreA: number,
    scoreB: number,
    overrideTeamAId?: string,
    overrideTeamBId?: string,
    overrideTeamAName?: string,
    overrideTeamBName?: string,
    penaltyWinnerId?: string,
    penaltyScoreA?: number,
    penaltyScoreB?: number
  ) => void;
  onGenerateBracket: () => void;
  onResetBracket?: () => void;
  onClearBracket?: () => void;
  onUpdateMatches?: (updatedMatches: Match[]) => void;
  onSelectSection?: (section: string) => void;
}

export const canEditMatchScore = (user: User | null, matchModality: ModalityType): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'subadmin') {
    if (user.allowedModality === 'futsal' && (matchModality === 'futsal_masc' || matchModality === 'futsal_fem')) {
      return true;
    }
    if (user.allowedModality === 'volei' && matchModality === 'volei_misto') {
      return true;
    }
    if (user.allowedModality === 'tenis_mesa' && (matchModality === 'tenis_mesa_masc' || matchModality === 'tenis_mesa_fem')) {
      return true;
    }
  }
  return false;
};

export const BracketSection: React.FC<BracketSectionProps> = ({
  matches,
  teams,
  activeModality,
  user,
  theme = 'dark',
  onUpdateMatchScore,
  onGenerateBracket,
  onResetBracket,
  onClearBracket,
  onUpdateMatches,
  onSelectSection,
}) => {
  const modalityConfig = MODALITY_CONFIGS[activeModality];
  const isDark = theme === 'dark';

  // Export structured bracket tree as JSON
  const handleExportTreeJson = () => {
    const treeData = exportBracketTreeAsJson(activeModality, matches, teams);
    const jsonStr = JSON.stringify(treeData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arvore_chaveamento_${activeModality}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // State for Matchup Config Modal
  const [isMatchupModalOpen, setIsMatchupModalOpen] = useState<boolean>(false);

  // Filters Embedded in Bracket
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  // Current modality matches before filters
  const modalityMatches = React.useMemo(() => {
    return matches.filter((m) => m.modality === activeModality);
  }, [matches, activeModality]);

  // Current modality teams
  const currentModalityTeams = React.useMemo(() => {
    return teams.filter((t) => t.modality === activeModality);
  }, [teams, activeModality]);

  // Unique rooms/classes for team modalities
  const roomOptions = React.useMemo(() => {
    const set = new Set<string>();
    currentModalityTeams.forEach((t) => {
      const room = t.playerClass || t.name;
      if (room) set.add(room.trim());
    });
    return Array.from(set).sort();
  }, [currentModalityTeams]);

  // Athlete options for individual modality (Tênis de Mesa)
  const athleteOptions = React.useMemo(() => {
    return currentModalityTeams
      .map((t) => ({
        id: t.id,
        name: t.playerName && t.playerClass ? `${t.playerName} (${t.playerClass})` : t.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [currentModalityTeams]);

  // Filtered matches based on mode and active selections
  const filteredMatches = React.useMemo(() => {
    let list = matches.filter((m) => m.modality === activeModality);
    list = list.filter((m) => !(m.isResetMatch && m.isActive === false));
    if (modalityConfig.isIndividual) {
      if (selectedTeamId) {
        list = list.filter(
          (m) => m.teamAId === selectedTeamId || m.teamBId === selectedTeamId
        );
      }
    } else {
      if (selectedRoom) {
        const matchingTeamIds = currentModalityTeams
          .filter((t) => (t.playerClass || t.name)?.trim() === selectedRoom.trim())
          .map((t) => t.id);
        list = list.filter(
          (m) =>
            (m.teamAId ? matchingTeamIds.includes(m.teamAId) : false) ||
            (m.teamBId ? matchingTeamIds.includes(m.teamBId) : false)
        );
      }
    }
    return list;
  }, [matches, activeModality, modalityConfig.isIndividual, selectedTeamId, selectedRoom, currentModalityTeams]);

  // Group matches by roundIndex
  const roundsMap = new Map<number, Match[]>();
  filteredMatches.forEach((m) => {
    const list = roundsMap.get(m.roundIndex) || [];
    list.push(m);
    roundsMap.set(m.roundIndex, list);
  });

  const sortedRoundIndices = Array.from(roundsMap.keys()).sort((a, b) => a - b);
  const maxRoundIndex = sortedRoundIndices.length > 0 ? Math.max(...sortedRoundIndices) : 1;

  // Helper to get normalized phase display name (ex: 64 avos, 32 avos, 16 avos, Oitavas, Quartas, Semifinal, Grande Final)
  const getPhaseDisplayName = (rIdx: number, sampleMatch?: Match): string => {
    if (sampleMatch?.roundName) {
      if (/64\s*avos/i.test(sampleMatch.roundName)) return '64 avos de Final';
      if (/32\s*avos/i.test(sampleMatch.roundName)) return '32 avos de Final';
      if (/16\s*avos/i.test(sampleMatch.roundName)) return '16 avos de Final';
      if (/oitavas/i.test(sampleMatch.roundName)) return 'Oitavas de Final';
      if (/quartas/i.test(sampleMatch.roundName)) return 'Quartas de Final';
      if (/semi/i.test(sampleMatch.roundName)) return 'Semifinal';
      if (/grande\s*final|final/i.test(sampleMatch.roundName)) return 'Grande Final';
    }
    const diff = maxRoundIndex - rIdx;
    if (diff === 0) return 'Grande Final';
    if (diff === 1) return 'Semifinal';
    if (diff === 2) return 'Quartas de Final';
    if (diff === 3) return 'Oitavas de Final';
    if (diff === 4) return '16 avos de Final';
    if (diff === 5) return '32 avos de Final';
    if (diff === 6) return '64 avos de Final';
    return `Fase ${rIdx}`;
  };

  // Double Elimination structured data grouping Winners, Losers and Grand Final
  const doubleEliminationData = React.useMemo(() => {
    if (activeModality !== 'tenis_mesa_fem') return null;

    const winners = filteredMatches.filter((m) => m.bracketType === 'winners');
    const winnersMap = new Map<number, Match[]>();
    winners.forEach((m) => {
      const list = winnersMap.get(m.roundIndex) || [];
      list.push(m);
      winnersMap.set(m.roundIndex, list);
    });
    const winnersIndices = Array.from(winnersMap.keys()).sort((a, b) => a - b);

    const losers = filteredMatches.filter((m) => m.bracketType === 'losers');
    const losersMap = new Map<number, Match[]>();
    losers.forEach((m) => {
      const list = losersMap.get(m.roundIndex) || [];
      list.push(m);
      losersMap.set(m.roundIndex, list);
    });
    const losersIndices = Array.from(losersMap.keys()).sort((a, b) => a - b);

    const grand = filteredMatches.filter((m) => m.bracketType === 'grand_final');
    const grandMap = new Map<number, Match[]>();
    grand.forEach((m) => {
      const list = grandMap.get(m.roundIndex) || [];
      list.push(m);
      grandMap.set(m.roundIndex, list);
    });
    const grandIndices = Array.from(grandMap.keys()).sort((a, b) => a - b);

    return {
      winners,
      winnersMap,
      winnersIndices,
      losers,
      losersMap,
      losersIndices,
      grand,
      grandMap,
      grandIndices,
    };
  }, [filteredMatches, activeModality]);

  // Selected phase state: 'all' or number (roundIndex) or 'winners' | 'losers' | 'grand_final'
  const [selectedPhase, setSelectedPhase] = useState<any>('all');

  // Futsal Feminino Ida e Volta Summary
  const futsalFemSummary = React.useMemo(() => {
    return getFutsalFemFinalSummary(teams, matches);
  }, [teams, matches]);

  // Reset filters and selected phase when modality changes
  React.useEffect(() => {
    setSelectedRoom('');
    setSelectedTeamId('');
    setSelectedPhase('all');
  }, [activeModality]);

  // Reference for horizontal scroll containers
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -380, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 380, behavior: 'smooth' });
    }
  };

  // Score Editor Modal State
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [editTeamAId, setEditTeamAId] = useState<string>('');
  const [editTeamBId, setEditTeamBId] = useState<string>('');
  const [penaltyWinnerId, setPenaltyWinnerId] = useState<string>('');
  const [penaltyScoreA, setPenaltyScoreA] = useState<number>(0);
  const [penaltyScoreB, setPenaltyScoreB] = useState<number>(0);

  const handleOpenScoreModal = (match: Match) => {
    if (!canEditMatchScore(user, match.modality)) return;
    setSelectedMatch(match);
    setScoreA(match.scoreA ?? (match.isBye && match.winnerId === match.teamAId ? 1 : 0));
    setScoreB(match.scoreB ?? (match.isBye && match.winnerId === match.teamBId ? 1 : 0));
    setEditTeamAId(match.teamAId || (match.teamAName === 'SEM OPONENTE' || match.teamAName === 'BYE' ? 'BYE' : ''));
    setEditTeamBId(match.teamBId || (match.teamBName === 'SEM OPONENTE' || match.teamBName === 'BYE' ? 'BYE' : ''));
    setPenaltyWinnerId(match.penaltyWinnerId || '');
    setPenaltyScoreA(match.penaltyScoreA ?? 0);
    setPenaltyScoreB(match.penaltyScoreB ?? 0);
  };

  const handleSaveScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatch) return;

    // Resolve overridden team names
    const teamA = teams.find((t) => t.id === editTeamAId);
    const teamB = teams.find((t) => t.id === editTeamBId);

    const teamAName = teamA
      ? (teamA.playerName && teamA.playerClass ? `${teamA.playerName} (${teamA.playerClass})` : teamA.name)
      : (editTeamAId === 'BYE' ? 'SEM OPONENTE' : 'A definir');

    const teamBName = teamB
      ? (teamB.playerName && teamB.playerClass ? `${teamB.playerName} (${teamB.playerClass})` : teamB.name)
      : (editTeamBId === 'BYE' ? 'SEM OPONENTE' : 'A definir');

    // In futsal, check tie in regular time or aggregate
    const isFutsal = selectedMatch.modality === 'futsal_masc' || selectedMatch.modality === 'futsal_fem';
    const isTie = scoreA === scoreB;

    let finalPenaltyWinnerId: string | undefined = undefined;
    let finalPenScoreA: number | undefined = undefined;
    let finalPenScoreB: number | undefined = undefined;

    if (isFutsal && isTie) {
      finalPenScoreA = penaltyScoreA;
      finalPenScoreB = penaltyScoreB;
      // Auto-assign penaltyWinnerId if penalty scores are unequal
      if (penaltyScoreA > penaltyScoreB && editTeamAId) {
        finalPenaltyWinnerId = editTeamAId;
      } else if (penaltyScoreB > penaltyScoreA && editTeamBId) {
        finalPenaltyWinnerId = editTeamBId;
      } else {
        finalPenaltyWinnerId = penaltyWinnerId || undefined;
      }
    } else if (isTie && penaltyWinnerId) {
      finalPenaltyWinnerId = penaltyWinnerId;
      finalPenScoreA = penaltyScoreA;
      finalPenScoreB = penaltyScoreB;
    }

    onUpdateMatchScore(
      selectedMatch.id,
      scoreA,
      scoreB,
      editTeamAId || undefined,
      editTeamBId || undefined,
      teamAName,
      teamBName,
      finalPenaltyWinnerId,
      finalPenScoreA,
      finalPenScoreB
    );
    setSelectedMatch(null);
  };

  // Helper to extract clear Team / Athlete Info with prominent Foto and Sala
  const getTeamInfo = (teamId?: string, fallbackName?: string) => {
    if (teamId) {
      const found = teams.find((t) => t.id === teamId);
      if (found) {
        // Table Tennis athlete
        if (found.playerName) {
          return {
            name: found.playerName,
            sala: found.playerClass || 'Sala não inf.',
            captain: undefined,
            imageUrl: found.imageUrl,
            shirtColor: found.shirtColor || '#0284c7',
            isDefined: true,
          };
        }
        // Team with playerClass
        if (found.playerClass) {
          return {
            name: found.name,
            sala: found.playerClass,
            captain: found.captain,
            imageUrl: found.imageUrl,
            shirtColor: found.shirtColor || '#0284c7',
            isDefined: true,
          };
        }
        // Team with regular name (e.g. "3º Ano A")
        return {
          name: found.name,
          sala: found.name, // Sala evidente
          captain: found.captain,
          imageUrl: found.imageUrl,
          shirtColor: found.shirtColor || '#0284c7',
          isDefined: true,
        };
      }
    }

    if (fallbackName && (fallbackName.toLowerCase().includes('jogo') || fallbackName.toLowerCase().includes('venc'))) {
      return {
        name: fallbackName,
        sala: fallbackName.toUpperCase().includes('JOGO') ? fallbackName.toUpperCase() : `CONFRONTO ${fallbackName}`,
        captain: undefined,
        imageUrl: undefined,
        shirtColor: '#1e293b',
        isDefined: false,
      };
    }

    const isPending =
      !fallbackName ||
      fallbackName.toLowerCase().startsWith('a definir');

    return {
      name: isPending ? 'A DEFINIR' : fallbackName,
      sala: isPending ? 'Aguardando' : fallbackName,
      captain: undefined,
      imageUrl: undefined,
      shirtColor: '#475569',
      isDefined: !isPending,
    };
  };

  // Find Champion if Final is decided
  const championTeam = React.useMemo(() => {
    if (activeModality === 'futsal_fem') {
      if (futsalFemSummary && futsalFemSummary.isDecided && futsalFemSummary.winnerTeamId) {
        return teams.find((t) => t.id === futsalFemSummary.winnerTeamId) || null;
      }
      return null;
    }

    if (activeModality === 'tenis_mesa_fem') {
      const resetMatch = filteredMatches.find((m) => m.isResetMatch);
      if (resetMatch && resetMatch.isActive && resetMatch.winnerId) {
        return teams.find((t) => t.id === resetMatch.winnerId) || null;
      }
      const firstFinal = filteredMatches.find((m) => m.roundName.includes('Grande Final') && !m.isResetMatch);
      if (firstFinal && firstFinal.winnerId) {
        if (firstFinal.winnerId === firstFinal.teamAId) {
          return teams.find((t) => t.id === firstFinal.winnerId) || null;
        }
      }
      return null;
    }

    const finalMatch = filteredMatches.find(
      (m) => m.roundIndex === maxRoundIndex || m.roundName.includes('Grande Final')
    );
    return finalMatch && finalMatch.winnerId ? teams.find((t) => t.id === finalMatch.winnerId) : null;
  }, [filteredMatches, activeModality, maxRoundIndex, teams, futsalFemSummary]);

  // Champion celebration animation with multi-burst confetti
  React.useEffect(() => {
    if (championTeam) {
      try {
        confetti({
          particleCount: 110,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#fbbf24', '#10b981', '#3b82f6', '#ec4899', '#ffffff'],
        });
        const timer1 = setTimeout(() => {
          confetti({
            particleCount: 70,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#f59e0b', '#fbbf24', '#ffffff'],
          });
          confetti({
            particleCount: 70,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#f59e0b', '#fbbf24', '#ffffff'],
          });
        }, 350);
        return () => clearTimeout(timer1);
      } catch (err) {
        console.warn('Confetti animation error:', err);
      }
    }
  }, [championTeam?.id]);

  const handleFireConfetti = () => {
    try {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#f59e0b', '#fbbf24', '#10b981', '#3b82f6', '#ec4899', '#ffffff'],
      });
    } catch {}
  };

  // Render individual match card with evident photo and classroom
  const renderMatchCardInLine = (match: Match, isFinal = false) => {
    const teamA = getTeamInfo(match.teamAId, match.teamAName);
    const teamB = getTeamInfo(match.teamBId, match.teamBName);

    const hasScores = match.scoreA !== undefined && match.scoreB !== undefined;
    const isTeamAWinner = Boolean(match.winnerId && match.winnerId === match.teamAId);
    const isTeamBWinner = Boolean(match.winnerId && match.winnerId === match.teamBId);
    const isTeamALoser = Boolean(match.loserId && match.loserId === match.teamAId);
    const isTeamBLoser = Boolean(match.loserId && match.loserId === match.teamBId);

    return (
      <div
        key={match.id}
        onClick={() => handleOpenScoreModal(match)}
        className={`w-full border rounded-xl p-2.5 sm:p-3 shadow-md relative overflow-hidden transition-all duration-200 flex flex-col justify-between ${
          isFinal
            ? isDark
              ? 'border-amber-400/90 bg-[#0d1428] shadow-amber-500/10 ring-1 ring-amber-400/30'
              : 'border-amber-500 bg-gradient-to-b from-amber-50/70 via-white to-sky-50/70 shadow-amber-500/20 ring-1 ring-amber-400/30'
            : isDark
            ? 'bg-[#0b1329] border-slate-800 hover:border-amber-400/60 hover:shadow-lg'
            : 'bg-white border-slate-200 hover:border-sky-400 shadow-sm hover:shadow-md'
        } ${
          canEditMatchScore(user, match.modality)
            ? 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]'
            : ''
        }`}
      >
        {/* Top Gold Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 opacity-80" />

        {/* Card Header: Phase & Jogo Badge */}
        <div
          className={`flex items-center justify-between text-[10px] font-black uppercase tracking-wider pb-1.5 mb-1.5 border-b ${
            isDark ? 'text-slate-400 border-slate-800/80' : 'text-slate-600 border-slate-100'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-amber-500 font-bold">
              <Flame className="w-3 h-3 text-amber-500 shrink-0" />
              <span>{match.roundName.replace(/\s+\d+$/, '').trim()}</span>
            </span>
            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[9px] tracking-wider shadow-sm">
              JOGO {match.matchNumber}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {match.isBye && (
              <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[8.5px] font-black tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                PASSA DIRETO
              </span>
            )}
            {canEditMatchScore(user, match.modality) && (
              <span className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow-sm transition-colors cursor-pointer">
                <Pencil className="w-2.5 h-2.5" />
                <span>EDITAR</span>
              </span>
            )}
          </div>
        </div>

        {/* Duel Face-off Area */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 items-center my-0.5">
          {/* Team A */}
          <div className="flex flex-col items-center text-center space-y-1 min-w-0">
            {/* Foto Evidente */}
            <div className="relative">
              {teamA.imageUrl ? (
                <img
                  src={teamA.imageUrl}
                  alt={teamA.name}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover border shadow-sm bg-white ${
                    isTeamAWinner
                      ? 'border-amber-400 ring-2 ring-amber-400/30'
                      : isTeamALoser
                      ? 'border-slate-700 opacity-60'
                      : isDark
                      ? 'border-slate-800'
                      : 'border-slate-200'
                  }`}
                />
              ) : (
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl border flex items-center justify-center text-white shadow-sm ${
                    isTeamAWinner
                      ? 'border-amber-400 ring-2 ring-amber-400/30'
                      : isTeamALoser
                      ? 'border-slate-700 opacity-60'
                      : isDark
                      ? 'border-slate-800'
                      : 'border-slate-200'
                  }`}
                  style={{ backgroundColor: teamA.shirtColor }}
                >
                  <Shirt className="w-5 h-5 drop-shadow-sm" />
                </div>
              )}

              {isTeamAWinner && (
                <div className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 p-0.5 rounded-full shadow">
                  <Crown className="w-3 h-3" />
                </div>
              )}
            </div>

            {/* Sala Evidente */}
            {teamA.isDefined && teamA.sala && !teamA.sala.toUpperCase().includes('JOGO') && !teamA.sala.toUpperCase().includes('VENC') && !teamA.sala.toUpperCase().includes('DEFINIR') && !teamA.sala.toUpperCase().includes('AGUARDANDO') && (
              <div className="w-full flex justify-center">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[8px] uppercase tracking-wider shadow-sm max-w-full truncate">
                  <Star className="w-2 h-2 text-slate-950 fill-current shrink-0" />
                  <span className="truncate">SALA: {teamA.sala}</span>
                </span>
              </div>
            )}

            {/* Nome / Atleta */}
            <div className="w-full px-0.5">
              <p
                title={teamA.name}
                className={`text-xs sm:text-[13px] uppercase tracking-tight truncate leading-tight ${
                  isTeamAWinner
                    ? 'font-black text-amber-400'
                    : isTeamALoser
                    ? 'text-slate-500 line-through font-semibold'
                    : isDark
                    ? 'font-black text-white'
                    : 'font-black text-slate-900'
                }`}
              >
                {teamA.name}
              </p>
            </div>
          </div>

          {/* Center VS / Scores */}
          <div className="flex flex-col items-center justify-center px-1">
            {match.isBye ? (
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider whitespace-nowrap shadow-inner">
                  <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Passa Direto</span>
                </div>
              </div>
            ) : hasScores ? (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1 border rounded-lg px-2.5 py-0.5 shadow-inner bg-[#070d1e] border-slate-800">
                  <span className="text-lg sm:text-xl font-black font-mono tracking-tighter text-amber-400">
                    {match.scoreA}
                  </span>
                  <span className="text-xs text-slate-500 font-black">:</span>
                  <span className="text-lg sm:text-xl font-black font-mono tracking-tighter text-amber-400">
                    {match.scoreB}
                  </span>
                </div>
                {match.scoreA === match.scoreB && match.penaltyWinnerId && (
                  <div className="flex flex-col items-center mt-0.5">
                    <span className="text-[7.5px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded uppercase text-center max-w-[110px] truncate shadow-sm">
                      {match.penaltyScoreA !== undefined && match.penaltyScoreB !== undefined
                        ? `Pên: ${match.penaltyScoreA} × ${match.penaltyScoreB} (${teams.find((t) => t.id === match.penaltyWinnerId)?.name || 'Venceu'})`
                        : `Pên: ${teams.find((t) => t.id === match.penaltyWinnerId)?.name || 'Venceu'}`}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`border rounded-full w-7 h-7 flex items-center justify-center font-black text-[10px] shadow-inner ${
                  isDark
                    ? 'bg-blue-950/80 border-blue-800 text-amber-400'
                    : 'bg-sky-100 border-sky-300 text-sky-900'
                }`}
              >
                VS
              </div>
            )}
          </div>

          {/* Team B */}
          <div className="flex flex-col items-center text-center space-y-1 min-w-0">
            {/* Foto Evidente ou "Sem Oponente" */}
            <div className="relative">
              {match.isBye ? (
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl border border-dashed border-slate-700/80 bg-slate-900/50 flex flex-col items-center justify-center text-slate-500 shadow-inner">
                  <span className="text-[14px] font-black text-slate-500 select-none">—</span>
                </div>
              ) : teamB.imageUrl ? (
                <img
                  src={teamB.imageUrl}
                  alt={teamB.name}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover border shadow-sm bg-white ${
                    isTeamBWinner
                      ? 'border-amber-400 ring-2 ring-amber-400/30'
                      : isTeamBLoser
                      ? 'border-slate-700 opacity-60'
                      : isDark
                      ? 'border-slate-800'
                      : 'border-slate-200'
                  }`}
                />
              ) : (
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl border flex items-center justify-center text-white shadow-sm ${
                    isTeamBWinner
                      ? 'border-amber-400 ring-2 ring-amber-400/30'
                      : isTeamBLoser
                      ? 'border-slate-700 opacity-60'
                      : isDark
                      ? 'border-slate-800'
                      : 'border-slate-200'
                  }`}
                  style={{ backgroundColor: teamB.shirtColor }}
                >
                  <Shirt className="w-5 h-5 drop-shadow-sm" />
                </div>
              )}

              {isTeamBWinner && (
                <div className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 p-0.5 rounded-full shadow">
                  <Crown className="w-3 h-3" />
                </div>
              )}
            </div>

            {/* Sala Evidente */}
            {!match.isBye && teamB.isDefined && teamB.sala && !teamB.sala.toUpperCase().includes('JOGO') && !teamB.sala.toUpperCase().includes('VENC') && !teamB.sala.toUpperCase().includes('DEFINIR') && !teamB.sala.toUpperCase().includes('AGUARDANDO') ? (
              <div className="w-full flex justify-center">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[8px] uppercase tracking-wider shadow-sm max-w-full truncate">
                  <Star className="w-2 h-2 text-slate-950 fill-current shrink-0" />
                  <span className="truncate">SALA: {teamB.sala}</span>
                </span>
              </div>
            ) : null}

            {/* Nome / Atleta ou "SEM OPONENTE" */}
            <div className="w-full px-0.5">
              <p
                title={match.isBye ? 'SEM OPONENTE' : teamB.name}
                className={`text-xs sm:text-[13px] uppercase tracking-tight truncate leading-tight ${
                  match.isBye
                    ? 'font-black text-slate-400 dark:text-slate-500 tracking-wider'
                    : isTeamBWinner
                    ? 'font-black text-amber-400'
                    : isTeamBLoser
                    ? 'text-slate-500 line-through font-semibold'
                    : isDark
                    ? 'font-black text-white'
                    : 'font-black text-slate-900'
                }`}
              >
                {match.isBye ? 'SEM OPONENTE' : teamB.name}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      className={`py-5 sm:py-7 relative overflow-hidden transition-colors duration-300 ${
        isDark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Background Subtle Glows */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4 relative z-10">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-sky-800/30">
          <div>
            <span className="text-xs font-black uppercase text-amber-500 dark:text-amber-400 tracking-widest flex items-center gap-2">
              <span className="text-base">{modalityConfig.icon}</span>
              {modalityConfig.label} • Chaveamento Mata-mata
            </span>
            <h2
              className={`text-2xl sm:text-3xl font-black font-display uppercase tracking-tight mt-0.5 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              CHAVEAMENTO DA COMPETIÇÃO
            </h2>
          </div>

          {user?.role === 'admin' && (
            <div className="flex flex-wrap items-center gap-2">
              {activeModality !== 'futsal_fem' && (
                <button
                  type="button"
                  onClick={() => setIsMatchupModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl shadow-md transition-all hover:scale-105 uppercase tracking-wider cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5 text-white" />
                  <span>Confrontos</span>
                </button>
              )}

              {/* Export Tree JSON Button */}
              {modalityMatches.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportTreeJson}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-700/60 text-xs font-black rounded-xl shadow-md transition-all hover:scale-105 uppercase tracking-wider cursor-pointer"
                  title="Exportar árvore estruturada do chaveamento em formato JSON"
                >
                  <FileJson className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Árvore JSON</span>
                </button>
              )}

              {/* Reset Match Scores Button */}
              {modalityMatches.length > 0 && onResetBracket && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Deseja resetar todos os placares desta modalidade? O sorteio e os Byes serão preservados.')) {
                      onResetBracket();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-black rounded-xl shadow-md transition-all hover:scale-105 uppercase tracking-wider cursor-pointer"
                  title="Resetar placares mantendo os emparelhamentos"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Resetar</span>
                </button>
              )}

              {/* Clear Bracket Button */}
              {modalityMatches.length > 0 && onClearBracket && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Deseja apagar o chaveamento desta modalidade para fazer um novo sorteio?')) {
                      onClearBracket();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-black rounded-xl shadow-md transition-all hover:scale-105 uppercase tracking-wider cursor-pointer"
                  title="Limpar chaveamento desta modalidade"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Limpar</span>
                </button>
              )}

              <button
                type="button"
                onClick={downloadBackupJson}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-black rounded-xl border border-slate-700 shadow-md transition-all hover:scale-105 uppercase tracking-wider cursor-pointer"
                title="Salvar tudo em JSON antes do banco de dados (Vercel)"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Backup</span>
              </button>

              <button
                onClick={onGenerateBracket}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black rounded-xl shadow-lg transition-all hover:scale-105 uppercase tracking-wider cursor-pointer"
              >
                {activeModality === 'futsal_fem' && currentModalityTeams.length === 2 ? (
                  <>
                    <Trophy className="w-4 h-4 text-slate-950" />
                    Configurar Final (Ida e Volta)
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-slate-950" />
                    Sorteio Aleatório
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Empty State when NO matches at all are generated for this modality */}
        {modalityMatches.length === 0 ? (
          <div
            className={`text-center py-14 border-2 border-dashed rounded-3xl p-8 ${
              isDark ? 'bg-blue-900/20 border-blue-800' : 'bg-white border-slate-200'
            }`}
          >
            <Trophy className="w-14 h-14 text-amber-500 mx-auto mb-3 animate-bounce" />
            <h3
              className={`text-xl font-black uppercase font-display ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Chaveamento não gerado
            </h3>
            <p
              className={`text-xs mt-2 max-w-md mx-auto ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {user?.role === 'admin'
                ? `Cadastre ao menos 2 participantes na aba "Equipes" e clique em "Sorteio Aleatório / Reset".`
                : 'Aguarde a organização sortear as partidas.'}
            </p>
          </div>
        ) : (
          /* Main Poster Board */
          <div
            className={`rounded-3xl p-4 sm:p-6 shadow-2xl border-2 relative overflow-hidden backdrop-blur-md transition-colors ${
              isDark
                ? 'bg-gradient-to-b from-blue-950/80 via-slate-900/95 to-slate-950/90 border-amber-400/40 text-white'
                : 'bg-white border-amber-400/50 text-slate-900 shadow-xl'
            }`}
          >
            {/* Embedded Search Filters */}
            <div className={`p-4 sm:p-5 mb-6 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 ${
              isDark ? 'bg-slate-900/60 border-blue-900/50' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                  <Search className="w-5 h-5 animate-pulse" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 block">
                    {modalityConfig.isIndividual ? 'Localizar Atleta' : 'Localizar Turma'}
                  </span>
                  <h3 className={`text-sm font-black uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {modalityConfig.isIndividual ? 'Filtrar por Atleta' : 'Filtrar por Turma/Sala'}
                  </h3>
                </div>
              </div>

              {/* Selector Control */}
              <div className="w-full md:max-w-md flex items-center gap-2">
                {modalityConfig.isIndividual ? (
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl text-xs font-black uppercase border outline-none cursor-pointer transition-all ${
                      isDark
                        ? 'bg-slate-950 border-blue-900 text-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-sky-500'
                    }`}
                  >
                    <option value="">-- Todos os Atletas --</option>
                    {athleteOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl text-xs font-black uppercase border outline-none cursor-pointer transition-all ${
                      isDark
                        ? 'bg-slate-950 border-blue-900 text-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-sky-500'
                    }`}
                  >
                    <option value="">-- Todas as Turmas / Salas --</option>
                    {roomOptions.map((room) => (
                      <option key={room} value={room}>
                        SALA: {room}
                      </option>
                    ))}
                  </select>
                )}

                {(selectedTeamId || selectedRoom) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeamId('');
                      setSelectedRoom('');
                    }}
                    className={`px-3 py-2.5 text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer border shrink-0 ${
                      isDark
                        ? 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Champion Banner if Final has a winner (Hidden if filtering is active for clean visual layout) */}
            {championTeam && !selectedTeamId && !selectedRoom && (
              <div className="max-w-md mx-auto mb-6 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 p-5 rounded-3xl shadow-2xl border-4 border-yellow-200 text-center animate-fade-in relative overflow-hidden ring-4 ring-amber-400/40">
                <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider mb-2">
                  <Crown className="w-6 h-6 text-slate-950 animate-bounce" />
                  <span className="text-sm font-black tracking-wide">🏆 GRANDE CAMPEÃO DO TORNEIO! 🏆</span>
                  <Sparkles className="w-5 h-5 text-amber-900 animate-spin" />
                </div>

                <div className="my-3 flex justify-center">
                  {championTeam.imageUrl ? (
                    <img
                      src={championTeam.imageUrl}
                      alt={championTeam.name}
                      className="w-20 h-20 rounded-2xl object-cover border-4 border-slate-950 shadow-2xl bg-white transform hover:scale-110 transition-transform"
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-2xl border-4 border-slate-950 flex items-center justify-center text-white shadow-2xl transform hover:scale-110 transition-transform"
                      style={{ backgroundColor: championTeam.shirtColor }}
                    >
                      <Shirt className="w-10 h-10 drop-shadow" />
                    </div>
                  )}
                </div>

                <span className="text-2xl font-black font-display uppercase block tracking-tight text-slate-950 drop-shadow-sm">
                  {championTeam.playerName || championTeam.name}
                </span>

                <div className="mt-2 flex justify-center">
                  <span className="inline-flex items-center gap-1 px-3.5 py-1 rounded-full bg-slate-950 text-amber-300 text-xs font-black uppercase tracking-wider shadow-lg">
                    <School className="w-4 h-4" />
                    SALA / TURMA: {championTeam.playerClass || championTeam.name}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-amber-600/30 flex justify-center">
                  <button
                    type="button"
                    onClick={handleFireConfetti}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-amber-300 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                    <span>🎉 Comemorar com Confetes!</span>
                  </button>
                </div>
              </div>
            )}

            {/* If dynamic filters find no matches, show empty state with option to clear */}
            {filteredMatches.length === 0 ? (
              <div className={`text-center py-12 rounded-2xl border-2 border-dashed p-6 my-4 ${
                isDark ? 'bg-slate-950/40 border-blue-900/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <Search className="w-10 h-10 text-amber-500 mx-auto mb-2 animate-bounce" />
                <h4 className={`text-base font-black uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Nenhum confronto encontrado para esta seleção
                </h4>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Experimente limpar o filtro acima ou escolher outra opção para ver os confrontos correspondentes.
                </p>
              </div>
            ) : (
              <>
                {/* Phase Selector Bar - "Escolher o chaveamento de acordo com a fase que deseja" */}
                <div className={`space-y-3 mb-6 ${activeModality === 'futsal_fem' ? 'hidden' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Swords className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-black uppercase tracking-wider text-amber-500 dark:text-amber-400">
                    Selecione a Fase Desejada:
                  </span>
                </div>
              </div>

              {/* Phase Switcher Buttons */}
              <div
                className={`p-1.5 rounded-2xl border flex items-center gap-1.5 overflow-x-auto scrollbar-thin ${
                  isDark ? 'bg-slate-950/80 border-blue-900/80' : 'bg-slate-100 border-slate-200'
                }`}
              >
                {/* Option: Todas as Fases */}
                <button
                  type="button"
                  onClick={() => setSelectedPhase('all')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                    selectedPhase === 'all'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black shadow-md scale-[1.02]'
                      : isDark
                      ? 'text-slate-300 hover:text-white hover:bg-slate-900'
                      : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Todas as Fases</span>
                  <span
                    className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedPhase === 'all'
                        ? 'bg-slate-950 text-amber-300'
                        : isDark
                        ? 'bg-blue-900/60 text-slate-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {filteredMatches.length}
                  </span>
                </button>

                {/* Individual Phases: 16 avos, Oitavas, Quartas, Semifinal, Final */}
                {sortedRoundIndices.map((rIdx) => {
                  const matchesInRound = roundsMap.get(rIdx) || [];
                  const phaseTitle = getPhaseDisplayName(rIdx, matchesInRound[0]);
                  const isSelected = selectedPhase === rIdx;
                  const isFinal = rIdx === maxRoundIndex;

                  return (
                    <button
                      key={rIdx}
                      type="button"
                      onClick={() => setSelectedPhase(rIdx)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black shadow-md scale-[1.02]'
                          : isDark
                          ? 'text-slate-300 hover:text-white hover:bg-slate-900'
                          : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                      }`}
                    >
                      {isFinal ? (
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Flame className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span>{phaseTitle}</span>
                      <span
                        className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected
                            ? 'bg-slate-950 text-amber-300'
                            : isDark
                            ? 'bg-blue-900/60 text-slate-300'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {matchesInRound.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Line-Format Content Area - "em forma de linha com espaço predefinido" */}
            {activeModality === 'futsal_fem' ? (
              // Futsal Feminino Direct Final (Jogo de Ida e Jogo de Volta)
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                {filteredMatches.map((m) => renderMatchCardInLine(m, false))}
              </div>
            ) : selectedPhase !== 'all' ? (
              // Single Selected Phase in a Line
              <div className="space-y-3">
                {(() => {
                  const currentMatches = roundsMap.get(selectedPhase as number) || [];
                  const phaseTitle = getPhaseDisplayName(
                    selectedPhase as number,
                    currentMatches[0]
                  );
                  const isFinal = (selectedPhase as number) === maxRoundIndex;

                  return (
                    <div>
                      {/* Phase Header with Navigation Arrows */}
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-sky-900/30">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-500">
                            {isFinal ? (
                              <Crown className="w-4 h-4" />
                            ) : (
                              <Swords className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-base sm:text-lg font-black font-display uppercase tracking-wide flex items-center gap-2">
                              <span>{phaseTitle}</span>
                              <span className="text-xs font-bold text-slate-400">
                                ({currentMatches.length}{' '}
                                {currentMatches.length === 1 ? 'confronto' : 'confrontos'})
                              </span>
                            </h3>
                          </div>
                        </div>
                      </div>

                      {/* Vertical Grid Container */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-1 px-1">
                        {currentMatches.map((m) => renderMatchCardInLine(m, isFinal))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              // "Todas as Fases" - Each phase presented in its own dedicated horizontal line track
              <div className="space-y-8">
                {sortedRoundIndices.map((rIdx) => {
                  const currentMatches = roundsMap.get(rIdx) || [];
                  const phaseTitle = getPhaseDisplayName(rIdx, currentMatches[0]);
                  const isFinal = rIdx === maxRoundIndex;

                  return (
                    <div key={rIdx} className="space-y-3">
                      {/* Phase Line Header */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-sky-900/40">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                              isFinal
                                ? 'bg-amber-500 text-slate-950 font-display'
                                : isDark
                                ? 'bg-blue-950 border border-blue-800 text-amber-400'
                                : 'bg-sky-100 border border-sky-200 text-sky-900'
                            }`}
                          >
                            {isFinal ? (
                              <Trophy className="w-3.5 h-3.5" />
                            ) : (
                              <Swords className="w-3.5 h-3.5" />
                            )}
                            {phaseTitle}
                          </span>
                          <span className="text-xs font-bold text-slate-400">
                            • {currentMatches.length}{' '}
                            {currentMatches.length === 1 ? 'confronto' : 'confrontos'}
                          </span>
                        </div>

                      </div>

                      {/* Vertical Grid Track for this Phase */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-1 px-1">
                        {currentMatches.map((m) => renderMatchCardInLine(m, isFinal))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>)}
          </div>
        )}

        {/* Modal Score Editor for Admin */}
        {selectedMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-900">
            <div className="bg-white dark:bg-slate-900 border-2 border-amber-400 rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="bg-slate-900 text-white px-4 py-2.5 sm:py-3 flex items-center justify-between border-b border-amber-400 shrink-0">
                <div>
                  <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">
                    PAINEL DE ARBITRAGEM • SÚMULA
                  </span>
                  <h3 className="text-sm sm:text-base font-black font-display uppercase tracking-wide">
                    {selectedMatch.roundName} • Jogo #{selectedMatch.matchNumber}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMatch(null)}
                  className="p-1 sm:p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Form with Scrollable Content and Fixed Footer */}
              <form onSubmit={handleSaveScore} className="flex flex-col flex-1 overflow-hidden">
                {/* Scrollable Body */}
                <div className="overflow-y-auto p-3 sm:p-4 space-y-3 flex-1 scrollbar-thin">
                  {/* Quick actions for Confrontos in modal */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-300 text-[10px] uppercase">
                      Ações Rápidas:
                    </span>
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const tempId = editTeamAId;
                          setEditTeamAId(editTeamBId);
                          setEditTeamBId(tempId);
                          const tempScore = scoreA;
                          setScoreA(scoreB);
                          setScoreB(tempScore);
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-black text-[10px] uppercase transition-colors cursor-pointer"
                      >
                        ⇄ Inverter
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditTeamBId('BYE');
                          setScoreA(scoreA > 0 ? scoreA : 1);
                          setScoreB(0);
                        }}
                        className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-black text-[10px] uppercase transition-colors cursor-pointer"
                      >
                        A Passa Direto
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditTeamAId('BYE');
                          setScoreA(0);
                          setScoreB(scoreB > 0 ? scoreB : 1);
                        }}
                        className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-black text-[10px] uppercase transition-colors cursor-pointer"
                      >
                        B Passa Direto
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {/* Team A Input */}
                    {(() => {
                      const infoA = getTeamInfo(selectedMatch.teamAId, selectedMatch.teamAName);
                      return (
                        <div className="space-y-2 text-center bg-slate-50 dark:bg-slate-800/60 p-2.5 sm:p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                          {infoA.imageUrl ? (
                            <img
                              src={infoA.imageUrl}
                              alt={infoA.name}
                              className="w-9 h-9 rounded-lg object-cover mx-auto border shadow-sm"
                            />
                          ) : (
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center mx-auto text-white shadow-sm"
                              style={{ backgroundColor: infoA.shirtColor }}
                            >
                              <Shirt className="w-4 h-4" />
                            </div>
                          )}
                          {infoA.isDefined && infoA.sala && !infoA.sala.toUpperCase().includes('JOGO') && !infoA.sala.toUpperCase().includes('VENC') && !infoA.sala.toUpperCase().includes('DEFINIR') && !infoA.sala.toUpperCase().includes('AGUARDANDO') && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-black uppercase">
                              SALA: {infoA.sala}
                            </span>
                          )}
                          
                          <div className="space-y-1 text-left">
                            <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-slate-400">
                              Participante A:
                            </label>
                            <select
                              value={editTeamAId}
                              onChange={(e) => setEditTeamAId(e.target.value)}
                              className="w-full py-1 px-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-[11px] font-bold focus:border-sky-500 outline-none"
                            >
                              <option value="">A definir</option>
                              <option value="BYE">🌟 BYE / Sem Oponente</option>
                              {currentModalityTeams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.playerName && t.playerClass ? `${t.playerName} (${t.playerClass})` : t.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="pt-1">
                            <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1">
                              Placar A:
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              value={scoreA}
                              onChange={(e) => setScoreA(parseInt(e.target.value) || 0)}
                              className="w-16 text-center py-1 bg-white dark:bg-slate-900 border-2 border-sky-500 text-slate-900 dark:text-white rounded-xl text-xl font-black focus:ring-2 focus:ring-sky-200 outline-none mx-auto block shadow-inner"
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Team B Input */}
                    {(() => {
                      const infoB = getTeamInfo(selectedMatch.teamBId, selectedMatch.teamBName);
                      return (
                        <div className="space-y-2 text-center bg-slate-50 dark:bg-slate-800/60 p-2.5 sm:p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                          {infoB.imageUrl ? (
                            <img
                              src={infoB.imageUrl}
                              alt={infoB.name}
                              className="w-9 h-9 rounded-lg object-cover mx-auto border shadow-sm"
                            />
                          ) : (
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center mx-auto text-white shadow-sm"
                              style={{ backgroundColor: infoB.shirtColor }}
                            >
                              <Shirt className="w-4 h-4" />
                            </div>
                          )}
                          {infoB.isDefined && infoB.sala && !infoB.sala.toUpperCase().includes('JOGO') && !infoB.sala.toUpperCase().includes('VENC') && !infoB.sala.toUpperCase().includes('DEFINIR') && !infoB.sala.toUpperCase().includes('AGUARDANDO') && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-black uppercase">
                              SALA: {infoB.sala}
                            </span>
                          )}

                          <div className="space-y-1 text-left">
                            <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-slate-400">
                              Participante B:
                            </label>
                            <select
                              value={editTeamBId}
                              onChange={(e) => setEditTeamBId(e.target.value)}
                              className="w-full py-1 px-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-[11px] font-bold focus:border-sky-500 outline-none"
                            >
                              <option value="">A definir</option>
                              <option value="BYE">🌟 BYE / Sem Oponente</option>
                              {currentModalityTeams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.playerName && t.playerClass ? `${t.playerName} (${t.playerClass})` : t.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="pt-1">
                            <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1">
                              Placar B:
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              value={scoreB}
                              onChange={(e) => setScoreB(parseInt(e.target.value) || 0)}
                              className="w-16 text-center py-1 bg-white dark:bg-slate-900 border-2 border-sky-500 text-slate-900 dark:text-white rounded-xl text-xl font-black focus:ring-2 focus:ring-sky-200 outline-none mx-auto block shadow-inner"
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Seção de Pênaltis para Futsal (Masculino e Feminino) em caso de Empate */}
                  {(() => {
                    const isFutsal = selectedMatch.modality === 'futsal_masc' || selectedMatch.modality === 'futsal_fem';
                    const idaMatch = matches.find(m => m.modality === 'futsal_fem' && m.roundName.includes('Ida'));
                    const isVolta = selectedMatch.modality === 'futsal_fem' && selectedMatch.roundName.includes('Volta');
                    let isTiedAggregate = false;
                    if (isVolta && idaMatch && idaMatch.scoreA !== undefined && idaMatch.scoreB !== undefined) {
                      const teamAGoals = scoreA + (idaMatch.teamBId === editTeamAId ? idaMatch.scoreB : idaMatch.scoreA);
                      const teamBGoals = scoreB + (idaMatch.teamAId === editTeamBId ? idaMatch.scoreA : idaMatch.scoreB);
                      isTiedAggregate = teamAGoals === teamBGoals;
                    }

                    const isTied = scoreA === scoreB || isTiedAggregate;
                    if (!isFutsal || !isTied) return null;

                    const teamANameDisplay = teams.find(t => t.id === editTeamAId)?.name || 'Equipe A';
                    const teamBNameDisplay = teams.find(t => t.id === editTeamBId)?.name || 'Equipe B';

                    return (
                      <div className="bg-amber-500/10 border-2 border-amber-400 p-3 sm:p-3.5 rounded-xl space-y-2.5 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">⚽</span>
                          <div>
                            <label className="block text-[11px] font-black uppercase text-amber-600 dark:text-amber-400">
                              {isTiedAggregate
                                ? 'EMPATE AGREGADO • PÊNALTIS'
                                : 'EMPATE NO FUTSAL • PÊNALTIS'}
                            </label>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                              Defina o placar dos pênaltis e a equipe classificada.
                            </p>
                          </div>
                        </div>

                        {/* Placar dos Pênaltis */}
                        <div className="grid grid-cols-2 gap-2 bg-white dark:bg-slate-900/80 p-2 sm:p-2.5 rounded-lg border border-amber-300 dark:border-amber-500/40">
                          <div className="text-center space-y-1">
                            <label className="block text-[9px] font-black uppercase text-slate-600 dark:text-slate-300 truncate">
                              Pênaltis {teamANameDisplay}:
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              value={penaltyScoreA}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setPenaltyScoreA(val);
                                if (val > penaltyScoreB && editTeamAId) {
                                  setPenaltyWinnerId(editTeamAId);
                                } else if (penaltyScoreB > val && editTeamBId) {
                                  setPenaltyWinnerId(editTeamBId);
                                }
                              }}
                              className="w-14 text-center py-1 bg-amber-50 dark:bg-slate-950 border-2 border-amber-500 text-amber-600 dark:text-amber-400 rounded-lg text-lg font-black focus:ring-2 focus:ring-amber-300 outline-none mx-auto block"
                            />
                          </div>

                          <div className="text-center space-y-1">
                            <label className="block text-[9px] font-black uppercase text-slate-600 dark:text-slate-300 truncate">
                              Pênaltis {teamBNameDisplay}:
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              value={penaltyScoreB}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setPenaltyScoreB(val);
                                if (val > penaltyScoreA && editTeamAId) {
                                  setPenaltyWinnerId(editTeamAId);
                                } else if (penaltyScoreA > val && editTeamBId) {
                                  setPenaltyWinnerId(editTeamBId);
                                }
                              }}
                              className="w-14 text-center py-1 bg-amber-50 dark:bg-slate-950 border-2 border-amber-500 text-amber-600 dark:text-amber-400 rounded-lg text-lg font-black focus:ring-2 focus:ring-amber-300 outline-none mx-auto block"
                            />
                          </div>
                        </div>

                        {/* Seleção do Vencedor nos Pênaltis */}
                        <div className="space-y-1">
                          <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-slate-400">
                            Equipe Classificada nos Pênaltis:
                          </label>
                          <select
                            value={penaltyWinnerId}
                            onChange={(e) => setPenaltyWinnerId(e.target.value)}
                            className="w-full py-1.5 px-2 bg-white dark:bg-slate-900 border-2 border-amber-400 rounded-lg text-xs font-black outline-none"
                            required
                          >
                            <option value="">-- Selecionar Vencedor dos Pênaltis --</option>
                            {editTeamAId && (
                              <option value={editTeamAId}>
                                {teamANameDisplay} (Venceu nos Pênaltis)
                              </option>
                            )}
                            {editTeamBId && (
                              <option value={editTeamBId}>
                                {teamBNameDisplay} (Venceu nos Pênaltis)
                              </option>
                            )}
                          </select>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Fixed Sticky Footer - Always Visible */}
                <div className="p-3 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedMatch(null)}
                    className="flex-1 py-2 sm:py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs uppercase cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 sm:py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-xl text-xs uppercase shadow-md tracking-wider cursor-pointer transition-all"
                  >
                    Salvar Placar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Modal Matchup Configurator */}
        {onUpdateMatches && (
          <MatchupConfigModal
            isOpen={isMatchupModalOpen}
            onClose={() => setIsMatchupModalOpen(false)}
            matches={matches}
            teams={teams}
            activeModality={activeModality}
            onSaveMatches={onUpdateMatches}
            theme={theme}
          />
        )}
      </div>
    </section>
  );
};
