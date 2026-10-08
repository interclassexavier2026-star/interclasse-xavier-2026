import React, { useState, useRef } from 'react';
import { Team } from '../types';
import { EMBLEM_PRESETS } from '../utils/emblems';
import { compressImage } from '../utils/imageCompressor';
import { saveImageToIndexedDb, imageMemoryCache } from '../utils/indexedDbStorage';
import {
  Upload,
  X,
  Image as ImageIcon,
  Check,
  Trash2,
  Sparkles,
  Link as LinkIcon,
  Shirt,
  ShieldCheck,
} from 'lucide-react';

interface EditTeamImageModalProps {
  isOpen: boolean;
  team: Team | null;
  onClose: () => void;
  onSaveImage: (teamId: string, imageUrl?: string) => void;
}

export const EditTeamImageModal: React.FC<EditTeamImageModalProps> = ({
  isOpen,
  team,
  onClose,
  onSaveImage,
}) => {
  const [currentPreview, setCurrentPreview] = useState<string>(team?.imageUrl || '');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'upload' | 'presets' | 'url'>('upload');
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state if team changes
  React.useEffect(() => {
    if (team) {
      setCurrentPreview(team.imageUrl || '');
      setUrlInput(team.imageUrl && !team.imageUrl.startsWith('data:') ? team.imageUrl : '');
      setErrorMsg('');
    }
  }, [team]);

  if (!isOpen || !team) return null;

  // Process file upload with automatic high-capacity compression & resizing
  const handleFileProcess = async (file: File) => {
    setErrorMsg('');
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecione um arquivo de imagem válido (PNG, JPG, SVG, WebP).');
      return;
    }

    setIsOptimizing(true);
    try {
      const compressed = await compressImage(file, 400, 0.8);
      setCurrentPreview(compressed);
    } catch (err) {
      console.error('Error compressing image', err);
      setErrorMsg('Ocorreu um erro ao otimizar a imagem. Tente novamente.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleApplyUrl = () => {
    if (urlInput.trim()) {
      setCurrentPreview(urlInput.trim());
      setErrorMsg('');
    }
  };

  const handleSave = () => {
    const finalUrl = currentPreview.trim() || undefined;
    if (finalUrl) {
      imageMemoryCache.set(team.id, finalUrl);
      saveImageToIndexedDb(team.id, finalUrl).catch(() => {});
    }
    onSaveImage(team.id, finalUrl);
    onClose();
  };

  const handleRemoveImage = () => {
    setCurrentPreview('');
    setUrlInput('');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-sky-100 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-sky-900 to-sky-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black font-display uppercase tracking-wide">
                SELECIONE OU ENVIE UM BRASÃO
              </h3>
              <p className="text-xs text-sky-200">
                Brasão da Turma / Atleta: {team.playerName ? `${team.playerName} (${team.playerClass})` : team.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} className="text-rose-500 hover:text-rose-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Live Preview Box */}
          <div className="bg-sky-50/70 border border-sky-100 rounded-2xl p-4 flex items-center gap-4">
            <div
              className="relative w-20 h-20 rounded-2xl border-2 flex items-center justify-center overflow-hidden bg-white shadow-md shrink-0"
              style={{ borderColor: team.shirtColor }}
            >
              {currentPreview ? (
                <img
                  src={currentPreview}
                  alt={team.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center text-white"
                  style={{ backgroundColor: team.shirtColor }}
                >
                  <Shirt className="w-7 h-7 drop-shadow-sm mb-0.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {team.name.slice(0, 3)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider block">
                Visualização do Brasão / Foto
              </span>
              <h4 className="text-sm font-black text-sky-950 uppercase truncate">
                {team.name}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentPreview
                  ? 'Imagem personalizada ativa'
                  : 'Nenhuma imagem personalizada (exibindo cor padrão)'}
              </p>

              {currentPreview && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Remover imagem atual
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs for Upload Options */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-white text-sky-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Carregar do Dispositivo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'presets'
                  ? 'bg-white text-sky-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Brasões & Mascotes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'url'
                  ? 'bg-white text-sky-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Link da Imagem
            </button>
          </div>

          {/* Tab 1: Upload (Drag & Drop + Click File Picker) */}
          {activeTab === 'upload' && (
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-sky-500 bg-sky-50 scale-[1.01]'
                    : 'border-sky-200 hover:border-sky-400 bg-sky-50/30 hover:bg-sky-50/60'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 mx-auto mb-2">
                  <Upload className={`w-6 h-6 ${isOptimizing ? 'animate-spin' : ''}`} />
                </div>
                <p className="text-xs font-bold text-sky-950 uppercase">
                  {isOptimizing ? 'Otimizando Imagem em Alta Resolução...' : 'Arraste e solte o brasão ou foto aqui'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isOptimizing
                    ? 'Comprimindo e armazenando em alta capacidade para evitar erros de limite...'
                    : 'ou clique no botão abaixo para escolher do computador ou celular'}
                </p>

                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[10px] font-black uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Capacidade Ampliada • Sem Erros de Limite</span>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    disabled={isOptimizing}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 shadow-md transition-all hover:scale-105 cursor-pointer"
                  >
                    <Upload className={`w-4 h-4 ${isOptimizing ? 'animate-spin' : ''}`} />
                    <span>{isOptimizing ? 'Otimizando...' : 'Carregar do Dispositivo'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: School Mascot / Emblem Presets */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-600 block">
                Escolha um mascote oficial para representar a turma:
              </span>
              <div className="grid grid-cols-3 gap-3">
                {EMBLEM_PRESETS.map((preset) => {
                  const isSelected = currentPreview === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCurrentPreview(preset.url)}
                      className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                        isSelected
                          ? 'border-sky-600 bg-sky-50 ring-2 ring-sky-500'
                          : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-12 h-12 rounded-xl object-cover shadow-sm"
                      />
                      <span className="text-[11px] font-bold text-slate-800 text-center">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: URL Input */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-sky-950 block">
                Cole a URL pública da imagem (PNG, JPG, etc.):
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://exemplo.com/brasao-turma.png"
                  className="flex-1 px-3.5 py-2.5 bg-sky-50/50 border border-sky-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-sky-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl"
                >
                  Aplicar
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Certifique-se de que o link é direto para o arquivo da imagem e acessível publicamente.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md transition-all hover:scale-105"
          >
            <Check className="w-4 h-4" />
            Salvar Imagem da Turma
          </button>
        </div>
      </div>
    </div>
  );
};
