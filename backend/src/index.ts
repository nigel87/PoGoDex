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

      try {
        const pokemons = await db.all('SELECT * FROM pokemons ORDER BY id ASC');
        const entries = await db.all('SELECT * FROM pokedex_entries WHERE userId = ?', userId);
        
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
            gigamaxVarietyId: p.gigamaxVarietyId || null
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
          gigamaxVarietyId: pokemon.gigamaxVarietyId || null
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
        log('INFO', `Bulk import completato`, { userId, category, count: validIds.length, skipped });
        res.json({ success: true, count: validIds.length, skipped });
      } catch (err) {
        try { await db.run('ROLLBACK'); } catch (_) {}
        log('ERROR', 'Errore nell\'importazione massiva', { err: String(err), userId, category });
        res.status(500).json({ error: 'Errore interno del server' });
      }
    });

    // Helper per verificare se la richiesta proviene da localhost (loopback)
    function isLocalRequest(req: express.Request): boolean {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
    }

    const configPath = path.join(__dirname, '../../frontend/src/app/services/pokemon-config.ts');

    // =================================================================
    // 7. GET /api/admin/config - Carica le liste capaci (Solo Locale)
    // =================================================================
    app.get('/api/admin/config', (req, res) => {
      if (!isLocalRequest(req)) {
        return res.status(403).json({ error: 'Accesso Negato: questa console di amministrazione è disponibile esclusivamente in ambiente locale.' });
      }

      try {
        if (!fs.existsSync(configPath)) {
          return res.json({ shadowCapable: [], megaCapable: [], gigamaxCapable: [], unreleasedCapable: [] });
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

        res.json({ shadowCapable, megaCapable, gigamaxCapable, unreleasedCapable });
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

      const { shadowCapable, megaCapable, gigamaxCapable, unreleasedCapable } = req.body;

      if (!Array.isArray(shadowCapable) || !Array.isArray(megaCapable) || !Array.isArray(gigamaxCapable) || !Array.isArray(unreleasedCapable)) {
        return res.status(400).json({ error: 'Formato dati non valido' });
      }

      try {
        const shadowLines = shadowCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
        const megaLines = megaCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
        const gigaLines = gigamaxCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');
        const unreleasedLines = unreleasedCapable.map(name => `  '${name.replace(/'/g, "\\'")}'`).join(',\n');

        let shinyUnreleasedLines = '';
        try {
          if (fs.existsSync(configPath)) {
            const currentContent = fs.readFileSync(configPath, 'utf-8');
            const regex = /export\s+const\s+SHINY_UNRELEASED_SPECIES\s*=\s*\[([\s\S]*?)\];/;
            const match = currentContent.match(regex);
            if (match) {
              shinyUnreleasedLines = match[1].trim();
            }
          }
        } catch (_) {}

        if (!shinyUnreleasedLines) {
          shinyUnreleasedLines = `  'Grookey', 'Thwackey', 'Rillaboom', 'Scorbunny', 'Raboot', 'Cinderace', 'Sobble', 'Drizzile', 'Inteleon',
  'Sprigatito', 'Floragato', 'Meowscarada', 'Fuecoco', 'Crocalor', 'Skeledirge', 'Quaxly', 'Quaxwell', 'Quaquaval',
  'Victini', 'Keldeo', 'Meloetta', 'Honedge', 'Doublade', 'Aegislash', 'Hoopa', 'Volcanion', 'Magearna', 'Marshadow',
  'Cosmog', 'Cosmoem', 'Poipole', 'Naganadel', 'Stakataka', 'Blacephalon', 'Nickit', 'Thievul', 'Yamper', 'Boltund',
  'Gossifleur', 'Eldegoss', 'Rolycoly', 'Carkol', 'Coalossal', 'Applin', 'Flapple', 'Appletun', 'Cramorant',
  'Sizzlipede', 'Centiskorch', 'Clobbopus', 'Grapploct', 'Sinistea', 'Polteageist', 'Hatenna', 'Hattrem', 'Hatterene',
  'Snom', 'Frosmoth', 'Stonjourner', 'Indeedee', 'Morpeko', 'Cufant', 'Copperajah', 'Duraludon', 'Dreepy', 'Drakloak',
  'Dragapult', 'Eternatus', 'Kubfu', 'Urshifu', 'Zarude', 'Regieleki', 'Regidrago', 'Spectrier', 'Glastrier', 'Calyrex', 'Enamorus',
  'Pawmi', 'Pawmo', 'Pawmot', 'Tarountula', 'Spidops', 'Nymble', 'Lokix', 'Tandemaus', 'Maushold', 'Fidough', 'Dachsbun',
  'Smoliv', 'Dolliv', 'Arboliva', 'Nacli', 'Naclstack', 'Garganacl', 'Charcadet', 'Armarouge', 'Ceruledge', 'Tadbulb', 'Bellibolt',
  'Wattrel', 'Kilowattrel', 'Shroodle', 'Grafaiai', 'Toedscool', 'Toedscruel', 'Klawf', 'Wiglett', 'Wugtrio', 'Flittle',
  'Espathra', 'Tinkatink', 'Tinkatuff', 'Tinkaton', 'Varoom', 'Revavroom', 'Orthworm', 'Glimmet', 'Glimmora', 'Greavard',
  'Houndstone', 'Flamigo', 'Cetoddle', 'Cetitan', 'Dondozo', 'Kingambit', 'Frigibax', 'Arctibax', 'Baxcalibur', 'Dipplin'`;
        }

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

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, tsContent, 'utf-8');

        console.log(`[Admin] Configurazione salvata con successo da localhost.`);
        res.json({ success: true, message: 'Configurazione salvata con successo.' });
      } catch (err) {
        console.error('Errore nel salvataggio della configurazione:', err);
        res.status(500).json({ error: 'Errore interno del server' });
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
    });

  } catch (err) {
    console.error('Errore fatale all\'avvio del server:', err);
    process.exit(1);
  }
}

startServer();
