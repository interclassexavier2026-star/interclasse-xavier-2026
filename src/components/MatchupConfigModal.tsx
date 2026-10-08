import React, { useState } from 'react';
import { Match, Team, ModalityType } from '../types';
import { MODALITY_CONFIGS } from '../utils/constants';
import {
  Swords,
  Shuffle,
  Trophy,
  ArrowRight,
  Check,
  X,
  Sparkles,
  RefreshCw,
  Flame,
  Layers,
  ArrowLeftRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface MatchupConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: Match[];
  teams: Team[];
  activeModality: ModalityType;
  onSaveMatches: (updatedMatches: Match[]) => void;
  theme?: 'light' | 'dark';
}

export const MatchupConfigModal: React.FC<MatchupConfigModalProps> = ({
  isOpen,
  onClose,
  matches,
  teams,
  activeModality,
  onSaveMatches,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const modalityConfig = MODALITY_CONFIGS[activeModality];

  // Modality teams and matches
  const modalityTeams = React.useMemo(() => {
    return teams.filter((t) => t.modality === activeModality);
  }, [teams, activeModality]);

  const modalityMatches = React.useMemo(() => {
    return matches.filter((m) => m.modality === activeModality);
  }, [matches, activeModality]);

  // Group modality matches by roundIndex
  const roundsMap = React.useMemo(() => {
    const map = new Map<number, Match[]>();
    modalityMatches.forEach((m) => {
      const list = map.get(m.roundIndex) || [];
      list.push(m);
      map.set(m.roundIndex, list);
    });
    return map;
  }, [modalityMatches]);

  const roundIndices = React.useMemo(() => {
    return Array.from(roundsMap.keys()).sort((a, b) => a - b);
  }, [roundsMap]);

  // Local draft of matches
  const [draftMatches, setDraftMatches] = useState<Match[]>([]);
  const [activeTabRound, setActiveTabRound] = useState<number>(1);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize draft when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDraftMatches(JSON.parse(JSON.stringify(modalityMatches)));
      if (roundIndices.length > 0) {
        setActiveTabRound(roundIndices[0]);
      }
      setSaveSuccess(false);
    }
  }, [isOpen, modalityMatches, roundIndices]);

  if (!isOpen) return null;

  const currentRoundMatches = draftMatches.filter((m) => m.roundIndex === activeTabRound);
  const isFirstRound = activeTabRound === roundIndices[0];
  const previousRoundIndex = roundIndices[roundIndices.indexOf(activeTabRound) - 1];
  const previousRoundMatches = draftMatches.filter((m) => m.roundIndex === previousRoundIndex);

  // Helper to get formatted team label
  const getTeamLabel = (team?: Team) => {
    if (!team) return 'A definir';
    if (team.playerName && team.playerClass) {
      return `${team.playerName} (${team.playerClass})`;
    }
    return team.name;
  };

  // Helper to clean round name (strip trailing digits)
  const cleanRoundName = (name: string): string => {
    return name.replace(/\s+\d+$/, '').trim();
  };

  // Helper to resolve slot value string
  const getSlotValue = (m: Match, slot: 'A' | 'B'): string => {
    if (slot === 'A') {
      if (m.sourceMatchAId) return `source:${m.sourceMatchAId}`;
      if (m.teamAId && m.teamAId !== 'BYE' && m.teamAId !== 'SEM OPONENTE') return `team:${m.teamAId}`;
      if (m.teamAName === 'SEM OPONENTE' || m.teamAName === 'BYE' || m.teamAId === 'BYE') return 'BYE';
      return '';
    } else {
      if (m.sourceMatchBId) return `source:${m.sourceMatchBId}`;
      if (m.teamBId && m.teamBId !== 'BYE' && m.teamBId !== 'SEM OPONENTE') return `team:${m.teamBId}`;
      if (m.teamBName === 'SEM OPONENTE' || m.teamBName === 'BYE' || m.teamBId === 'BYE') return 'BYE';
      return '';
    }
  };

  // Universal handler to set participant in ANY phase
  const handleSetSlot = (targetMatchId: string, slot: 'A' | 'B', rawValue: string) => {
    setDraftMatches((prev) => {
      let updated = [...prev];

      // If value is a source match
      if (rawValue.startsWith('source:')) {
        const sourceMatchId = rawValue.replace('source:', '');
        const sourceMatch = prev.find((m) => m.id === sourceMatchId);
        const sourceLabel = sourceMatch ? `Venc. Jogo ${sourceMatch.matchNumber}` : 'A definir';
        const winnerId = sourceMatch?.winnerId;
        const winnerTeam = winnerId ? modalityTeams.find((t) => t.id === winnerId) : undefined;
        const resolvedTeamName = winnerTeam ? getTeamLabel(winnerTeam) : sourceLabel;

        updated = updated.map((m) => {
          if (m.id === targetMatchId) {
            if (slot === 'A') {
              return {
                ...m,
                sourceMatchAId: sourceMatchId,
                sourceLabelA: sourceLabel,
                teamAId: winnerId,
                teamAName: resolvedTeamName,
                isManualSlotA: false,
                isBye: false,
              };
            } else {
              return {
                ...m,
                sourceMatchBId: sourceMatchId,
                sourceLabelB: sourceLabel,
                teamBId: winnerId,
                teamBName: resolvedTeamName,
                isManualSlotB: false,
                isBye: false,
              };
            }
          }

          // Link source match nextMatchId
          if (m.id === sourceMatchId) {
            return {
              ...m,
              nextMatchId: targetMatchId,
              nextMatchSlot: slot,
            };
          }

          // If another match was previously pointing to this slot of targetMatch, unlink it
          if (m.nextMatchId === targetMatchId && m.nextMatchSlot === slot && m.id !== sourceMatchId) {
            return {
              ...m,
              nextMatchId: undefined,
              nextMatchSlot: undefined,
            };
          }

          return m;
        });
      }
      // If value is a specific team
      else if (rawValue.startsWith('team:')) {
        const teamId = rawValue.replace('team:', '');
        const selectedTeam = modalityTeams.find((t) => t.id === teamId);
        const teamName = selectedTeam ? getTeamLabel(selectedTeam) : 'A definir';

        updated = updated.map((m) => {
          if (m.id === targetMatchId) {
            const nextMatchObj = { ...m };
            if (slot === 'A') {
              nextMatchObj.teamAId = teamId;
              nextMatchObj.teamAName = teamName;
              nextMatchObj.sourceMatchAId = undefined;
              nextMatchObj.sourceLabelA = undefined;
              nextMatchObj.isManualSlotA = true;
              // Check if B is BYE
              if (nextMatchObj.teamBName === 'SEM OPONENTE' || nextMatchObj.teamBName === 'BYE') {
                nextMatchObj.isBye = true;
                nextMatchObj.winnerId = teamId;
              } else {
                nextMatchObj.isBye = false;
              }
            } else {
              nextMatchObj.teamBId = teamId;
              nextMatchObj.teamBName = teamName;
              nextMatchObj.sourceMatchBId = undefined;
              nextMatchObj.sourceLabelB = undefined;
              nextMatchObj.isManualSlotB = true;
              // Check if A is BYE
              if (nextMatchObj.teamAName === 'SEM OPONENTE' || nextMatchObj.teamAName === 'BYE') {
                nextMatchObj.isBye = true;
                nextMatchObj.winnerId = teamId;
              } else {
                nextMatchObj.isBye = false;
              }
            }
            return nextMatchObj;
          }

          // Unlink any child match that was pointing to this overridden slot
          if (m.nextMatchId === targetMatchId && m.nextMatchSlot === slot) {
            return {
              ...m,
              nextMatchId: undefined,
              nextMatchSlot: undefined,
            };
          }

          return m;
        });
      }
      // If value is BYE / SEM OPONENTE
      else if (rawValue === 'BYE') {
        updated = updated.map((m) => {
          if (m.id === targetMatchId) {
            const nextMatchObj = { ...m, isBye: true };
            if (slot === 'A') {
              nextMatchObj.teamAId = undefined;
              nextMatchObj.teamAName = 'SEM OPONENTE';
              nextMatchObj.sourceMatchAId = undefined;
              nextMatchObj.sourceLabelA = undefined;
              nextMatchObj.isManualSlotA = true;
              if (nextMatchObj.teamBId) {
                nextMatchObj.winnerId = nextMatchObj.teamBId;
                nextMatchObj.scoreA = 0;
                nextMatchObj.scoreB = 1;
              }
            } else {
              nextMatchObj.teamBId = undefined;
              nextMatchObj.teamBName = 'SEM OPONENTE';
              nextMatchObj.sourceMatchBId = undefined;
              nextMatchObj.sourceLabelB = undefined;
              nextMatchObj.isManualSlotB = true;
              if (nextMatchObj.teamAId) {
                nextMatchObj.winnerId = nextMatchObj.teamAId;
                nextMatchObj.scoreA = 1;
                nextMatchObj.scoreB = 0;
              }
            }
            return nextMatchObj;
          }

          // Unlink any child match that was pointing to this slot
          if (m.nextMatchId === targetMatchId && m.nextMatchSlot === slot) {
            return {
              ...m,
              nextMatchId: undefined,
              nextMatchSlot: undefined,
            };
          }

          return m;
        });
      }
      // If empty: A definir
      else {
        updated = updated.map((m) => {
          if (m.id === targetMatchId) {
            if (slot === 'A') {
              return {
                ...m,
                teamAId: undefined,
                teamAName: 'A definir',
                sourceMatchAId: undefined,
                sourceLabelA: undefined,
                isManualSlotA: true,
                isBye: false,
                winnerId: undefined,
              };
            } else {
              return {
                ...m,
                teamBId: undefined,
                teamBName: 'A definir',
                sourceMatchBId: undefined,
                sourceLabelB: undefined,
                isManualSlotB: true,
                isBye: false,
                winnerId: undefined,
              };
            }
          }

          // Unlink any child match
          if (m.nextMatchId === targetMatchId && m.nextMatchSlot === slot) {
            return {
              ...m,
              nextMatchId: undefined,
              nextMatchSlot: undefined,
            };
          }

          return m;
        });
      }

      return updated;
    });
  };

  // Swap Participant A and Participant B in a match
  const handleSwapSlots = (matchId: string) => {
    setDraftMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;

        return {
          ...m,
          teamAId: m.teamBId,
          teamBId: m.teamAId,
          teamAName: m.teamBName,
          teamBName: m.teamAName,
          scoreA: m.scoreB,
          scoreB: m.scoreA,
          sourceMatchAId: m.sourceMatchBId,
          sourceMatchBId: m.sourceMatchAId,
          sourceLabelA: m.sourceLabelB,
          sourceLabelB: m.sourceLabelA,
          isManualSlotA: m.isManualSlotB,
          isManualSlotB: m.isManualSlotA,
        };
      })
    );
  };

  // Quick preset: Apply Cruzado (ex: Jogo 1 x Jogo 4, Jogo 2 x Jogo 3)
  const handleApplyCrossingPreset = () => {
    if (previousRoundMatches.length < 4 || currentRoundMatches.length < 2) return;

    const prevM1 = previousRoundMatches[0];
    const prevM2 = previousRoundMatches[1];
    const prevM3 = previousRoundMatches[2];
    const prevM4 = previousRoundMatches[3];

    const semi1 = currentRoundMatches[0];
    const semi2 = currentRoundMatches[1];

    if (!semi1 || !semi2 || !prevM1 || !prevM2 || !prevM3 || !prevM4) return;

    setDraftMatches((prev) => {
      let updated = [...prev];

      // Semi 1: Jogo 1 x Jogo 4
      updated = updated.map((m) => {
        if (m.id === semi1.id) {
          const win1 = prevM1.winnerId ? modalityTeams.find((t) => t.id === prevM1.winnerId) : undefined;
          const win4 = prevM4.winnerId ? modalityTeams.find((t) => t.id === prevM4.winnerId) : undefined;
          return {
            ...m,
            sourceMatchAId: prevM1.id,
            sourceLabelA: `Venc. Jogo ${prevM1.matchNumber}`,
            teamAId: prevM1.winnerId,
            teamAName: win1 ? getTeamLabel(win1) : `Venc. Jogo ${prevM1.matchNumber}`,
            isManualSlotA: false,
            sourceMatchBId: prevM4.id,
            sourceLabelB: `Venc. Jogo ${prevM4.matchNumber}`,
            teamBId: prevM4.winnerId,
            teamBName: win4 ? getTeamLabel(win4) : `Venc. Jogo ${prevM4.matchNumber}`,
            isManualSlotB: false,
          };
        }
        if (m.id === semi2.id) {
          const win2 = prevM2.winnerId ? modalityTeams.find((t) => t.id === prevM2.winnerId) : undefined;
          const win3 = prevM3.winnerId ? modalityTeams.find((t) => t.id === prevM3.winnerId) : undefined;
          return {
            ...m,
            sourceMatchAId: prevM2.id,
            sourceLabelA: `Venc. Jogo ${prevM2.matchNumber}`,
            teamAId: prevM2.winnerId,
            teamAName: win2 ? getTeamLabel(win2) : `Venc. Jogo ${prevM2.matchNumber}`,
            isManualSlotA: false,
            sourceMatchBId: prevM3.id,
            sourceLabelB: `Venc. Jogo ${prevM3.matchNumber}`,
            teamBId: prevM3.winnerId,
            teamBName: win3 ? getTeamLabel(win3) : `Venc. Jogo ${prevM3.matchNumber}`,
            isManualSlotB: false,
          };
        }
        if (m.id === prevM1.id) return { ...m, nextMatchId: semi1.id, nextMatchSlot: 'A' };
        if (m.id === prevM4.id) return { ...m, nextMatchId: semi1.id, nextMatchSlot: 'B' };
        if (m.id === prevM2.id) return { ...m, nextMatchId: semi2.id, nextMatchSlot: 'A' };
        if (m.id === prevM3.id) return { ...m, nextMatchId: semi2.id, nextMatchSlot: 'B' };
        return m;
      });

      return updated;
    });
  };

  // Quick preset: Apply Sequential (Jogo 1 x Jogo 2, Jogo 3 x Jogo 4)
  const handleApplySequentialPreset = () => {
    if (previousRoundMatches.length < 4 || currentRoundMatches.length < 2) return;

    const prevM1 = previousRoundMatches[0];
    const prevM2 = previousRoundMatches[1];
    const prevM3 = previousRoundMatches[2];
    const prevM4 = previousRoundMatches[3];

    const semi1 = currentRoundMatches[0];
    const semi2 = currentRoundMatches[1];

    if (!semi1 || !semi2 || !prevM1 || !prevM2 || !prevM3 || !prevM4) return;

    setDraftMatches((prev) => {
      let updated = [...prev];

      // Semi 1: Jogo 1 x Jogo 2
      updated = updated.map((m) => {
        if (m.id === semi1.id) {
          const win1 = prevM1.winnerId ? modalityTeams.find((t) => t.id === prevM1.winnerId) : undefined;
          const win2 = prevM2.winnerId ? modalityTeams.find((t) => t.id === prevM2.winnerId) : undefined;
          return {
            ...m,
            sourceMatchAId: prevM1.id,
            sourceLabelA: `Venc. Jogo ${prevM1.matchNumber}`,
            teamAId: prevM1.winnerId,
            teamAName: win1 ? getTeamLabel(win1) : `Venc. Jogo ${prevM1.matchNumber}`,
            isManualSlotA: false,
            sourceMatchBId: prevM2.id,
            sourceLabelB: `Venc. Jogo ${prevM2.matchNumber}`,
            teamBId: prevM2.winnerId,
            teamBName: win2 ? getTeamLabel(win2) : `Venc. Jogo ${prevM2.matchNumber}`,
            isManualSlotB: false,
          };
        }
        if (m.id === semi2.id) {
          const win3 = prevM3.winnerId ? modalityTeams.find((t) => t.id === prevM3.winnerId) : undefined;
          const win4 = prevM4.winnerId ? modalityTeams.find((t) => t.id === prevM4.winnerId) : undefined;
          return {
            ...m,
            sourceMatchAId: prevM3.id,
            sourceLabelA: `Venc. Jogo ${prevM3.matchNumber}`,
            teamAId: prevM3.winnerId,
            teamAName: win3 ? getTeamLabel(win3) : `Venc. Jogo ${prevM3.matchNumber}`,
            isManualSlotA: false,
            sourceMatchBId: prevM4.id,
            sourceLabelB: `Venc. Jogo ${prevM4.matchNumber}`,
            teamBId: prevM4.winnerId,
            teamBName: win4 ? getTeamLabel(win4) : `Venc. Jogo ${prevM4.matchNumber}`,
            isManualSlotB: false,
          };
        }
        if (m.id === prevM1.id) return { ...m, nextMatchId: semi1.id, nextMatchSlot: 'A' };
        if (m.id === prevM2.id) return { ...m, nextMatchId: semi1.id, nextMatchSlot: 'B' };
        if (m.id === prevM3.id) return { ...m, nextMatchId: semi2.id, nextMatchSlot: 'A' };
        if (m.id === prevM4.id) return { ...m, nextMatchId: semi2.id, nextMatchSlot: 'B' };
        return m;
      });

      return updated;
    });
  };

  // Shuffle teams in the CURRENT round
  const handleShuffleCurrentRound = () => {
    if (isFirstRound) {
      const shuffled = [...modalityTeams].sort(() => Math.random() - 0.5);
      setDraftMatches((prev) => {
        let teamIndex = 0;
        return prev.map((m) => {
          if (m.roundIndex !== activeTabRound) return m;
          const teamA = shuffled[teamIndex++];
          const teamB = shuffled[teamIndex++];
          return {
            ...m,
            teamAId: teamA?.id,
            teamAName: teamA ? getTeamLabel(teamA) : 'A definir',
            teamBId: teamB?.id,
            teamBName: teamB ? getTeamLabel(teamB) : 'A definir',
            isManualSlotA: true,
            isManualSlotB: true,
            sourceMatchAId: undefined,
            sourceMatchBId: undefined,
            isBye: false,
          };
        });
      });
    } else {
      // For subsequent rounds: collect all currently present teams/winners in this round, shuffle and redistribute
      const activeMatches = draftMatches.filter((m) => m.roundIndex === activeTabRound);
      const candidates: { id?: string; name: string }[] = [];

      activeMatches.forEach((m) => {
        if (m.teamAId) candidates.push({ id: m.teamAId, name: m.teamAName || 'A definir' });
        if (m.teamBId) candidates.push({ id: m.teamBId, name: m.teamBName || 'A definir' });
      });

      // If candidates are empty, try winners of previous round
      if (candidates.length === 0 && previousRoundMatches.length > 0) {
        previousRoundMatches.forEach((prevM) => {
          if (prevM.winnerId) {
            const team = modalityTeams.find((t) => t.id === prevM.winnerId);
            candidates.push({ id: prevM.winnerId, name: team ? getTeamLabel(team) : `Venc. Jogo ${prevM.matchNumber}` });
          } else {
            candidates.push({ id: undefined, name: `Venc. Jogo ${prevM.matchNumber}` });
          }
        });
      }

      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      let candIdx = 0;

      setDraftMatches((prev) =>
        prev.map((m) => {
          if (m.roundIndex !== activeTabRound) return m;
          const cA = shuffled[candIdx++];
          const cB = shuffled[candIdx++];
          return {
            ...m,
            teamAId: cA?.id,
            teamAName: cA?.name || 'A definir',
            teamBId: cB?.id,
            teamBName: cB?.name || 'A definir',
            isManualSlotA: Boolean(cA?.id),
            isManualSlotB: Boolean(cB?.id),
          };
        })
      );
    }
  };

  // Clear matchups in the current round
  const handleClearCurrentRound = () => {
    setDraftMatches((prev) =>
      prev.map((m) => {
        if (m.roundIndex !== activeTabRound) return m;
        return {
          ...m,
          teamAId: undefined,
          teamAName: 'A definir',
          teamBId: undefined,
          teamBName: 'A definir',
          sourceMatchAId: undefined,
          sourceMatchBId: undefined,
          sourceLabelA: undefined,
          sourceLabelB: undefined,
          isManualSlotA: true,
          isManualSlotB: true,
          isBye: false,
          scoreA: undefined,
          scoreB: undefined,
          winnerId: undefined,
          loserId: undefined,
        };
      })
    );
  };

  // Save changes
  const handleSave = () => {
    // Clean all round names (remove trailing digits like 'Quartas de Final 1' -> 'Quartas de Final')
    const cleaned = draftMatches.map((m) => ({
      ...m,
      roundName: cleanRoundName(m.roundName),
    }));

    onSaveMatches(cleaned);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in text-slate-900">
      <div
        className={`w-full max-w-5xl max-h-[90vh] sm:max-h-[88vh] flex flex-col rounded-2xl sm:rounded-3xl shadow-2xl border-2 overflow-hidden transition-all ${
          isDark ? 'bg-slate-900 border-amber-400/60 text-white' : 'bg-white border-amber-400 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="bg-slate-950 px-4 sm:px-6 py-2.5 sm:py-3 border-b border-amber-400/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-400">
              <Swords className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                {modalityConfig.label} • Gerenciador de Chaveamento
              </span>
              <h2 className="text-base sm:text-lg font-black font-display uppercase tracking-tight text-white">
                Definir Confrontos em Todas as Fases
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Phase Selector Tabs (All rounds: 1ª Fase, 16-avos, Oitavas, Quartas, Semifinal, Final, etc.) */}
        <div className="px-4 sm:px-6 pt-2 pb-1.5 border-b border-slate-800 bg-slate-950/40 flex items-center gap-1.5 overflow-x-auto scrollbar-thin shrink-0">
          {roundIndices.map((rIdx) => {
            const matchesInR = draftMatches.filter((m) => m.roundIndex === rIdx);
            const rawName = matchesInR[0]?.roundName || `Fase ${rIdx}`;
            const cleanName = cleanRoundName(rawName);
            const isSelected = activeTabRound === rIdx;

            return (
              <button
                key={rIdx}
                type="button"
                onClick={() => setActiveTabRound(rIdx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md scale-102 ring-2 ring-amber-400/50'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-950'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{cleanName}</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? 'bg-slate-950 text-amber-300'
                      : isDark
                      ? 'bg-slate-900 text-slate-400'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {matchesInR.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Phase Action Toolbar */}
        <div className="px-4 sm:px-6 py-2 bg-slate-950/20 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>{cleanRoundName(currentRoundMatches[0]?.roundName || `Fase ${activeTabRound}`)}</span>
            </span>
            <span className="text-[11px] text-slate-400">
              ({currentRoundMatches.length} jogos)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Quick Sorteio / Embaralhar Button for CURRENT phase */}
            <button
              type="button"
              onClick={handleShuffleCurrentRound}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black uppercase tracking-wider transition-all shadow cursor-pointer"
            >
              <Shuffle className="w-3 h-3" />
              <span>Sortear Fase</span>
            </button>

            {/* Quick Presets if previous round has 4+ matches */}
            {previousRoundMatches.length >= 4 && (
              <>
                <button
                  type="button"
                  onClick={handleApplyCrossingPreset}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] uppercase tracking-wide transition-all shadow flex items-center gap-1 cursor-pointer"
                  title="Cruzamento de semifinais: Jogo 1 x Jogo 4 & Jogo 2 x Jogo 3"
                >
                  <Flame className="w-3 h-3 text-slate-950 fill-current" />
                  <span>Cruzar (1x4 e 2x3)</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplySequentialPreset}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] uppercase tracking-wide transition-all flex items-center gap-1 cursor-pointer border ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                  }`}
                  title="Sequencial: Jogo 1 x Jogo 2 & Jogo 3 x Jogo 4"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Sequencial (1x2 e 3x4)</span>
                </button>
              </>
            )}

            {/* Clear Round */}
            <button
              type="button"
              onClick={handleClearCurrentRound}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer border ${
                isDark
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {/* Instructions Banner */}
          <div
            className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
              isDark ? 'bg-blue-950/40 border-blue-800/60' : 'bg-sky-50 border-sky-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-[11px] font-bold text-slate-300 leading-tight">
              Como Administrador, você pode alterar participantes em qualquer fase, selecionar vencedores de jogos anteriores, aplicar <strong>BYE (Passou Direto)</strong> ou inverter confrontos.
            </p>
          </div>

          {/* Match Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentRoundMatches.map((m) => {
              const gameLabel = `Jogo ${m.matchNumber}`;
              const cleanPhase = cleanRoundName(m.roundName);

              return (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl border-2 flex flex-col justify-between transition-all ${
                    isDark
                      ? 'bg-slate-950/80 border-slate-800 hover:border-amber-400/50'
                      : 'bg-white border-slate-200 hover:border-amber-400 shadow-sm'
                  }`}
                >
                  {/* Card Header: Jogo X • Fase & Quick Bye Badge */}
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-black text-[11px] uppercase tracking-wider">
                        {gameLabel}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">
                        {cleanPhase}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {m.isBye && (
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Passou Direto</span>
                        </span>
                      )}
                      {!m.isBye && m.sourceLabelA && m.sourceLabelB && (
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                          {m.sourceLabelA} × {m.sourceLabelB}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Face-off Pickers */}
                  <div className="space-y-2">
                    {/* Participant A */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                          Participante A:
                        </label>
                        {m.teamAName && m.teamAName !== 'A definir' && (
                          <span className="text-[9px] font-bold text-amber-400 truncate max-w-[180px]">
                            {m.teamAName}
                          </span>
                        )}
                      </div>

                      <select
                        value={getSlotValue(m, 'A')}
                        onChange={(e) => handleSetSlot(m.id, 'A', e.target.value)}
                        className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-black uppercase border outline-none cursor-pointer ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                            : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-sky-500'
                        }`}
                      >
                        <option value="">-- A definir --</option>
                        <option value="BYE">🌟 BYE / Sem Oponente (Passou Direto)</option>

                        {/* All Teams in Modality */}
                        <optgroup label="Times / Alunos Cadastrados">
                          {modalityTeams.map((t) => (
                            <option key={t.id} value={`team:${t.id}`}>
                              {getTeamLabel(t)} {t.playerClass ? `(Sala: ${t.playerClass})` : ''}
                            </option>
                          ))}
                        </optgroup>

                        {/* Previous Matches Winners */}
                        {previousRoundMatches.length > 0 && (
                          <optgroup label={`Vencedores da Fase Anterior (${cleanRoundName(previousRoundMatches[0]?.roundName || '')})`}>
                            {previousRoundMatches.map((prevM) => {
                              const winner = prevM.winnerId
                                ? modalityTeams.find((t) => t.id === prevM.winnerId)
                                : undefined;
                              const winnerSuffix = winner ? ` → ${getTeamLabel(winner)}` : '';
                              return (
                                <option key={prevM.id} value={`source:${prevM.id}`}>
                                  🏆 Vencedor do Jogo {prevM.matchNumber} ({prevM.teamAName || 'A def.'} × {prevM.teamBName || 'A def.'}){winnerSuffix}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    {/* VS Badge with Inverter (Swap) button */}
                    <div className="flex items-center justify-center gap-1.5 my-1">
                      <div className="h-px bg-slate-800 flex-1" />
                      <button
                        type="button"
                        onClick={() => handleSwapSlots(m.id)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-black text-[9px] uppercase border border-slate-700 transition-colors cursor-pointer"
                        title="Inverter Participante A com Participante B"
                      >
                        <ArrowLeftRight className="w-2.5 h-2.5" />
                        <span>Inverter Lados</span>
                      </button>
                      <div className="h-px bg-slate-800 flex-1" />
                    </div>

                    {/* Participant B */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                          Participante B:
                        </label>
                        {m.teamBName && m.teamBName !== 'A definir' && (
                          <span className="text-[9px] font-bold text-amber-400 truncate max-w-[180px]">
                            {m.teamBName}
                          </span>
                        )}
                      </div>

                      <select
                        value={getSlotValue(m, 'B')}
                        onChange={(e) => handleSetSlot(m.id, 'B', e.target.value)}
                        className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-black uppercase border outline-none cursor-pointer ${
                          isDark
                            ? 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                            : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-sky-500'
                        }`}
                      >
                        <option value="">-- A definir --</option>
                        <option value="BYE">🌟 BYE / Sem Oponente (Passou Direto)</option>

                        {/* All Teams in Modality */}
                        <optgroup label="Times / Alunos Cadastrados">
                          {modalityTeams.map((t) => (
                            <option key={t.id} value={`team:${t.id}`}>
                              {getTeamLabel(t)} {t.playerClass ? `(Sala: ${t.playerClass})` : ''}
                            </option>
                          ))}
                        </optgroup>

                        {/* Previous Matches Winners */}
                        {previousRoundMatches.length > 0 && (
                          <optgroup label={`Vencedores da Fase Anterior (${cleanRoundName(previousRoundMatches[0]?.roundName || '')})`}>
                            {previousRoundMatches.map((prevM) => {
                              const winner = prevM.winnerId
                                ? modalityTeams.find((t) => t.id === prevM.winnerId)
                                : undefined;
                              const winnerSuffix = winner ? ` → ${getTeamLabel(winner)}` : '';
                              return (
                                <option key={prevM.id} value={`source:${prevM.id}`}>
                                  🏆 Vencedor do Jogo {prevM.matchNumber} ({prevM.teamAName || 'A def.'} × {prevM.teamBName || 'A def.'}){winnerSuffix}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="bg-slate-950 px-4 sm:px-6 py-2.5 sm:py-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saveSuccess}
            className="flex items-center gap-1.5 px-4 sm:px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all hover:scale-105 cursor-pointer"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-800 stroke-[3]" />
                <span>Salvo com Sucesso!</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                <span>Salvar Confrontos</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
