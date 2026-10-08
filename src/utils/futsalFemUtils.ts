import { Team, Match } from '../types';

export interface FutsalFemFinalSummary {
  teamA?: Team;
  teamB?: Team;
  teamAName: string;
  teamBName: string;
  idaMatch?: Match;
  voltaMatch?: Match;
  teamAGoals: number;
  teamBGoals: number;
  isIdaFinished: boolean;
  isVoltaFinished: boolean;
  isDecided: boolean;
  winnerTeamId?: string;
  winnerTeamName?: string;
  isTiedOnAggregate: boolean;
  decidedByPenalties: boolean;
}

/**
 * Calculates the aggregate score and final champion for Futsal Feminino
 * based on the two-legged final (Jogo de Ida e Jogo de Volta).
 */
export function getFutsalFemFinalSummary(teams: Team[], matches: Match[]): FutsalFemFinalSummary {
  const femTeams = teams.filter((t) => t.modality === 'futsal_fem');
  const femMatches = matches.filter((m) => m.modality === 'futsal_fem');

  const idaMatch = femMatches.find((m) => m.roundName.includes('Ida')) || femMatches[0];
  const voltaMatch = femMatches.find((m) => m.roundName.includes('Volta')) || femMatches[1];

  // Primary teams definition:
  // In Ida: teamAId is Team 1, teamBId is Team 2.
  const team1Id = idaMatch?.teamAId || femTeams[0]?.id;
  const team2Id = idaMatch?.teamBId || femTeams[1]?.id;

  const team1 = femTeams.find((t) => t.id === team1Id) || femTeams[0];
  const team2 = femTeams.find((t) => t.id === team2Id) || femTeams[1];

  const team1Name = idaMatch?.teamAName || team1?.name || 'Equipe A';
  const team2Name = idaMatch?.teamBName || team2?.name || 'Equipe B';

  let team1Goals = 0;
  let team2Goals = 0;

  const isIdaFinished = idaMatch !== undefined && idaMatch.scoreA !== undefined && idaMatch.scoreB !== undefined;
  const isVoltaFinished = voltaMatch !== undefined && voltaMatch.scoreA !== undefined && voltaMatch.scoreB !== undefined;

  // Ida match: teamA is team1, teamB is team2
  if (idaMatch && idaMatch.scoreA !== undefined && idaMatch.scoreB !== undefined) {
    if (idaMatch.teamAId === team1?.id) {
      team1Goals += idaMatch.scoreA;
      team2Goals += idaMatch.scoreB;
    } else {
      team1Goals += idaMatch.scoreB;
      team2Goals += idaMatch.scoreA;
    }
  }

  // Volta match: teamA is team2, teamB is team1 (or vice versa)
  if (voltaMatch && voltaMatch.scoreA !== undefined && voltaMatch.scoreB !== undefined) {
    if (voltaMatch.teamAId === team2?.id) {
      team2Goals += voltaMatch.scoreA;
      team1Goals += voltaMatch.scoreB;
    } else if (voltaMatch.teamAId === team1?.id) {
      team1Goals += voltaMatch.scoreA;
      team2Goals += voltaMatch.scoreB;
    } else {
      team2Goals += voltaMatch.scoreA;
      team1Goals += voltaMatch.scoreB;
    }
  }

  let isDecided = false;
  let winnerTeamId: string | undefined = undefined;
  let winnerTeamName: string | undefined = undefined;
  let isTiedOnAggregate = false;
  let decidedByPenalties = false;

  if (isIdaFinished && isVoltaFinished) {
    if (team1Goals > team2Goals) {
      isDecided = true;
      winnerTeamId = team1?.id;
      winnerTeamName = team1Name;
    } else if (team2Goals > team1Goals) {
      isDecided = true;
      winnerTeamId = team2?.id;
      winnerTeamName = team2Name;
    } else {
      // Tie on aggregate
      isTiedOnAggregate = true;
      // Check if decided by penalties on the Volta match (or Ida)
      const penaltyWinner = voltaMatch?.penaltyWinnerId || idaMatch?.penaltyWinnerId;
      if (penaltyWinner) {
        isDecided = true;
        decidedByPenalties = true;
        winnerTeamId = penaltyWinner;
        winnerTeamName = penaltyWinner === team1?.id ? team1Name : team2Name;
      }
    }
  }

  return {
    teamA: team1,
    teamB: team2,
    teamAName: team1Name,
    teamBName: team2Name,
    idaMatch,
    voltaMatch,
    teamAGoals: team1Goals,
    teamBGoals: team2Goals,
    isIdaFinished,
    isVoltaFinished,
    isDecided,
    winnerTeamId,
    winnerTeamName,
    isTiedOnAggregate,
    decidedByPenalties,
  };
}
