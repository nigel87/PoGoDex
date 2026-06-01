import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getDb } from './db';
import { runSeeder } from './seed';
import { PokedexDTO, User } from './types';

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

    // Auto-cleanup di profili fantasma generati da navigazioni crawler su rotte riservate
    try {
      const reserved = ['about', 'admin', 'settings', 'stats', 'export', 'assets', 'favicon.ico', 'landing', 'api'];
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
        const result = await db.run('DELETE FROM users WHERE id = ?', id);
        log('INFO', `Profilo allenatore eliminato con successo`, { id, changes: result.changes });
        res.json({ success: true });
      } catch (err) {
        log('ERROR', 'Errore nella cancellazione del profilo allenatore', { err: String(err), id });
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
    // 3. GET /api/pokedex - Catalogo completo con stato spunte allenatore
    // =================================================================
    app.get('/api/pokedex', async (req, res) => {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'userId è richiesto' });
      }

      const parsedUserId = parseInt(userId as string, 10);

      try {
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
            parentId: p.parentId || null
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

      const tStart = Date.now();
      try {
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
        await touchUserLastUpdated(parseInt(userId as string, 10));

        const elapsed = Date.now() - tStart;
        log('INFO', `Transazione batch completata con successo in ${elapsed}ms`, { userId, count: updates.length });
        res.json({ success: true, count: updates.length });
      } catch (err) {
        try { await db.run('ROLLBACK'); } catch (_) {}
        log('ERROR', 'Errore durante la transazione batch', { err: String(err), userId });
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    const configPath = path.join(__dirname, '../../frontend/src/app/services/pokemon-config.ts');

    // =================================================================
    // 6.6. GET /api/pokemon-config - Carica le liste di configurazione (Pubblico)
    // =================================================================
    app.get('/api/pokemon-config', (req, res) => {
      try {
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

    // Helper per verificare se la richiesta proviene da localhost (loopback)
    function isLocalRequest(req: express.Request): boolean {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
    }

    // =================================================================
    // 7. GET /api/admin/config - Carica le liste capaci (Solo Locale)
    // =================================================================
    app.get('/api/admin/config', (req, res) => {
      if (!isLocalRequest(req)) {
        return res.status(403).json({ error: 'Accesso Negato: questa console di amministrazione è disponibile esclusivamente in ambiente locale.' });
      }

      try {
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
        console.error('Errore nel recupero della configurazione:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // =================================================================
    // 8. POST /api/admin/config - Salva le liste su disco (Solo Locale)
    // =================================================================
    app.post('/api/admin/config', (req, res) => {
      if (!isLocalRequest(req)) {
        return res.status(403).json({ error: 'Accesso Negato: questa console di amministrazione è disponibile esclusivamente in ambiente locale.' });
      }

      const { shadowCapable, megaCapable, gigamaxCapable, unreleasedCapable, shinyUnreleasedCapable } = req.body;

      if (!Array.isArray(shadowCapable) || !Array.isArray(megaCapable) || !Array.isArray(gigamaxCapable) || !Array.isArray(unreleasedCapable) || !Array.isArray(shinyUnreleasedCapable)) {
        return res.status(400).json({ error: 'Formato dati non valido' });
      }

      try {
        const shadowLines = shadowCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
        const megaLines = megaCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
        const gigaLines = gigamaxCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
        const unreleasedLines = unreleasedCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
        const shinyUnreleasedLines = shinyUnreleasedCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');

        const tsContent = `export const SHADOW_CAPABLE_SPECIES = [
${shadowLines}
];

export const MEGA_CAPABLE_SPECIES = [
${megaLines}
];

export const GIGAMAX_CAPABLE_SPECIES = [
${gigaLines}
];

export const UNRELEASED_SPECIES = [
${unreleasedLines}
];

export const SHINY_UNRELEASED_SPECIES = [
${shinyUnreleasedLines}
];
`;

        let extraContent = '';
        if (fs.existsSync(configPath)) {
          const oldContent = fs.readFileSync(configPath, 'utf-8');
          const mythicalIndex = oldContent.indexOf('export const MYTHICAL_POKEMON');
          if (mythicalIndex !== -1) {
            extraContent = oldContent.substring(mythicalIndex);
          }
        }

        if (!extraContent.includes('export const MYTHICAL_POKEMON') || !extraContent.includes('export const EVOLVES_FROM') || !extraContent.includes('export const MODAL_FORMS_SPECIES')) {
          extraContent = `export const MYTHICAL_POKEMON = [
  'Mew', 'Celebi', 'Jirachi', 'Deoxys', 'Phione', 'Manaphy', 'Darkrai', 'Shaymin', 'Arceus',
  'Victini', 'Meloetta', 'Genesect', 'Keldeo', 'Diancie', 'Hoopa', 'Volcanion', 'Magearna',
  'Marshadow', 'Zeraora', 'Meltan', 'Melmetal', 'Zarude', 'Pecharunt'
];

export const LEGENDARY_POKEMON = [
  'Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Raikou', 'Entei', 'Suicune', 'Lugia', 'Ho-Oh',
  'Regirock', 'Regice', 'Registeel', 'Latias', 'Latios', 'Kyogre', 'Groudon', 'Rayquaza',
  'Uxie', 'Mesprit', 'Azelf', 'Dialga', 'Palkia', 'Heatran', 'Regigigas', 'Giratina', 'Cresselia',
  'Cobalion', 'Terrakion', 'Virizion', 'Tornadus', 'Thundurus', 'Reshiram', 'Zekrom', 'Landorus',
  'Kyurem', 'Xerneas', 'Yveltal', 'Zygarde', 'Type: Null', 'Silvally', 'Tapu Koko', 'Tapu Lele',
  'Tapu Bulu', 'Tapu Fini', 'Cosmog', 'Cosmoem', 'Solgaleo', 'Lunala', 'Necrozma', 'Zacian',
  'Zamazenta', 'Eternatus', 'Kubfu', 'Urshifu', 'Regieleki', 'Regidrago', 'Glastrier', 'Spectrier',
  'Calyrex', 'Enamorus', 'Wo-Chien', 'Chien-Pao', 'Ting-Lu', 'Chi-Yu', 'Koraidon', 'Miraidon',
  'Okidogi', 'Munkidori', 'Fezandipiti', 'Ogerpon', 'Gouging Fire', 'Raging Bolt', 'Iron Boulder',
  'Iron Crown', 'Terapagos'
];

export const ULTRA_BEASTS = [
  'Nihilego', 'Buzzwole', 'Pheromosa', 'Xurkitree', 'Celesteela', 'Kartana', 'Guzzlord',
  'Poipole', 'Naganadel', 'Stakataka', 'Blacephalon'
];

export const EVOLVES_FROM: Record<string, string> = {
  // Gen 1
  'Ivysaur': 'Bulbasaur',
  'Venusaur': 'Ivysaur',
  'Charmeleon': 'Charmander',
  'Charizard': 'Charmeleon',
  'Wartortle': 'Squirtle',
  'Blastoise': 'Wartortle',
  'Metapod': 'Caterpie',
  'Butterfree': 'Metapod',
  'Kakuna': 'Weedle',
  'Beedrill': 'Kakuna',
  'Pidgeotto': 'Pidgey',
  'Pidgeot': 'Pidgeotto',
  'Raticate': 'Rattata',
  'Fearow': 'Spearow',
  'Arbok': 'Ekans',
  'Raichu': 'Pikachu',
  'Pikachu': 'Pichu',
  'Sandslash': 'Sandshrew',
  'Nidorina': 'Nidoran♀',
  'Nidoqueen': 'Nidorina',
  'Nidorino': 'Nidoran♂',
  'Nidoking': 'Nidorino',
  'Clefairy': 'Cleffa',
  'Clefable': 'Clefairy',
  'Jigglypuff': 'Igglybuff',
  'Wigglytuff': 'Jigglypuff',
  'Golbat': 'Zubat',
  'Crobat': 'Golbat',
  'Gloom': 'Oddish',
  'Vileplume': 'Gloom',
  'Bellossom': 'Gloom',
  'Parasect': 'Paras',
  'Venomoth': 'Venonat',
  'Dugtrio': 'Diglett',
  'Persian': 'Meowth',
  'Perrserker': 'Meowth',
  'Golduck': 'Psyduck',
  'Primeape': 'Mankey',
  'Annihilape': 'Primeape',
  'Arcanine': 'Growlithe',
  'Poliwhirl': 'Poliwag',
  'Poliwrath': 'Poliwhirl',
  'Politoed': 'Poliwhirl',
  'Kadabra': 'Abra',
  'Alakazam': 'Kadabra',
  'Machoke': 'Machop',
  'Machamp': 'Machoke',
  'Weepinbell': 'Bellsprout',
  'Tentacruel': 'Tentacool',
  'Graveler': 'Geodude',
  'Golem': 'Graveler',
  'Rapidash': 'Ponyta',
  'Slowbro': 'Slowpoke',
  'Slowking': 'Slowpoke',
  'Magneton': 'Magnemite',
  'Magnezone': 'Magneton',
  'Sirfetch\\'d': 'Farfetch\\'d',
  'Dodrio': 'Doduo',
  'Dewgong': 'Seel',
  'Muk': 'Grimer',
  'Haunter': 'Gastly',
  'Gengar': 'Haunter',
  'Steelix': 'Onix',
  'Hypno': 'Drowzee',
  'Kingler': 'Krabby',
  'Electrode': 'Voltorb',
  'Exeggutor': 'Exeggcute',
  'Marowak': 'Cubone',
  'Hitmonlee': 'Tyrogue',
  'Hitmonchan': 'Tyrogue',
  'Hitmontop': 'Tyrogue',
  'Lickilicky': 'Lickitung',
  'Weezing': 'Koffing',
  'Rhydon': 'Rhyhorn',
  'Rhyperior': 'Rhydon',
  'Chansey': 'Happiny',
  'Blissey': 'Chansey',
  'Tangrowth': 'Tangela',
  'Seadra': 'Horsea',
  'Kingdra': 'Seadra',
  'Seaking': 'Goldeen',
  'Starmie': 'Staryu',
  'Mr. Mr. Mr. Mr. Mr. Mime': 'Mime Jr.',
  'Mr. Rime': 'Mr. Mime',
  'Scizor': 'Scyther',
  'Kleavor': 'Scyther',
  'Jynx': 'Smoochum',
  'Electabuzz': 'Elekid',
  'Electivire': 'Electabuzz',
  'Magmar': 'Magby',
  'Magmortar': 'Magmar',
  'Gyarados': 'Magikarp',
  'Vaporeon': 'Eevee',
  'Jolteon': 'Eevee',
  'Flareon': 'Eevee',
  'Espeon': 'Eevee',
  'Umbreon': 'Eevee',
  'Leafeon': 'Eevee',
  'Glaceon': 'Eevee',
  'Sylveon': 'Eevee',
  'Porygon2': 'Porygon',
  'Porygon-Z': 'Porygon2',
  'Omastar': 'Omanyte',
  'Kabutops': 'Kabuto',
  'Snorlax': 'Munchlax',
  'Dragonair': 'Dratini',
  'Dragonite': 'Dragonair',

  // Gen 2
  'Bayleef': 'Chikorita',
  'Meganium': 'Bayleef',
  'Quilava': 'Cyndaquil',
  'Typhlosion': 'Quilava',
  'Croconaw': 'Totodile',
  'Feraligatr': 'Croconaw',
  'Furret': 'Sentret',
  'Noctowl': 'Hoothoot',
  'Ledian': 'Ledyba',
  'Ariados': 'Spinarak',
  'Lanturn': 'Chinchou',
  'Togetic': 'Togepi',
  'Togekiss': 'Togetic',
  'Xatu': 'Natu',
  'Flaaffy': 'Mareep',
  'Ampharos': 'Flaaffy',
  'Azumarill': 'Marill',
  'Marill': 'Azurill',
  'Sudowoodo': 'Bonsly',
  'Jumpluff': 'Skiploom',
  'Skiploom': 'Hoppip',
  'Sunflora': 'Sunkern',
  'Quagsire': 'Wooper',
  'Wobbuffet': 'Wynaut',
  'Farigiraf': 'Girafarig',
  'Forretress': 'Pineco',
  'Dudunsparce': 'Dunsparce',
  'Granbull': 'Snubbull',
  'Ursaring': 'Teddiursa',
  'Ursaluna': 'Ursaring',
  'Magcargo': 'Slugma',
  'Piloswine': 'Swinub',
  'Mamoswine': 'Piloswine',
  'Octillery': 'Remoraid',
  'Mantine': 'Mantyke',
  'Houndoom': 'Houndour',
  'Donphan': 'Phanpy',
  'Pupitar': 'Larvitar',
  'Tyranitar': 'Pupitar',

  // Gen 3
  'Grovyle': 'Treecko',
  'Sceptile': 'Grovyle',
  'Combusken': 'Torchic',
  'Blaziken': 'Combusken',
  'Marshtomp': 'Mudkip',
  'Swampert': 'Marshtomp',
  'Mightyena': 'Poochyena',
  'Linoone': 'Zigzagoon',
  'Obstagoon': 'Linoone',
  'Beautifly': 'Silcoon',
  'Silcoon': 'Wurmple',
  'Dustox': 'Cascoon',
  'Cascoon': 'Wurmple',
  'Lombre': 'Lotad',
  'Ludicolo': 'Lombre',
  'Nuzleaf': 'Seedot',
  'Shiftry': 'Nuzleaf',
  'Swellow': 'Taillow',
  'Pelipper': 'Wingull',
  'Kirlia': 'Ralts',
  'Gardevoir': 'Kirlia',
  'Gallade': 'Kirlia',
  'Masquerain': 'Surskit',
  'Breloom': 'Shroomish',
  'Vigoroth': 'Slakoth',
  'Slaking': 'Vigoroth',
  'Ninjask': 'Nincada',
  'Shedinja': 'Nincada',
  'Loudred': 'Whismur',
  'Exploud': 'Loudred',
  'Hariyama': 'Makuhita',
  'Delcatty': 'Skitty',
  'Lairon': 'Aron',
  'Aggron': 'Lairon',
  'Medicham': 'Meditite',
  'Manectric': 'Electrike',
  'Roselia': 'Budew',
  'Roserade': 'Roselia',
  'Swalot': 'Gulpin',
  'Sharpedo': 'Carvanha',
  'Wailord': 'Wailmer',
  'Camerupt': 'Numel',
  'Grumpig': 'Spoink',
  'Vibrava': 'Trapinch',
  'Flygon': 'Vibrava',
  'Cacturne': 'Cacnea',
  'Altaria': 'Swablu',
  'Crawdaunt': 'Corphish',
  'Claydol': 'Baltoy',
  'Cradily': 'Lileep',
  'Armaldo': 'Anorith',
  'Milotic': 'Feebas',
  'Banette': 'Shuppet',
  'Dusclops': 'Duskull',
  'Dusknoir': 'Dusclops',
  'Chimecho': 'Chingling',
  'Glalie': 'Snorunt',
  'Froslass': 'Snorunt',
  'Sealeo': 'Spheal',
  'Walrein': 'Sealeo',
  'Huntail': 'Clamperl',
  'Gorebyss': 'Clamperl',
  'Shelgon': 'Bagon',
  'Salamence': 'Shelgon',
  'Metang': 'Beldum',
  'Metagross': 'Metang',

  // Gen 4
  'Grotle': 'Turtwig',
  'Torterra': 'Grotle',
  'Monferno': 'Chimchar',
  'Infernape': 'Monferno',
  'Prinplup': 'Piplup',
  'Empoleon': 'Prinplup',
  'Staravia': 'Starly',
  'Staraptor': 'Staravia',
  'Bibarel': 'Bidoof',
  'Kricketune': 'Kricketot',
  'Luxio': 'Shinx',
  'Luxray': 'Luxio',
  'Rampardos': 'Cranidos',
  'Bastiodon': 'Shieldon',
  'Wormadam': 'Burmy',
  'Mothim': 'Burmy',
  'Vespiquen': 'Combee',
  'Floatzel': 'Buizel',
  'Cherrim': 'Cherubi',
  'Gastrodon': 'Shellos',
  'Ambipom': 'Aipom',
  'Drifblim': 'Drifloon',
  'Lopunny': 'Buneary',
  'Mismagius': 'Misdreavus',
  'Honchkrow': 'Murkrow',
  'Purugly': 'Glameow',
  'Skuntank': 'Stunky',
  'Bronzong': 'Bronzor',
  'Lucario': 'Riolu',
  'Hippowdon': 'Hippopotas',
  'Drapion': 'Skorupi',
  'Toxicroak': 'Croagunk',
  'Lumineon': 'Finneon',
  'Abomasnow': 'Snover',
  'Weavile': 'Sneasel',
  'Sneasler': 'Sneasel',
  'Yanmega': 'Yanma',
  'Gliscor': 'Gligar',

  // Gen 5
  'Servine': 'Snivy',
  'Serperior': 'Servine',
  'Pignite': 'Tepig',
  'Emboar': 'Pignite',
  'Dewott': 'Oshawott',
  'Samurott': 'Dewott',
  'Watchog': 'Patrat',
  'Herdier': 'Lillipup',
  'Stoutland': 'Herdier',
  'Liepard': 'Purrloin',
  'Simisage': 'Pansage',
  'Simisear': 'Pansear',
  'Simipour': 'Panpour',
  'Musharna': 'Munna',
  'Tranquill': 'Pidove',
  'Unfezant': 'Tranquill',
  'Zebstrika': 'Blitzle',
  'Boldore': 'Roggenrola',
  'Gigalith': 'Boldore',
  'Swoobat': 'Woobat',
  'Excadrill': 'Drilbur',
  'Gurdurr': 'Timburr',
  'Conkeldurr': 'Gurdurr',
  'Palpitoad': 'Tympole',
  'Seismitoad': 'Palpitoad',
  'Swadloon': 'Sewaddle',
  'Leavanny': 'Swadloon',
  'Whimsicott': 'Cottonee',
  'Lilligant': 'Petilil',
  'Krokorok': 'Sandile',
  'Krookodile': 'Krokorok',
  'Darmanitan': 'Darumaka',
  'Crustle': 'Dwebble',
  'Scrafty': 'Scraggy',
  'Cofagrigus': 'Yamask',
  'Carracosta': 'Tirtouga',
  'Archeops': 'Archen',
  'Garbodor': 'Trubbish',
  'Zoroark': 'Zorua',
  'Cinccino': 'Minccino',
  'Gothorita': 'Gothita',
  'Gothitelle': 'Gothorita',
  'Duosion': 'Solosis',
  'Reuniclus': 'Duosion',
  'Swanna': 'Ducklett',
  'Vanillish': 'Vanillite',
  'Vanilluxe': 'Vanillish',
  'Sawsbuck': 'Deerling',
  'Escavalier': 'Karrablast',
  'Amoonguss': 'Foongus',
  'Jellicent': 'Frillish',
  'Galvantula': 'Joltik',
  'Ferrothorn': 'Ferroseed',
  'Klang': 'Klink',
  'Klinklang': 'Klang',
  'Eelektrik': 'Tynamo',
  'Eelektross': 'Eelektrik',
  'Beheeyem': 'Elgyem',
  'Lampent': 'Litwick',
  'Chandelure': 'Lampent',
  'Fraxure': 'Axew',
  'Haxorus': 'Fraxure',
  'Beartic': 'Cubchoo',
  'Accelgor': 'Shelmet',
  'Mienshao': 'Mienfoo',
  'Golurk': 'Golett',
  'Bisharp': 'Pawniard',
  'Kingambit': 'Bisharp',
  'Braviary': 'Rufflet',
  'Mandibuzz': 'Vullaby',
  'Zweilous': 'Deino',
  'Hydreigon': 'Zweilous',
  'Volcarona': 'Larvesta',

  // Gen 6
  'Quilladin': 'Chespin',
  'Chesnaught': 'Quilladin',
  'Braixen': 'Fennekin',
  'Delphox': 'Braixen',
  'Frogadier': 'Froakie',
  'Greninja': 'Frogadier',
  'Diggersby': 'Bunnelby',
  'Fletchinder': 'Fletchling',
  'Talonflame': 'Fletchinder',
  'Spewpa': 'Scatterbug',
  'Vivillon': 'Spewpa',
  'Pyroar': 'Litleo',
  'Floette': 'Flabebe',
  'Florges': 'Floette',
  'Gogoat': 'Skiddo',
  'Pangoro': 'Pancham',
  'Meowstic': 'Espurr',
  'Doublade': 'Honedge',
  'Aegislash': 'Doublade',
  'Aromatisse': 'Spritzee',
  'Slurpuff': 'Swirlix',
  'Malamar': 'Inkay',
  'Barbaracle': 'Binacle',
  'Dragalge': 'Skrelp',
  'Clawitzer': 'Clauncher',
  'Heliolisk': 'Helioptile',
  'Tyrantrum': 'Tyrunt',
  'Aurorus': 'Amaura',
  'Sliggoo': 'Goomy',
  'Goodra': 'Sliggoo',
  'Trevenant': 'Phantump',
  'Gourgeist': 'Pumpkaboo',
  'Avalugg': 'Bergmite',
  'Noivern': 'Noibat',

  // Gen 7
  'Dartrix': 'Rowlet',
  'Decidueye': 'Dartrix',
  'Torracat': 'Litten',
  'Incineroar': 'Torracat',
  'Brionne': 'Popplio',
  'Primarina': 'Brionne',
  'Trumbeak': 'Pikipek',
  'Toucannon': 'Trumbeak',
  'Gumshoos': 'Yungoos',
  'Charjabug': 'Grubbin',
  'Vikavolt': 'Charjabug',
  'Crabominable': 'Crabrawler',
  'Ribombee': 'Cutiefly',
  'Lycanroc': 'Rockruff',
  'Toxapex': 'Mareanie',
  'Mudsdale': 'Mudbray',
  'Araquanid': 'Dewpider',
  'Lurantis': 'Fomantis',
  'Shiinotic': 'Morelull',
  'Salazzle': 'Salandit',
  'Bewear': 'Stufful',
  'Steenee': 'Bounsweet',
  'Tsareena': 'Steenee',
  'Golisopod': 'Wimpod',
  'Palossand': 'Sandygast',
  'Silvally': 'Type: Null',
  'Hakamo-o': 'Jangmo-o',
  'Kommo-o': 'Hakamo-o',
  'Cosmoem': 'Cosmog',
  'Solgaleo': 'Cosmoem',
  'Lunala': 'Cosmoem',
  'Melmetal': 'Meltan',

  // Gen 8
  'Thwackey': 'Grookey',
  'Rillaboom': 'Thwackey',
  'Raboot': 'Scorbunny',
  'Cinderace': 'Raboot',
  'Drizzile': 'Sobble',
  'Inteleon': 'Drizzile',
  'Greedent': 'Skwovet',
  'Corvisquire': 'Rookidee',
  'Corviknight': 'Corvisquire',
  'Dottler': 'Blipbug',
  'Orbeetle': 'Dottler',
  'Thievul': 'Nickit',
  'Eldegoss': 'Gossifleur',
  'Dubwool': 'Wooloo',
  'Drednaw': 'Chewtle',
  'Boltund': 'Yamper',
  'Carkol': 'Rolycoly',
  'Coalossal': 'Carkol',
  'Flapple': 'Applin',
  'Appletun': 'Applin',
  'Dipplin': 'Applin',
  'Hydrapple': 'Dipplin',
  'Sandaconda': 'Silicobra',
  'Barraskewda': 'Arrokuda',
  'Toxtricity': 'Toxel',
  'Centiskorch': 'Sizzlipede',
  'Grapploct': 'Clobbopus',
  'Polteageist': 'Sinistea',
  'Hattrem': 'Hatenna',
  'Hatterene': 'Hattrem',
  'Morgrem': 'Impidimp',
  'Grimmsnarl': 'Morgrem',
  'Alcremie': 'Milcery',
  'Frosmoth': 'Snom',
  'Copperajah': 'Cufant',
  'Drakloak': 'Dreepy',
  'Dragapult': 'Drakloak',

  // Gen 9
  'Floragato': 'Sprigatito',
  'Meowscarada': 'Floragato',
  'Crocalor': 'Fuecoco',
  'Skeledirge': 'Crocalor',
  'Quaxwell': 'Quaxly',
  'Quaquaval': 'Quaxwell',
  'Oinkologne': 'Lechonk',
  'Lokix': 'Nymble',
  'Pawmo': 'Pawmi',
  'Pawmot': 'Pawmo',
  'Maushold': 'Tandemaus',
  'Dachsbun': 'Fidough',
  'Dolliv': 'Smoliv',
  'Arboliva': 'Dolliv',
  'Naclstack': 'Nacli',
  'Garganacl': 'Naclstack',
  'Armarouge': 'Charcadet',
  'Ceruledge': 'Charcadet',
  'Bellibolt': 'Tadbulb',
  'Kilowattrel': 'Wattrel',
  'Mabosstiff': 'Maschiff',
  'Grafaiai': 'Shroodle',
  'Scovillain': 'Capsakid',
  'Rabsca': 'Rellor',
  'Espathra': 'Flittle',
  'Tinkatuff': 'Tinkatink',
  'Tinkaton': 'Tinkatuff',
  'Wugtrio': 'Wiglett',
  'Palafin': 'Finizen',
  'Revavroom': 'Varoom',
  'Gholdengo': 'Gimmighoul',
  'Arctibax': 'Frigibax',
  'Baxcalibur': 'Arctibax'
};

export const MODAL_FORMS_SPECIES = ['Unown', 'Vivillon', 'Spinda', 'Furfrou'];
`;
        }

        const fullTsContent = tsContent + extraContent;

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, fullTsContent, 'utf-8');

        console.log(`[Admin] Configurazione salvata con successo da localhost.`);
        res.json({ success: true, message: 'Configurazione salvata con successo.' });
      } catch (err) {
        console.error('Errore nel salvataggio della configurazione:', err);
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    async function performShinyAutoSync(): Promise<string[]> {
      // Helper per la normalizzazione dei nomi per il confronto robusto
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
      const shinyData = await response.json() as Record<string, { id: number; name: string }>;

      const releasedShinyNames = new Set(
        Object.values(shinyData).map(p => p.name.trim())
      );
      const cleanedReleasedShinyNames = new Set(
        Array.from(releasedShinyNames).map(name => cleanStringForMatch(name))
      );

      const seedPath = path.join(__dirname, 'pokemon.json');
      if (!fs.existsSync(seedPath)) {
        throw new Error('File pokemon.json non trovato');
      }
      const pokemonData = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as Array<{ name: string }>;

      const shinyUnreleasedSet = new Set<string>();
      for (const p of pokemonData) {
        const baseName = p.name.split(' (')[0];
        const cleanedBaseName = cleanStringForMatch(baseName);

        if (!cleanedReleasedShinyNames.has(cleanedBaseName)) {
          shinyUnreleasedSet.add(baseName);
        }
      }

      const shinyUnreleasedCapable = Array.from(shinyUnreleasedSet).sort();

      // Legge le altre liste capaci per non sovrascriverle
      let shadowCapable: string[] = [];
      let megaCapable: string[] = [];
      let gigamaxCapable: string[] = [];
      let unreleasedCapable: string[] = [];

      if (fs.existsSync(configPath)) {
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

        shadowCapable = extractArray(content, 'SHADOW_CAPABLE_SPECIES');
        megaCapable = extractArray(content, 'MEGA_CAPABLE_SPECIES');
        gigamaxCapable = extractArray(content, 'GIGAMAX_CAPABLE_SPECIES');
        unreleasedCapable = extractArray(content, 'UNRELEASED_SPECIES');
      }

      const shadowLines = shadowCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
      const megaLines = megaCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
      const gigaLines = gigamaxCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
      const unreleasedLines = unreleasedCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
      const shinyUnreleasedLines = shinyUnreleasedCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');

      const tsContent = `export const SHADOW_CAPABLE_SPECIES = [
${shadowLines}
];

export const MEGA_CAPABLE_SPECIES = [
${megaLines}
];

export const GIGAMAX_CAPABLE_SPECIES = [
${gigaLines}
];

export const UNRELEASED_SPECIES = [
${unreleasedLines}
];

export const SHINY_UNRELEASED_SPECIES = [
${shinyUnreleasedLines}
];
`;

      let extraContent = '';
      if (fs.existsSync(configPath)) {
        const oldContent = fs.readFileSync(configPath, 'utf-8');
        const mythicalIndex = oldContent.indexOf('export const MYTHICAL_POKEMON');
        if (mythicalIndex !== -1) {
          extraContent = oldContent.substring(mythicalIndex);
        }
      }

      if (!extraContent.includes('export const MYTHICAL_POKEMON') || !extraContent.includes('export const EVOLVES_FROM') || !extraContent.includes('export const MODAL_FORMS_SPECIES')) {
        extraContent = `export const MYTHICAL_POKEMON = [
  'Mew', 'Celebi', 'Jirachi', 'Deoxys', 'Phione', 'Manaphy', 'Darkrai', 'Shaymin', 'Arceus',
  'Victini', 'Meloetta', 'Genesect', 'Keldeo', 'Diancie', 'Hoopa', 'Volcanion', 'Magearna',
  'Marshadow', 'Zeraora', 'Meltan', 'Melmetal', 'Zarude', 'Pecharunt'
];

export const LEGENDARY_POKEMON = [
  'Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Raikou', 'Entei', 'Suicune', 'Lugia', 'Ho-Oh',
  'Regirock', 'Regice', 'Registeel', 'Latias', 'Latios', 'Kyogre', 'Groudon', 'Rayquaza',
  'Uxie', 'Mesprit', 'Azelf', 'Dialga', 'Palkia', 'Heatran', 'Regigigas', 'Giratina', 'Cresselia',
  'Cobalion', 'Terrakion', 'Virizion', 'Tornadus', 'Thundurus', 'Reshiram', 'Zekrom', 'Landorus',
  'Kyurem', 'Xerneas', 'Yveltal', 'Zygarde', 'Type: Null', 'Silvally', 'Tapu Koko', 'Tapu Lele',
  'Tapu Bulu', 'Tapu Fini', 'Cosmog', 'Cosmoem', 'Solgaleo', 'Lunala', 'Necrozma', 'Zacian',
  'Zamazenta', 'Eternatus', 'Kubfu', 'Urshifu', 'Regieleki', 'Regidrago', 'Glastrier', 'Spectrier',
  'Calyrex', 'Enamorus', 'Wo-Chien', 'Chien-Pao', 'Ting-Lu', 'Chi-Yu', 'Koraidon', 'Miraidon',
  'Okidogi', 'Munkidori', 'Fezandipiti', 'Ogerpon', 'Gouging Fire', 'Raging Bolt', 'Iron Boulder',
  'Iron Crown', 'Terapagos'
];

export const ULTRA_BEASTS = [
  'Nihilego', 'Buzzwole', 'Pheromosa', 'Xurkitree', 'Celesteela', 'Kartana', 'Guzzlord',
  'Poipole', 'Naganadel', 'Stakataka', 'Blacephalon'
];

export const EVOLVES_FROM: Record<string, string> = {
  // Gen 1
  'Ivysaur': 'Bulbasaur',
  'Venusaur': 'Ivysaur',
  'Charmeleon': 'Charmander',
  'Charizard': 'Charmeleon',
  'Wartortle': 'Squirtle',
  'Blastoise': 'Wartortle',
  'Metapod': 'Caterpie',
  'Butterfree': 'Metapod',
  'Kakuna': 'Weedle',
  'Beedrill': 'Kakuna',
  'Pidgeotto': 'Pidgey',
  'Pidgeot': 'Pidgeotto',
  'Raticate': 'Rattata',
  'Fearow': 'Spearow',
  'Arbok': 'Ekans',
  'Raichu': 'Pikachu',
  'Pikachu': 'Pichu',
  'Sandslash': 'Sandshrew',
  'Nidorina': 'Nidoran♀',
  'Nidoqueen': 'Nidorina',
  'Nidorino': 'Nidoran♂',
  'Nidoking': 'Nidorino',
  'Clefairy': 'Cleffa',
  'Clefable': 'Clefairy',
  'Jigglypuff': 'Igglybuff',
  'Wigglytuff': 'Jigglypuff',
  'Golbat': 'Zubat',
  'Crobat': 'Golbat',
  'Gloom': 'Oddish',
  'Vileplume': 'Gloom',
  'Bellossom': 'Gloom',
  'Parasect': 'Paras',
  'Venomoth': 'Venonat',
  'Dugtrio': 'Diglett',
  'Persian': 'Meowth',
  'Perrserker': 'Meowth',
  'Golduck': 'Psyduck',
  'Primeape': 'Mankey',
  'Annihilape': 'Primeape',
  'Arcanine': 'Growlithe',
  'Poliwhirl': 'Poliwag',
  'Poliwrath': 'Poliwhirl',
  'Politoed': 'Poliwhirl',
  'Kadabra': 'Abra',
  'Alakazam': 'Kadabra',
  'Machoke': 'Machop',
  'Machamp': 'Machoke',
  'Weepinbell': 'Bellsprout',
  'Tentacruel': 'Tentacool',
  'Graveler': 'Geodude',
  'Golem': 'Graveler',
  'Rapidash': 'Ponyta',
  'Slowbro': 'Slowpoke',
  'Slowking': 'Slowpoke',
  'Magneton': 'Magnemite',
  'Magnezone': 'Magneton',
  'Sirfetch\\'d': 'Farfetch\\'d',
  'Dodrio': 'Doduo',
  'Dewgong': 'Seel',
  'Muk': 'Grimer',
  'Haunter': 'Gastly',
  'Gengar': 'Haunter',
  'Steelix': 'Onix',
  'Hypno': 'Drowzee',
  'Kingler': 'Krabby',
  'Electrode': 'Voltorb',
  'Exeggutor': 'Exeggcute',
  'Marowak': 'Cubone',
  'Hitmonlee': 'Tyrogue',
  'Hitmonchan': 'Tyrogue',
  'Hitmontop': 'Tyrogue',
  'Lickilicky': 'Lickitung',
  'Weezing': 'Koffing',
  'Rhydon': 'Rhyhorn',
  'Rhyperior': 'Rhydon',
  'Chansey': 'Happiny',
  'Blissey': 'Chansey',
  'Tangrowth': 'Tangela',
  'Seadra': 'Horsea',
  'Kingdra': 'Seadra',
  'Seaking': 'Goldeen',
  'Starmie': 'Staryu',
  'Mr. Mr. Mr. Mr. Mr. Mime': 'Mime Jr.',
  'Mr. Rime': 'Mr. Mime',
  'Scizor': 'Scyther',
  'Kleavor': 'Scyther',
  'Jynx': 'Smoochum',
  'Electabuzz': 'Elekid',
  'Electivire': 'Electabuzz',
  'Magmar': 'Magby',
  'Magmortar': 'Magmar',
  'Gyarados': 'Magikarp',
  'Vaporeon': 'Eevee',
  'Jolteon': 'Eevee',
  'Flareon': 'Eevee',
  'Espeon': 'Eevee',
  'Umbreon': 'Eevee',
  'Leafeon': 'Eevee',
  'Glaceon': 'Eevee',
  'Sylveon': 'Eevee',
  'Porygon2': 'Porygon',
  'Porygon-Z': 'Porygon2',
  'Omastar': 'Omanyte',
  'Kabutops': 'Kabuto',
  'Snorlax': 'Munchlax',
  'Dragonair': 'Dratini',
  'Dragonite': 'Dragonair',

  // Gen 2
  'Bayleef': 'Chikorita',
  'Meganium': 'Bayleef',
  'Quilava': 'Cyndaquil',
  'Typhlosion': 'Quilava',
  'Croconaw': 'Totodile',
  'Feraligatr': 'Croconaw',
  'Furret': 'Sentret',
  'Noctowl': 'Hoothoot',
  'Ledian': 'Ledyba',
  'Ariados': 'Spinarak',
  'Lanturn': 'Chinchou',
  'Togetic': 'Togepi',
  'Togekiss': 'Togetic',
  'Xatu': 'Natu',
  'Flaaffy': 'Mareep',
  'Ampharos': 'Flaaffy',
  'Azumarill': 'Marill',
  'Marill': 'Azurill',
  'Sudowoodo': 'Bonsly',
  'Jumpluff': 'Skiploom',
  'Skiploom': 'Hoppip',
  'Sunflora': 'Sunkern',
  'Quagsire': 'Wooper',
  'Wobbuffet': 'Wynaut',
  'Farigiraf': 'Girafarig',
  'Forretress': 'Pineco',
  'Dudunsparce': 'Dunsparce',
  'Granbull': 'Snubbull',
  'Ursaring': 'Teddiursa',
  'Ursaluna': 'Ursaring',
  'Magcargo': 'Slugma',
  'Piloswine': 'Swinub',
  'Mamoswine': 'Piloswine',
  'Octillery': 'Remoraid',
  'Mantine': 'Mantyke',
  'Houndoom': 'Houndour',
  'Donphan': 'Phanpy',
  'Pupitar': 'Larvitar',
  'Tyranitar': 'Pupitar',

  // Gen 3
  'Grovyle': 'Treecko',
  'Sceptile': 'Grovyle',
  'Combusken': 'Torchic',
  'Blaziken': 'Combusken',
  'Marshtomp': 'Mudkip',
  'Swampert': 'Marshtomp',
  'Mightyena': 'Poochyena',
  'Linoone': 'Zigzagoon',
  'Obstagoon': 'Linoone',
  'Beautifly': 'Silcoon',
  'Silcoon': 'Wurmple',
  'Dustox': 'Cascoon',
  'Cascoon': 'Wurmple',
  'Lombre': 'Lotad',
  'Ludicolo': 'Lombre',
  'Nuzleaf': 'Seedot',
  'Shiftry': 'Nuzleaf',
  'Swellow': 'Taillow',
  'Pelipper': 'Wingull',
  'Kirlia': 'Ralts',
  'Gardevoir': 'Kirlia',
  'Gallade': 'Kirlia',
  'Masquerain': 'Surskit',
  'Breloom': 'Shroomish',
  'Vigoroth': 'Slakoth',
  'Slaking': 'Vigoroth',
  'Ninjask': 'Nincada',
  'Shedinja': 'Nincada',
  'Loudred': 'Whismur',
  'Exploud': 'Loudred',
  'Hariyama': 'Makuhita',
  'Delcatty': 'Skitty',
  'Lairon': 'Aron',
  'Aggron': 'Lairon',
  'Medicham': 'Meditite',
  'Manectric': 'Electrike',
  'Roselia': 'Budew',
  'Roserade': 'Roselia',
  'Swalot': 'Gulpin',
  'Sharpedo': 'Carvanha',
  'Wailord': 'Wailmer',
  'Camerupt': 'Numel',
  'Grumpig': 'Spoink',
  'Vibrava': 'Trapinch',
  'Flygon': 'Vibrava',
  'Cacturne': 'Cacnea',
  'Altaria': 'Swablu',
  'Crawdaunt': 'Corphish',
  'Claydol': 'Baltoy',
  'Cradily': 'Lileep',
  'Armaldo': 'Anorith',
  'Milotic': 'Feebas',
  'Banette': 'Shuppet',
  'Dusclops': 'Duskull',
  'Dusknoir': 'Dusclops',
  'Chimecho': 'Chingling',
  'Glalie': 'Snorunt',
  'Froslass': 'Snorunt',
  'Sealeo': 'Spheal',
  'Walrein': 'Sealeo',
  'Huntail': 'Clamperl',
  'Gorebyss': 'Clamperl',
  'Shelgon': 'Bagon',
  'Salamence': 'Shelgon',
  'Metang': 'Beldum',
  'Metagross': 'Metang',

  // Gen 4
  'Grotle': 'Turtwig',
  'Torterra': 'Grotle',
  'Monferno': 'Chimchar',
  'Infernape': 'Monferno',
  'Prinplup': 'Piplup',
  'Empoleon': 'Prinplup',
  'Staravia': 'Starly',
  'Staraptor': 'Staravia',
  'Bibarel': 'Bidoof',
  'Kricketune': 'Kricketot',
  'Luxio': 'Shinx',
  'Luxray': 'Luxio',
  'Rampardos': 'Cranidos',
  'Bastiodon': 'Shieldon',
  'Wormadam': 'Burmy',
  'Mothim': 'Burmy',
  'Vespiquen': 'Combee',
  'Floatzel': 'Buizel',
  'Cherrim': 'Cherubi',
  'Gastrodon': 'Shellos',
  'Ambipom': 'Aipom',
  'Drifblim': 'Drifloon',
  'Lopunny': 'Buneary',
  'Mismagius': 'Misdreavus',
  'Honchkrow': 'Murkrow',
  'Purugly': 'Glameow',
  'Skuntank': 'Stunky',
  'Bronzong': 'Bronzor',
  'Lucario': 'Riolu',
  'Hippowdon': 'Hippopotas',
  'Drapion': 'Skorupi',
  'Toxicroak': 'Croagunk',
  'Lumineon': 'Finneon',
  'Abomasnow': 'Snover',
  'Weavile': 'Sneasel',
  'Sneasler': 'Sneasel',
  'Yanmega': 'Yanma',
  'Gliscor': 'Gligar',

  // Gen 5
  'Servine': 'Snivy',
  'Serperior': 'Servine',
  'Pignite': 'Tepig',
  'Emboar': 'Pignite',
  'Dewott': 'Oshawott',
  'Samurott': 'Dewott',
  'Watchog': 'Patrat',
  'Herdier': 'Lillipup',
  'Stoutland': 'Herdier',
  'Liepard': 'Purrloin',
  'Simisage': 'Pansage',
  'Simisear': 'Pansear',
  'Simipour': 'Panpour',
  'Musharna': 'Munna',
  'Tranquill': 'Pidove',
  'Unfezant': 'Tranquill',
  'Zebstrika': 'Blitzle',
  'Boldore': 'Roggenrola',
  'Gigalith': 'Boldore',
  'Swoobat': 'Woobat',
  'Excadrill': 'Drilbur',
  'Gurdurr': 'Timburr',
  'Conkeldurr': 'Gurdurr',
  'Palpitoad': 'Tympole',
  'Seismitoad': 'Palpitoad',
  'Swadloon': 'Sewaddle',
  'Leavanny': 'Swadloon',
  'Whimsicott': 'Cottonee',
  'Lilligant': 'Petilil',
  'Krokorok': 'Sandile',
  'Krookodile': 'Krokorok',
  'Darmanitan': 'Darumaka',
  'Crustle': 'Dwebble',
  'Scrafty': 'Scraggy',
  'Cofagrigus': 'Yamask',
  'Carracosta': 'Tirtouga',
  'Archeops': 'Archen',
  'Garbodor': 'Trubbish',
  'Zoroark': 'Zorua',
  'Cinccino': 'Minccino',
  'Gothorita': 'Gothita',
  'Gothitelle': 'Gothorita',
  'Duosion': 'Solosis',
  'Reuniclus': 'Duosion',
  'Swanna': 'Ducklett',
  'Vanillish': 'Vanillite',
  'Vanilluxe': 'Vanillish',
  'Sawsbuck': 'Deerling',
  'Escavalier': 'Karrablast',
  'Amoonguss': 'Foongus',
  'Jellicent': 'Frillish',
  'Galvantula': 'Joltik',
  'Ferrothorn': 'Ferroseed',
  'Klang': 'Klink',
  'Klinklang': 'Klang',
  'Eelektrik': 'Tynamo',
  'Eelektross': 'Eelektrik',
  'Beheeyem': 'Elgyem',
  'Lampent': 'Litwick',
  'Chandelure': 'Lampent',
  'Fraxure': 'Axew',
  'Haxorus': 'Fraxure',
  'Beartic': 'Cubchoo',
  'Accelgor': 'Shelmet',
  'Mienshao': 'Mienfoo',
  'Golurk': 'Golett',
  'Bisharp': 'Pawniard',
  'Kingambit': 'Bisharp',
  'Braviary': 'Rufflet',
  'Mandibuzz': 'Vullaby',
  'Zweilous': 'Deino',
  'Hydreigon': 'Zweilous',
  'Volcarona': 'Larvesta',

  // Gen 6
  'Quilladin': 'Chespin',
  'Chesnaught': 'Quilladin',
  'Braixen': 'Fennekin',
  'Delphox': 'Braixen',
  'Frogadier': 'Froakie',
  'Greninja': 'Frogadier',
  'Diggersby': 'Bunnelby',
  'Fletchinder': 'Fletchling',
  'Talonflame': 'Fletchinder',
  'Spewpa': 'Scatterbug',
  'Vivillon': 'Spewpa',
  'Pyroar': 'Litleo',
  'Floette': 'Flabebe',
  'Florges': 'Floette',
  'Gogoat': 'Skiddo',
  'Pangoro': 'Pancham',
  'Meowstic': 'Espurr',
  'Doublade': 'Honedge',
  'Aegislash': 'Doublade',
  'Aromatisse': 'Spritzee',
  'Slurpuff': 'Swirlix',
  'Malamar': 'Inkay',
  'Barbaracle': 'Binacle',
  'Dragalge': 'Skrelp',
  'Clawitzer': 'Clauncher',
  'Heliolisk': 'Helioptile',
  'Tyrantrum': 'Tyrunt',
  'Aurorus': 'Amaura',
  'Sliggoo': 'Goomy',
  'Goodra': 'Sliggoo',
  'Trevenant': 'Phantump',
  'Gourgeist': 'Pumpkaboo',
  'Avalugg': 'Bergmite',
  'Noivern': 'Noibat',

  // Gen 7
  'Dartrix': 'Rowlet',
  'Decidueye': 'Dartrix',
  'Torracat': 'Litten',
  'Incineroar': 'Torracat',
  'Brionne': 'Popplio',
  'Primarina': 'Brionne',
  'Trumbeak': 'Pikipek',
  'Toucannon': 'Trumbeak',
  'Gumshoos': 'Yungoos',
  'Charjabug': 'Grubbin',
  'Vikavolt': 'Charjabug',
  'Crabominable': 'Crabrawler',
  'Ribombee': 'Cutiefly',
  'Lycanroc': 'Rockruff',
  'Toxapex': 'Mareanie',
  'Mudsdale': 'Mudbray',
  'Araquanid': 'Dewpider',
  'Lurantis': 'Fomantis',
  'Shiinotic': 'Morelull',
  'Salazzle': 'Salandit',
  'Bewear': 'Stufful',
  'Steenee': 'Bounsweet',
  'Tsareena': 'Steenee',
  'Golisopod': 'Wimpod',
  'Palossand': 'Sandygast',
  'Silvally': 'Type: Null',
  'Hakamo-o': 'Jangmo-o',
  'Kommo-o': 'Hakamo-o',
  'Cosmoem': 'Cosmog',
  'Solgaleo': 'Cosmoem',
  'Lunala': 'Cosmoem',
  'Melmetal': 'Meltan',

  // Gen 8
  'Thwackey': 'Grookey',
  'Rillaboom': 'Thwackey',
  'Raboot': 'Scorbunny',
  'Cinderace': 'Raboot',
  'Drizzile': 'Sobble',
  'Inteleon': 'Drizzile',
  'Greedent': 'Skwovet',
  'Corvisquire': 'Rookidee',
  'Corviknight': 'Corvisquire',
  'Dottler': 'Blipbug',
  'Orbeetle': 'Dottler',
  'Thievul': 'Nickit',
  'Eldegoss': 'Gossifleur',
  'Dubwool': 'Wooloo',
  'Drednaw': 'Chewtle',
  'Boltund': 'Yamper',
  'Carkol': 'Rolycoly',
  'Coalossal': 'Carkol',
  'Flapple': 'Applin',
  'Appletun': 'Applin',
  'Dipplin': 'Applin',
  'Hydrapple': 'Dipplin',
  'Sandaconda': 'Silicobra',
  'Barraskewda': 'Arrokuda',
  'Toxtricity': 'Toxel',
  'Centiskorch': 'Sizzlipede',
  'Grapploct': 'Clobbopus',
  'Polteageist': 'Sinistea',
  'Hattrem': 'Hatenna',
  'Hatterene': 'Hattrem',
  'Morgrem': 'Impidimp',
  'Grimmsnarl': 'Morgrem',
  'Alcremie': 'Milcery',
  'Frosmoth': 'Snom',
  'Copperajah': 'Cufant',
  'Drakloak': 'Dreepy',
  'Dragapult': 'Drakloak',

  // Gen 9
  'Floragato': 'Sprigatito',
  'Meowscarada': 'Floragato',
  'Crocalor': 'Fuecoco',
  'Skeledirge': 'Crocalor',
  'Quaxwell': 'Quaxly',
  'Quaquaval': 'Quaxwell',
  'Oinkologne': 'Lechonk',
  'Lokix': 'Nymble',
  'Pawmo': 'Pawmi',
  'Pawmot': 'Pawmo',
  'Maushold': 'Tandemaus',
  'Dachsbun': 'Fidough',
  'Dolliv': 'Smoliv',
  'Arboliva': 'Dolliv',
  'Naclstack': 'Nacli',
  'Garganacl': 'Naclstack',
  'Armarouge': 'Charcadet',
  'Ceruledge': 'Charcadet',
  'Bellibolt': 'Tadbulb',
  'Kilowattrel': 'Wattrel',
  'Mabosstiff': 'Maschiff',
  'Grafaiai': 'Shroodle',
  'Scovillain': 'Capsakid',
  'Rabsca': 'Rellor',
  'Espathra': 'Flittle',
  'Tinkatuff': 'Tinkatink',
  'Tinkaton': 'Tinkatuff',
  'Wugtrio': 'Wiglett',
  'Palafin': 'Finizen',
  'Revavroom': 'Varoom',
  'Gholdengo': 'Gimmighoul',
  'Arctibax': 'Frigibax',
  'Baxcalibur': 'Arctibax'
};

export const MODAL_FORMS_SPECIES = ['Unown', 'Vivillon', 'Spinda', 'Furfrou'];
`;
      }

      const fullTsContent = tsContent + extraContent;

      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, fullTsContent, 'utf-8');

      console.log(`[Auto-Sync] Shiny auto-sincronizzati con successo su disk. Trovati ${shinyUnreleasedCapable.length} shiny non rilasciati.`);
      return shinyUnreleasedCapable;
    }

    // =================================================================
    // 9. POST /api/admin/sync-shinies - Sincronizza automaticamente gli shiny da PoGoAPI (Solo Locale)
    // =================================================================
    app.post('/api/admin/sync-shinies', async (req, res) => {
      if (!isLocalRequest(req)) {
        return res.status(403).json({ error: 'Accesso Negato: questa console di amministrazione è disponibile esclusivamente in ambiente locale.' });
      }

      try {
        const shinyUnreleasedCapable = await performShinyAutoSync();
        res.json({ success: true, shinyUnreleasedCapable });
      } catch (err) {
        console.error('Errore nella sincronizzazione automatica degli shiny:', err);
        res.status(500).json({ error: 'Errore durante la sincronizzazione automatica con PoGoAPI: ' + String(err) });
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

      // 10. Esegui la sincronizzazione automatica degli shiny all'avvio in background
      setTimeout(async () => {
        try {
          console.log('[Startup Background Worker] Avvio sincronizzazione Shiny programmata...');
          await performShinyAutoSync();
          console.log('[Startup Background Worker] Sincronizzazione Shiny iniziale completata con successo.');
        } catch (err) {
          console.error('[Startup Background Worker] Impossibile eseguire la sincronizzazione automatica Shiny all\'avvio:', err);
        }
      }, 5000); // Ritardo di 5 secondi per far avviare il server liberamente

      // 11. Esegui la sincronizzazione automatica ogni 24 ore
      setInterval(async () => {
        try {
          console.log('[Periodic Background Worker] Avvio sincronizzazione Shiny giornaliera...');
          await performShinyAutoSync();
          console.log('[Periodic Background Worker] Sincronizzazione Shiny giornaliera completata con successo.');
        } catch (err) {
          console.error('[Periodic Background Worker] Impossibile eseguire la sincronizzazione automatica Shiny periodica:', err);
        }
      }, 24 * 60 * 60 * 1000); // 24 ore
    });

  } catch (err) {
    console.error('Errore fatale all\'avvio del server:', err);
    process.exit(1);
  }
}

startServer();
