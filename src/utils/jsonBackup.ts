import { Team, Match } from '../types';
import { getStoredTeams, setStoredTeams, getStoredMatches, setStoredMatches } from './storage';
import { getAllImagesFromIndexedDb, saveImageToIndexedDb } from './indexedDbStorage';

export interface InterclasseBackupData {
  version: string;
  exportDate: string;
  teams: Team[];
  matches: Match[];
  mediaImages?: Record<string, string>;
}

/**
 * Generates a full JSON backup object containing all teams, players, matches, results, and base64 images
 */
export const createFullBackupObject = async (): Promise<InterclasseBackupData> => {
  const teams = getStoredTeams();
  const matches = getStoredMatches();
  const mediaImages = await getAllImagesFromIndexedDb();

  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    teams,
    matches,
    mediaImages,
  };
};

/**
 * Triggers a browser download of the full JSON backup
 */
export const downloadBackupJson = async (): Promise<void> => {
  const data = await createFullBackupObject();
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `interclasse_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Restores all application state (teams, players, matches, images) from a JSON string or file
 */
export const restoreBackupFromJson = async (jsonString: string): Promise<{ success: boolean; teamsCount: number; matchesCount: number }> => {
  try {
    const data: InterclasseBackupData = JSON.parse(jsonString);

    if (!data.teams || !Array.isArray(data.teams) || !data.matches || !Array.isArray(data.matches)) {
      throw new Error('Arquivo JSON inválido. Estrutura de dados incorreta.');
    }

    // Restore Teams & Matches
    setStoredTeams(data.teams);
    setStoredMatches(data.matches);

    // Restore Images to IndexedDB if present
    if (data.mediaImages) {
      for (const [id, dataUrl] of Object.entries(data.mediaImages)) {
        if (dataUrl && dataUrl.startsWith('data:image/')) {
          await saveImageToIndexedDb(id, dataUrl);
        }
      }
    }

    return {
      success: true,
      teamsCount: data.teams.length,
      matchesCount: data.matches.length,
    };
  } catch (err) {
    console.error('Erro ao restaurar backup JSON:', err);
    return {
      success: false,
      teamsCount: 0,
      matchesCount: 0,
    };
  }
};
