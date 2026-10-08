import React, { useState, useRef } from 'react';
import { Team, ModalityType, User } from '../types';
import { MODALITY_CONFIGS } from '../utils/constants';
import { EMBLEM_PRESETS } from '../utils/emblems';
import { EditTeamImageModal } from './EditTeamImageModal';
import { compressImage } from '../utils/imageCompressor';
import { saveImageToIndexedDb } from '../utils/indexedDbStorage';
import {
  Plus,
  Trash2,
  Users,
  Shirt,
  UserCheck,
  GitBranch,
  Info,
  UserPlus,
  X,
  Sparkles,
  Award,
  Camera,
  Image as ImageIcon,
  Upload,
  Pencil,
  Trophy,
  Save,
  Check,
} from 'lucide-react';

const PREDEFINED_CLASSES = [
  '1 A',
  '1 B',
  '1 C',
  '1 D',
  '2 A',
  '2 B',
  '2 C',
  '2 D',
  '3 A',
  '3 B',
  '3 C',
  '3 D',
  '1FDI',
  '2 FDI',
  '3 FDI A',
  '3 FDI B',
  '1 DSA',
  '1 DSB',
  '2DSA',
  '2DSAB',
  '3DS',
  'PROFS',
];

interface TeamsSectionProps {
  teams: Team[];
  activeModality: ModalityType;
  user: User | null;
  theme?: 'light' | 'dark';
  onAddTeam: (team: Omit<Team, 'id' | 'createdDate'>) => void;
  onDeleteTeam: (teamId: string) => void;
  onUpdateTeamPlayers?: (teamId: string, players: string[]) => void;
  onUpdateTeamImage?: (teamId: string, imageUrl?: string) => void;
  onUpdateTeam?: (team: Team) => void;
  onGenerateBracket: () => void;
  onManualSave?: () => Promise<any>;
}

export const TeamsSection: React.FC<TeamsSectionProps> = ({
  teams,
  activeModality,
  user,
  theme = 'dark',
  onAddTeam,
  onDeleteTeam,
  onUpdateTeamPlayers,
  onUpdateTeamImage,
  onUpdateTeam,
  onGenerateBracket,
  onManualSave,
}) => {
  const isAdmin = user?.role === 'admin' || user?.role === 'subadmin';
  const config = MODALITY_CONFIGS[activeModality];
  const filteredTeams = teams.filter((t) => t.modality === activeModality);
  const isDark = theme === 'dark';
  const [savedTeamsSuccess, setSavedTeamsSuccess] = useState(false);
  const [isSavingTeams, setIsSavingTeams] = useState(false);

  const handleSectionSave = async () => {
    if (!onManualSave) return;
    setIsSavingTeams(true);
    try {
      await onManualSave();
      setSavedTeamsSuccess(true);
      setTimeout(() => setSavedTeamsSuccess(false), 3000);
    } finally {
      setIsSavingTeams(false);
    }
  };

  // Form states for Team (Futsal & Volei)
  const [teamName, setTeamName] = useState('');
  const [customTeamName, setCustomTeamName] = useState('');
  const [captain, setCaptain] = useState('');
  const [shirtColor, setShirtColor] = useState('#0284c7');
  const [teamImageUrl, setTeamImageUrl] = useState<string>('');
  const [playerInput, setPlayerInput] = useState('');
  const [roster, setRoster] = useState<string[]>([]);

  // Form states for Individual Athlete (Tênis de Mesa)
  const [athleteName, setAthleteName] = useState('');
  const [athleteClass, setAthleteClass] = useState('');
  const [customAthleteClass, setCustomAthleteClass] = useState('');

  // Editing Roster for an existing team modal
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');

  // Editing Image for an existing team modal
  const [editingImageTeam, setEditingImageTeam] = useState<Team | null>(null);

  // Editing Details (name, class/room, color) for an existing team modal
  const [editingDetailsTeam, setEditingDetailsTeam] = useState<Team | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [editName, setEditName] = useState('');
  const [editCaptain, setEditCaptain] = useState('');
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editPlayerClass, setEditPlayerClass] = useState('');
  const [editShirtColor, setEditShirtColor] = useState('');

  const handleOpenEditDetails = (team: Team) => {
    setEditingDetailsTeam(team);
    setEditName(team.name || '');
    setEditCaptain(team.captain || '');
    setEditPlayerName(team.playerName || '');
    setEditPlayerClass(team.playerClass || '');
    setEditShirtColor(team.shirtColor || '#0284c7');
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDetailsTeam || !onUpdateTeam) return;

    const updated: Team = {
      ...editingDetailsTeam,
      name: config.isIndividual ? editPlayerClass.trim() : editName.trim(),
      captain: config.isIndividual ? editPlayerName.trim() : editCaptain.trim(),
      playerName: config.isIndividual ? editPlayerName.trim() : undefined,
      playerClass: config.isIndividual ? editPlayerClass.trim() : undefined,
      shirtColor: editShirtColor,
    };

    onUpdateTeam(updated);
    setEditingDetailsTeam(null);
  };

  // File input ref for creation form
  const formFileInputRef = useRef<HTMLInputElement>(null);
  const [isOptimizingImage, setIsOptimizingImage] = useState(false);

  // Handle file select during creation with automatic high-capacity compression
  const handleFormFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) return;
      setIsOptimizingImage(true);
      try {
        const compressed = await compressImage(file, 400, 0.8);
        setTeamImageUrl(compressed);
      } catch (err) {
        console.error('Error compressing image', err);
      } finally {
        setIsOptimizingImage(false);
      }
    }
    e.target.value = '';
  };

  // Handle adding player to temporary roster
  const handleAddPlayerToRoster = () => {
    const trimmed = playerInput.trim();
    if (!trimmed) return;
    if (roster.includes(trimmed)) return;
    setRoster([...roster, trimmed]);
    setPlayerInput('');
  };

  const handleRemovePlayerFromRoster = (index: number) => {
    setRoster(roster.filter((_, i) => i !== index));
  };

  // Submit team / athlete
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (config.isIndividual) {
      // Individual Athlete Submission
      const resolvedClass = athleteClass === 'outro' ? customAthleteClass.trim() : athleteClass.trim();
      if (!athleteName.trim() || !resolvedClass) return;

      onAddTeam({
        name: resolvedClass, // School class acts as group
        modality: activeModality,
        captain: athleteName.trim(),
        shirtColor: '#0284c7',
        playerName: athleteName.trim(),
        playerClass: resolvedClass,
        imageUrl: teamImageUrl || undefined,
        players: [athleteName.trim()],
      });

      setAthleteName('');
      setAthleteClass('');
      setCustomAthleteClass('');
      setTeamImageUrl('');
    } else {
      // Team Submission
      const resolvedName = teamName === 'outro' ? customTeamName.trim() : teamName.trim();
      if (!resolvedName) return;

      onAddTeam({
        name: resolvedName,
        modality: activeModality,
        captain: '',
        shirtColor,
        imageUrl: teamImageUrl || undefined,
        players: roster.length > 0 ? roster : [],
      });

      setTeamName('');
      setCustomTeamName('');
      setCaptain('');
      setRoster([]);
      setTeamImageUrl('');
    }
  };

  // Add player to existing team
  const handleAddPlayerToExisting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam || !newPlayerName.trim() || !onUpdateTeamPlayers) return;

    const currentPlayers = editingTeam.players || [];
    if (currentPlayers.includes(newPlayerName.trim())) return;

    const updated = [...currentPlayers, newPlayerName.trim()];
    onUpdateTeamPlayers(editingTeam.id, updated);
    setEditingTeam({ ...editingTeam, players: updated });
    setNewPlayerName('');
  };

  // Remove player from existing team
  const handleRemovePlayerFromExisting = (team: Team, playerToRemove: string) => {
    if (!onUpdateTeamPlayers) return;
    const currentPlayers = team.players || [];
    const updated = currentPlayers.filter((p) => p !== playerToRemove);
    onUpdateTeamPlayers(team.id, updated);
    setEditingTeam({ ...team, players: updated });
  };

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
            <div className={`inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-1 ${
              isDark ? 'text-amber-400' : 'text-sky-700'
            }`}>
              <span className="text-base">{config.icon}</span>
              <span>Modalidade: {config.label}</span>
            </div>
            <h2 className={`text-2xl sm:text-3xl font-black font-display uppercase tracking-tight ${
              isDark ? 'text-white' : 'text-sky-950'
            }`}>
              {config.isIndividual ? 'ATLETAS INSCRITOS' : 'TURMAS CADASTRADAS'}
            </h2>
            <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}>
              {config.isIndividual
                ? `Cadastro de atletas individuais para a disputa de ${config.label}.`
                : `Equipes e turmas inscritas para a disputa de ${config.label}.`}
            </p>
          </div>

          {/* Admin: Generate Bracket */}
          {isAdmin && (
            <div className="flex flex-col sm:flex-row gap-2.5">
              {onManualSave && (
                <button
                  type="button"
                  onClick={handleSectionSave}
                  disabled={isSavingTeams}
                  title="Salvar todas as turmas, elencos e fotos imediatamente no dispositivo"
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer ${
                    savedTeamsSuccess
                      ? 'bg-emerald-500 text-slate-950 font-black scale-105'
                      : isDark
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105'
                  }`}
                >
                  <Save className={`w-4 h-4 ${isSavingTeams ? 'animate-spin' : ''}`} />
                  <span>{savedTeamsSuccess ? '✓ Tudo Salvo!' : 'Salvar Tudo'}</span>
                </button>
              )}

              <button
                onClick={onGenerateBracket}
                disabled={filteredTeams.length < 2}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer ${
                  filteredTeams.length >= 2
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-500/20 hover:scale-105'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                {activeModality === 'futsal_fem' ? (
                  <>
                    <Trophy className="w-4 h-4 text-slate-950" />
                    Configurar Final: Jogos de Ida e Volta
                  </>
                ) : (
                  <>
                    <GitBranch className="w-4 h-4" />
                    Gerar Chaveamento Automático
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Rule note */}
        <div className={`p-3.5 rounded-2xl border shadow-sm flex items-start gap-3 ${
          isDark ? 'bg-slate-900 border-blue-900/80 text-slate-200' : 'bg-white border-sky-200 text-slate-800'
        }`}>
          <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-xl mt-0.5">
            <Info className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-xs leading-relaxed space-y-0.5">
            <p className={`font-bold uppercase ${isDark ? 'text-amber-400' : 'text-sky-950'}`}>
              {config.isIndividual
                ? 'Regras do Tênis de Mesa (Disputa Individual):'
                : activeModality === 'futsal_fem'
                ? 'Regulamento Oficial do Futsal Feminino (Sem Fase de Grupos):'
                : 'Regras das Equipes (Futsal Masculino & Vôlei Misto):'}
            </p>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              {config.isIndividual
                ? 'No Tênis de Mesa os jogos são individuais entre os alunos representantes de cada turma. Se a chave tiver número ímpar de inscritos, um atleta passa direto por sorteio.'
                : activeModality === 'futsal_fem'
                ? 'O Futsal Feminino não possui fase de grupos. A modalidade é disputada diretamente pelas 2 equipes finalistas em confrontos de Ida e Volta (com soma de gols / placar agregado e pênaltis em caso de empate).'
                : 'Para Futsal Masculino e Vôlei, cadastre a sala, as cores de camisa e envie o brasão ou foto da turma.'}
            </p>
          </div>
        </div>

        {/* Admin Registration Form or 2-Team Limit Notice for Futsal Feminino */}
        {isAdmin && (
          activeModality === 'futsal_fem' && filteredTeams.length >= 2 ? (
            <div className={`border-2 rounded-3xl p-5 shadow-lg transition-colors ${
              isDark ? 'bg-slate-900/90 border-amber-400/40 text-white' : 'bg-amber-50/70 border-amber-300 text-slate-900'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-500 rounded-2xl shrink-0">
                  <Trophy className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950">
                      Disputa Direta
                    </span>
                    <h3 className="text-base font-black uppercase font-display">
                      Futsal Feminino: 2 Equipes Finalistas Prontas
                    </h3>
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Esta modalidade não possui fase de grupos. O regulamento oficial conta com exatamente as 2 equipes finalistas disputando o título diretamente na Grande Final em jogos de Ida e Volta. Ambas já estão cadastradas abaixo e você pode gerenciar elencos e brasões diretamente nos cards.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className={`border-2 rounded-3xl p-5 shadow-md transition-colors ${
              isDark ? 'bg-slate-900 border-blue-900 text-white' : 'bg-white border-sky-200 text-slate-900'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-sky-500/20 text-sky-500 rounded-xl">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-base font-bold uppercase font-display ${isDark ? 'text-white' : 'text-sky-950'}`}>
                    {config.isIndividual
                      ? `Cadastrar Jogador(a) de ${config.label}`
                      : `Cadastrar Turma de ${config.label}`}
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {config.isIndividual
                      ? 'Informe o nome do aluno e a sala que ele representa.'
                      : activeModality === 'futsal_fem'
                      ? 'Cadastre a equipe finalista para a disputa direta de Ida e Volta.'
                      : 'Cadastre a sala e envie o brasão ou selecione uma imagem.'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
              {/* Universal hidden file input for device upload */}
              <input
                ref={formFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFormFileSelect}
                className="hidden"
              />

              {config.isIndividual ? (
                /* Individual Athlete Form (Tênis de Mesa) */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Nome do Aluno / Atleta *
                    </label>
                    <input
                      type="text"
                      value={athleteName}
                      onChange={(e) => setAthleteName(e.target.value)}
                      placeholder="Ex: Pedro Henrique"
                      className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-950 border-blue-900 text-white focus:border-amber-400'
                          : 'bg-sky-50/60 border-sky-200 text-slate-900 focus:bg-white focus:border-sky-500'
                      }`}
                      required
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Turma / Sala *
                    </label>
                    <select
                      value={athleteClass}
                      onChange={(e) => {
                        setAthleteClass(e.target.value);
                        if (e.target.value !== 'outro') {
                          setCustomAthleteClass('');
                        }
                      }}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border outline-none transition-all cursor-pointer ${
                        isDark
                          ? 'bg-slate-950 border-blue-900 text-white focus:border-amber-400'
                          : 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                      }`}
                      required
                    >
                      <option value="">-- Selecione a Sala --</option>
                      {PREDEFINED_CLASSES.map((cls) => (
                        <option key={cls} value={cls}>
                          SALA: {cls}
                        </option>
                      ))}
                      <option value="outro">Outra (Digitar...)</option>
                    </select>

                    {athleteClass === 'outro' && (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={customAthleteClass}
                          onChange={(e) => setCustomAthleteClass(e.target.value)}
                          placeholder="Digite o nome da sala personalizada"
                          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border outline-none transition-all ${
                            isDark
                              ? 'bg-slate-950 border-blue-900 text-white focus:border-amber-400'
                              : 'bg-sky-50/60 border-sky-200 text-slate-900 focus:bg-white focus:border-sky-500'
                          }`}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setAthleteClass('');
                            setCustomAthleteClass('');
                          }}
                          className="px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-xl transition-all flex items-center justify-center cursor-pointer shrink-0"
                          title="Limpar campo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Brasão / Foto (Opcional)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isOptimizingImage}
                        onClick={() => formFileInputRef.current?.click()}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isDark
                            ? 'bg-slate-950 border-blue-800 text-sky-300 hover:bg-slate-800'
                            : 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100'
                        }`}
                      >
                        <Upload className={`w-3.5 h-3.5 text-sky-500 ${isOptimizingImage ? 'animate-spin' : ''}`} />
                        <span>{isOptimizingImage ? 'Otimizando Imagem...' : 'Carregar do Dispositivo'}</span>
                      </button>

                      {teamImageUrl ? (
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-xl">
                          <img src={teamImageUrl} alt="Preview" className="w-7 h-7 rounded-lg object-cover border border-emerald-500" />
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Foto Ativa HD</span>
                          <button
                            type="button"
                            onClick={() => setTeamImageUrl('')}
                            className="text-rose-500 hover:text-rose-600 p-0.5 cursor-pointer"
                            title="Remover"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                /* Team Form (Futsal & Vôlei) */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-xs font-bold uppercase mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        Nome da Turma / Time *
                      </label>
                      <select
                        value={teamName}
                        onChange={(e) => {
                          setTeamName(e.target.value);
                          if (e.target.value !== 'outro') {
                            setCustomTeamName('');
                          }
                        }}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border outline-none transition-all cursor-pointer ${
                          isDark
                            ? 'bg-slate-950 border-blue-900 text-white focus:border-amber-400'
                            : 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                        }`}
                        required
                      >
                        <option value="">-- Selecione a Sala --</option>
                        {PREDEFINED_CLASSES.map((cls) => (
                          <option key={cls} value={cls}>
                            SALA: {cls}
                          </option>
                        ))}
                        <option value="outro">Outra (Digitar...)</option>
                      </select>

                      {teamName === 'outro' && (
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={customTeamName}
                            onChange={(e) => setCustomTeamName(e.target.value)}
                            placeholder="Digite o nome da sala personalizada"
                            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border outline-none transition-all ${
                              isDark
                                ? 'bg-slate-950 border-blue-900 text-white focus:border-amber-400'
                                : 'bg-sky-50/60 border-sky-200 text-slate-900 focus:bg-white focus:border-sky-500'
                            }`}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setTeamName('');
                              setCustomTeamName('');
                            }}
                            className="px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-xl transition-all flex items-center justify-center cursor-pointer shrink-0"
                            title="Limpar campo"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={`block text-xs font-bold uppercase mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        Cor do Uniforme
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={shirtColor}
                          onChange={(e) => setShirtColor(e.target.value)}
                          className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {shirtColor.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Emblem selection preset strip */}
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Selecione ou Envie um Brasão / Foto da Turma
                    </label>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      <button
                        type="button"
                        disabled={isOptimizingImage}
                        onClick={() => formFileInputRef.current?.click()}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                          isDark
                            ? 'bg-slate-950 border-blue-800 text-sky-300 hover:bg-slate-800'
                            : 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100'
                        }`}
                      >
                        <Upload className={`w-3.5 h-3.5 text-sky-500 ${isOptimizingImage ? 'animate-spin' : ''}`} />
                        <span>{isOptimizingImage ? 'Otimizando...' : 'Carregar do Dispositivo'}</span>
                      </button>

                      {/* Display custom image preview if uploaded from device */}
                      {teamImageUrl && !EMBLEM_PRESETS.some((p) => p.url === teamImageUrl) && (
                        <div className="flex items-center gap-1.5 bg-emerald-500/15 border-2 border-emerald-500 px-2.5 py-1 rounded-xl shrink-0">
                          <img src={teamImageUrl} alt="Brasão Personalizado" className="w-8 h-8 rounded-lg object-cover border border-white shadow-sm" />
                          <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Foto Ativa HD</span>
                          <button
                            type="button"
                            onClick={() => setTeamImageUrl('')}
                            className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer"
                            title="Remover Imagem"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {EMBLEM_PRESETS.slice(0, 8).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setTeamImageUrl(preset.url)}
                          className={`w-9 h-9 rounded-xl border-2 overflow-hidden shrink-0 transition-transform hover:scale-110 cursor-pointer ${
                            teamImageUrl === preset.url
                              ? 'border-amber-400 ring-2 ring-amber-400/30'
                              : isDark ? 'border-blue-900/60' : 'border-slate-200'
                          }`}
                        >
                          <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg transition-all hover:scale-105 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-slate-950" />
                  {config.isIndividual ? 'Cadastrar Atleta' : 'Cadastrar Equipe'}
                </button>
              </div>
            </form>
          </div>
          )
        )}

        {/* Teams List Cards */}
        {filteredTeams.length === 0 ? (
          <div className={`text-center py-16 border-2 border-dashed rounded-3xl p-8 ${
            isDark ? 'bg-slate-900/40 border-blue-900 text-white' : 'bg-white border-sky-200 text-slate-900'
          }`}>
            <Users className="w-12 h-12 text-sky-500 mx-auto mb-3" />
            <h3 className={`text-xl font-black uppercase font-display ${isDark ? 'text-white' : 'text-sky-950'}`}>
              Nenhuma {config.isIndividual ? 'atleta cadastrado' : 'equipe cadastrada'} em {config.label}
            </h3>
            <p className={`text-xs mt-1 max-w-sm mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {isAdmin
                ? 'Utilize o formulário acima para cadastrar os participantes.'
                : 'Aguarde a comissão organizadora realizar o cadastro oficial.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeams.map((team) => (
              <div
                key={team.id}
                className={`border-2 rounded-3xl p-6 shadow-md transition-all hover:shadow-xl relative overflow-hidden flex flex-col justify-between ${
                  isDark ? 'bg-slate-900 border-blue-900/80 text-white' : 'bg-white border-sky-200 text-slate-900'
                }`}
              >
                {/* Accent Shirt Bar */}
                <div
                  className="absolute top-0 left-0 right-0 h-2"
                  style={{ backgroundColor: team.shirtColor }}
                />

                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-4 pt-1">
                    <div className="flex items-center gap-3">
                      {team.imageUrl ? (
                        <div className="relative group">
                          <img
                            src={team.imageUrl}
                            alt={team.name}
                            className={`w-14 h-14 rounded-2xl object-cover border-2 shadow-sm ${
                              isDark ? 'border-blue-800' : 'border-sky-200 bg-white'
                            }`}
                          />
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setEditingImageTeam(team)}
                              title="Alterar Imagem"
                              className="absolute inset-0 bg-slate-950/60 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Camera className="w-4 h-4 text-amber-300" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-white shadow-sm relative group"
                          style={{
                            backgroundColor: team.shirtColor,
                            borderColor: isDark ? '#1e3a8a' : '#cbd5e1',
                          }}
                        >
                          <Shirt className="w-7 h-7 drop-shadow-sm" />
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setEditingImageTeam(team)}
                              title="Adicionar Imagem"
                              className="absolute inset-0 bg-slate-950/60 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Camera className="w-4 h-4 text-amber-300" />
                            </button>
                          )}
                        </div>
                      )}

                      <div>
                        <h4 className={`text-lg font-black uppercase font-display tracking-wide ${
                          isDark ? 'text-white' : 'text-sky-950'
                        }`}>
                          {team.playerName && team.playerClass
                            ? team.playerName
                            : team.name}
                        </h4>
                        <span className={`text-xs font-bold block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          {team.playerClass 
                            ? `Sala: ${team.playerClass}` 
                            : team.modality === 'futsal_masc' 
                              ? 'Futsal Masculino' 
                              : team.modality === 'futsal_fem' 
                                ? 'Futsal Feminino • Finalista Ida e Volta' 
                                : 'Vôlei Misto'}
                        </span>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditDetails(team);
                          }}
                          className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-xl transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTeamToDelete(team);
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Image Modal */}
      {editingImageTeam && (
        <EditTeamImageModal
          isOpen={Boolean(editingImageTeam)}
          team={editingImageTeam}
          onClose={() => setEditingImageTeam(null)}
          onSaveImage={(teamId, imageUrl) => {
            if (onUpdateTeamImage) {
              onUpdateTeamImage(teamId, imageUrl);
            }
            setEditingImageTeam(null);
          }}
        />
      )}

      {/* Edit Details Modal */}
      {editingDetailsTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-900">
          <div className="bg-white border-2 border-amber-400 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-amber-400">
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">
                  PAINEL DE CADASTRO • EDITAR PARTICIPANTE
                </span>
                <h3 className="text-lg font-black font-display uppercase tracking-wide">
                  Editar Detalhes
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingDetailsTeam(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="p-6 space-y-5">
              {config.isIndividual ? (
                <>
                  <div className="space-y-1">
                    <label className="block text-xs font-black uppercase text-slate-700">
                      Nome do Aluno / Atleta
                    </label>
                    <input
                      type="text"
                      value={editPlayerName}
                      onChange={(e) => setEditPlayerName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border-2 border-sky-500/30 focus:border-sky-500 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-200 outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-black uppercase text-slate-700">
                      Turma / Sala
                    </label>
                    <select
                      value={PREDEFINED_CLASSES.includes(editPlayerClass) ? editPlayerClass : editPlayerClass ? 'outro' : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'outro') {
                          setEditPlayerClass('');
                        } else {
                          setEditPlayerClass(val);
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-slate-50 border-2 border-sky-500/30 focus:border-sky-500 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-200 outline-none cursor-pointer"
                      required
                    >
                      <option value="">-- Selecione a Sala --</option>
                      {PREDEFINED_CLASSES.map((cls) => (
                        <option key={cls} value={cls}>
                          SALA: {cls}
                        </option>
                      ))}
                      <option value="outro">Outra (Digitar abaixo...)</option>
                    </select>
                    {(!PREDEFINED_CLASSES.includes(editPlayerClass) || editPlayerClass === '') && (
                      <input
                        type="text"
                        value={editPlayerClass}
                        onChange={(e) => setEditPlayerClass(e.target.value)}
                        placeholder="Digite o nome da sala personalizada"
                        className="w-full px-4 py-2.5 mt-2 bg-slate-50 border-2 border-sky-500/30 focus:border-sky-500 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-200 outline-none"
                        required
                      />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="block text-xs font-black uppercase text-slate-700">
                      Nome da Turma / Time
                    </label>
                    <select
                      value={PREDEFINED_CLASSES.includes(editName) ? editName : editName ? 'outro' : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'outro') {
                          setEditName('');
                        } else {
                          setEditName(val);
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-slate-50 border-2 border-sky-500/30 focus:border-sky-500 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-200 outline-none cursor-pointer"
                      required
                    >
                      <option value="">-- Selecione a Sala --</option>
                      {PREDEFINED_CLASSES.map((cls) => (
                        <option key={cls} value={cls}>
                          SALA: {cls}
                        </option>
                      ))}
                      <option value="outro">Outra (Digitar abaixo...)</option>
                    </select>
                    {(!PREDEFINED_CLASSES.includes(editName) || editName === '') && (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Digite o nome da sala personalizada"
                        className="w-full px-4 py-2.5 mt-2 bg-slate-50 border-2 border-sky-500/30 focus:border-sky-500 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-sky-200 outline-none"
                        required
                      />
                    )}
                  </div>



                  <div className="space-y-1">
                    <label className="block text-xs font-black uppercase text-slate-700">
                      Cor do Uniforme
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={editShirtColor}
                        onChange={(e) => setEditShirtColor(e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span className="text-xs font-mono font-bold text-slate-700">
                        {editShirtColor.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDetailsTeam(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg transition-all hover:scale-105"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {teamToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-900">
          <div className="bg-white border-2 border-rose-500 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-rose-500/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl">
                  <Trash2 className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block">
                    CONFIRMAÇÃO DE EXCLUSÃO
                  </span>
                  <h3 className="text-base font-black font-display uppercase tracking-wide text-white">
                    Excluir {config.isIndividual ? 'Atleta' : 'Turma'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTeamToDelete(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm font-medium text-slate-700 leading-relaxed">
                Tem certeza de que deseja excluir permanentemente {config.isIndividual ? 'o(a) atleta' : 'a turma'}{' '}
                <strong className="text-slate-950 font-black uppercase">"{teamToDelete.name}"</strong>?
              </p>
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-300 p-3 rounded-2xl font-medium">
                ⚠️ Esta ação removerá a turma do sistema e desvinculará quaisquer confrontos e tabelas associadas.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTeamToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 uppercase cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = teamToDelete.id;
                    setTeamToDelete(null);
                    onDeleteTeam(id);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/20 transition-all hover:scale-105 cursor-pointer"
                >
                  Sim, Excluir Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
