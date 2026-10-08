import { ModalityType, User } from '../types';

// Data do temporizador: 14 de Outubro de 2026 às 00:00:00 (Meia-noite)
export const COUNTDOWN_TARGET = new Date('2026-10-14T00:00:00');

export const DEFAULT_OFFICIAL_SUBADMINS: User[] = [
  {
    username: 'adminfutsalxavier',
    password: '2026ADMININTERCLASSEFUTS@L',
    role: 'subadmin',
    name: 'Admin Futsal',
    allowedModality: 'futsal',
  },
  {
    username: 'voleiadminxavier2026',
    password: 'acessarvolei2026xavierinterclasse',
    role: 'subadmin',
    name: 'Admin Vôlei',
    allowedModality: 'volei',
  },
  {
    username: 'tenisdemesaxavieradmin',
    password: '26bolsonaropresidenteadmintenisd3MES4',
    role: 'subadmin',
    name: 'Admin Tênis de Mesa',
    allowedModality: 'tenis_mesa',
  },
];

export interface ModalityConfig {
  id: ModalityType;
  label: string;
  shortLabel: string;
  category: 'futsal' | 'volei' | 'tenis_mesa';
  isIndividual: boolean;
  gender: 'masculino' | 'feminino' | 'misto';
  icon: string;
}

export const MODALITY_CONFIGS: Record<ModalityType, ModalityConfig> = {
  futsal_masc: {
    id: 'futsal_masc',
    label: 'Futsal Masculino',
    shortLabel: 'Futsal Masc.',
    category: 'futsal',
    isIndividual: false,
    gender: 'masculino',
    icon: '⚽',
  },
  futsal_fem: {
    id: 'futsal_fem',
    label: 'Futsal Feminino',
    shortLabel: 'Futsal Fem.',
    category: 'futsal',
    isIndividual: false,
    gender: 'feminino',
    icon: '⚽',
  },
  volei_misto: {
    id: 'volei_misto',
    label: 'Vôlei Misto',
    shortLabel: 'Vôlei Misto',
    category: 'volei',
    isIndividual: false,
    gender: 'misto',
    icon: '🏐',
  },
  tenis_mesa_masc: {
    id: 'tenis_mesa_masc',
    label: 'Tênis de Mesa Masc.',
    shortLabel: 'Tênis de Mesa Masc.',
    category: 'tenis_mesa',
    isIndividual: true,
    gender: 'masculino',
    icon: '🏓',
  },
  tenis_mesa_fem: {
    id: 'tenis_mesa_fem',
    label: 'Tênis de Mesa Fem.',
    shortLabel: 'Tênis de Mesa Fem.',
    category: 'tenis_mesa',
    isIndividual: true,
    gender: 'feminino',
    icon: '🏓',
  },
};
