import { Match, Team, ModalityType } from '../types';

/**
 * Returns formatted display name for a team or table tennis athlete.
 */
export function formatDisplayName(team?: Team): string {
  if (!team) return 'A definir';
  if (team.playerName && team.playerClass) {
    return `${team.playerName} (${team.playerClass})`;
  }
  if (team.playerName) {
    return team.playerName;
  }
  return team.name;
}

/**
 * Calculates human-readable round names in Portuguese based on distance to the Grande Final.
 * @param roundIndex 1-based index of the round (1 = first round, totalRounds = Grande Final)
 * @param totalRounds total number of rounds in the tournament tree (log2(C))
 */
export function getRoundName(roundIndex: number, totalRounds: number): string {
  const distanceToFinal = totalRounds - roundIndex;
  switch (distanceToFinal) {
    case 0:
      return 'Grande Final';
    case 1:
      return 'Semifinal';
    case 2:
      return 'Quartas de Final';
    case 3:
      return 'Oitavas de Final';
    case 4:
      return '16 avos de Final';
    case 5:
      return '32 avos de Final';
    case 6:
      return '64 avos de Final';
    default:
      return `Fase ${roundIndex}`;
  }
}

/**
 * Automatically propagates winners (from completed matches and BYEs) down the tournament tree.
 * Guarantees that any athlete with a BYE / Avanço Direto is placed in their target nextMatch slot
 * without requiring any manual administrator action or phantom score insertion.
 */
export function propagateBracketWinners(matches: Match[], teams: Team[]): Match[] {
  let changed = true;
  let iterations = 0;
  const maxIterations = 30;

  const getTeamName = (id?: string) => {
    if (!id || id === 'BYE' || id === 'SEM OPONENTE') return 'SEM OPONENTE';
    const t = teams.find((item) => item.id === id);
    return formatDisplayName(t);
  };

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];

      // 1. Resolve BYE logic on matches in ANY round
      const hasA = Boolean(match.teamAId && match.teamAId !== 'BYE' && match.teamAId !== 'SEM OPONENTE');
      const hasB = Boolean(match.teamBId && match.teamBId !== 'BYE' && match.teamBId !== 'SEM OPONENTE');
      const isTeamBBye = match.teamBId === 'BYE' || match.teamBId === 'SEM OPONENTE' || match.teamBName === 'BYE' || match.teamBName === 'SEM OPONENTE';
      const isTeamABye = match.teamAId === 'BYE' || match.teamAId === 'SEM OPONENTE' || match.teamAName === 'BYE' || match.teamAName === 'SEM OPONENTE';

      if ((match.isBye || isTeamBBye || (!match.teamBId && match.teamBName === 'SEM OPONENTE')) && hasA && !hasB) {
        if (!match.isBye) {
          match.isBye = true;
          changed = true;
        }
        if (match.teamBName !== 'SEM OPONENTE') {
          match.teamBName = 'SEM OPONENTE';
          changed = true;
        }
        if (match.winnerId !== match.teamAId) {
          match.winnerId = match.teamAId;
          match.scoreA = match.scoreA ?? 1;
          match.scoreB = match.scoreB ?? 0;
          changed = true;
        }
      } else if ((match.isBye || isTeamABye || (!match.teamAId && match.teamAName === 'SEM OPONENTE')) && hasB && !hasA) {
        if (!match.isBye) {
          match.isBye = true;
          changed = true;
        }
        if (match.teamAName !== 'SEM OPONENTE') {
          match.teamAName = 'SEM OPONENTE';
          changed = true;
        }
        if (match.winnerId !== match.teamBId) {
          match.winnerId = match.teamBId;
          match.scoreA = match.scoreA ?? 0;
          match.scoreB = match.scoreB ?? 1;
          changed = true;
        }
      }

      // 2. Determine winner from scores if not already a Bye
      if (!match.isBye && match.scoreA !== undefined && match.scoreB !== undefined) {
        let expectedWinnerId: string | undefined = undefined;
        let expectedLoserId: string | undefined = undefined;

        if (match.scoreA > match.scoreB) {
          expectedWinnerId = match.teamAId;
          expectedLoserId = match.teamBId;
        } else if (match.scoreB > match.scoreA) {
          expectedWinnerId = match.teamBId;
          expectedLoserId = match.teamAId;
        } else if (match.scoreA === match.scoreB && match.penaltyWinnerId) {
          expectedWinnerId = match.penaltyWinnerId;
          expectedLoserId = match.penaltyWinnerId === match.teamAId ? match.teamBId : match.teamAId;
        }

        if (expectedWinnerId && match.winnerId !== expectedWinnerId) {
          match.winnerId = expectedWinnerId;
          match.loserId = expectedLoserId;
          changed = true;
        }
      }

      // 3. Propagate the winner directly to the next match
      // Respect manual slot overrides set by the admin (isManualSlotA / isManualSlotB)
      if (match.winnerId && match.nextMatchId) {
        const nextMatch = matches.find((m) => m.id === match.nextMatchId);
        if (nextMatch) {
          const winnerName = getTeamName(match.winnerId);
          if (match.nextMatchSlot === 'A') {
            if (!nextMatch.isManualSlotA && (nextMatch.teamAId !== match.winnerId || nextMatch.teamAName !== winnerName)) {
              nextMatch.teamAId = match.winnerId;
              nextMatch.teamAName = winnerName;
              changed = true;
            }
          } else if (match.nextMatchSlot === 'B') {
            if (!nextMatch.isManualSlotB && (nextMatch.teamBId !== match.winnerId || nextMatch.teamBName !== winnerName)) {
              nextMatch.teamBId = match.winnerId;
              nextMatch.teamBName = winnerName;
              changed = true;
            }
          }
        }
      }
    }
  }

  return matches;
}

/**
 * Core Dynamic Knockout Draw Generator (Sorteio Aleatório de Mata-Mata com Byes)
 * 
 * Business Rules:
 * - Dynamic power of 2 bracket size (C >= N).
 * - Exact Bye and Direct Match calculation:
 *   Total Byes = B = C - N.
 *   Direct matches in Round 1 = P = (N - B) / 2 = N - C/2.
 *   Athletes playing in Round 1 = 2P = 2N - C.
 *   Athletes receiving BYE in Round 1 = B = C - N.
 *   Total athletes = 2P + B = N (100% of enrolled participants).
 * 
 * Specific rule for Tênis de Mesa Masculino (38 Atletas):
 * - N = 38 => Next power of 2 is C = 64 (32-avos de final).
 * - Round 1 has 32 matches.
 * - Total Byes = 64 - 38 = 26 athletes get BYE.
 * - Direct matches = 38 - 32 = 6 direct matches (12 athletes face off).
 * - The 26 athletes with BYE advance AUTOMATICALLY to Round 2 (16-avos de final).
 * - In Round 2, exactly 32 athletes compete (26 from Byes + 6 Round 1 winners) in 16 matches.
 * - The rounds funnel down cleanly: 32 -> 16 -> 8 -> 4 -> 2 -> 1 (Grande Final).
 */
export function sorteioAleatorio(modality: ModalityType, teams: Team[]): Match[] {
  const modalityTeams = teams.filter((t) => t.modality === modality);
  if (modalityTeams.length < 2) return [];

  const N = modalityTeams.length;
  const timestamp = Date.now();

  // 1. Calculate smallest power of 2 C >= N
  let C = 2;
  while (C < N) {
    C *= 2;
  }

  // 2. Number of total rounds in the tree
  const totalRounds = Math.round(Math.log2(C));

  // 3. Mathematical Byes & Direct Match calculations
  const totalByes = C - N;                      // B
  const numDirectMatches = N - C / 2;          // P
  const numMatchesRound1 = C / 2;              // M1

  // 4. Randomly shuffle all participating athletes / teams
  const shuffledTeams = [...modalityTeams].sort(() => Math.random() - 0.5);

  // 5. Select which match indices in Round 1 will be direct matches vs Bye matches
  // Spread direct matches evenly across the bracket for a balanced tournament tree
  const directMatchIndices = new Set<number>();
  if (numDirectMatches > 0) {
    for (let i = 0; i < numDirectMatches; i++) {
      const idx = Math.floor((i * numMatchesRound1) / numDirectMatches);
      directMatchIndices.add(idx);
    }
  }

  // 6. Pre-generate matches round by round to establish IDs and linking
  const roundsMatches: Match[][] = [];
  let globalMatchNumber = 1;

  for (let r = 1; r <= totalRounds; r++) {
    const numMatchesInRound = C / Math.pow(2, r);
    const roundName = getRoundName(r, totalRounds);
    const currentRound: Match[] = [];

    for (let m = 0; m < numMatchesInRound; m++) {
      const matchId = `match_${modality}_r${r}_m${m}_${timestamp}`;
      const matchNum = globalMatchNumber++;

      currentRound.push({
        id: matchId,
        modality,
        roundName,
        roundIndex: r,
        matchNumber: matchNum,
        teamAName: 'A definir',
        teamBName: 'A definir',
        date: '14 de Outubro',
        time: `${8 + Math.floor((matchNum - 1) / 4)}:${((matchNum - 1) % 4) * 15 === 0 ? '00' : ((matchNum - 1) % 4) * 15}`,
        location: modality.includes('tenis_mesa') ? `Mesa ${(m % 4) + 1}` : 'Quadra Central',
        bracketType: 'winners',
        isActive: true,
      });
    }
    roundsMatches.push(currentRound);
  }

  // 7. Connect parent-child links (nextMatchId, nextMatchSlot, sourceMatchAId, sourceMatchBId)
  for (let r = 1; r < totalRounds; r++) {
    const currentRound = roundsMatches[r - 1];
    const nextRound = roundsMatches[r];

    for (let m = 0; m < currentRound.length; m++) {
      const childMatch = currentRound[m];
      const parentMatchIndex = Math.floor(m / 2);
      const parentSlot: 'A' | 'B' = m % 2 === 0 ? 'A' : 'B';
      const parentMatch = nextRound[parentMatchIndex];

      if (parentMatch) {
        childMatch.nextMatchId = parentMatch.id;
        childMatch.nextMatchSlot = parentSlot;

        if (parentSlot === 'A') {
          parentMatch.sourceMatchAId = childMatch.id;
          parentMatch.sourceLabelA = `Venc. Jogo ${childMatch.matchNumber}`;
          parentMatch.teamAName = `Venc. Jogo ${childMatch.matchNumber}`;
        } else {
          parentMatch.sourceMatchBId = childMatch.id;
          parentMatch.sourceLabelB = `Venc. Jogo ${childMatch.matchNumber}`;
          parentMatch.teamBName = `Venc. Jogo ${childMatch.matchNumber}`;
        }
      }
    }
  }

  // 8. Populate Round 1 with teams and Byes
  const round1Matches = roundsMatches[0];
  let teamCursor = 0;

  // First, place 2 teams in each direct match
  for (let m = 0; m < round1Matches.length; m++) {
    if (directMatchIndices.has(m)) {
      const match = round1Matches[m];
      const teamA = shuffledTeams[teamCursor++];
      const teamB = shuffledTeams[teamCursor++];

      if (teamA) {
        match.teamAId = teamA.id;
        match.teamAName = formatDisplayName(teamA);
      }
      if (teamB) {
        match.teamBId = teamB.id;
        match.teamBName = formatDisplayName(teamB);
      }
      match.isBye = false;
      match.winnerId = undefined;
    }
  }

  // Next, place 1 team in each Bye match with automatic advance
  for (let m = 0; m < round1Matches.length; m++) {
    if (!directMatchIndices.has(m)) {
      const match = round1Matches[m];
      const teamA = shuffledTeams[teamCursor++];

      if (teamA) {
        match.teamAId = teamA.id;
        match.teamAName = formatDisplayName(teamA);
        match.teamBId = undefined;
        match.teamBName = 'SEM OPONENTE';
        match.isBye = true;
        match.winnerId = teamA.id; // Automatic advance
        match.scoreA = 1;
        match.scoreB = 0;
      }
    }
  }

  // 9. Flatten all matches
  const allMatches: Match[] = [];
  roundsMatches.forEach((round) => allMatches.push(...round));

  // 10. Automatically propagate Byes straight into Round 2 slots
  return propagateBracketWinners(allMatches, modalityTeams);
}

/**
 * Resets the tournament bracket for a modality:
 * Clears scores and direct match winners, while preserving the draw and re-advancing the Byes to the next round.
 */
export function resetChaveamento(modality: ModalityType, teams: Team[], matches: Match[]): Match[] {
  const modalityTeams = teams.filter((t) => t.modality === modality);
  const otherMatches = matches.filter((m) => m.modality !== modality);
  const modalityMatches = matches.filter((m) => m.modality === modality);

  if (modalityMatches.length === 0) return matches;

  // Reset all matches
  const resetList: Match[] = modalityMatches.map((m) => {
    const updated = { ...m };

    if (m.roundIndex === 1) {
      if (m.isBye) {
        // Keep bye winner
        updated.scoreA = 1;
        updated.scoreB = 0;
        updated.teamBName = 'SEM OPONENTE';
        updated.teamBId = undefined;
      } else {
        // Direct match: clear score and winner
        updated.scoreA = undefined;
        updated.scoreB = undefined;
        updated.winnerId = undefined;
        updated.loserId = undefined;
        updated.penaltyWinnerId = undefined;
        updated.penaltyScoreA = undefined;
        updated.penaltyScoreB = undefined;
      }
    } else {
      // Round 2 onwards: clear scores, winners, and reset team placeholders
      updated.scoreA = undefined;
      updated.scoreB = undefined;
      updated.winnerId = undefined;
      updated.loserId = undefined;
      updated.penaltyWinnerId = undefined;
      updated.penaltyScoreA = undefined;
      updated.penaltyScoreB = undefined;
      updated.teamAId = undefined;
      updated.teamBId = undefined;
      updated.teamAName = m.sourceLabelA || 'A definir';
      updated.teamBName = m.sourceLabelB || 'A definir';
    }

    return updated;
  });

  // Re-propagate Byes to subsequent rounds
  const resolved = propagateBracketWinners(resetList, modalityTeams);
  return [...otherMatches, ...resolved];
}

/**
 * Completely clears matches for a specific modality.
 */
export function limparChaveamento(modality: ModalityType, matches: Match[]): Match[] {
  return matches.filter((m) => m.modality !== modality);
}

/**
 * Exports the structured bracket tree into a clean JSON representation
 * including rounds, matches, participants, and flow.
 */
export interface BracketTreeJson {
  tournament: string;
  modality: ModalityType;
  generatedDate: string;
  totalParticipants: number;
  bracketSize: number;
  totalRounds: number;
  byesCount: number;
  directMatchesRound1: number;
  rounds: {
    roundIndex: number;
    roundName: string;
    matchesCount: number;
    matches: {
      id: string;
      matchNumber: number;
      teamA: { id?: string; name: string };
      teamB: { id?: string; name: string };
      scoreA?: number;
      scoreB?: number;
      winnerId?: string;
      isBye: boolean;
      nextMatchId?: string;
      nextMatchSlot?: 'A' | 'B';
      sourceLabelA?: string;
      sourceLabelB?: string;
    }[];
  }[];
}

export function exportBracketTreeAsJson(
  modality: ModalityType,
  matches: Match[],
  teams: Team[]
): BracketTreeJson {
  const modalityTeams = teams.filter((t) => t.modality === modality);
  const modalityMatches = matches.filter((m) => m.modality === modality);

  const roundsMap = new Map<number, Match[]>();
  modalityMatches.forEach((m) => {
    const list = roundsMap.get(m.roundIndex) || [];
    list.push(m);
    roundsMap.set(m.roundIndex, list);
  });

  const sortedRoundIndices = Array.from(roundsMap.keys()).sort((a, b) => a - b);
  const round1Matches = roundsMap.get(1) || [];
  const byesCount = round1Matches.filter((m) => m.isBye).length;
  const directMatchesCount = round1Matches.filter((m) => !m.isBye).length;

  const roundsData = sortedRoundIndices.map((rIdx) => {
    const rMatches = roundsMap.get(rIdx) || [];
    return {
      roundIndex: rIdx,
      roundName: rMatches[0]?.roundName || `Fase ${rIdx}`,
      matchesCount: rMatches.length,
      matches: rMatches.map((m) => ({
        id: m.id,
        matchNumber: m.matchNumber,
        teamA: { id: m.teamAId, name: m.teamAName || 'A definir' },
        teamB: { id: m.teamBId, name: m.teamBName || 'A definir' },
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        winnerId: m.winnerId,
        isBye: Boolean(m.isBye),
        nextMatchId: m.nextMatchId,
        nextMatchSlot: m.nextMatchSlot,
        sourceLabelA: m.sourceLabelA,
        sourceLabelB: m.sourceLabelB,
      })),
    };
  });

  return {
    tournament: 'Torneio Interclasse 2026',
    modality,
    generatedDate: new Date().toISOString(),
    totalParticipants: modalityTeams.length,
    bracketSize: round1Matches.length * 2,
    totalRounds: sortedRoundIndices.length,
    byesCount,
    directMatchesRound1: directMatchesCount,
    rounds: roundsData,
  };
}
