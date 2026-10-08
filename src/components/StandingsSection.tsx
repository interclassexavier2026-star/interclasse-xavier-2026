import React, { useState } from 'react';
import { Team, Match, ModalityType, User } from '../types';
import { MODALITY_CONFIGS } from '../utils/constants';
import { getFutsalFemFinalSummary } from '../utils/futsalFemUtils';
import { Trophy, Medal, Flame, Award, Star, Sparkles, TrendingUp, Shirt, Layers, Swords } from 'lucide-react';
import confetti from 'canvas-confetti';

interface StandingsSectionProps {
  teams: Team[];
  matches: Match[];
  activeModality: ModalityType;
  theme?: 'light' | 'dark';
  user?: User | null;
  onUpdateTeam?: (team: Team) => void;
}

interface ParticipantWinStats {
  team: Team;
  wins: number;
  losses: number;
  totalMatches: number;
  isChampion: boolean;
}

export const StandingsSection: React.FC<StandingsSectionProps> = ({
  teams,
  matches,
  activeModality,
  theme = 'dark',
  user,
  onUpdateTeam,
}) => {
  const [viewMode, setViewMode] = useState<'modality' | 'futsal_stats' | 'overall'>(
    activeModality === 'futsal_fem' ? 'modality' : activeModality === 'futsal_masc' ? 'futsal_stats' : 'overall'
  );
  const [showFemTable, setShowFemTable] = useState(false);

  React.useEffect(() => {
    if (activeModality === 'futsal_fem') {
      setViewMode('modality');
    } else if (activeModality === 'futsal_masc') {
      setViewMode('futsal_stats');
    } else {
      setViewMode('overall');
    }
    setShowFemTable(false);
  }, [activeModality]);

  const currentConfig = MODALITY_CONFIGS[activeModality];
  const isDark = theme === 'dark';
  const isAdmin = user?.role === 'admin' || user?.role === 'subadmin';

  // 1. Modality Wins Stats (Standard Knockout)
  const filteredTeams = teams.filter((t) => t.modality === activeModality);
  const filteredMatches = matches.filter((m) => m.modality === activeModality);

  const futsalFemSummary = React.useMemo(() => {
    if (activeModality !== 'futsal_fem') return null;
    return getFutsalFemFinalSummary(teams, matches);
  }, [teams, matches, activeModality]);

  const championId = React.useMemo(() => {
    if (activeModality === 'futsal_fem') {
      return futsalFemSummary?.winnerTeamId;
    }
    if (activeModality === 'tenis_mesa_fem') {
      const resetMatch = filteredMatches.find((m) => m.isResetMatch);
      if (resetMatch && resetMatch.isActive && resetMatch.winnerId) {
        return resetMatch.winnerId;
      }
      const firstFinal = filteredMatches.find((m) => m.roundName.includes('Grande Final') && !m.isResetMatch);
      if (firstFinal && firstFinal.winnerId) {
        if (firstFinal.winnerId === firstFinal.teamAId) {
          return firstFinal.winnerId;
        }
      }
      return undefined;
    }
    const finalMatch = filteredMatches.find(
      (m) => m.roundName === 'Grande Final' && m.winnerId
    );
    return finalMatch?.winnerId;
  }, [filteredMatches, activeModality, futsalFemSummary]);

  const statsMap: Record<string, ParticipantWinStats> = {};

  filteredTeams.forEach((t) => {
    statsMap[t.id] = {
      team: t,
      wins: 0,
      losses: 0,
      totalMatches: 0,
      isChampion: championId === t.id,
    };
  });

  filteredMatches.forEach((m) => {
    if (m.isBye && m.winnerId && statsMap[m.winnerId]) {
      statsMap[m.winnerId].wins += 1;
      statsMap[m.winnerId].totalMatches += 1;
      return;
    }

    if (m.winnerId) {
      if (statsMap[m.winnerId]) {
        statsMap[m.winnerId].wins += 1;
        statsMap[m.winnerId].totalMatches += 1;
      }
      if (m.loserId && statsMap[m.loserId]) {
        statsMap[m.loserId].losses += 1;
        statsMap[m.loserId].totalMatches += 1;
      }
    }
  });

  const rankedParticipants = Object.values(statsMap).sort((a, b) => {
    if (a.isChampion) return -1;
    if (b.isChampion) return 1;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });

  // 2. Futsal Goals & Fouls table calculation (Futsal Masc & Fem only)
  const futsalGoalsAndFoulsStats = React.useMemo(() => {
    const isFutsal = activeModality === 'futsal_masc' || activeModality === 'futsal_fem';
    if (!isFutsal) return [];

    const futsalTeams = teams.filter((t) => t.modality === activeModality);
    const futsalMatches = matches.filter((m) => m.modality === activeModality);

    const stats = futsalTeams.map((t) => {
      let goalsScored = 0;
      futsalMatches.forEach((m) => {
        if (m.scoreA !== undefined && m.scoreB !== undefined) {
          if (m.teamAId === t.id) {
            goalsScored += m.scoreA;
          } else if (m.teamBId === t.id) {
            goalsScored += m.scoreB;
          }
        }
      });
      return {
        team: t,
        goalsScored,
        fouls: t.fouls || 0,
      };
    });

    // Order: fewer fouls primarily (pushing teams with high fouls to the bottom), then most goals scored secondarily
    return stats.sort((a, b) => {
      if (a.fouls !== b.fouls) {
        return a.fouls - b.fouls; // Ascending fouls (fewer fouls is better!)
      }
      return b.goalsScored - a.goalsScored; // Descending goals scored
    });
  }, [teams, matches, activeModality]);

  // 4. School-wide Overall Class Wins (Ranking Geral por Sala)
  const classWinsMap: Record<string, { className: string; totalWins: number; shirtColor: string; imageUrl?: string }> = {};

  teams.forEach((t) => {
    const cleanClass = t.playerClass ? t.playerClass : t.name;

    if (!classWinsMap[cleanClass]) {
      classWinsMap[cleanClass] = {
        className: cleanClass,
        totalWins: 0,
        shirtColor: t.shirtColor,
        imageUrl: t.imageUrl,
      };
    } else if (t.imageUrl && !classWinsMap[cleanClass].imageUrl) {
      classWinsMap[cleanClass].imageUrl = t.imageUrl;
    }
  });

  matches.forEach((m) => {
    if (m.winnerId) {
      const winningTeam = teams.find((t) => t.id === m.winnerId);
      if (winningTeam) {
        const cleanClass = winningTeam.playerClass ? winningTeam.playerClass : winningTeam.name;
        if (classWinsMap[cleanClass]) {
          classWinsMap[cleanClass].totalWins += 1;
        }
      }
    }
  });

  const rankedSchoolClasses = Object.values(classWinsMap).sort(
    (a, b) => b.totalWins - a.totalWins
  );

  return (
    <section className={`py-6 sm:py-8 transition-colors duration-300 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-sky-50/50 text-slate-900'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
        {/* Section Header */}
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b pb-4 ${
          isDark ? 'border-blue-900/60' : 'border-sky-200'
        }`}>
          <div>
            <h2 className={`text-3xl font-black font-display uppercase tracking-tight ${
              isDark ? 'text-white' : 'text-sky-950'
            }`}>
              RESULTADOS & CLASSIFICAÇÃO
            </h2>
          </div>

          {/* Toggle Views */}
          <div className={`flex flex-wrap p-1.5 rounded-2xl border gap-1.5 ${
            isDark ? 'bg-slate-900 border-blue-900' : 'bg-white border-sky-200 shadow-sm'
          }`}>
            {activeModality === 'futsal_fem' && (
              <button
                onClick={() => setViewMode('modality')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'modality'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                🏆 Final Ida e Volta (Sem Grupos)
              </button>
            )}

            {activeModality === 'futsal_masc' && (
              <button
                onClick={() => setViewMode('futsal_stats')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'futsal_stats'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                ⚽ Gols & Faltas
              </button>
            )}

            <button
              onClick={() => setViewMode('overall')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'overall'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-sky-700'
              }`}
            >
              🏆 Geral das Salas (Escola)
            </button>
          </div>
        </div>

         {/* 1. Modality Standing rendering */}
        {viewMode === 'modality' && (
          <div className="space-y-6">
            {activeModality === 'futsal_fem' ? (
              <div className="space-y-6">
                {/* Futsal Feminino Ida e Volta Header and Aggregate Summary */}
                {futsalFemSummary && (
                  <div className={`p-5 rounded-3xl border-2 shadow-xl ${
                    isDark
                      ? 'bg-gradient-to-br from-slate-900 via-blue-950/70 to-slate-900 border-amber-400/40 text-white'
                      : 'bg-gradient-to-br from-sky-50 via-white to-amber-50/50 border-amber-300 text-slate-900'
                  }`}>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-amber-400/20">
                      <Trophy className="w-5 h-5 text-amber-400" />
                      <h3 className="text-base font-black font-display uppercase tracking-wide">
                        Decisão da Grande Final: Ida e Volta (Sem Grupos)
                      </h3>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      {/* Team A */}
                      <div className="flex items-center gap-3 flex-1 justify-end text-right">
                        <div>
                          <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">
                            Finalista 1
                          </span>
                          <h4 className="text-base sm:text-lg font-black uppercase font-display">
                            {futsalFemSummary.teamAName}
                          </h4>
                        </div>
                        {futsalFemSummary.teamA?.imageUrl ? (
                          <img
                            src={futsalFemSummary.teamA.imageUrl}
                            alt={futsalFemSummary.teamAName}
                            className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-400 shadow-md"
                          />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-white font-black"
                            style={{ backgroundColor: futsalFemSummary.teamA?.shirtColor || '#0284c7' }}
                          >
                            <Shirt className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      {/* Aggregate Score Center */}
                      <div className="flex flex-col items-center px-5 py-2.5 rounded-2xl bg-black/30 border border-amber-400/30">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                          Placar Agregado
                        </span>
                        <div className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white flex items-center gap-2">
                          <span className={futsalFemSummary.teamAGoals > futsalFemSummary.teamBGoals ? 'text-emerald-400' : ''}>
                            {futsalFemSummary.teamAGoals}
                          </span>
                          <span className="text-slate-500 text-2xl font-light">x</span>
                          <span className={futsalFemSummary.teamBGoals > futsalFemSummary.teamAGoals ? 'text-emerald-400' : ''}>
                            {futsalFemSummary.teamBGoals}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {futsalFemSummary.isDecided
                            ? futsalFemSummary.decidedByPenalties
                              ? 'Decidido nos Pênaltis'
                              : 'Resultado Final'
                            : futsalFemSummary.isIdaFinished
                            ? 'Jogo de Ida Concluído'
                            : 'Aguardando Partidas'}
                        </span>
                      </div>

                      {/* Team B */}
                      <div className="flex items-center gap-3 flex-1 justify-start text-left">
                        {futsalFemSummary.teamB?.imageUrl ? (
                          <img
                            src={futsalFemSummary.teamB.imageUrl}
                            alt={futsalFemSummary.teamBName}
                            className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-400 shadow-md"
                          />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-white font-black"
                            style={{ backgroundColor: futsalFemSummary.teamB?.shirtColor || '#db2777' }}
                          >
                            <Shirt className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">
                            Finalista 2
                          </span>
                          <h4 className="text-base sm:text-lg font-black uppercase font-display">
                            {futsalFemSummary.teamBName}
                          </h4>
                        </div>
                      </div>
                    </div>

                    {/* Champion Announcement */}
                    {futsalFemSummary.isDecided && futsalFemSummary.winnerTeamName && (
                      <div className="mt-4 pt-3 border-t border-amber-400/30 flex items-center justify-center gap-2 text-amber-300 font-black text-sm uppercase tracking-wide animate-pulse">
                        <Trophy className="w-5 h-5 text-amber-400" />
                        <span>
                          🏆 Equipe Campeã Oficial: {futsalFemSummary.winnerTeamName}
                          {futsalFemSummary.decidedByPenalties ? ' (Vencedora nos Pênaltis)' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Team Ranking Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {rankedParticipants.map((stat) => {
                    return (
                      <div
                        key={stat.team.id}
                        className={`rounded-3xl p-6 border-2 transition-all shadow-md relative overflow-hidden flex flex-col justify-between ${
                          stat.isChampion
                            ? 'border-amber-400 bg-amber-500/10 ring-4 ring-amber-400/20'
                            : isDark
                            ? 'bg-slate-900 border-blue-900/80 text-white'
                            : 'bg-white border-sky-200 text-slate-900'
                        }`}
                      >
                        <div
                          className="absolute top-0 left-0 right-0 h-2"
                          style={{ backgroundColor: stat.team.shirtColor }}
                        />

                        <div>
                          <div className="flex items-center justify-between mb-4 pt-1">
                            <div className="flex items-center gap-2">
                              {stat.isChampion ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                                    } catch {}
                                  }}
                                  className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl uppercase flex items-center gap-1 shadow-md cursor-pointer transition-transform hover:scale-105"
                                  title="Clique para comemorar com confetes!"
                                >
                                  <Trophy className="w-3.5 h-3.5 animate-bounce" /> 1º Campeã 🎉
                                </button>
                              ) : (
                                <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl uppercase">
                                  Finalista
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-400">
                              Futsal Feminino
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            {stat.team.imageUrl ? (
                              <img
                                src={stat.team.imageUrl}
                                alt={stat.team.name}
                                className="w-12 h-12 rounded-2xl object-cover border-2 shadow-sm border-blue-800"
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-white shadow-sm"
                                style={{
                                  backgroundColor: stat.team.shirtColor,
                                  borderColor: isDark ? '#1e3a8a' : '#cbd5e1',
                                }}
                              >
                                <Shirt className="w-6 h-6" />
                              </div>
                            )}

                            <div>
                              <h4 className={`text-base font-black uppercase font-display tracking-tight ${
                                isDark ? 'text-white' : 'text-sky-950'
                              }`}>
                                {stat.team.name}
                              </h4>
                              <span className={`text-xs font-bold block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                Decisão em Ida e Volta
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className={`mt-4 pt-3 border-t grid grid-cols-2 gap-2 text-center text-xs ${
                          isDark ? 'border-blue-900/60' : 'border-sky-100'
                        }`}>
                          <div>
                            <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              Gols no Agregado
                            </span>
                            <span className={`font-black text-base ${isDark ? 'text-white' : 'text-sky-950'}`}>
                              {stat.team.id === futsalFemSummary?.teamA?.id ? futsalFemSummary?.teamAGoals : futsalFemSummary?.teamBGoals}
                            </span>
                          </div>
                          <div>
                            <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              Status
                            </span>
                            <span className={`font-black ${stat.isChampion ? 'text-amber-400' : 'text-slate-400'}`}>
                              {stat.isChampion ? '🏆 Campeã' : 'Finalista'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Standard Modality Wins Stats for knockout tournaments */
              rankedParticipants.length === 0 ? (
                <div className={`text-center py-16 border border-dashed rounded-3xl p-8 ${
                  isDark ? 'bg-slate-900/40 border-blue-900' : 'bg-white border-sky-200'
                }`}>
                  <Trophy className="w-12 h-12 text-sky-500 mx-auto mb-3" />
                  <h3 className={`text-lg font-bold uppercase ${isDark ? 'text-white' : 'text-sky-950'}`}>
                    Sem vitórias registradas em {currentConfig.label}
                  </h3>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    O quadro será atualizado automaticamente com o avanço de cada partida do chaveamento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {rankedParticipants.map((stat, idx) => {
                    const isGold = idx === 0 && stat.wins > 0;
                    const isSilver = idx === 1 && stat.wins > 0;
                    const isBronze = idx === 2 && stat.wins > 0;

                    return (
                      <div
                        key={stat.team.id}
                        className={`rounded-3xl p-6 border-2 transition-all shadow-md relative overflow-hidden flex flex-col justify-between ${
                          stat.isChampion
                            ? 'border-amber-400 bg-amber-500/10 ring-4 ring-amber-400/20'
                            : isDark
                            ? 'bg-slate-900 border-blue-900/80 text-white'
                            : 'bg-white border-sky-200 text-slate-900'
                        }`}
                      >
                        <div
                          className="absolute top-0 left-0 right-0 h-2"
                          style={{ backgroundColor: stat.team.shirtColor }}
                        />

                        <div>
                          <div className="flex items-center justify-between mb-4 pt-1">
                            <div className="flex items-center gap-2">
                              {stat.isChampion ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                                    } catch {}
                                  }}
                                  className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl uppercase flex items-center gap-1 shadow-md cursor-pointer transition-transform hover:scale-105"
                                  title="Clique para comemorar com confetes!"
                                >
                                  <Trophy className="w-3.5 h-3.5 animate-bounce" /> 1º Campeão 🎉
                                </button>
                              ) : isGold ? (
                                <span className="px-2.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-400/40 text-xs font-black rounded-xl flex items-center gap-1">
                                  🥇 1º Lugar
                                </span>
                              ) : isSilver ? (
                                <span className="px-2.5 py-1 bg-slate-400/20 text-slate-300 border border-slate-400/40 text-xs font-bold rounded-xl flex items-center gap-1">
                                  🥈 2º Lugar
                                </span>
                              ) : isBronze ? (
                                <span className="px-2.5 py-1 bg-amber-700/20 text-amber-300 border border-amber-700/40 text-xs font-bold rounded-xl flex items-center gap-1">
                                  🥉 3º Lugar
                                </span>
                              ) : (
                                <span className={`px-2.5 py-1 border text-xs font-bold rounded-xl ${
                                  isDark ? 'bg-slate-950 border-blue-900 text-slate-300' : 'bg-sky-50 border-sky-200 text-slate-700'
                                }`}>
                                  {idx + 1}º Lugar
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 text-amber-400 font-black text-sm">
                              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
                              <span>{stat.wins} {stat.wins === 1 ? 'Vitória' : 'Vitórias'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {stat.team.imageUrl ? (
                              <img
                                src={stat.team.imageUrl}
                                alt={stat.team.name}
                                className={`w-12 h-12 rounded-2xl object-cover border-2 shadow-sm ${
                                  isDark ? 'border-blue-800' : 'border-sky-200 bg-white'
                                }`}
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-white shadow-sm"
                                style={{
                                  backgroundColor: stat.team.shirtColor,
                                  borderColor: isDark ? '#1e3a8a' : '#cbd5e1',
                                }}
                              >
                                <Shirt className="w-6 h-6" />
                              </div>
                            )}

                            <div>
                              <h4 className={`text-base font-black uppercase font-display tracking-tight ${
                                isDark ? 'text-white' : 'text-sky-950'
                              }`}>
                                {stat.team.playerName && stat.team.playerClass
                                  ? stat.team.playerName
                                  : stat.team.name}
                              </h4>
                              <span className={`text-xs font-bold block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {stat.team.playerClass 
                                  ? `Sala: ${stat.team.playerClass}` 
                                  : stat.team.modality === 'futsal_masc' 
                                    ? 'Futsal Masculino' 
                                    : stat.team.modality === 'futsal_fem' 
                                      ? 'Futsal Feminino' 
                                      : 'Vôlei Misto'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className={`mt-4 pt-3 border-t grid grid-cols-2 gap-2 text-center text-xs ${
                          isDark ? 'border-blue-900/60' : 'border-sky-100'
                        }`}>
                          <div>
                            <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              Partidas Jogadas
                            </span>
                            <span className={`font-black ${isDark ? 'text-white' : 'text-sky-950'}`}>{stat.totalMatches}</span>
                          </div>
                          <div>
                            <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              Aproveitamento
                            </span>
                            <span className="font-black text-emerald-500">
                              {stat.totalMatches > 0
                                ? `${Math.round((stat.wins / stat.totalMatches) * 100)}%`
                                : '0%'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* 2. Futsal Goals & Fouls table rendering */}
        {viewMode === 'futsal_stats' && (
          <div className="space-y-6">
            <div className={`border-2 rounded-3xl overflow-hidden shadow-xl ${
              isDark ? 'bg-[#0b1329] border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="p-5 bg-slate-900 border-b border-slate-800 text-white">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-black font-display uppercase tracking-wide">
                    Tabela de Controle: Gols Marcados & Faltas
                  </h3>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className={`border-b text-[10px] font-black uppercase tracking-wider ${
                      isDark ? 'bg-[#070d1e] text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      <th className="py-3 px-4 text-center w-12">Pos</th>
                      <th className="py-3 px-4">Sala / Time</th>
                      <th className="py-3 px-4 text-center">GP (Gols Pró)</th>
                      <th className="py-3 px-4 text-center w-40">Faltas Cometidas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {futsalGoalsAndFoulsStats.map((stat, idx) => (
                      <tr key={stat.team.id} className="text-xs hover:bg-slate-900/30">
                        <td className="py-4 px-4 text-center font-black">
                          {idx === 0 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-400 text-slate-950 font-black">
                              1º
                            </span>
                          ) : (
                            `${idx + 1}º`
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-sm shrink-0 shadow-sm border border-slate-700" style={{ backgroundColor: stat.team.shirtColor }} />
                            <span className="font-black uppercase">{stat.team.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-block px-3 py-1 bg-sky-500/20 border border-sky-500/30 text-sky-300 font-mono font-black text-sm rounded-lg">
                            {stat.goalsScored} Gols
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {isAdmin && onUpdateTeam ? (
                            <div className="inline-flex items-center gap-2 px-2 py-1 bg-slate-950 rounded-xl border border-slate-800">
                              <button
                                type="button"
                                title="Diminuir falta"
                                onClick={() => {
                                  onUpdateTeam({
                                    ...stat.team,
                                    fouls: Math.max(0, (stat.team.fouls || 0) - 1),
                                  });
                                }}
                                className="w-6 h-6 flex items-center justify-center bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg text-xs font-black transition-all cursor-pointer"
                              >
                                -
                              </button>
                              <span className="font-mono font-black text-sm text-white w-6 text-center">
                                {stat.team.fouls || 0}
                              </span>
                              <button
                                type="button"
                                title="Aumentar falta"
                                onClick={() => {
                                  onUpdateTeam({
                                    ...stat.team,
                                    fouls: (stat.team.fouls || 0) + 1,
                                  });
                                }}
                                className="w-6 h-6 flex items-center justify-center bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-lg text-xs font-black transition-all cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <span className="inline-block px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg font-mono font-black text-sm text-rose-400">
                              {stat.fouls} Faltas
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={`p-4 border-t text-[10px] leading-relaxed ${
                isDark ? 'bg-[#070d1e] border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-500'
              }`}>
                <p className="font-bold uppercase mb-1">Critério de Classificação da Tabela:</p>
                <p>
                  1º Critério: <strong>Maior número de gols marcados (GP)</strong>. Se houver empate em gols, o time com <strong>menor número de faltas cometidas</strong> fica na frente!
                </p>
                {isAdmin && (
                  <p className="mt-1 text-emerald-400 font-bold">
                    * Como administrador, use os botões (+) e (-) para adicionar ou remover faltas cometidas por cada sala em tempo real!
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. Overall ranking rendering */}
        {viewMode === 'overall' && (
          <div className="space-y-6">
            <div className={`p-6 border-2 rounded-3xl shadow-md ${
              isDark ? 'bg-slate-900 border-blue-900/80 text-white' : 'bg-white border-sky-200 text-slate-900'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className={`text-lg font-black uppercase font-display ${isDark ? 'text-white' : 'text-sky-950'}`}>
                  Ranking Geral das Turmas da Escola
                </h3>
              </div>
              <p className={`text-xs mb-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Soma de todas as vitórias obtidas pela mesma sala em todas as modalidades do Interclasse 2026.
              </p>

              <div className="space-y-3">
                {rankedSchoolClasses.map((item, index) => (
                  <div
                    key={item.className}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      index === 0
                        ? 'bg-amber-500/10 border-amber-400/50 font-bold'
                        : isDark
                        ? 'bg-slate-950 border-blue-900/60'
                        : 'bg-sky-50/50 border-sky-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                        index === 0
                          ? 'bg-amber-400 text-slate-950'
                          : index === 1
                          ? 'bg-slate-300 text-slate-900'
                          : index === 2
                          ? 'bg-amber-700 text-white'
                          : isDark ? 'bg-slate-800 text-slate-300' : 'bg-sky-200 text-sky-900'
                      }`}>
                        {index + 1}º
                      </span>

                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.className}
                          className="w-9 h-9 rounded-xl object-cover border border-amber-400/40"
                        />
                      )}

                      <div>
                        <span className={`text-sm font-black uppercase block ${isDark ? 'text-white' : 'text-sky-950'}`}>
                          {item.className}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-black text-amber-400">
                        {item.totalWins} {item.totalWins === 1 ? 'Vitória' : 'Vitórias'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
