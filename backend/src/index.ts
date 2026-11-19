import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getDb } from './db';
import { runSeeder } from './seed';
import { PokedexDTO, User } from './types';
import { signJwt, verifyJwt, verifyGoogleToken, requireAdmin, isLocalRequest, AuthenticatedRequest, hashPassword, verifyPassword } from './auth';

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
    
    // Inizializza cartelle per le traduzioni delle quest
    const translationsDir = path.join(__dirname, '../data/translations');
    const translationsFile = path.join(translationsDir, 'quests.json');
    if (!fs.existsSync(translationsDir)) {
      fs.mkdirSync(translationsDir, { recursive: true });
    }
    if (!fs.existsSync(translationsFile)) {
      fs.writeFileSync(translationsFile, '{}', 'utf-8');
    }

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

    // Helper per sanificare l'oggetto utente da inviare al client
    function sanitizeUser(user: any) {
      if (!user) return null;
      const sanitized = { ...user };
      sanitized.hasPassword = !!sanitized.passwordHash;
      delete sanitized.passwordHash;
      return sanitized;
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
        res.json(users.map(sanitizeUser));
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
          return res.json({ token, user: sanitizeUser(user) });
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
          return res.json({ token, user: sanitizeUser(updatedUser) });
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
          return res.json({ token, user: sanitizeUser(newUser) });
        }
      } catch (err) {
        log('ERROR', 'Errore durante l\'autenticazione Google', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // POST /api/auth/check-status - Verifica lo stato di un nome allenatore
    // =================================================================
    app.post('/api/auth/check-status', async (req, res) => {
      const { name } = req.body;
      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Il nome è richiesto' });
      }

      const trimmedName = name.trim();
      try {
        const user = await db.get('SELECT googleSubId, passwordHash FROM users WHERE name = ?', trimmedName);
        if (!user) {
          return res.json({ exists: false, hasPassword: false, hasGoogle: false });
        }
        return res.json({
          exists: true,
          hasPassword: !!user.passwordHash,
          hasGoogle: !!user.googleSubId
        });
      } catch (err) {
        log('ERROR', 'Errore nella verifica dello stato dell\'utente', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // POST /api/auth/login-password - Login con Nome Allenatore + Password
    // =================================================================
    app.post('/api/auth/login-password', async (req, res) => {
      const { name, password } = req.body;
      if (!name || name.trim() === '' || !password) {
        return res.status(400).json({ error: 'Nome e password sono richiesti' });
      }

      const trimmedName = name.trim();
      try {
        const user = await db.get('SELECT * FROM users WHERE name = ?', trimmedName);
        if (!user || !user.passwordHash) {
          return res.status(401).json({ error: 'Credenziali non valide o profilo non protetto da password' });
        }

        const isValid = verifyPassword(password, user.passwordHash);
        if (!isValid) {
          return res.status(401).json({ error: 'Password errata' });
        }

        const token = signJwt({ id: user.id, name: user.name, googleSubId: user.googleSubId, isAdmin: user.isAdmin });
        return res.json({ token, user: sanitizeUser(user) });
      } catch (err) {
        log('ERROR', 'Errore durante il login con password', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // POST /api/users/register-password - Registrazione nuovo allenatore con password
    // =================================================================
    app.post('/api/users/register-password', async (req, res) => {
      const { name, password } = req.body;
      if (!name || name.trim() === '' || !password || password.trim() === '') {
        return res.status(400).json({ error: 'Nome e password sono richiesti' });
      }

      const trimmedName = name.trim();
      try {
        const existingUser = await db.get('SELECT id FROM users WHERE name = ?', trimmedName);
        if (existingUser) {
          return res.status(400).json({ error: 'Questo nome allenatore è già registrato' });
        }

        const hash = hashPassword(password);
        const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${trimmedName}`;
        
        const result = await db.run(
          'INSERT INTO users (name, passwordHash, isProtected, avatarUrl, privacyMode) VALUES (?, ?, ?, ?, ?);',
          trimmedName,
          hash,
          1,
          avatarUrl,
          'public_edit'
        );

        const newUser = {
          id: result.lastID,
          name: trimmedName,
          email: null,
          googleId: null,
          avatarUrl,
          isProtected: 1,
          privacyMode: 'public_edit',
          isAdmin: 0
        };

        const token = signJwt({ id: newUser.id, name: newUser.name, isAdmin: 0 });
        log('INFO', `Nuovo profilo creato con Password`, { id: newUser.id, name: trimmedName });
        return res.json({ token, user: sanitizeUser(newUser) });
      } catch (err) {
        log('ERROR', 'Errore nella registrazione con password', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // POST /api/users/:id/password - Gestione password da Settings (Aggiungi/Modifica/Rimuovi)
    // =================================================================
    app.post('/api/users/:id/password', async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const { currentPassword, newPassword } = req.body;

      // Richiede autenticazione
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autenticazione richiesta' });
      }
      const token = authHeader.substring(7);
      const decoded = verifyJwt(token);
      if (!decoded || decoded.id !== id) {
        return res.status(403).json({ error: 'Non autorizzato a modificare le credenziali di questo profilo' });
      }

      try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', id);
        if (!user) {
          return res.status(404).json({ error: 'Utente non trovato' });
        }

        // Se l'utente ha già una password, deve fornire quella corrente prima di cambiarla o rimuoverla
        if (user.passwordHash) {
          if (!currentPassword) {
            return res.status(400).json({ error: 'La password corrente è richiesta' });
          }
          const isValid = verifyPassword(currentPassword, user.passwordHash);
          if (!isValid) {
            return res.status(401).json({ error: 'La password corrente non è corretta' });
          }
        }

        if (newPassword && newPassword.trim() !== '') {
          // Aggiunge o modifica la password
          const hash = hashPassword(newPassword);
          await db.run('UPDATE users SET passwordHash = ?, isProtected = 1 WHERE id = ?', hash, id);
          log('INFO', `Password aggiornata per l'utente`, { id });
          const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', id);
          return res.json({ success: true, message: 'Password impostata con successo', user: sanitizeUser(updatedUser) });
        } else {
          // Rimuove la password (l'account torna libero, tranne se ha Google associato)
          const newIsProtected = user.googleSubId ? 1 : 0;
          await db.run('UPDATE users SET passwordHash = NULL, isProtected = ? WHERE id = ?', newIsProtected, id);
          log('INFO', `Password rimossa per l'utente`, { id });
          const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', id);
          return res.json({ success: true, message: 'Password rimossa con successo', user: sanitizeUser(updatedUser) });
        }
      } catch (err) {
        log('ERROR', 'Errore nella gestione della password in settings', err);
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
        res.json({ success: true, token, user: sanitizeUser(updatedUser) });
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
          return res.status(400).json({ error: 'Proteggi prima il tuo profilo con una password o collegando un account Google per cambiarne la privacy' });
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
          return res.json(sanitizeUser(existingUser));
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
        res.json(sanitizeUser(newUser));
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
        const lang = (req.query.lang as string) || 'it';
        const quests = await db.all('SELECT * FROM quests ORDER BY displayOrder ASC');
        
        // Carica il dizionario delle traduzioni
        const translationsFile = path.join(__dirname, '../data/translations/quests.json');
        let translationDict: Record<string, Record<string, string>> = {};
        try {
          if (fs.existsSync(translationsFile)) {
            translationDict = JSON.parse(fs.readFileSync(translationsFile, 'utf-8'));
          }
        } catch (e) {
          console.error('Errore nel caricamento del dizionario di traduzione delle quest:', e);
        }

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

          // Traduzione dinamica
          let displayName = q.name;
          if (lang !== 'en') {
            const questTranslations = translationDict[q.name];
            if (questTranslations && questTranslations[lang]) {
              displayName = questTranslations[lang];
            }
          }

          return {
            id: q.id,
            name: displayName,
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

        // Recupera il conteggio dei Pokémon per invalidare la cache se il catalogo cambia
        const pkCountRow = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM pokemons');
        const pkCount = pkCountRow?.count || 0;

        // Genera l'ETag dinamico per il Pokédex di questo utente
        const etag = `W/"user_${parsedUserId}_${lastUpdated}_${pkCount}"`;

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

    async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<globalThis.Response> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          ...options,
          headers: {
            'User-Agent': 'PoGODex-Backend/1.0 (+https://github.com/PoGODex)',
            ...(options.headers || {})
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
    }

    function decodeHtmlEntities(str: string): string {
      return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&rsquo;/g, '’')
        .replace(/&lsquo;/g, '‘')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .trim();
    }

    async function performReleasedPokemonAutoSync(): Promise<{
      unreleasedCapable: string[];
      newlyReleased: string[];
      newlyAddedPokemon: string[];
      source: string;
    }> {
      console.log('[Auto-Sync-Released] Avvio sincronizzazione Pokémon rilasciati e specie mancanti...');
      const db = await getDb();

      let unreleasedDexIds: Set<number> | null = null;
      let knownReleasedDexIds = new Set<number>();
      const unreleasedSubForms = new Set<string>();
      let source = '';

      // 1. Fonte primaria: Bulbapedia MediaWiki API (List_of_Pokémon_by_availability_in_Pokémon_GO)
      try {
        const bulbaUrl = 'https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=List_of_Pok%C3%A9mon_by_availability_in_Pok%C3%A9mon_GO&prop=wikitext&format=json';
        const response = await fetchWithTimeout(bulbaUrl, {}, 25000);
        if (!response.ok) {
          throw new Error(`Bulbapedia returned status ${response.status}`);
        }
        const json = await response.json() as any;
        const wikitext: string = json?.parse?.wikitext?.['*'] || '';
        const unrelStart = wikitext.indexOf('===Unreleased Pokémon===');
        if (unrelStart === -1) {
          throw new Error('Sezione ===Unreleased Pokémon=== non trovata su Bulbapedia');
        }
        const nextHeadingIdx = wikitext.indexOf('\n===', unrelStart + 10);
        const unrelSection = nextHeadingIdx !== -1 ? wikitext.slice(unrelStart, nextHeadingIdx) : wikitext.slice(unrelStart);

        // Estrae le tabelle wiki {| ... |} dalla sezione Unreleased
        const tables = unrelSection.match(/\{\|[\s\S]*?\|\}/g) || [];
        const speciesTable = tables[0];
        if (!speciesTable) {
          throw new Error('Nessuna tabella trovata nella sezione Unreleased di Bulbapedia');
        }

        // Tabella 1: specie interamente non ancora rilasciate
        const parsedUnreleased = new Set<number>();
        const templateRegex = /\{\{(?:MSP\/GO|MS)\|0*(\d+)[A-Za-z]*\|/g;
        let match;
        while ((match = templateRegex.exec(speciesTable)) !== null) {
          const dexId = parseInt(match[1], 10);
          if (!isNaN(dexId) && dexId > 0) {
            parsedUnreleased.add(dexId);
          }
        }

        if (parsedUnreleased.size < 5 || parsedUnreleased.size > 500) {
          throw new Error(`Conteggio specie non rilasciate anomalo da Bulbapedia: ${parsedUnreleased.size}`);
        }

        unreleasedDexIds = parsedUnreleased;
        source = 'Bulbapedia';

        // Tabella 2 (se presente): forme specifiche non ancora rilasciate (es. Vivillon Fancy / Pokeball)
        const formsTable = tables[1];
        if (formsTable) {
          if (/0666Fan\b/i.test(formsTable)) {
            unreleasedSubForms.add('Vivillon (Fancy)');
          }
          if (/0666Pok\b/i.test(formsTable)) {
            unreleasedSubForms.add('Vivillon (Pokeball)');
          }
        }

        // Raccogli anche eventuali Dex ID rilasciati dalla sezione cronologica (per auto-inserimento specie future > 1025)
        const releasedSection = wikitext.slice(0, unrelStart);
        const relRegex = /\{\{(?:MSP\/GO|MS)\|0*(\d+)[A-Za-z]*\|/g;
        while ((match = relRegex.exec(releasedSection)) !== null) {
          const dexId = parseInt(match[1], 10);
          if (!isNaN(dexId) && dexId > 0 && !parsedUnreleased.has(dexId)) {
            knownReleasedDexIds.add(dexId);
          }
        }

        console.log(`[Auto-Sync-Released] Bulbapedia elaborato: ${parsedUnreleased.size} specie non rilasciate, ${unreleasedSubForms.size} forme speciali non rilasciate.`);
      } catch (bulbaErr) {
        console.warn('[Auto-Sync-Released] Bulbapedia non disponibile o errore parsing, passo al fallback Fandom:', bulbaErr);
      }

      // 2. Fallback automatico: Pokémon GO Fandom Wiki MediaWiki API (List_of_Pokémon)
      if (!unreleasedDexIds) {
        const fandomUrl = 'https://pokemongo.fandom.com/api.php?action=parse&page=List_of_Pok%C3%A9mon&prop=wikitext&format=json';
        const response = await fetchWithTimeout(fandomUrl, {}, 25000);
        if (!response.ok) {
          throw new Error(`Fandom Wiki returned status ${response.status}`);
        }
        const json = await response.json() as any;
        const wikitext: string = json?.parse?.wikitext?.['*'] || '';

        const parsedUnreleased = new Set<number>();
        const parsedReleased = new Set<number>();
        const pRegex = /\{\{P\|([^}]+)\}\}/g;
        let match;
        while ((match = pRegex.exec(wikitext)) !== null) {
          const parts = match[1].split('|');
          const dexId = parseInt(parts[1], 10);
          if (isNaN(dexId) || dexId <= 0) continue;
          if (parts.some(p => p.startsWith('mega=') || p.startsWith('gmax=') || p.startsWith('form='))) continue;
          const isUnavailable = parts.some(p => p.trim() === 'a=n' || p.trim() === 'available=no');
          if (isUnavailable) {
            parsedUnreleased.add(dexId);
          } else {
            parsedReleased.add(dexId);
          }
        }

        if (parsedReleased.size < 800) {
          throw new Error(`Dati Fandom Wiki incompleti: solo ${parsedReleased.size} specie rilasciate rilevate.`);
        }

        unreleasedDexIds = parsedUnreleased;
        knownReleasedDexIds = parsedReleased;
        source = 'Fandom Wiki';

        // Preserva eventuali forme speciali non rilasciate (es. Vivillon) già presenti in config quando si usa il fallback
        try {
          const prevRow = await db.get<{ value: string }>('SELECT value FROM app_config WHERE key = ?', 'UNRELEASED_SPECIES');
          if (prevRow?.value) {
            const prevList = JSON.parse(prevRow.value) as string[];
            for (const item of prevList) {
              if (item === 'Vivillon (Fancy)' || item === 'Vivillon (Pokeball)') {
                unreleasedSubForms.add(item);
              }
            }
          }
        } catch (_) {}

        console.log(`[Auto-Sync-Released] Fandom Wiki elaborato: ${parsedReleased.size} rilasciati, ${parsedUnreleased.size} non rilasciati.`);
      }

      // 3. Auto-inserimento specie mancanti nel database `pokemons` + backfill statistiche base
      const existingBaseRows = await db.all<{ id: number; name: string; attack: number | null }[]>(
        'SELECT id, name, attack FROM pokemons WHERE parentId IS NULL ORDER BY id ASC'
      );
      const existingById = new Map<number, { id: number; name: string; attack: number | null }>();
      for (const row of existingBaseRows) {
        existingById.set(row.id, row);
      }

      const newlyAddedPokemon: string[] = [];
      let pgoApiByDex = new Map<number, any>();

      try {
        const pgoResp = await fetchWithTimeout('https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json', {}, 25000);
        if (pgoResp.ok) {
          const pgoList = await pgoResp.json() as any[];
          for (const entry of pgoList) {
            if (entry && typeof entry.dexNr === 'number' && !pgoApiByDex.has(entry.dexNr)) {
              pgoApiByDex.set(entry.dexNr, entry);
            }
          }

          // Inserisci eventuali nuove specie presenti in pokemon-go-api ma assenti dal DB locale
          const missingFromDb: any[] = [];
          for (const [dexNr, entry] of pgoApiByDex.entries()) {
            if (!existingById.has(dexNr)) {
              missingFromDb.push(entry);
            }
          }

          if (missingFromDb.length > 0) {
            const insertStmt = await db.prepare(`
              INSERT OR IGNORE INTO pokemons (id, name, type1, type2, generation, spriteUrl, parentId, attack, defense, stamina)
              VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
            `);
            for (const entry of missingFromDb) {
              const dexNr = entry.dexNr;
              const name = entry.names?.English || `Pokemon #${dexNr}`;
              const type1 = entry.primaryType?.names?.English || 'Normal';
              const type2 = entry.secondaryType?.names?.English || null;
              const generation = typeof entry.generation === 'number' ? entry.generation : (dexNr > 1025 ? 10 : 9);
              const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNr}.png`;
              const attack = entry.stats?.attack ?? null;
              const defense = entry.stats?.defense ?? null;
              const stamina = entry.stats?.stamina ?? null;

              await insertStmt.run(dexNr, name, type1, type2, generation, spriteUrl, attack, defense, stamina);
              existingById.set(dexNr, { id: dexNr, name, attack });
              newlyAddedPokemon.push(`#${dexNr} ${name}`);
            }
            await insertStmt.finalize();
            console.log(`[Auto-Sync-Released] Inserite ${newlyAddedPokemon.length} nuove specie nel catalogo DB: ${newlyAddedPokemon.join(', ')}`);
          }

          // Backfill statistiche base mancanti (attack/defense/stamina) per Pokémon esistenti
          const rowsMissingStats = existingBaseRows.filter(r => r.attack === null);
          if (rowsMissingStats.length > 0) {
            const updateStatsStmt = await db.prepare('UPDATE pokemons SET attack = ?, defense = ?, stamina = ? WHERE id = ?');
            let updatedStatsCount = 0;
            for (const row of rowsMissingStats) {
              const entry = pgoApiByDex.get(row.id);
              if (entry?.stats?.attack != null && entry?.stats?.defense != null && entry?.stats?.stamina != null) {
                await updateStatsStmt.run(entry.stats.attack, entry.stats.defense, entry.stats.stamina, row.id);
                updatedStatsCount++;
              }
            }
            await updateStatsStmt.finalize();
            if (updatedStatsCount > 0) {
              console.log(`[Auto-Sync-Released] Aggiornate statistiche base mancanti per ${updatedStatsCount} Pokémon.`);
            }
          }
        }
      } catch (pgoErr) {
        console.warn('[Auto-Sync-Released] Impossibile contattare pokemon-go-api per il check specie mancanti (continuo comunque):', pgoErr);
      }

      // Controlla se Bulbapedia/Fandom segnala nuovi Dex ID rilasciati ancora assenti nel DB e in pokemon-go-api -> fallback PokeAPI
      const stillMissingReleased = Array.from(knownReleasedDexIds).filter(dexId => !existingById.has(dexId));
      for (const dexId of stillMissingReleased.slice(0, 20)) {
        try {
          const pokeResp = await fetchWithTimeout(`https://pokeapi.co/api/v2/pokemon/${dexId}`, {}, 10000);
          if (!pokeResp.ok) continue;
          const pokeData = await pokeResp.json() as any;
          const rawName: string = pokeData.name || `pokemon-${dexId}`;
          const name = rawName
            .split('-')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          const type1 = pokeData.types?.[0]?.type?.name ? capitalize(pokeData.types[0].type.name) : 'Normal';
          const type2 = pokeData.types?.[1]?.type?.name ? capitalize(pokeData.types[1].type.name) : null;
          const generation = dexId > 1025 ? 10 : 9;
          const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexId}.png`;

          await db.run(
            `INSERT OR IGNORE INTO pokemons (id, name, type1, type2, generation, spriteUrl, parentId)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`,
            dexId, name, type1, type2, generation, spriteUrl
          );
          existingById.set(dexId, { id: dexId, name, attack: null });
          newlyAddedPokemon.push(`#${dexId} ${name}`);
        } catch (pokeErr) {
          console.warn(`[Auto-Sync-Released] Impossibile recuperare da PokeAPI la specie mancante #${dexId}:`, pokeErr);
        }
      }

      // 4. Costruisci la nuova lista UNRELEASED_SPECIES mappando per ID numerico (zero errori di spelling)
      const unreleasedSet = new Set<string>();
      for (const dexId of unreleasedDexIds) {
        const dbPokemon = existingById.get(dexId);
        if (dbPokemon) {
          unreleasedSet.add(dbPokemon.name);
        }
      }
      for (const subForm of unreleasedSubForms) {
        unreleasedSet.add(subForm);
      }

      const unreleasedCapable = Array.from(unreleasedSet).sort();

      // Calcola quali Pokémon sono diventati rilasciati rispetto alla configurazione precedente
      let previousUnreleased: string[] = [];
      try {
        const prevRow = await db.get<{ value: string }>('SELECT value FROM app_config WHERE key = ?', 'UNRELEASED_SPECIES');
        if (prevRow?.value) {
          previousUnreleased = JSON.parse(prevRow.value) as string[];
        }
      } catch (_) {}

      const newlyReleased = previousUnreleased.filter(name => !unreleasedSet.has(name));

      await db.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)',
        'UNRELEASED_SPECIES',
        JSON.stringify(unreleasedCapable)
      );

      console.log(
        `[Auto-Sync-Released] Pokémon rilasciati sincronizzati da ${source}. Non rilasciati: ${unreleasedCapable.length}. ` +
        `Appena sbloccati: ${newlyReleased.length}${newlyReleased.length > 0 ? ' (' + newlyReleased.join(', ') + ')' : ''}. ` +
        `Nuove specie inserite: ${newlyAddedPokemon.length}.`
      );

      return { unreleasedCapable, newlyReleased, newlyAddedPokemon, source };
    }

    async function performShinyAutoSync(): Promise<string[]> {
      console.log('[Auto-Sync-Shiny] Avvio sincronizzazione Shiny automatica...');
      const db = await getDb();

      let releasedShinyIds: Set<number> | null = null;
      let source = '';

      // 1. Fonte primaria: Bulbapedia MediaWiki API (List_of_Shiny_Pokémon_in_Pokémon_GO)
      try {
        const bulbaShinyUrl = 'https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=List_of_Shiny_Pok%C3%A9mon_in_Pok%C3%A9mon_GO&prop=wikitext&format=json';
        const response = await fetchWithTimeout(bulbaShinyUrl, {}, 25000);
        if (!response.ok) {
          throw new Error(`Bulbapedia Shiny returned status ${response.status}`);
        }
        const json = await response.json() as any;
        const rawWikitext: string = json?.parse?.wikitext?.['*'] || '';
        // Rimuove i commenti HTML (su Bulbapedia gli shiny non ancora rilasciati sono commentati con <!-- ... -->)
        const cleanWikitext = rawWikitext.replace(/<!--[\s\S]*?-->/g, '');

        const parsedIds = new Set<number>();
        let match;
        const lopRegex = /\{\{lop\/shiny\/GO\|0*(\d+)\|/g;
        while ((match = lopRegex.exec(cleanWikitext)) !== null) {
          const id = parseInt(match[1], 10);
          if (!isNaN(id) && id > 0) parsedIds.add(id);
        }
        const mspRegex = /\{\{MSP\/GO\|[^}]*\|0*(\d+)[^|]*\s+s\|/g;
        while ((match = mspRegex.exec(cleanWikitext)) !== null) {
          const id = parseInt(match[1], 10);
          if (!isNaN(id) && id > 0) parsedIds.add(id);
        }

        if (parsedIds.size < 500) {
          throw new Error(`Conteggio shiny anomalo da Bulbapedia: ${parsedIds.size}`);
        }

        releasedShinyIds = parsedIds;
        source = 'Bulbapedia';
      } catch (bulbaErr) {
        console.warn('[Auto-Sync-Shiny] Bulbapedia non disponibile, passo al fallback PoGoAPI:', bulbaErr);
      }

      // 2. Fallback automatico: PoGoAPI (pogoapi.net)
      if (!releasedShinyIds) {
        const response = await fetchWithTimeout('https://pogoapi.net/api/v1/shiny_pokemon.json', {}, 20000);
        if (!response.ok) {
          throw new Error(`PoGoAPI returned status ${response.status}`);
        }
        const shinyData = (await response.json()) as Record<string, { id?: number; name: string; [key: string]: any }>;
        const parsedIds = new Set<number>();
        for (const [key, val] of Object.entries(shinyData)) {
          const id = typeof val?.id === 'number' ? val.id : parseInt(key, 10);
          if (!isNaN(id) && id > 0) parsedIds.add(id);
        }
        if (parsedIds.size < 500) {
          throw new Error(`Conteggio shiny anomalo da PoGoAPI: ${parsedIds.size}`);
        }
        releasedShinyIds = parsedIds;
        source = 'PoGoAPI';
      }

      // Legge tutte le specie base direttamente dal DB (include eventuali nuove specie auto-inserite)
      const basePokemons = await db.all<{ id: number; name: string }[]>(
        'SELECT id, name FROM pokemons WHERE parentId IS NULL ORDER BY id ASC'
      );

      const shinyUnreleasedSet = new Set<string>();
      for (const p of basePokemons) {
        if (!releasedShinyIds.has(p.id)) {
          shinyUnreleasedSet.add(p.name);
        }
      }

      const shinyUnreleasedCapable = Array.from(shinyUnreleasedSet).sort();

      await db.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)',
        'SHINY_UNRELEASED_SPECIES',
        JSON.stringify(shinyUnreleasedCapable)
      );

      console.log(`[Auto-Sync-Shiny] Shiny cromatici sincronizzati da ${source} (${releasedShinyIds.size} rilasciati, ${shinyUnreleasedCapable.length} non ancora rilasciati).`);
      return shinyUnreleasedCapable;
    }

    async function performRaidAutoSync(): Promise<void> {
      console.log('[Auto-Sync-Raids] Avvio sincronizzazione Raid automatica. Contatto pokemon-go-api...');
      const response = await fetchWithTimeout('https://pokemon-go-api.github.io/pokemon-go-api/api/raidboss.json', {}, 20000);
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

    async function performEggAutoSync(): Promise<void> {
      console.log('[Auto-Sync-Eggs] Avvio sincronizzazione Uova automatica. Contatto leekduck.com...');
      const response = await fetchWithTimeout('https://leekduck.com/eggs/', {}, 20000);
      if (!response.ok) {
        throw new Error(`Leek Duck returned status ${response.status}`);
      }
      const html = await response.text();

      function normalizeEggPokemonName(name: string): string {
        name = name.trim();
        if (name.startsWith('Galarian ')) {
          return name.replace('Galarian ', '') + ' (Galarian)';
        }
        if (name.startsWith('Alolan ')) {
          return name.replace('Alolan ', '') + ' (Alolan)';
        }
        if (name.startsWith('Hisuian ')) {
          return name.replace('Hisuian ', '') + ' (Hisuian)';
        }
        if (name.startsWith('Paldean ')) {
          return name.replace('Paldean ', '') + ' (Paldean)';
        }
        if (name.includes('Origin Forme') || name.includes('Origin Form')) {
          return name.replace(' Origin Forme', '').replace(' Origin Form', '') + ' (Origin)';
        }
        
        // Forme speciali che non hanno voci separate nel DB
        if (name.startsWith('Indeedee ')) {
          return 'Indeedee';
        }
        if (name.startsWith('Basculin ')) {
          return 'Basculin';
        }
        return name;
      }

      const cpMultiplier2 = 0.35688677; // Level 20 CPM squared

      function calculateCp(baseAtk: number, baseDef: number, baseSta: number, ivAtk: number, ivDef: number, ivSta: number): number {
        const atk = baseAtk + ivAtk;
        const def = baseDef + ivDef;
        const sta = baseSta + ivSta;
        return Math.floor((atk * Math.sqrt(def) * Math.sqrt(sta) * cpMultiplier2) / 10);
      }

      const db = await getDb();
      // Carica i Pokemon dal DB per fare mapping e calcolare CP
      const pokemonsList = await db.all<{ id: number; name: string; attack: number; defense: number; stamina: number }[]>(
        'SELECT id, name, attack, defense, stamina FROM pokemons;'
      );
      const pokemonMap = new Map<string, { id: number; name: string; attack: number; defense: number; stamina: number }>();
      for (const p of pokemonsList) {
        pokemonMap.set(p.name.toLowerCase().trim(), p);
      }

      const parts = html.split(/<h2[^>]*>/);
      const eggPools: Record<string, Set<string>> = {};

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const headingMatch = part.match(/^([\s\S]*?)<\/h2>/);
        if (!headingMatch) continue;
        const heading = headingMatch[1].trim();

        let distanceType: string | null = null;
        if (heading.includes('12 km')) distanceType = '12km';
        else if (heading.includes('2 km')) distanceType = '2km';
        else if (heading.includes('5 km')) distanceType = '5km';
        else if (heading.includes('7 km')) distanceType = '7km';
        else if (heading.includes('10 km')) distanceType = '10km';

        if (!distanceType) {
          continue;
        }

        if (!eggPools[distanceType]) {
          eggPools[distanceType] = new Set<string>();
        }

        const cardRegex = /<li class="pokemon-card[^>]*>([\s\S]*?)<\/li>/g;
        let cardMatch;
        while ((cardMatch = cardRegex.exec(part)) !== null) {
          const cardHtml = cardMatch[1];
          const nameMatch = cardHtml.match(/<span class="name">([^<]+)<\/span>/);
          if (!nameMatch) continue;
          const originalName = nameMatch[1].trim();
          const normalizedName = normalizeEggPokemonName(originalName);

          const p = pokemonMap.get(normalizedName.toLowerCase().trim());
          if (p) {
            if (p.attack === null || p.defense === null || p.stamina === null) {
              console.warn(`[Auto-Sync-Eggs] Pokemon "${p.name}" ha statistiche incomplete nel database. Salto.`);
              continue;
            }

            const minCp = calculateCp(p.attack, p.defense, p.stamina, 10, 10, 10);
            const maxCp = calculateCp(p.attack, p.defense, p.stamina, 15, 15, 15);

            eggPools[distanceType].add(JSON.stringify({
              pokemonId: p.id,
              minCp,
              maxCp
            }));
          } else {
            console.warn(`[Auto-Sync-Eggs] Impossibile mappare "${originalName}" (normalizzato: "${normalizedName}") a un pokemonId.`);
          }
        }
      }

      // Prepara i record per le 5 categorie principali di uova
      const targetEggs = [
        { name: 'Uovo da 2 km', type: '2km' },
        { name: 'Uovo da 5 km', type: '5km' },
        { name: 'Uovo da 7 km', type: '7km' },
        { name: 'Uovo da 10 km', type: '10km' },
        { name: 'Uovo da 12 km', type: '12km' }
      ];

      await db.run('BEGIN TRANSACTION;');
      try {
        const stmt = await db.prepare(
          'INSERT OR REPLACE INTO eggs (id, name, type, contents) VALUES (?, ?, ?, ?);'
        );

        // Per ciascuna delle 5 categorie principali di uova
        for (let idx = 0; idx < targetEggs.length; idx++) {
          const egg = targetEggs[idx];
          const id = idx + 1;
          const set = eggPools[egg.type] || new Set<string>();
          const contentsList = Array.from(set).map(s => JSON.parse(s));

          // Ordina le schiuse per pokemonId per consistenza
          contentsList.sort((a, b) => a.pokemonId - b.pokemonId);

          await stmt.run(id, egg.name, egg.type, JSON.stringify(contentsList));
        }

        await stmt.finalize();
        await db.run('COMMIT;');
        console.log(`[Auto-Sync-Eggs] Uova auto-sincronizzate con successo. Aggiornate ${targetEggs.length} categorie.`);
      } catch (err) {
        await db.run('ROLLBACK;');
        throw err;
      }
    }

    function translateQuestLocalItalian(name: string): string {
      let t = name.trim();
      const typeMap: Record<string, string> = {
        'normal': 'Normale', 'fire': 'Fuoco', 'water': 'Acqua', 'grass': 'Erba',
        'electric': 'Elettro', 'ice': 'Ghiaccio', 'fighting': 'Lotta', 'poison': 'Veleno',
        'ground': 'Terra', 'flying': 'Volante', 'psychic': 'Psico', 'bug': 'Coleottero',
        'rock': 'Roccia', 'ghost': 'Spettro', 'dragon': 'Drago', 'dark': 'Buio',
        'steel': 'Acciaio', 'fairy': 'Folletto'
      };
      const berryMap: Record<string, string> = {
        'golden razz': 'bacche Lampon dorata',
        'silver pinap': 'bacche Baccanana d\'argento',
        'razz': 'bacche Lampon',
        'pinap': 'bacche Baccanana',
        'nanab': 'bacche Bananan'
      };

      // 1. Catch tasks
      if (/^Catch (\d+)\s+([a-zA-Z]+)-type Pokémon$/i.test(t)) {
        t = t.replace(/^Catch (\d+)\s+([a-zA-Z]+)-type Pokémon$/i, (match, p1, p2) => {
          const typeIt = typeMap[p2.toLowerCase()] || p2;
          return `Cattura ${p1} Pokémon di tipo ${typeIt}`;
        });
      }
      else if (/^Catch (\d+)\s+Pokémon$/i.test(t)) {
        t = t.replace(/^Catch (\d+)\s+Pokémon$/i, 'Cattura $1 Pokémon');
      }
      else if (/^Catch (\d+)\s+different species of Pokémon$/i.test(t)) {
        t = t.replace(/^Catch (\d+)\s+different species of Pokémon$/i, 'Cattura $1 specie diverse di Pokémon');
      }
      else if (/^Catch a ([a-zA-Z]+)-type Pokémon$/i.test(t)) {
        t = t.replace(/^Catch a ([a-zA-Z]+)-type Pokémon$/i, (match, p1) => {
          const typeIt = typeMap[p1.toLowerCase()] || p1;
          return `Cattura un Pokémon di tipo ${typeIt}`;
        });
      }

      // 2. Throws
      if (/^Make (\d+)\s+(Nice|Great|Excellent)\s+(Curveball\s+)?Throws(\s+in\s+a\s+row)?$/i.test(t)) {
        t = t.replace(/^Make (\d+)\s+(Nice|Great|Excellent)\s+(Curveball\s+)?Throws(\s+in\s+a\s+row)?$/i, (match, num, quality, curve, row) => {
          let qualIt = 'buoni';
          if (quality.toLowerCase() === 'great') qualIt = 'ottimi';
          if (quality.toLowerCase() === 'excellent') qualIt = 'eccellenti';
          const curveIt = curve ? ' con effetto' : '';
          const rowIt = row ? ' di fila' : '';
          return `Effettua ${num} lanci ${qualIt}${curveIt}${rowIt}`;
        });
      }
      else if (/^Make (\d+)\s+Curveball\s+Throws$/i.test(t)) {
        t = t.replace(/^Make (\d+)\s+Curveball\s+Throws$/i, 'Effettua $1 lanci con effetto');
      }
      else if (/^Make (\d+)\s+Curveball\s+Throws\s+in\s+a\s+row$/i.test(t)) {
        t = t.replace(/^Make (\d+)\s+Curveball\s+Throws\s+in\s+a\s+row$/i, 'Effettua $1 lanci con effetto di fila');
      }

      // 3. Evolve
      if (/^Evolve (\d+)\s+Pokémon$/i.test(t)) {
        t = t.replace(/^Evolve (\d+)\s+Pokémon$/i, 'Fai evolvere $1 Pokémon');
      }
      else if (/^Evolve a Pokémon$/i.test(t)) {
        t = 'Fai evolvere un Pokémon';
      }
      else if (/^Evolve (\d+)\s+([a-zA-Z]+)-type Pokémon$/i.test(t)) {
        t = t.replace(/^Evolve (\d+)\s+([a-zA-Z]+)-type Pokémon$/i, (match, p1, p2) => {
          const typeIt = typeMap[p2.toLowerCase()] || p2;
          return `Fai evolvere ${p1} Pokémon di tipo ${typeIt}`;
        });
      }

      // 4. Power up
      if (/^Power up Pokémon (\d+)\s+times$/i.test(t)) {
        t = t.replace(/^Power up Pokémon (\d+)\s+times$/i, 'Potenzia i tuoi Pokémon $1 volte');
      }
      else if (/^Power up a Pokémon (\d+)\s+times$/i.test(t)) {
        t = t.replace(/^Power up a Pokémon (\d+)\s+times$/i, 'Potenzia un Pokémon $1 volte');
      }

      // 5. Spin PokéStops
      if (/^Spin (\d+)\s+PokéStops?\s+or\s+Gyms$/i.test(t)) {
        t = t.replace(/^Spin (\d+)\s+PokéStops?\s+or\s+Gyms$/i, 'Gira $1 Pokéstop o Palestre');
      }
      else if (/^Spin (\d+)\s+PokéStops?$/i.test(t)) {
        t = t.replace(/^Spin (\d+)\s+PokéStops?$/i, 'Gira $1 Pokéstop');
      }

      // 6. Hatch
      if (/^Hatch (\d+)\s+Eggs?$/i.test(t)) {
        t = t.replace(/^Hatch (\d+)\s+Eggs?$/i, (match, p1) => {
          const num = parseInt(p1, 10);
          return num === 1 ? 'Fai schiudere 1 uovo' : `Fai schiudere ${num} uova`;
        });
      }
      else if (/^Hatch an Egg$/i.test(t)) {
        t = 'Fai schiudere un uovo';
      }

      // 7. Snapshots
      if (/^Take a snapshot of a wild Pokémon$/i.test(t)) {
        t = 'Scatta una foto a un Pokémon selvatico';
      }
      else if (/^Take (\d+)\s+snapshots\s+of\s+wild\s+Pokémon$/i.test(t)) {
        t = t.replace(/^Take (\d+)\s+snapshots\s+of\s+wild\s+Pokémon$/i, 'Scatta $1 foto a Pokémon selvatici');
      }

      // 8. Berries
      if (/^Use (\d+)\s+Berries\s+to\s+help\s+catch\s+Pokémon$/i.test(t)) {
        t = t.replace(/^Use (\d+)\s+Berries\s+to\s+help\s+catch\s+Pokémon$/i, 'Usa $1 bacche per catturare Pokémon');
      }
      else if (/^Use (\d+)\s+([a-zA-Z\s]+)\s+Berries\s+to\s+help\s+catch\s+Pokémon$/i.test(t)) {
        t = t.replace(/^Use (\d+)\s+([a-zA-Z\s]+)\s+Berries\s+to\s+help\s+catch\s+Pokémon$/i, (match, p1, p2) => {
          const berryKey = p2.toLowerCase().replace(/\s+berry$/i, '').trim();
          const berryIt = berryMap[berryKey] || `bacche ${p2}`;
          return `Usa ${p1} ${berryIt} per catturare Pokémon`;
        });
      }

      // 9. Gifts
      if (/^Send (\d+)\s+Gifts\s+to\s+friends$/i.test(t)) {
        t = t.replace(/^Send (\d+)\s+Gifts\s+to\s+friends$/i, 'Invia $1 pacchi amicizia agli amici');
      }
      else if (/^Open (\d+)\s+Gifts$/i.test(t)) {
        t = t.replace(/^Open (\d+)\s+Gifts$/i, 'Apri $1 pacchi amicizia');
      }

      // 10. Buddy
      if (/^Earn (\d+)\s+Candies?\s+walking\s+with\s+your\s+buddy$/i.test(t)) {
        t = t.replace(/^Earn (\d+)\s+Candies?\s+walking\s+with\s+your\s+buddy$/i, 'Guadagna $1 caramelle camminando con il tuo compagno');
      }

      // 11. Walk / Explore
      if (/^(?:Walk|Explore) (\d+(?:\.\d+)?)\s*km$/i.test(t)) {
        t = t.replace(/^(?:Walk|Explore) (\d+(?:\.\d+)?)\s*km$/i, 'Esplora $1 km');
      }

      // 12. Raids & Max Battles
      if (/^Win a Level (\d+)\s+or\s+higher\s+Raid$/i.test(t)) {
        t = t.replace(/^Win a Level (\d+)\s+or\s+higher\s+Raid$/i, 'Vinci un raid di livello $1 o superiore');
      }
      else if (/^Win a three-star raid\s+or\s+higher$/i.test(t)) {
        t = 'Vinci un raid di livello 3 o superiore';
      }
      else if (/^Win (\d+)\s+Raids$/i.test(t)) {
        t = t.replace(/^Win (\d+)\s+Raids$/i, 'Vinci $1 raid');
      }
      else if (/^Win a Raid$/i.test(t)) {
        t = 'Vinci un raid';
      }
      else if (/^Win a Max Battle$/i.test(t)) {
        t = 'Vinci una Lotta Dynamax';
      }
      else if (/^Win (\d+)\s+Max Battles$/i.test(t)) {
        t = t.replace(/^Win (\d+)\s+Max Battles$/i, 'Vinci $1 Lotte Dynamax');
      }

      // 13. Team Rocket
      if (/^Defeat a Team GO Rocket Member$/i.test(t)) {
        t = 'Sconfiggi un membro del Team GO Rocket';
      }
      else if (/^Defeat (\d+)\s+Team\s+GO\s+Rocket\s+Grunts$/i.test(t)) {
        t = t.replace(/^Defeat (\d+)\s+Team\s+GO\s+Rocket\s+Grunts$/i, 'Sconfiggi $1 reclute del Team GO Rocket');
      }

      // 14. Purify
      if (/^Purify (\d+)\s+Shadow\s+Pokémon$/i.test(t)) {
        t = t.replace(/^Purify (\d+)\s+Shadow\s+Pokémon$/i, 'Purifica $1 Pokémon Ombra');
      }

      // 15. Trade
      if (/^Trade a Pokémon$/i.test(t)) {
        t = 'Scambia un Pokémon';
      }

      // 16. GO Battle League
      if (/^Battle in the GO Battle League$/i.test(t)) {
        t = 'Sfida un altro Allenatore nella Lega Lotte GO';
      }
      else if (/^Win in the GO Battle League$/i.test(t)) {
        t = 'Vinci nella Lega Lotte GO';
      }

      return t;
    }

    function translateQuestsLocalFallback(questNames: string[]): Record<string, Record<string, string>> {
      const result: Record<string, Record<string, string>> = {};
      for (const name of questNames) {
        result[name] = {
          it: translateQuestLocalItalian(name),
          de: name,
          ja: name
        };
      }
      return result;
    }

    async function translateNewQuestsChunk(chunk: string[], apiKey: string): Promise<Record<string, Record<string, string>>> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
      const prompt = `Translate the following Pokémon GO field research quests from English into Italian ('it'), German ('de'), and Japanese ('ja').
Keep the same variables (e.g. numbers, Pokemon names). Use official Pokémon GO localization terms (e.g., throws like Nice/Great/Excellent, items like Pinap/Razz/Nanab Berries, types, and actions).
Return only a JSON object where the keys are the exact input English quest strings, and the values are objects containing the translations for 'it', 'de', and 'ja'.

Input list:
${JSON.stringify(chunk)}`;

      let lastError: any = null;
      let delay = 1500;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: prompt
                }]
              }],
              generationConfig: {
                responseMimeType: 'application/json'
              }
            })
          }, 10000);

          if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) {
            const fatalErr: any = new Error(`Gemini API non-retryable status ${response.status}: ${response.statusText}`);
            fatalErr.fatal = true;
            throw fatalErr;
          }

          if (response.status === 429 || response.status === 503) {
            console.warn(`[Quest-Translation] Attempt ${attempt} failed with status ${response.status}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }

          if (!response.ok) {
            throw new Error(`Gemini API returned status ${response.status}: ${response.statusText}`);
          }

          const data: any = await response.json();
          const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!textResponse) {
            throw new Error('Risposta vuota o non valida da parte dell\'API di Gemini');
          }

          const parsed = JSON.parse(textResponse.trim());
          let valid = true;
          for (const q of chunk) {
            if (!parsed[q] || !parsed[q].it || !parsed[q].de || !parsed[q].ja) {
              console.warn(`[Quest-Translation] Traduzione mancante o non valida per "${q}" nella risposta.`);
              valid = false;
              break;
            }
          }

          if (valid) {
            return parsed;
          } else {
            throw new Error('La risposta dell\'API di Gemini non contiene tutte le chiavi o le lingue richieste');
          }
        } catch (err: any) {
          lastError = err;
          if (err?.fatal) {
            throw err;
          }
          console.warn(`[Quest-Translation] Attempt ${attempt} failed with error: ${err.message || err}.`);
          if (attempt < 2) {
            console.log(`[Quest-Translation] Waiting ${delay}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
          }
        }
      }
      throw lastError || new Error('Massimo numero di tentativi raggiunto senza successo');
    }

    async function translateNewQuests(missingQuests: string[]): Promise<Record<string, Record<string, string>>> {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.log('[Quest-Translation] GEMINI_API_KEY non definita. Utilizzo del traduttore locale a regole.');
        return translateQuestsLocalFallback(missingQuests);
      }

      console.log(`[Quest-Translation] Richiesta traduzione multilingua per ${missingQuests.length} nuove missioni in batch...`);
      const chunkSize = 5;
      const result: Record<string, Record<string, string>> = {};
      let geminiDisabled = false;

      for (let i = 0; i < missingQuests.length; i += chunkSize) {
        const chunk = missingQuests.slice(i, i + chunkSize);
        if (geminiDisabled) {
          Object.assign(result, translateQuestsLocalFallback(chunk));
          continue;
        }
        console.log(`[Quest-Translation] Traduzione batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(missingQuests.length / chunkSize)} (${chunk.length} ricerche)...`);
        try {
          const chunkResult = await translateNewQuestsChunk(chunk, apiKey);
          Object.assign(result, chunkResult);
        } catch (err: any) {
          console.warn(`[Quest-Translation] Errore nel batch ${Math.floor(i / chunkSize) + 1}. Fallback locale per questo batch.`, err?.message || err);
          if (err?.fatal) {
            geminiDisabled = true;
          }
          const fallbackResult = translateQuestsLocalFallback(chunk);
          Object.assign(result, fallbackResult);
        }
        if (!geminiDisabled && i + chunkSize < missingQuests.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      return result;
    }

    async function performQuestAutoSync(): Promise<{ count: number; source: string }> {
      console.log('[Auto-Sync-Quests] Avvio sincronizzazione Ricerche automatica...');

      // Funzione helper per normalizzare i nomi
      function normalizeQuestRewardName(name: string): string {
        name = decodeHtmlEntities(name).trim();
        if (name.startsWith('Galarian ')) {
          return name.replace('Galarian ', '') + ' (Galarian)';
        }
        if (name.startsWith('Alolan ')) {
          return name.replace('Alolan ', '') + ' (Alolan)';
        }
        if (name.startsWith('Hisuian ')) {
          return name.replace('Hisuian ', '') + ' (Hisuian)';
        }
        if (name.startsWith('Paldean ')) {
          return name.replace('Paldean ', '') + ' (Paldean)';
        }
        if (name.includes('Origin Forme') || name.includes('Origin Form')) {
          return name.replace(' Origin Forme', '').replace(' Origin Form', '') + ' (Origin)';
        }
        // Rimuove pattern Spinda (es. "Spinda 4" / "Spinda 5" -> "Spinda")
        if (/^Spinda\b/i.test(name)) {
          return 'Spinda';
        }
        // Rimuove costumi comuni (es. "Charmander wearing Friede's goggles" -> "Charmander")
        if (name.includes(' wearing ')) {
          name = name.split(' wearing ')[0].trim();
        }
        // Rimuove prefissi costume (es. "Captain's Cap Pikachu" -> "Pikachu")
        if (name.includes('Pikachu')) {
          return 'Pikachu';
        }
        return name;
      }

      const db = await getDb();
      // Carica i Pokemon dal DB per fare mapping
      const pokemonsList = await db.all<{ id: number; name: string }[]>('SELECT id, name FROM pokemons;');
      const pokemonNameMap = new Map<string, number>();
      for (const p of pokemonsList) {
        pokemonNameMap.set(p.name.toLowerCase().trim(), p.id);
      }

      const parsedQuests: Array<{
        name: string;
        rewards: string; // JSON string
        displayOrder: number;
      }> = [];
      let count = 0;
      let source = '';

      // 1. Fonte primaria: Leek Duck HTML
      try {
        console.log('[Auto-Sync-Quests] Contatto leekduck.com/research/...');
        const response = await fetchWithTimeout('https://leekduck.com/research/', {}, 20000);
        if (!response.ok) {
          throw new Error(`Leek Duck returned status ${response.status}`);
        }
        const html = await response.text();

        // Suddividi l'HTML in base ai blocchi di categoria per filtrare gli eventi scaduti
        const parts = html.split(/<div class="task-category/);

        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];

          // Estrai il tag di apertura per verificare se l'evento è scaduto
          const tagMatch = part.match(/^([^>]+)>/);
          if (!tagMatch) continue;
          const tagContent = tagMatch[1];

          const eventEndMatch = tagContent.match(/data-event-end="([^"]+)"/);
          if (eventEndMatch) {
            const eventEndDateStr = eventEndMatch[1];
            const eventEndDate = new Date(eventEndDateStr);
            if (!isNaN(eventEndDate.getTime()) && eventEndDate.getTime() < Date.now()) {
              console.log(`[Auto-Sync-Quests] Salto categoria evento scaduta: data fine ${eventEndDateStr}`);
              continue;
            }
          }

          const taskParts = part.split(/<li class="task-item[^"]*">/);
          for (let j = 1; j < taskParts.length; j++) {
            const taskHtml = taskParts[j];

            // Estrai nome missione in modo resiliente (gestisce tag annidati come <span> e entità HTML)
            const taskTextMatch = taskHtml.match(/<span class="task-text"[^>]*>([\s\S]*?)<\/span>/);
            if (!taskTextMatch) continue;
            const taskName = decodeHtmlEntities(taskTextMatch[1].replace(/<[^>]+>/g, '')).trim();
            if (!taskName) continue;

            // Estrai incontri Pokémon
            const rewardRegex = /<li class="reward"[^>]*data-reward-type="encounter"[\s\S]*?<\/li>/g;
            let rewardMatch;
            const rewards: Array<{ pokemonId: number; minCp: number; maxCp: number }> = [];

            while ((rewardMatch = rewardRegex.exec(taskHtml)) !== null) {
              const rewardHtml = rewardMatch[0];

              const rewardLabelMatch = rewardHtml.match(/<span class="reward-label"[^>]*>([\s\S]*?)<\/span>/);
              if (!rewardLabelMatch) continue;
              const leekDuckPokemonName = decodeHtmlEntities(rewardLabelMatch[1].replace(/<[^>]+>/g, '')).trim();
              const normalizedName = normalizeQuestRewardName(leekDuckPokemonName);

              const maxCpMatch = rewardHtml.match(/max-cp">[^<]*<div>Max CP<\/div>\s*(\d+)\s*/);
              const minCpMatch = rewardHtml.match(/min-cp">[^<]*<div>Min CP<\/div>\s*(\d+)\s*/);

              const maxCp = maxCpMatch ? parseInt(maxCpMatch[1], 10) : 0;
              const minCp = minCpMatch ? parseInt(minCpMatch[1], 10) : 0;

              const pokemonId = pokemonNameMap.get(normalizedName.toLowerCase());
              if (pokemonId) {
                rewards.push({
                  pokemonId,
                  minCp,
                  maxCp
                });
              } else {
                console.warn(`[Auto-Sync-Quests] Impossibile mappare "${leekDuckPokemonName}" (normalizzato: "${normalizedName}") a un pokemonId.`);
              }
            }

            if (rewards.length > 0) {
              count++;
              parsedQuests.push({
                name: taskName,
                rewards: JSON.stringify(rewards),
                displayOrder: count
              });
            }
          }
        }

        if (parsedQuests.length > 0) {
          source = 'Leek Duck';
        } else {
          console.warn('[Auto-Sync-Quests] Parsing HTML Leek Duck ha restituito 0 missioni. Passo al fallback ScrapedDuck JSON...');
        }
      } catch (leekErr) {
        console.warn('[Auto-Sync-Quests] Errore Leek Duck diretto, passo al fallback ScrapedDuck JSON:', leekErr);
      }

      // 2. Fallback automatico: ScrapedDuck JSON (feed JSON strutturato di Leek Duck)
      if (parsedQuests.length === 0) {
        const sdUrl = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/research.json';
        console.log('[Auto-Sync-Quests] Contatto fallback ScrapedDuck JSON...');
        const sdResp = await fetchWithTimeout(sdUrl, {}, 20000);
        if (!sdResp.ok) {
          throw new Error(`ScrapedDuck fallback returned status ${sdResp.status}`);
        }
        const sdData = await sdResp.json() as Array<{
          text?: string;
          rewards?: Array<{ name?: string; combatPower?: { min?: number; max?: number } }>;
        }>;

        if (!Array.isArray(sdData)) {
          throw new Error('Risposta ScrapedDuck non valida');
        }

        for (const item of sdData) {
          const taskName = decodeHtmlEntities((item.text || '').replace(/<[^>]+>/g, '')).trim();
          if (!taskName || !Array.isArray(item.rewards)) continue;

          const rewards: Array<{ pokemonId: number; minCp: number; maxCp: number }> = [];
          for (const r of item.rewards) {
            if (!r || !r.name) continue;
            const normalizedName = normalizeQuestRewardName(r.name);
            const pokemonId = pokemonNameMap.get(normalizedName.toLowerCase());
            if (pokemonId) {
              rewards.push({
                pokemonId,
                minCp: r.combatPower?.min ?? 0,
                maxCp: r.combatPower?.max ?? 0
              });
            } else {
              console.warn(`[Auto-Sync-Quests] [ScrapedDuck] Impossibile mappare "${r.name}" (normalizzato: "${normalizedName}") a un pokemonId.`);
            }
          }

          if (rewards.length > 0) {
            count++;
            parsedQuests.push({
              name: taskName,
              rewards: JSON.stringify(rewards),
              displayOrder: count
            });
          }
        }
        source = 'ScrapedDuck JSON';
      }

      if (parsedQuests.length === 0) {
        throw new Error('Nessuna ricerca sul campo trovata o errore nel parsing (sia Leek Duck che ScrapedDuck)');
      }

      // Aggiornamento immediato del database quests (senza attendere eventuali chiamate lente a Gemini)
      await db.run('BEGIN TRANSACTION;');
      try {
        await db.run('DELETE FROM quests;');
        const insertStmt = await db.prepare(
          'INSERT INTO quests (name, rewards, displayOrder) VALUES (?, ?, ?);'
        );
        for (const q of parsedQuests) {
          await insertStmt.run(q.name, q.rewards, q.displayOrder);
        }
        await insertStmt.finalize();
        await db.run('COMMIT;');
        console.log(`[Auto-Sync-Quests] Ricerche auto-sincronizzate con successo da ${source}. Inserite ${parsedQuests.length} missioni.`);
      } catch (err) {
        await db.run('ROLLBACK;');
        throw err;
      }

      // Aggiornamento dizionario delle traduzioni quests.json (fallback italiano istantaneo + arricchimento Gemini in background)
      const translationsDir = path.join(__dirname, '../data/translations');
      const translationsFile = path.join(translationsDir, 'quests.json');

      let translationDict: Record<string, Record<string, string>> = {};
      try {
        if (fs.existsSync(translationsFile)) {
          translationDict = JSON.parse(fs.readFileSync(translationsFile, 'utf-8'));
        }
      } catch (e) {
        console.error('[Auto-Sync-Quests] Errore nella lettura di quests.json:', e);
      }

      const rawNames = Array.from(new Set(parsedQuests.map(q => q.name)));
      const completelyMissing = rawNames.filter(name => !translationDict[name]);
      if (completelyMissing.length > 0) {
        const localFallback = translateQuestsLocalFallback(completelyMissing);
        translationDict = { ...translationDict, ...localFallback };
        try {
          fs.writeFileSync(translationsFile, JSON.stringify(translationDict, null, 2), 'utf-8');
          console.log(`[Auto-Sync-Quests] Salvate traduzioni locali istantanee per ${completelyMissing.length} nuove missioni.`);
        } catch (writeErr) {
          console.error('[Auto-Sync-Quests] Errore nel salvataggio locale di quests.json:', writeErr);
        }
      }

      const needsAiTranslation = rawNames.filter(name => {
        const trans = translationDict[name];
        if (!trans) return true;
        return trans.de === name || trans.ja === name;
      });

      if (needsAiTranslation.length > 0 && process.env.GEMINI_API_KEY) {
        console.log(`[Auto-Sync-Quests] Avvio traduzione multilingua in background per ${needsAiTranslation.length} missioni...`);
        translateNewQuests(needsAiTranslation)
          .then(newTranslations => {
            try {
              const latestDict = fs.existsSync(translationsFile)
                ? JSON.parse(fs.readFileSync(translationsFile, 'utf-8'))
                : {};
              const merged = { ...latestDict, ...newTranslations };
              fs.writeFileSync(translationsFile, JSON.stringify(merged, null, 2), 'utf-8');
              console.log(`[Auto-Sync-Quests] Dizionario quests.json arricchito in background.`);
            } catch (bgWriteErr) {
              console.error('[Auto-Sync-Quests] Errore nel salvataggio traduzioni background:', bgWriteErr);
            }
          })
          .catch(transErr => {
            console.warn('[Auto-Sync-Quests] Arricchimento traduzioni in background fallito (traduzioni locali già attive):', transErr);
          });
      }

      return { count: parsedQuests.length, source };
    }

    // Guard anti-sovrapposizione per evitare transazioni SQLite concorrenti tra startup worker e click manuale
    const syncInFlight = new Map<string, Promise<any>>();
    function runSingleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = syncInFlight.get(key);
      if (existing) {
        return existing as Promise<T>;
      }
      const p = fn().finally(() => {
        syncInFlight.delete(key);
      });
      syncInFlight.set(key, p);
      return p;
    }

    // =================================================================
    // 8.9. POST /api/admin/sync-released - Sincronizza automaticamente i Pokémon rilasciati e le specie mancanti (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/sync-released', requireAdmin, async (req, res) => {
      try {
        const result = await runSingleFlight('released', performReleasedPokemonAutoSync);
        res.json({ success: true, ...result });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica dei Pokémon rilasciati:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione dei Pokémon rilasciati: ' + String(err) });
      }
    });

    // =================================================================
    // 9. POST /api/admin/sync-shinies - Sincronizza automaticamente gli shiny (Bulbapedia + fallback PoGoAPI) (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/sync-shinies', requireAdmin, async (req, res) => {
      try {
        const shinyUnreleasedCapable = await runSingleFlight('shinies', performShinyAutoSync);
        res.json({ success: true, shinyUnreleasedCapable });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica degli shiny:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione automatica degli shiny: ' + String(err) });
      }
    });

    // =================================================================
    // 9.1. POST /api/admin/sync-raids - Sincronizza automaticamente i raid da Pokemon GO API (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/sync-raids', requireAdmin, async (req, res) => {
      try {
        await runSingleFlight('raids', performRaidAutoSync);
        res.json({ success: true });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica dei raid:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione dei raid: ' + String(err) });
      }
    });

    // =================================================================
    // 9.2. POST /api/admin/sync-quests - Sincronizza automaticamente le ricerche da Leek Duck / ScrapedDuck (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/sync-quests', requireAdmin, async (req, res) => {
      try {
        const result = await runSingleFlight('quests', performQuestAutoSync);
        res.json({ success: true, ...result });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica delle ricerche:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione delle ricerche: ' + String(err) });
      }
    });

    // =================================================================
    // 9.3. POST /api/admin/sync-eggs - Sincronizza automaticamente le uova da Leek Duck (Protetto da requireAdmin)
    // =================================================================
    app.post('/api/admin/sync-eggs', requireAdmin, async (req, res) => {
      try {
        await runSingleFlight('eggs', performEggAutoSync);
        res.json({ success: true });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica delle uova:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione delle uova: ' + String(err) });
      }
    });

    // Serve static files of the Angular frontend
    const frontendPath = path.join(__dirname, '../../frontend/dist/frontend/browser');
    app.use(express.static(frontendPath));

    // Redirect all other requests to Angular's index.html (client-side routing)
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });

    async function runAllAutoSyncs(workerLabel: string) {
      const steps: Array<{ key: string; name: string; fn: () => Promise<any> }> = [
        { key: 'released', name: 'Pokémon Rilasciati & Catalogo', fn: performReleasedPokemonAutoSync },
        { key: 'shinies', name: 'Shiny', fn: performShinyAutoSync },
        { key: 'raids', name: 'Raid', fn: performRaidAutoSync },
        { key: 'quests', name: 'Ricerche', fn: performQuestAutoSync },
        { key: 'eggs', name: 'Uova', fn: performEggAutoSync }
      ];

      for (const step of steps) {
        try {
          console.log(`[${workerLabel}] Avvio sincronizzazione ${step.name}...`);
          await runSingleFlight(step.key, step.fn);
          console.log(`[${workerLabel}] Sincronizzazione ${step.name} completata con successo.`);
        } catch (err) {
          console.error(`[${workerLabel}] Errore durante la sincronizzazione ${step.name} (le altre proseguono):`, err);
        }
      }
    }

    // Avvia l'ascolto
    app.listen(port, host, () => {
      console.log(`================================================================`);
      console.log(`   [Node OK] Server REST in ascolto su http://${host}:${port}!`);
      console.log(`================================================================`);

      // 10. Esegui tutte le sincronizzazioni automatiche all'avvio in background (ciascuna isolata)
      setTimeout(() => {
        runAllAutoSyncs('Startup Background Worker');
      }, 5000); // Ritardo di 5 secondi per far avviare il server liberamente

      // 11. Esegui tutte le sincronizzazioni automatiche ogni 24 ore (ciascuna isolata)
      setInterval(() => {
        runAllAutoSyncs('Periodic Background Worker');
      }, 24 * 60 * 60 * 1000); // 24 ore
    });

  } catch (err) {
    console.error('Errore fatale all\'avvio del server:', err);
    process.exit(1);
  }
}

startServer();
