import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'tournament.json');

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ teams: [], matches: [], lastUpdated: 0 }, null, 2), 'utf-8');
}

// Support large JSON payloads (team crests, compressed images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS headers for flexible deployment
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper to read data safely
function readTournamentData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { teams: [], matches: [], lastUpdated: 0 };
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading tournament data:', err);
    return { teams: [], matches: [], lastUpdated: 0 };
  }
}

// Helper to write data safely with atomic backup
function writeTournamentData(data: any) {
  try {
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Error writing tournament data:', err);
    return false;
  }
}

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// GET /api/data - Retrieve current shared tournament state
app.get('/api/data', (_req, res) => {
  const data = readTournamentData();
  res.json(data);
});

// POST /api/data - Save/Sync entire shared tournament state
app.post('/api/data', (req, res) => {
  const { teams, matches, lastUpdated, subadmins } = req.body;
  const current = readTournamentData();

  const updatedData = {
    teams: Array.isArray(teams) ? teams : current.teams || [],
    matches: Array.isArray(matches) ? matches : current.matches || [],
    subadmins: Array.isArray(subadmins) ? subadmins : current.subadmins || [],
    lastUpdated: lastUpdated || Date.now(),
  };

  const success = writeTournamentData(updatedData);
  if (success) {
    res.json({ success: true, lastUpdated: updatedData.lastUpdated, teamsCount: updatedData.teams.length });
  } else {
    res.status(500).json({ success: false, error: 'Could not write data file' });
  }
});

// POST /api/teams - Add or update a single team
app.post('/api/teams', (req, res) => {
  const team = req.body;
  if (!team || !team.id) {
    return res.status(400).json({ error: 'Team data is required' });
  }

  const current = readTournamentData();
  const existingIndex = current.teams.findIndex((t: any) => t.id === team.id);

  if (existingIndex >= 0) {
    current.teams[existingIndex] = team;
  } else {
    current.teams.push(team);
  }

  current.lastUpdated = Date.now();
  writeTournamentData(current);
  res.json({ success: true, lastUpdated: current.lastUpdated });
});

// DELETE /api/teams/:id - Delete a team and unbind from matches
app.delete('/api/teams/:id', (req, res) => {
  const { id } = req.params;
  const current = readTournamentData();

  current.teams = current.teams.filter((t: any) => t.id !== id);

  // Unbind from matches
  if (Array.isArray(current.matches)) {
    current.matches = current.matches.map((m: any) => {
      let updated = { ...m };
      if (m.teamAId === id) {
        updated.teamAId = undefined;
        updated.teamAName = 'A definir';
      }
      if (m.teamBId === id) {
        updated.teamBId = undefined;
        updated.teamBName = 'A definir';
      }
      if (m.winnerId === id) {
        updated.winnerId = undefined;
      }
      if (m.loserId === id) {
        updated.loserId = undefined;
      }
      return updated;
    });
  }

  current.lastUpdated = Date.now();
  writeTournamentData(current);
  res.json({ success: true, lastUpdated: current.lastUpdated });
});

// Start dev or production mode
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // In dev: Mount Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production: Serve built static files from dist
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Servidor Interclasse 2026 ativo em http://0.0.0.0:${PORT} [${isDev ? 'DEV' : 'PROD'}]`);
    console.log(`📁 Banco de Dados JSON: ${DATA_FILE}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
