export interface EmblemPreset {
  id: string;
  name: string;
  url: string;
  category: string;
}

// Crisp inline SVGs encoded as Data URLs for immediate rendering and offline persistence
const createSvgEmblem = (bgGradient: [string, string], iconSvg: string, label: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="g_${label}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradient[0]}" />
        <stop offset="100%" stop-color="${bgGradient[1]}" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="24" fill="url(#g_${label})" />
    <circle cx="50" cy="50" r="38" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" stroke-width="2" />
    <g transform="translate(25, 25) scale(2)" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${iconSvg}
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const EMBLEM_PRESETS: EmblemPreset[] = [
  {
    id: 'emblem_eagle',
    name: 'Águias',
    category: 'Mascotes',
    url: createSvgEmblem(
      ['#0284c7', '#0369a1'],
      '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
      'eagle'
    ),
  },
  {
    id: 'emblem_lion',
    name: 'Leões',
    category: 'Mascotes',
    url: createSvgEmblem(
      ['#ea580c', '#c2410c'],
      '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="1" fill="white"/>',
      'lion'
    ),
  },
  {
    id: 'emblem_panther',
    name: 'Panteras',
    category: 'Mascotes',
    url: createSvgEmblem(
      ['#1e293b', '#0f172a'],
      '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5a1.5 1.5 0 1 1-2 0V11h2z"/>',
      'panther'
    ),
  },
  {
    id: 'emblem_shark',
    name: 'Tubarões',
    category: 'Mascotes',
    url: createSvgEmblem(
      ['#06b6d4', '#0891b2'],
      '<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      'shark'
    ),
  },
  {
    id: 'emblem_lightning',
    name: 'Trovão',
    category: 'Energia',
    url: createSvgEmblem(
      ['#eab308', '#ca8a04'],
      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="white" stroke="white"/>',
      'lightning'
    ),
  },
  {
    id: 'emblem_flame',
    name: 'Fênix / Fogo',
    category: 'Energia',
    url: createSvgEmblem(
      ['#ef4444', '#b91c1c'],
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="white"/>',
      'flame'
    ),
  },
  {
    id: 'emblem_shield',
    name: 'Guerreiros',
    category: 'Defesa',
    url: createSvgEmblem(
      ['#4f46e5', '#3730a3'],
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(255,255,255,0.2)"/>',
      'shield'
    ),
  },
  {
    id: 'emblem_emerald_dragons',
    name: 'Dragões',
    category: 'Mascotes',
    url: createSvgEmblem(
      ['#059669', '#047857'],
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="white"/>',
      'dragons'
    ),
  },
  {
    id: 'emblem_royal',
    name: 'Spartanos',
    category: 'Força',
    url: createSvgEmblem(
      ['#7c3aed', '#6d28d9'],
      '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24"/>',
      'royal'
    ),
  },
];
