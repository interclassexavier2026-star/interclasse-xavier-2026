/**
 * High-Capacity Media Storage using Browser IndexedDB + In-Memory Cache
 * Provides gigabytes of persistent image storage, completely eliminating
 * the ~5MB localStorage quota limit.
 */
const DB_NAME = 'interclasse_media_db_v2';
const DB_VERSION = 2;
const STORE_NAME = 'team_images';

// High-speed in-memory cache for synchronous read access
export const imageMemoryCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function saveImageToIndexedDb(id: string, dataUrl: string): Promise<void> {
  if (!id || !dataUrl) return;

  // Immediately store in fast memory cache
  imageMemoryCache.set(id, dataUrl);

  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id, dataUrl, updatedAt: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB write deferred, preserved in memory cache:', err);
  }
}

export async function getImageFromIndexedDb(id: string): Promise<string | null> {
  if (!id) return null;

  // Check fast memory cache first
  if (imageMemoryCache.has(id)) {
    return imageMemoryCache.get(id) || null;
  }

  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const url = request.result?.dataUrl || null;
        if (url) {
          imageMemoryCache.set(id, url);
        }
        resolve(url);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllImagesFromIndexedDb(): Promise<Record<string, string>> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        const map: Record<string, string> = {};
        for (const item of records) {
          if (item.id && item.dataUrl) {
            map[item.id] = item.dataUrl;
            imageMemoryCache.set(item.id, item.dataUrl);
          }
        }
        resolve(map);
      };
      request.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

export async function deleteImageFromIndexedDb(id: string): Promise<void> {
  imageMemoryCache.delete(id);
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Ignore error
  }
}
