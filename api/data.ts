import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

// Shared Cloud JSON Bin ID for global synchronization across Vercel serverless instances
const GLOBAL_CLOUD_OBJECT_ID = 'ff808181a09d98f701a1172368f61865';
const CLOUD_API_URL = `https://api.restful-api.dev/objects/${GLOBAL_CLOUD_OBJECT_ID}`;

// In-memory fallback
let memoryStore = {
  teams: [] as any[],
  matches: [] as any[],
  subadmins: [] as any[],
  lastUpdated: 0,
};

function getStoragePath() {
  return path.resolve('/tmp', 'tournament.json');
}

function readLocalTmpData() {
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lastUpdated === 'number' && parsed.lastUpdated > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Vercel serverless /tmp read warning:', err);
  }
  return memoryStore;
}

function writeLocalTmpData(data: any) {
  try {
    memoryStore = data;
    const filePath = getStoragePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Vercel serverless /tmp write warning:', err);
  }
}

/**
 * Fetch from Cloud API store
 */
async function fetchCloudData(): Promise<any | null> {
  try {
    const res = await fetch(CLOUD_API_URL, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('Could not fetch cloud data in /api/data:', err);
  }
  return null;
}

/**
 * Save to Cloud API store
 */
async function saveCloudData(data: any): Promise<boolean> {
  try {
    // Sanitize heavy base64 images from global payload if too large
    const sanitizedTeams = Array.isArray(data.teams)
      ? data.teams.map((t: any) => {
          if (t.imageUrl && t.imageUrl.length > 50000) {
            // Keep emblem preset or small image, strip bloated raw base64
            const { imageUrl, ...rest } = t;
            return rest;
          }
          return t;
        })
      : [];

    const payload = {
      name: 'Interclasse Data 2026',
      data: {
        teams: sanitizedTeams,
        matches: Array.isArray(data.matches) ? data.matches : [],
        subadmins: Array.isArray(data.subadmins) ? data.subadmins : [],
        lastUpdated: data.lastUpdated || Date.now(),
      },
    };

    const res = await fetch(CLOUD_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch (err) {
    console.warn('Could not save cloud data in /api/data:', err);
    return false;
  }
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    // Try Cloud store first so all Vercel instances share exact same state
    const cloudData = await fetchCloudData();
    const localTmp = readLocalTmpData();

    let finalData = localTmp;
    if (cloudData && typeof cloudData.lastUpdated === 'number' && cloudData.lastUpdated >= (localTmp.lastUpdated || 0)) {
      finalData = cloudData;
      writeLocalTmpData(cloudData);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.statusCode = 200;
    res.end(JSON.stringify(finalData));
    return;
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }

      const currentLocal = readLocalTmpData();
      const updated = {
        teams: Array.isArray(body?.teams) ? body.teams : currentLocal.teams || [],
        matches: Array.isArray(body?.matches) ? body.matches : currentLocal.matches || [],
        subadmins: Array.isArray(body?.subadmins) ? body.subadmins : currentLocal.subadmins || [],
        lastUpdated: body?.lastUpdated || Date.now(),
      };

      writeLocalTmpData(updated);

      // Async cloud sync
      saveCloudData(updated).catch(() => {});

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, lastUpdated: updated.lastUpdated }));
      return;
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method Not Allowed' }));
}
