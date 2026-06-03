import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getDb } from './db';
import { runSeeder } from './seed';
import { PokedexDTO, User } from './types';
import { signJwt, verifyJwt, verifyGoogleToken, requireAdmin, isLocalRequest, AuthenticatedRequest } from './auth';

// Carica variabili d'ambiente da .env
function loadEnv() {
  const possiblePaths = [
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'backend/.env')
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const firstEqual = trimmed.indexOf('=');
          const key = trimmed.slice(0, firstEqual).trim();
          const val = trimmed.slice(firstEqual + 1).trim();
          const cleanVal = val.replace(/^["']|["']$/g, '');
          process.env[key] = cleanVal;
        }
      }
      break;
    }
  }
}
loadEnv();

// =================================================================
// Logger strutturato — scrive su console e su file logs/YYYY-MM-DD.log
// =================================================================
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function getLogFile(): string {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(logsDir, `${today}.log`);
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function log(level: LogLevel, message: string, extra?: unknown): void {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}] ${message}`;
  const full = extra !== undefined
    ? `${base} | ${JSON.stringify(extra)}`
    : base;
  // Console
  if (level === 'ERROR') console.error(full);
  else if (level === 'WARN') console.warn(full);
  else console.log(full);
  // File
  try { fs.appendFileSync(getLogFile(), full + '\n'); } catch (_) {}
}

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8085;
const host = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

// Log di ogni richiesta HTTP in entrata
app.use((req, _res, next) => {
  log('INFO', `${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Inizializza il database e avvia il server Express
async function startServer() {
  try {
    console.log('Avvio del Database SQLite...');
    const db = await getDb();
    
    console.log('Esecuzione seeding...');
    await runSeeder(db);

    // Helper per aggiornare il timestamp lastUpdated per il Pokédex di un utente
    async function touchUserLastUpdated(userId: number) {
      try {
        const timestamp = Date.now();
        await db.run('UPDATE users SET lastUpdated = ? WHERE id = ?', timestamp, userId);
      } catch (err) {
        log('ERROR', `Errore nell'aggiornamento lastUpdated per utente ${userId}`, err);
      }
    }

    // Verifica i permessi di lettura di un Pokédex
    async function checkReadPermission(req: express.Request, userId: number): Promise<boolean> {
      try {
        const user = await db.get<User>('SELECT * FROM users WHERE id = ?', userId);
        if (!user) return false;
        
        if (user.privacyMode === 'private') {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
          const token = authHeader.substring(7);
          const decoded = verifyJwt(token);
          if (!decoded || decoded.id !== userId) return false;
        }
        return true;
      } catch (err) {
        return false;
      }
    }

    // Verifica i permessi di modifica di un Pokédex
    async function checkWritePermission(req: express.Request, userId: number): Promise<boolean> {
      try {
        const user = await db.get<User>('SELECT * FROM users WHERE id = ?', userId);
        if (!user) return false;
        
        if (user.isProtected === 1 || user.privacyMode === 'public_readonly' || user.privacyMode === 'private') {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
          const token = authHeader.substring(7);
          const decoded = verifyJwt(token);
          if (!decoded || decoded.id !== userId) return false;
        }
        return true;
      } catch (err) {
        return false;
      }
    }

    // Auto-cleanup di profili fantasma generati da navigazioni crawler su rotte riservate
    try {
      const reserved = ['about', 'admin', 'settings', 'stats', 'export', 'assets', 'favicon.ico', 'landing', 'api', 'quest', 'quests', 'egg', 'eggs', 'raid', 'raids'];
      const placeholders = reserved.map(() => '?').join(',');
      const result = await db.run(
        `DELETE FROM users WHERE LOWER(name) IN (${placeholders})`,
        ...reserved
      );
      if (result.changes && result.changes > 0) {
        log('INFO', `[Auto-Cleanup] Purged ${result.changes} accidental crawler-generated player profiles.`);
      }
    } catch (err) {
      console.error('[Auto-Cleanup] Errore durante la rimozione dei profili riservati:', err);
    }

    // =================================================================
    // 1. GET /api/users - Recupera la lista di tutti gli allenatori
    // =================================================================
    app.get('/api/users', async (req, res) => {
      try {
        const users = await db.all<User[]>('SELECT * FROM users ORDER BY id ASC');
        res.json(users);
      } catch (err) {
        console.error('Errore nel recupero degli utenti:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 1.5. DELETE /api/users/:id - Elimina un profilo allenatore
    // =================================================================
    app.delete('/api/users/:id', async (req, res) => {
      const id = parseInt(req.params.id, 10);
      try {
        const user = await db.get<User>('SELECT * FROM users WHERE id = ?', id);
        if (!user) {
          return res.status(404).json({ error: 'Utente non trovato' });
        }

        if (user.isProtected === 1) {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Autenticazione richiesta per eliminare questo profilo protetto' });
          }
          const token = authHeader.substring(7);
          const decoded = verifyJwt(token);
          if (!decoded || decoded.id !== id) {
            return res.status(403).json({ error: 'Non autorizzato a eliminare questo profilo' });
          }
        }

        const result = await db.run('DELETE FROM users WHERE id = ?', id);
        log('INFO', `Profilo allenatore eliminato con successo`, { id, changes: result.changes });
        res.json({ success: true });
      } catch (err) {
        log('ERROR', 'Errore nella cancellazione del profilo allenatore', { err: String(err), id });
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // POST /api/auth/google - Login o Registrazione con Account Google
    // =================================================================
    app.post('/api/auth/google', async (req, res) => {
      const { idToken, requestedUsername } = req.body;
      if (!idToken) {
        return res.status(400).json({ error: 'idToken è richiesto' });
      }

      try {
        const payload = await verifyGoogleToken(idToken);
        if (!payload) {
          return res.status(401).json({ error: 'Token Google non valido o scaduto' });
        }

        const sub = payload.sub;
        const email = payload.email || null;
        const googleName = payload.name || '';
        const picture = payload.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${sub}`;

        // Verifica se l'email fa parte della lista amministratori in .env
        const adminEmailsStr = process.env.ADMIN_EMAILS || '';
        const adminEmails = adminEmailsStr.split(',').map(e => e.trim().toLowerCase());
        const shouldBeAdmin = email ? adminEmails.includes(email.toLowerCase()) : false;

        // Controlla se esiste già un utente con questo googleSubId
        let user = await db.get<any>('SELECT * FROM users WHERE googleSubId = ?', sub);

        if (user) {
          // Se deve essere admin ma non lo è sul DB, aggiorna
          if (shouldBeAdmin && user.isAdmin !== 1) {
            await db.run('UPDATE users SET isAdmin = 1 WHERE id = ?', user.id);
            user.isAdmin = 1;
            await touchUserLastUpdated(user.id);
          }
          // Utente già registrato, effettua il login
          const token = signJwt({ id: user.id, name: user.name, googleSubId: user.googleSubId, isAdmin: user.isAdmin });
          return res.json({ token, user });
        }

        // Se l'utente non è ancora associato a nessun profilo
        if (!requestedUsername || requestedUsername.trim() === '') {
          // Restituisce le info per richiedere l'inserimento del nickname nel frontend
          return res.json({
            status: 'username_required',
            googlePayload: { sub, email, name: googleName, picture }
          });
        }

        const trimmedName = requestedUsername.trim();

        // Verifica se il nickname scelto esiste già nel database
        const existingUser = await db.get<any>('SELECT * FROM users WHERE name = ?', trimmedName);
        if (existingUser) {
          if (existingUser.isProtected === 1 || existingUser.googleSubId) {
            return res.status(400).json({ error: 'Questo nickname è già registrato da un altro utente' });
          }

          const isAdminVal = shouldBeAdmin ? 1 : 0;
          // Associa l'account Google al profilo esistente non protetto (claiming)
          await db.run(
            'UPDATE users SET googleSubId = ?, isProtected = ?, email = ?, avatarUrl = ?, isAdmin = ? WHERE id = ?',
            sub, 1, email, picture, isAdminVal, existingUser.id
          );
          await touchUserLastUpdated(existingUser.id as number);
          
          const updatedUser = await db.get<User>('SELECT * FROM users WHERE id = ?', existingUser.id);
          const token = signJwt({ id: updatedUser?.id, name: updatedUser?.name, googleSubId: updatedUser?.googleSubId, isAdmin: updatedUser?.isAdmin });
          log('INFO', `Profilo esistente collegato con Google (Admin: ${isAdminVal})`, { id: updatedUser?.id, name: updatedUser?.name });
          return res.json({ token, user: updatedUser });
        } else {
          const isAdminVal = shouldBeAdmin ? 1 : 0;
          // Crea un nuovo profilo protetto
          const result = await db.run(
            'INSERT INTO users (name, email, googleSubId, isProtected, avatarUrl, privacyMode, isAdmin) VALUES (?, ?, ?, ?, ?, ?, ?)',
            trimmedName, email, sub, 1, picture, 'public_edit', isAdminVal
          );
          const newUserId = result.lastID;
          await touchUserLastUpdated(newUserId as number);

          const newUser = await db.get<User>('SELECT * FROM users WHERE id = ?', newUserId);
          const token = signJwt({ id: newUser?.id, name: newUser?.name, googleSubId: newUser?.googleSubId, isAdmin: newUser?.isAdmin });
          log('INFO', `Nuovo profilo creato con Google (Admin: ${isAdminVal})`, { id: newUserId, name: trimmedName });
          return res.json({ token, user: newUser });
        }
      } catch (err) {
        log('ERROR', 'Errore durante l\'autenticazione Google', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // POST /api/users/:id/link-google - Collega Google Account a profilo esistente in settings
    // =================================================================
    app.post('/api/users/:id/link-google', async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const { idToken } = req.body;
      if (!idToken) {
        return res.status(400).json({ error: 'idToken è richiesto' });
      }

      try {
        const payload = await verifyGoogleToken(idToken);
        if (!payload) {
          return res.status(401).json({ error: 'Token Google non valido o scaduto' });
        }

        const sub = payload.sub;
        const email = payload.email || null;
        const picture = payload.picture || null;

        // Controlla se questo account Google è già associato a qualcun altro
        const existingLinked = await db.get<User>('SELECT * FROM users WHERE googleSubId = ?', sub);
        if (existingLinked && existingLinked.id !== id) {
          return res.status(400).json({ error: 'Questo account Google è già collegato ad un altro allenatore' });
        }

        // Recupera l'utente corrente
        const currentUser = await db.get<User>('SELECT * FROM users WHERE id = ?', id);
        if (!currentUser) {
          return res.status(404).json({ error: 'Utente non trovato' });
        }

        if (currentUser.isProtected === 1 || currentUser.googleSubId) {
          return res.status(400).json({ error: 'Questo profilo è già protetto' });
        }

        // Eseguiamo il collegamento
        const adminEmailsStr = process.env.ADMIN_EMAILS || '';
        const adminEmails = adminEmailsStr.split(',').map(e => e.trim().toLowerCase());
        const shouldBeAdmin = email ? adminEmails.includes(email.toLowerCase()) : false;
        const isAdminVal = shouldBeAdmin ? 1 : (currentUser.isAdmin || 0);

        await db.run(
          'UPDATE users SET googleSubId = ?, isProtected = ?, email = ?, avatarUrl = COALESCE(?, avatarUrl), isAdmin = ? WHERE id = ?',
          sub, 1, email, picture, isAdminVal, id
        );
        await touchUserLastUpdated(id);

        const updatedUser = await db.get<any>('SELECT * FROM users WHERE id = ?', id);
        const token = signJwt({ id: updatedUser?.id, name: updatedUser?.name, googleSubId: updatedUser?.googleSubId, isAdmin: updatedUser?.isAdmin });
        log('INFO', `Collegato Google account a profilo esistente via settings (Admin: ${isAdminVal})`, { id });
        res.json({ success: true, token, user: updatedUser });
      } catch (err) {
        log('ERROR', 'Errore durante il collegamento Google', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // PUT /api/users/:id/privacy - Cambia privacy del Pokedex
    // =================================================================
    app.put('/api/users/:id/privacy', async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const { privacyMode } = req.body;
      const validModes = ['public_edit', 'public_readonly', 'private'];
      if (!validModes.includes(privacyMode)) {
        return res.status(400).json({ error: 'privacyMode non valido' });
      }

      // Richiede autenticazione
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autenticazione richiesta' });
      }
      const token = authHeader.substring(7);
      const decoded = verifyJwt(token);
      if (!decoded || decoded.id !== id) {
        return res.status(403).json({ error: 'Non autorizzato a modificare la privacy di questo profilo' });
      }

      try {
        const user = await db.get<User>('SELECT * FROM users WHERE id = ?', id);
        if (!user) {
          return res.status(404).json({ error: 'Utente non trovato' });
        }

        // Se si vuole impostare una privacy restrittiva, l'utente deve essere protetto!
        if (privacyMode !== 'public_edit' && user.isProtected !== 1) {
          return res.status(400).json({ error: 'Collega prima un account Google per proteggere il tuo Pokédex e cambiarne la privacy' });
        }

        await db.run('UPDATE users SET privacyMode = ? WHERE id = ?', privacyMode, id);
        await touchUserLastUpdated(id);

        log('INFO', `Privacy modificata per utente`, { id, privacyMode });
        res.json({ success: true, privacyMode });
      } catch (err) {
        log('ERROR', 'Errore nella modifica della privacy', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 2. POST /api/users - Trova o crea un profilo allenatore per nome
    // =================================================================
    app.post('/api/users', async (req, res) => {
      const { name } = req.body;
      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Il nome è richiesto' });
      }

      const trimmedName = name.trim();

      try {
        // Verifica se l'utente esiste già
        const existingUser = await db.get<User>('SELECT * FROM users WHERE name = ?', trimmedName);
        if (existingUser) {
          return res.json(existingUser);
        }

        // Altrimenti, crea un nuovo profilo
        const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${trimmedName}`;
        const result = await db.run(
          'INSERT INTO users (name, avatarUrl) VALUES (?, ?);',
          trimmedName,
          avatarUrl
        );

        const newUser: User = {
          id: result.lastID,
          name: trimmedName,
          email: null,
          googleId: null,
          avatarUrl
        };

        console.log(`Profilo registrato per: ${trimmedName} (ID: ${result.lastID})`);
        res.json(newUser);
      } catch (err) {
        console.error('Errore nella registrazione dell\'utente:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 2.5. GET /api/quests - Elenco delle ricerche sul campo arricchite
    // =================================================================
    app.get('/api/quests', async (req, res) => {
      try {
        const quests = await db.all('SELECT * FROM quests ORDER BY displayOrder ASC');
        
        // Estraiamo tutti gli ID dei pokemon coinvolti per caricarne i dettagli (nome, spriteUrl)
        const pokemonIds = new Set<number>();
        for (const q of quests) {
          try {
            const rewards = JSON.parse(q.rewards);
            if (Array.isArray(rewards)) {
              for (const r of rewards) {
                if (r.pokemonId) pokemonIds.add(r.pokemonId);
              }
            }
          } catch (e) {
            console.error('Errore nel parse dei rewards della quest:', q.id, e);
          }
        }

        let pokemonDetailsMap = new Map<number, { name: string, spriteUrl: string }>();
        if (pokemonIds.size > 0) {
          const placeholders = Array.from(pokemonIds).map(() => '?').join(',');
          const pokemons = await db.all(
            `SELECT id, name, spriteUrl FROM pokemons WHERE id IN (${placeholders})`,
            ...Array.from(pokemonIds)
          );
          for (const p of pokemons) {
            pokemonDetailsMap.set(p.id, { name: p.name, spriteUrl: p.spriteUrl });
          }
        }

        // Arricchiamo le quest con i dettagli caricati
        const enrichedQuests = quests.map(q => {
          let rewards = [];
          try {
            rewards = JSON.parse(q.rewards);
          } catch (e) {}

          const enrichedRewards = rewards.map((r: any) => {
            const details = pokemonDetailsMap.get(r.pokemonId);
            return {
              ...r,
              name: details ? details.name : 'Unknown',
              spriteUrl: details ? details.spriteUrl : ''
            };
          });

          return {
            id: q.id,
            name: q.name,
            rewards: enrichedRewards,
            displayOrder: q.displayOrder
          };
        });

        res.json(enrichedQuests);
      } catch (err) {
        console.error('Errore nel recupero delle quest:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 2.6. PUT /api/quests/reorder - Riordina l'elenco delle quest
    // =================================================================
    app.put('/api/quests/reorder', async (req, res) => {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'orderedIds è richiesto e deve essere un array' });
      }

      try {
        await db.run('BEGIN TRANSACTION;');
        const stmt = await db.prepare('UPDATE quests SET displayOrder = ? WHERE id = ?');
        for (let i = 0; i < orderedIds.length; i++) {
          await stmt.run(i + 1, orderedIds[i]);
        }
        await stmt.finalize();
        await db.run('COMMIT;');
        res.json({ success: true });
      } catch (err) {
        try { await db.run('ROLLBACK;'); } catch (_) {}
        console.error('Errore durante il riordino delle quest:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 2.7. GET /api/eggs - Elenco delle uova arricchite
    // =================================================================
    app.get('/api/eggs', async (req, res) => {
      try {
        const eggs = await db.all('SELECT * FROM eggs ORDER BY id ASC');
        
        // Estraiamo tutti gli ID dei pokemon coinvolti per caricarne i dettagli (nome, spriteUrl, generation)
        const pokemonIds = new Set<number>();
        for (const egg of eggs) {
          try {
            const contents = JSON.parse(egg.contents);
            if (Array.isArray(contents)) {
              for (const c of contents) {
                if (c.pokemonId) pokemonIds.add(c.pokemonId);
              }
            }
          } catch (e) {
            console.error('Errore nel parse del contenuto dell uovo:', egg.id, e);
          }
        }

        let pokemonDetailsMap = new Map<number, { name: string, spriteUrl: string, generation: number }>();
        if (pokemonIds.size > 0) {
          const placeholders = Array.from(pokemonIds).map(() => '?').join(',');
          const pokemons = await db.all(
            `SELECT id, name, spriteUrl, generation FROM pokemons WHERE id IN (${placeholders})`,
            ...Array.from(pokemonIds)
          );
          for (const p of pokemons) {
            pokemonDetailsMap.set(p.id, { name: p.name, spriteUrl: p.spriteUrl, generation: p.generation });
          }
        }

        // Arricchiamo le uova con i dettagli caricati
        const enrichedEggs = eggs.map(egg => {
          let contents = [];
          try {
            contents = JSON.parse(egg.contents);
          } catch (e) {}

          const enrichedContents = contents.map((c: any) => {
            const details = pokemonDetailsMap.get(c.pokemonId);
            return {
              ...c,
              name: details ? details.name : 'Unknown',
              spriteUrl: details ? details.spriteUrl : '',
              generation: details ? details.generation : 0
            };
          });

          return {
            id: egg.id,
            name: egg.name,
            type: egg.type,
            contents: enrichedContents
          };
        });

        res.json(enrichedEggs);
      } catch (err) {
        console.error('Errore nel recupero delle uova:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 2.8. GET /api/raids - Elenco dei raid arricchiti
    // =================================================================
    app.get('/api/raids', async (req, res) => {
      try {
        const raids = await db.all(`
          SELECT r.*, p.name, p.spriteUrl, p.generation, p.attack, p.defense, p.stamina 
          FROM raids r 
          LEFT JOIN pokemons p ON r.pokemonId = p.id 
          ORDER BY r.id ASC
        `);
        
        const enrichedRaids = raids.map(r => ({
          id: r.id,
          pokemonId: r.pokemonId,
          name: r.name || 'Unknown',
          spriteUrl: r.spriteUrl || '',
          generation: r.generation || 0,
          minCp: r.minCp,
          maxCp: r.maxCp,
          minCpBoost: r.minCpBoost || null,
          maxCpBoost: r.maxCpBoost || null,
          tier: r.tier,
          isShadow: !!r.isShadow,
          isMega: !!r.isMega,
          attack: r.attack || null,
          defense: r.defense || null,
          stamina: r.stamina || null
        }));

        res.json(enrichedRaids);
      } catch (err) {
        console.error('Errore nel recupero dei raid:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 3. GET /api/pokedex - Catalogo completo con stato spunte allenatore
    // =================================================================
    app.get('/api/pokedex', async (req, res) => {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'userId è richiesto' });
      }

      const parsedUserId = parseInt(userId as string, 10);

      try {
        if (!(await checkReadPermission(req, parsedUserId))) {
          return res.status(403).json({ error: 'Questo Pokédex è privato. Accedi con il profilo proprietario per visualizzarlo.' });
        }
        // Query preventiva del timestamp lastUpdated dell'utente
        const userRow = await db.get<{ lastUpdated: number }>('SELECT lastUpdated FROM users WHERE id = ?', parsedUserId);
        const lastUpdated = userRow?.lastUpdated || 0;

        // Genera l'ETag dinamico per il Pokédex di questo utente
        const etag = `W/"user_${parsedUserId}_${lastUpdated}"`;

        // Verifica se l'ETag corrisponde a quello del client
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag === etag) {
          return res.status(304).end();
        }

        // Impostiamo l'header ETag per consentire il caching del browser
        res.setHeader('ETag', etag);

        const pokemons = await db.all('SELECT * FROM pokemons ORDER BY id ASC');
        const entries = await db.all('SELECT * FROM pokedex_entries WHERE userId = ?', parsedUserId);
        
        // Mappa delle spunte di cattura (chiave pokemonId)
        const entriesMap = new Map<number, any>();
        for (const e of entries) {
          entriesMap.set(e.pokemonId, e);
        }

        const dtos: PokedexDTO[] = pokemons.map(p => {
          const entry = entriesMap.get(p.id);
          return {
            id: p.id,
            name: p.name,
            type1: p.type1,
            type2: p.type2 || null,
            generation: p.generation,
            spriteUrl: p.spriteUrl,
            regular: entry ? !!entry.regular : false,
            shadow: entry ? !!entry.shadow : false,
            purified: entry ? !!entry.purified : false,
            perfect: entry ? !!entry.perfect : false,
            lucky: entry ? !!entry.lucky : false,
            xxs: entry ? !!entry.xxs : false,
            xxl: entry ? !!entry.xxl : false,
            shiny: entry ? !!entry.shiny : false,
            mega: entry ? (entry.mega || 0) : 0,
            gigamax: entry ? !!entry.gigamax : false,
            megaVarietyId: p.megaVarietyId || null,
            megaVarietyId2: p.megaVarietyId2 || null,
            gigamaxVarietyId: p.gigamaxVarietyId || null,
            parentId: p.parentId || null,
            attack: p.attack || null,
            defense: p.defense || null,
            stamina: p.stamina || null
          };
        });

        res.json(dtos);
      } catch (err) {
        console.error('Errore nel recupero del Pokédex:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 4. PUT /api/pokedex/:pokemonId - Aggiorna lo stato di cattura
    // =================================================================
    app.put('/api/pokedex/:pokemonId', async (req, res) => {
      const pokemonId = parseInt(req.params.pokemonId, 10);
      const { userId } = req.query;
      const dto: PokedexDTO = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId è richiesto' });
      }

      try {
        const parsedUserId = parseInt(userId as string, 10);
        if (!(await checkWritePermission(req, parsedUserId))) {
          return res.status(403).json({ error: 'Non hai i permessi per modificare questo Pokédex' });
        }
        const pokemon = await db.get('SELECT * FROM pokemons WHERE id = ?', pokemonId);
        if (!pokemon) {
          return res.status(404).json({ error: 'Pokémon non trovato' });
        }

        // Upsert spunte spianate come integer 0 o 1
        await db.run(`
          INSERT OR REPLACE INTO pokedex_entries 
          (userId, pokemonId, regular, shadow, purified, perfect, lucky, xxs, xxl, shiny, mega, gigamax)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
          userId,
          pokemonId,
          dto.regular ? 1 : 0,
          dto.shadow ? 1 : 0,
          dto.purified ? 1 : 0,
          dto.perfect ? 1 : 0,
          dto.lucky ? 1 : 0,
          dto.xxs ? 1 : 0,
          dto.xxl ? 1 : 0,
          dto.shiny ? 1 : 0,
          dto.mega || 0,
          dto.gigamax ? 1 : 0
        );

        // Aggiorna il timestamp lastUpdated per questo utente
        await touchUserLastUpdated(parseInt(userId as string, 10));

        const updatedDto: PokedexDTO = {
          id: pokemon.id,
          name: pokemon.name,
          type1: pokemon.type1,
          type2: pokemon.type2 || null,
          generation: pokemon.generation,
          spriteUrl: pokemon.spriteUrl,
          regular: dto.regular,
          shadow: dto.shadow,
          purified: dto.purified,
          perfect: dto.perfect,
          lucky: dto.lucky,
          xxs: dto.xxs,
          xxl: dto.xxl,
          shiny: dto.shiny,
          mega: dto.mega,
          gigamax: dto.gigamax,
          megaVarietyId: pokemon.megaVarietyId || null,
          megaVarietyId2: pokemon.megaVarietyId2 || null,
          gigamaxVarietyId: pokemon.gigamaxVarietyId || null,
          parentId: pokemon.parentId || null
        };

        res.json(updatedDto);
      } catch (err) {
        console.error('Errore nell\'aggiornamento del Pokédex:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 5. GET /api/pokedex/stats - Statistiche di cattura allenatore
    // =================================================================
    app.get('/api/pokedex/stats', async (req, res) => {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'userId è richiesto' });
      }

      try {
        const parsedUserId = parseInt(userId as string, 10);
        if (!(await checkReadPermission(req, parsedUserId))) {
          return res.status(403).json({ error: 'Questo Pokédex è privato. Accedi con il profilo proprietario per visualizzarlo.' });
        }
        const totalRow = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM pokemons');
        const statsRow = await db.get<any>(`
          SELECT 
            SUM(regular) as regularCaught,
            SUM(shadow) as shadowCaught,
            SUM(purified) as purifiedCaught,
            SUM(perfect) as perfectCaught,
            SUM(lucky) as luckyCaught,
            SUM(xxs) as xxsCaught,
            SUM(xxl) as xxlCaught,
            SUM(shiny) as shinyCaught,
            SUM(CASE WHEN mega = 3 THEN 2 WHEN mega > 0 THEN 1 ELSE 0 END) as megaCaught,
            SUM(gigamax) as gigamaxCaught
          FROM pokedex_entries
          WHERE userId = ?;
        `, userId);

        res.json({
          total: totalRow?.count || 0,
          regularCaught: statsRow?.regularCaught || 0,
          shadowCaught: statsRow?.shadowCaught || 0,
          purifiedCaught: statsRow?.purifiedCaught || 0,
          perfectCaught: statsRow?.perfectCaught || 0,
          luckyCaught: statsRow?.luckyCaught || 0,
          xxsCaught: statsRow?.xxsCaught || 0,
          xxlCaught: statsRow?.xxlCaught || 0,
          shinyCaught: statsRow?.shinyCaught || 0,
          megaCaught: statsRow?.megaCaught || 0,
          gigamaxCaught: statsRow?.gigamaxCaught || 0
        });
      } catch (err) {
        console.error('Errore nel caricamento statistiche:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 6. GET /api/pokedex/search-string - Generatore di stringhe Pokémon GO
    // =================================================================
    app.get('/api/pokedex/search-string', async (req, res) => {
      const { userId, category = 'regular', mode = 'list' } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'userId è richiesto' });
      }

      try {
        const parsedUserId = parseInt(userId as string, 10);
        if (!(await checkReadPermission(req, parsedUserId))) {
          return res.status(403).json({ error: 'Questo Pokédex è privato. Accedi con il profilo proprietario per visualizzarlo.' });
        }
        const pokemons = await db.all('SELECT id FROM pokemons ORDER BY id ASC');
        const entries = await db.all('SELECT * FROM pokedex_entries WHERE userId = ?', userId);
        
        const entriesMap = new Map<number, any>();
        for (const e of entries) {
          entriesMap.set(e.pokemonId, e);
        }

        const missingIds: number[] = [];
        const catKey = String(category).toLowerCase();

        for (const p of pokemons) {
          const entry = entriesMap.get(p.id);
          let isCaught = false;

          if (entry) {
            isCaught = !!entry[catKey];
          }

          if (!isCaught) {
            missingIds.push(p.id);
          }
        }

        if (missingIds.length === 0) {
          return res.json({ searchString: '' });
        }

        let searchString = '';
        if (String(mode).toLowerCase() === 'negation') {
          searchString = missingIds.map(id => `!${id}`).join('&');
        } else {
          searchString = missingIds.map(String).join(',');
        }

        res.json({ searchString });
      } catch (err) {
        console.error('Errore nella generazione della stringa:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 6.5. POST /api/pokedex/bulk - Importazione massiva di spunte per Pokémon
    // =================================================================
    app.post('/api/pokedex/bulk', async (req, res) => {
      const { userId, pokemonIds, category, value = true } = req.body;
      if (!userId || !pokemonIds || !category) {
        return res.status(400).json({ error: 'userId, pokemonIds e category sono richiesti' });
      }

      const intValue = value ? 1 : 0;
      const catKey = String(category).toLowerCase();
      const validCategories = ['regular', 'shadow', 'purified', 'perfect', 'lucky', 'xxs', 'xxl', 'shiny', 'mega', 'gigamax'];
      if (!validCategories.includes(catKey)) {
        return res.status(400).json({ error: 'Categoria non valida' });
      }

      try {
        const parsedUserId = parseInt(userId as string, 10);
        if (!(await checkWritePermission(req, parsedUserId))) {
          return res.status(403).json({ error: 'Non hai i permessi per modificare questo Pokédex' });
        }
        const inputIds: number[] = (pokemonIds as number[]).map(Number);

        // Filtra solo i pokemonId che esistono nella tabella pokemons
        // (evita violazione della FOREIGN KEY per pokemon non ancora rilasciati)
        const placeholders = inputIds.map(() => '?').join(',');
        const validRows = await db.all<{ id: number }[]>(
          `SELECT id FROM pokemons WHERE id IN (${placeholders})`,
          ...inputIds
        );
        const validIds = validRows.map(r => r.id);
        const skipped = inputIds.length - validIds.length;

        if (skipped > 0) {
          log('WARN', `Bulk import: saltati ${skipped} pokemon non presenti nel catalogo`, {
            userId, category, skipped,
            missingIds: inputIds.filter(id => !validIds.includes(id))
          });
        }

        if (validIds.length === 0) {
          return res.json({ success: true, count: 0, skipped });
        }

        // Usa INSERT OR REPLACE per upsert atomico più efficiente
        const columns = ['userId', 'pokemonId', 'regular', 'shadow', 'purified', 'perfect', 'lucky', 'xxs', 'xxl', 'shiny', 'mega', 'gigamax'];
        const catIndex = columns.indexOf(catKey);

        await db.run('BEGIN TRANSACTION');

        for (const id of validIds) {
          // Legge il record esistente per non sovrascrivere le altre colonne
          const existing = await db.get(
            'SELECT * FROM pokedex_entries WHERE userId = ? AND pokemonId = ?',
            userId, id
          );
          if (existing) {
            await db.run(
              `UPDATE pokedex_entries SET ${catKey} = ? WHERE userId = ? AND pokemonId = ?`,
              intValue, userId, id
            );
          } else {
            const values: (string | number)[] = [userId, id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            if (catIndex !== -1) values[catIndex] = intValue;
            const queryCols = columns.join(', ');
            const ph = columns.map(() => '?').join(', ');
            await db.run(`INSERT INTO pokedex_entries (${queryCols}) VALUES (${ph})`, ...values);
          }
        }

        await db.run('COMMIT');
        
        // Aggiorna il timestamp lastUpdated per questo utente
        await touchUserLastUpdated(parseInt(userId as string, 10));

        log('INFO', `Bulk import completato`, { userId, category, count: validIds.length, skipped });
        res.json({ success: true, count: validIds.length, skipped });
      } catch (err) {
        try { await db.run('ROLLBACK'); } catch (_) {}
        log('ERROR', 'Errore nell\'importazione massiva', { err: String(err), userId, category });
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 6. POST /api/pokedex/batch - Salvataggio massivo e transazionale delle spunte
    // =================================================================
    app.post('/api/pokedex/batch', async (req, res) => {
      const { userId, updates } = req.body;
      if (!userId || !Array.isArray(updates)) {
        return res.status(400).json({ error: 'userId e updates sono richiesti e updates deve essere un array' });
      }

      if (updates.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      try {
        const parsedUserId = parseInt(userId as string, 10);
        if (!(await checkWritePermission(req, parsedUserId))) {
          return res.status(403).json({ error: 'Non hai i permessi per modificare questo Pokédex' });
        }

        const tStart = Date.now();
        await db.run('BEGIN TRANSACTION');

        for (const dto of updates) {
          await db.run(`
            INSERT OR REPLACE INTO pokedex_entries 
            (userId, pokemonId, regular, shadow, purified, perfect, lucky, xxs, xxl, shiny, mega, gigamax)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
            userId,
            dto.id,
            dto.regular ? 1 : 0,
            dto.shadow ? 1 : 0,
            dto.purified ? 1 : 0,
            dto.perfect ? 1 : 0,
            dto.lucky ? 1 : 0,
            dto.xxs ? 1 : 0,
            dto.xxl ? 1 : 0,
            dto.shiny ? 1 : 0,
            dto.mega || 0,
            dto.gigamax ? 1 : 0
          );
        }

        await db.run('COMMIT');
        
        // Aggiorna il timestamp lastUpdated per questo utente
        await touchUserLastUpdated(parsedUserId);

        const elapsed = Date.now() - tStart;
        log('INFO', `Transazione batch completata con successo in ${elapsed}ms`, { userId, count: updates.length });
        res.json({ success: true, count: updates.length });
      } catch (err) {
        try { await db.run('ROLLBACK'); } catch (_) {}
        log('ERROR', 'Errore durante la transazione batch', { err: String(err), userId });
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // GET /api/auth/config - Recupera configurazione OAuth
    // =================================================================
    app.get('/api/auth/config', (req, res) => {
      res.json({
        googleClientId: process.env.GOOGLE_CLIENT_ID || null
      });
    });

    const configPath = path.join(__dirname, '../../frontend/src/app/services/pokemon-config.ts');

    // =================================================================
    // 6.6. GET /api/pokemon-config - Carica le liste di configurazione (Pubblico)
    // =================================================================
    app.get('/api/pokemon-config', async (req, res) => {
      try {
        const db = await getDb();
        const rows = (await db.all('SELECT * FROM app_config')) as { key: string, value: string }[];
        
        if (rows && rows.length > 0) {
          const configMap = new Map<string, string[]>();
          for (const row of rows) {
            try {
              configMap.set(row.key, JSON.parse(row.value));
            } catch (_) {}
          }
          return res.json({
            shadowCapable: configMap.get('SHADOW_CAPABLE_SPECIES') || [],
            megaCapable: configMap.get('MEGA_CAPABLE_SPECIES') || [],
            gigamaxCapable: configMap.get('GIGAMAX_CAPABLE_SPECIES') || [],
            unreleasedCapable: configMap.get('UNRELEASED_SPECIES') || [],
            shinyUnreleasedCapable: configMap.get('SHINY_UNRELEASED_SPECIES') || []
          });
        }

        // Fallback su lettura file
        if (!fs.existsSync(configPath)) {
          return res.json({ shadowCapable: [], megaCapable: [], gigamaxCapable: [], unreleasedCapable: [], shinyUnreleasedCapable: [] });
        }

        const content = fs.readFileSync(configPath, 'utf-8');

        function extractArray(fileContent: string, arrayName: string): string[] {
          const regex = new RegExp(`export\\s+const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
          const match = fileContent.match(regex);
          if (!match) return [];
          const arrayBody = match[1];
          const nameRegex = /['"](.*?)['"]/g;
          const names: string[] = [];
          let nameMatch;
          while ((nameMatch = nameRegex.exec(arrayBody)) !== null) {
            names.push(nameMatch[1].replace(/\\'/g, "'"));
          }
          return names;
        }

        const shadowCapable = extractArray(content, 'SHADOW_CAPABLE_SPECIES');
        const megaCapable = extractArray(content, 'MEGA_CAPABLE_SPECIES');
        const gigamaxCapable = extractArray(content, 'GIGAMAX_CAPABLE_SPECIES');
        const unreleasedCapable = extractArray(content, 'UNRELEASED_SPECIES');
        const shinyUnreleasedCapable = extractArray(content, 'SHINY_UNRELEASED_SPECIES');

        res.json({ shadowCapable, megaCapable, gigamaxCapable, unreleasedCapable, shinyUnreleasedCapable });
      } catch (err) {
        console.error('Errore nel recupero pubblico della configurazione:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 7. GET /api/admin/config - Carica le liste capaci (Protetto da requireAdmin)
    // =================================================================
    app.get('/api/admin/config', requireAdmin, async (req, res) => {
      try {
        const db = await getDb();
        const rows = (await db.all('SELECT * FROM app_config')) as { key: string, value: string }[];
        
        const configMap = new Map<string, string[]>();
        if (rows && rows.length > 0) {
          for (const row of rows) {
            try {
              configMap.set(row.key, JSON.parse(row.value));
            } catch (_) {}
          }
        } else if (fs.existsSync(configPath)) {
          // Fallback statico
          const content = fs.readFileSync(configPath, 'utf-8');
          function extractArray(fileContent: string, arrayName: string): string[] {
            const regex = new RegExp(`export\\s+const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
            const match = fileContent.match(regex);
            if (!match) return [];
            const arrayBody = match[1];
            const nameRegex = /['"](.*?)['"]/g;
            const names: string[] = [];
            let nameMatch;
            while ((nameMatch = nameRegex.exec(arrayBody)) !== null) {
              names.push(nameMatch[1].replace(/\\'/g, "'"));
            }
            return names;
          }
          configMap.set('SHADOW_CAPABLE_SPECIES', extractArray(content, 'SHADOW_CAPABLE_SPECIES'));
          configMap.set('MEGA_CAPABLE_SPECIES', extractArray(content, 'MEGA_CAPABLE_SPECIES'));
          configMap.set('GIGAMAX_CAPABLE_SPECIES', extractArray(content, 'GIGAMAX_CAPABLE_SPECIES'));
          configMap.set('UNRELEASED_SPECIES', extractArray(content, 'UNRELEASED_SPECIES'));
          configMap.set('SHINY_UNRELEASED_SPECIES', extractArray(content, 'SHINY_UNRELEASED_SPECIES'));
        }

        res.json({
          shadowCapable: configMap.get('SHADOW_CAPABLE_SPECIES') || [],
          megaCapable: configMap.get('MEGA_CAPABLE_SPECIES') || [],
          gigamaxCapable: configMap.get('GIGAMAX_CAPABLE_SPECIES') || [],
          unreleasedCapable: configMap.get('UNRELEASED_SPECIES') || [],
          shinyUnreleasedCapable: configMap.get('SHINY_UNRELEASED_SPECIES') || []
        });
      } catch (err) {
        console.error('Errore nel recupero della configurazione di amministrazione:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 8. POST /api/admin/config - Salva le liste su database (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/config', requireAdmin, async (req, res) => {
      const { shadowCapable, megaCapable, gigamaxCapable, unreleasedCapable, shinyUnreleasedCapable } = req.body;

      if (!Array.isArray(shadowCapable) || !Array.isArray(megaCapable) || !Array.isArray(gigamaxCapable) || !Array.isArray(unreleasedCapable) || !Array.isArray(shinyUnreleasedCapable)) {
        return res.status(400).json({ error: 'Formato dati non valido' });
      }

      try {
        const db = await getDb();
        await db.run('BEGIN TRANSACTION;');
        await db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', 'SHADOW_CAPABLE_SPECIES', JSON.stringify(shadowCapable));
        await db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', 'MEGA_CAPABLE_SPECIES', JSON.stringify(megaCapable));
        await db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', 'GIGAMAX_CAPABLE_SPECIES', JSON.stringify(gigamaxCapable));
        await db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', 'UNRELEASED_SPECIES', JSON.stringify(unreleasedCapable));
        await db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', 'SHINY_UNRELEASED_SPECIES', JSON.stringify(shinyUnreleasedCapable));
        await db.run('COMMIT;');

        console.log(`[Admin] Configurazione salvata con successo nel database.`);
        res.json({ success: true, message: 'Configurazione salvata con successo.' });
      } catch (err) {
        try { const db = await getDb(); await db.run('ROLLBACK;'); } catch (_) {}
        console.error('Errore nel salvataggio della configurazione:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // GET /api/admin/users - Ritorna la lista di tutti gli utenti (Protetto da requireAdmin)
    // =================================================================
    app.get('/api/admin/users', requireAdmin, async (req, res) => {
      try {
        const db = await getDb();
        const users = await db.all('SELECT id, name, email, avatarUrl, googleSubId, isProtected, privacyMode, isAdmin FROM users ORDER BY name ASC');
        res.json(users);
      } catch (err) {
        console.error('Errore nel recupero degli utenti:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // PUT /api/admin/users/:id/admin-role - Imposta o revoca il ruolo admin (Protetto da requireAdmin)
    // =================================================================
    app.put('/api/admin/users/:id/admin-role', requireAdmin, async (req, res) => {
      const targetUserId = parseInt(req.params.id, 10);
      const { isAdmin } = req.body;

      if (isNaN(targetUserId)) {
        return res.status(400).json({ error: 'ID utente non valido' });
      }
      if (isAdmin !== 0 && isAdmin !== 1) {
        return res.status(400).json({ error: 'Valore isAdmin non valido (deve essere 0 o 1)' });
      }

      // Impedisci a un admin di auto-revocarsi il ruolo tramite API se è l'utente attivo
      const loggedUser = (req as AuthenticatedRequest).user;
      if (loggedUser && loggedUser.id === targetUserId && isAdmin === 0) {
        return res.status(400).json({ error: 'Non puoi revocare il tuo stesso ruolo di amministratore' });
      }

      try {
        const db = await getDb();
        const user = await db.get('SELECT * FROM users WHERE id = ?', targetUserId);
        if (!user) {
          return res.status(404).json({ error: 'Utente non trovato' });
        }

        await db.run('UPDATE users SET isAdmin = ? WHERE id = ?', isAdmin, targetUserId);
        await touchUserLastUpdated(targetUserId);

        console.log(`[Admin] Ruolo admin aggiornato a ${isAdmin} per utente ${user.name} (ID: ${targetUserId})`);
        res.json({ success: true, isAdmin });
      } catch (err) {
        console.error('Errore durante l\'aggiornamento del ruolo admin:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    async function performShinyAutoSync(): Promise<string[]> {
      function cleanStringForMatch(str: string): string {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/’/g, "'")
          .replace(/♀/g, 'f')
          .replace(/♂/g, 'm')
          .replace(/[^a-z0-9]/g, '');
      }

      console.log('[Auto-Sync] Avvio sincronizzazione Shiny automatica. Contatto pogoapi.net...');
      const response = await fetch('https://pogoapi.net/api/v1/shiny_pokemon.json');
      if (!response.ok) {
        throw new Error(`PoGoAPI returned status ${response.status}`);
      }
      const shinyData = (await response.json()) as Record<string, { name: string; [key: string]: any }>;

      const releasedShinyNames = new Set<string>(
        Object.values(shinyData).map((p: any) => p.name.trim())
      );
      const cleanedReleasedShinyNames = new Set<string>(
        Array.from(releasedShinyNames).map(name => cleanStringForMatch(name))
      );

      const seedPath = path.join(__dirname, 'pokemon.json');
      if (!fs.existsSync(seedPath)) {
        throw new Error('File pokemon.json non trovato');
      }
      const pokemonData = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as any[];

      const shinyUnreleasedSet = new Set<string>();
      for (const p of pokemonData) {
        const baseName = p.name.split(' (')[0];
        const cleanedBaseName = cleanStringForMatch(baseName);

        if (!cleanedReleasedShinyNames.has(cleanedBaseName)) {
          shinyUnreleasedSet.add(baseName);
        }
      }

      const shinyUnreleasedCapable = Array.from(shinyUnreleasedSet).sort();

      const db = await getDb();
      await db.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)',
        'SHINY_UNRELEASED_SPECIES',
        JSON.stringify(shinyUnreleasedCapable)
      );

      console.log(`[Auto-Sync] Shiny cromatici sincronizzati con successo nel database. Trovati ${shinyUnreleasedCapable.length} shiny non rilasciati.`);
      return shinyUnreleasedCapable;
    }

    async function performRaidAutoSync(): Promise<void> {
      console.log('[Auto-Sync-Raids] Avvio sincronizzazione Raid automatica. Contatto pokemon-go-api...');
      const response = await fetch('https://pokemon-go-api.github.io/pokemon-go-api/api/raidboss.json');
      if (!response.ok) {
        throw new Error(`Pokemon GO API returned status ${response.status}`);
      }
      const data = await response.json() as any;
      if (!data || !data.currentList) {
        throw new Error('Raid boss data is empty or invalid');
      }

      const list = data.currentList;
      const parsedRaids: Array<{
        pokemonId: number;
        minCp: number;
        maxCp: number;
        minCpBoost: number | null;
        maxCpBoost: number | null;
        tier: string;
        isShadow: number;
        isMega: number;
      }> = [];

      for (const tierKey of Object.keys(list)) {
        const bosses = list[tierKey];
        if (!Array.isArray(bosses)) continue;

        for (const b of bosses) {
          const imageSrc = b.assets?.image || '';
          const match = imageSrc.match(/\/pm(\d+)(?:\.f([A-Z0-9]+))?\.icon\.png/);
          if (!match) {
            console.warn(`[Auto-Sync-Raids] Impossibile estrarre Pokédex ID dall'immagine per ${b.names?.English}: ${imageSrc}`);
            continue;
          }

          const dexNumber = parseInt(match[1], 10);
          const formSuffix = match[2] || '';
          let pokemonId = dexNumber;

          if (formSuffix && ['ALOLA', 'GALAR', 'HISUI', 'PALDEA', 'ORIGIN'].includes(formSuffix)) {
            const formNameMap: Record<string, string> = {
              'ALOLA': 'Alolan',
              'GALAR': 'Galarian',
              'HISUI': 'Hisuian',
              'PALDEA': 'Paldean',
              'ORIGIN': 'Origin'
            };
            const dbFormName = formNameMap[formSuffix];
            if (dbFormName) {
              const variety = await db.get<{ id: number }>(
                'SELECT id FROM pokemons WHERE parentId = ? AND name LIKE ?',
                dexNumber,
                `%(${dbFormName})%`
              );
              if (variety) {
                pokemonId = variety.id;
              } else {
                console.warn(`[Auto-Sync-Raids] Varietà non trovata nel DB per parentId=${dexNumber}, form=${dbFormName}`);
                continue;
              }
            }
          }

          // Verifica se l'ID esiste nel database pokemons
          const countRow = await db.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM pokemons WHERE id = ?',
            pokemonId
          );
          if (!countRow || countRow.count === 0) {
            console.warn(`[Auto-Sync-Raids] Pokémon con ID ${pokemonId} non trovato nel database. Salto.`);
            continue;
          }

          let isShadow = 0;
          let isMega = 0;
          let tier = 'standard';

          if (tierKey === 'mega') {
            isMega = 1;
            tier = 'mega';
          } else if (tierKey === 'lvl5' || tierKey === 'ultra_beast' || tierKey === 'shadow_lvl5') {
            tier = 'legendary';
          } else {
            tier = 'standard';
          }

          if (tierKey.startsWith('shadow_')) {
            isShadow = 1;
          }

          const minCp = Array.isArray(b.cpRange) ? b.cpRange[0] : 0;
          const maxCp = Array.isArray(b.cpRange) ? b.cpRange[1] : 0;
          const minCpBoost = Array.isArray(b.cpRangeBoost) ? b.cpRangeBoost[0] : null;
          const maxCpBoost = Array.isArray(b.cpRangeBoost) ? b.cpRangeBoost[1] : null;

          parsedRaids.push({
            pokemonId,
            minCp,
            maxCp,
            minCpBoost,
            maxCpBoost,
            tier,
            isShadow,
            isMega
          });
        }
      }

      // Esegui l'aggiornamento sul database
      await db.run('BEGIN TRANSACTION;');
      try {
        await db.run('DELETE FROM raids;');
        const insertStmt = await db.prepare(
          'INSERT INTO raids (pokemonId, minCp, maxCp, minCpBoost, maxCpBoost, tier, isShadow, isMega) VALUES (?, ?, ?, ?, ?, ?, ?, ?);'
        );
        for (const r of parsedRaids) {
          await insertStmt.run(r.pokemonId, r.minCp, r.maxCp, r.minCpBoost, r.maxCpBoost, r.tier, r.isShadow, r.isMega);
        }
        await insertStmt.finalize();
        await db.run('COMMIT;');
        console.log(`[Auto-Sync-Raids] Raid auto-sincronizzati con successo. Inseriti ${parsedRaids.length} raid attivi.`);
      } catch (err) {
        await db.run('ROLLBACK;');
        throw err;
      }
    }

    // =================================================================
    // 9. POST /api/admin/sync-shinies - Sincronizza automaticamente gli shiny da PoGoAPI (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/sync-shinies', requireAdmin, async (req, res) => {
      try {
        const shinyUnreleasedCapable = await performShinyAutoSync();
        res.json({ success: true, shinyUnreleasedCapable });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica degli shiny:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione automatica con PoGoAPI: ' + String(err) });
      }
    });

    // =================================================================
    // 9.1. POST /api/admin/sync-raids - Sincronizza automaticamente i raid da Pokemon GO API (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/sync-raids', requireAdmin, async (req, res) => {
      try {
        await performRaidAutoSync();
        res.json({ success: true });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica dei raid:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione dei raid: ' + String(err) });
      }
    });

    // Serve static files of the Angular frontend
    const frontendPath = path.join(__dirname, '../../frontend/dist/frontend/browser');
    app.use(express.static(frontendPath));

    // Redirect all other requests to Angular's index.html (client-side routing)
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });

    // Avvia l'ascolto
    app.listen(port, host, () => {
      console.log(`================================================================`);
      console.log(`   [Node OK] Server REST in ascolto su http://${host}:${port}!`);
      console.log(`================================================================`);

      // 10. Esegui la sincronizzazione automatica degli shiny e dei raid all'avvio in background
      setTimeout(async () => {
        try {
          console.log('[Startup Background Worker] Avvio sincronizzazione Shiny programmata...');
          await performShinyAutoSync();
          console.log('[Startup Background Worker] Sincronizzazione Shiny iniziale completata con successo.');
        } catch (err) {
          console.error('[Startup Background Worker] Impossibile eseguire la sincronizzazione automatica Shiny all\'avvio:', err);
        }

        try {
          console.log('[Startup Background Worker] Avvio sincronizzazione Raid programmata...');
          await performRaidAutoSync();
          console.log('[Startup Background Worker] Sincronizzazione Raid iniziale completata con successo.');
        } catch (err) {
          console.error('[Startup Background Worker] Impossibile eseguire la sincronizzazione automatica Raid all\'avvio:', err);
        }
      }, 5000); // Ritardo di 5 secondi per far avviare il server liberamente

      // 11. Esegui la sincronizzazione automatica ogni 24 ore
      setInterval(async () => {
        try {
          console.log('[Periodic Background Worker] Avvio sincronizzazione Shiny e Raid giornaliera...');
          await performShinyAutoSync();
          await performRaidAutoSync();
          console.log('[Periodic Background Worker] Sincronizzazione Shiny e Raid giornaliera completata con successo.');
        } catch (err) {
          console.error('[Periodic Background Worker] Impossibile eseguire la sincronizzazione automatica periodica:', err);
        }
      }, 24 * 60 * 60 * 1000); // 24 ore
    });

  } catch (err) {
    console.error('Errore fatale all\'avvio del server:', err);
    process.exit(1);
  }
}

startServer();
