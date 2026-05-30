import express from 'express';
import cors from 'cors';
import path from 'path';
import { getDb } from './db';
import { runSeeder } from './seed';
import { PokedexDTO, User } from './types';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8085;
const host = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

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
            gigamax: entry ? !!entry.gigamax : false
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
          gigamax: dto.gigamax
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
