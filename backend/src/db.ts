import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

let db: Database | null = null;

/**
 * Recupera o inizializza la connessione al database SQLite.
 */
export async function getDb(): Promise<Database> {
  if (db) {
    return db;
  }

  const dbDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'pogodex.sqlite');

  // Connette al database SQLite
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Abilita il supporto alle chiavi esterne in SQLite
  await db.exec('PRAGMA foreign_keys = ON;');

  // Esegue le DDL per inizializzare le tabelle
  await initializeTables(db);

  return db;
}

async function initializeTables(database: Database) {
  // Tabella schema_migrations
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      executedAt INTEGER NOT NULL
    );
  `);

  // Tabella Users
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      email TEXT,
      googleId TEXT,
      avatarUrl TEXT,
      lastUpdated INTEGER DEFAULT 0,
      googleSubId TEXT UNIQUE,
      isProtected INTEGER DEFAULT 0,
      privacyMode TEXT DEFAULT 'public_edit'
    );
  `);

  // Tabella Pokemons
  await database.exec(`
    CREATE TABLE IF NOT EXISTS pokemons (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type1 TEXT NOT NULL,
      type2 TEXT,
      generation INTEGER NOT NULL,
      spriteUrl TEXT NOT NULL,
      megaVarietyId INTEGER DEFAULT NULL,
      megaVarietyId2 INTEGER DEFAULT NULL,
      gigamaxVarietyId INTEGER DEFAULT NULL,
      parentId INTEGER DEFAULT NULL
    );
  `);

  // Esegue migrazioni safe per database preesistenti
  try {
    await database.exec('ALTER TABLE users ADD COLUMN lastUpdated INTEGER DEFAULT 0;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE users ADD COLUMN googleSubId TEXT DEFAULT NULL;');
  } catch (_) {}
  try {
    await database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_googleSubId ON users(googleSubId);');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE users ADD COLUMN isProtected INTEGER DEFAULT 0;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE users ADD COLUMN privacyMode TEXT DEFAULT "public_edit";');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE users ADD COLUMN avatarUrl TEXT DEFAULT NULL;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE users ADD COLUMN googleId TEXT DEFAULT NULL;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE pokemons ADD COLUMN megaVarietyId INTEGER DEFAULT NULL;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE pokemons ADD COLUMN megaVarietyId2 INTEGER DEFAULT NULL;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE pokemons ADD COLUMN gigamaxVarietyId INTEGER DEFAULT NULL;');
  } catch (_) {}
  try {
    await database.exec('ALTER TABLE pokemons ADD COLUMN parentId INTEGER DEFAULT NULL;');
  } catch (_) {}

  // Tabella PokedexEntries (con spunte di cattura integer 0/1)
  await database.exec(`
    CREATE TABLE IF NOT EXISTS pokedex_entries (
      userId INTEGER NOT NULL,
      pokemonId INTEGER NOT NULL,
      regular INTEGER DEFAULT 0,
      shadow INTEGER DEFAULT 0,
      purified INTEGER DEFAULT 0,
      perfect INTEGER DEFAULT 0,
      lucky INTEGER DEFAULT 0,
      xxs INTEGER DEFAULT 0,
      xxl INTEGER DEFAULT 0,
      shiny INTEGER DEFAULT 0,
      mega INTEGER DEFAULT 0,
      gigamax INTEGER DEFAULT 0,
      PRIMARY KEY (userId, pokemonId),
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (pokemonId) REFERENCES pokemons (id) ON DELETE CASCADE
    );
  `);

  // Esegue migrazioni di dati in modo automatico se non ancora eseguite
  try {
    const migrationName = 'migrate_custom_form_ids_v1';
    const row = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM schema_migrations WHERE name = ?',
      migrationName
    );
    
    if (row && row.count === 0) {
      console.log(`[Database Migration] Esecuzione migrazione automatica degli ID in pokedex_entries: ${migrationName}...`);
      
      // Eseguiamo gli aggiornamenti ID in pokedex_entries
      await database.exec('BEGIN TRANSACTION;');
      
      // Sposta Unown
      await database.exec('UPDATE pokedex_entries SET pokemonId = pokemonId + 10059 WHERE pokemonId >= 10043 AND pokemonId <= 10069;');
      // Sposta Spinda 2-8
      await database.exec('UPDATE pokedex_entries SET pokemonId = pokemonId + 9922 WHERE pokemonId >= 10080 AND pokemonId <= 10086;');
      // Sposta Spinda 9
      await database.exec('UPDATE pokedex_entries SET pokemonId = 20009 WHERE pokemonId = 10278;');
      // Sposta Vivillon motivi
      await database.exec('UPDATE pokedex_entries SET pokemonId = pokemonId + 10075 WHERE pokemonId >= 10126 AND pokemonId <= 10142;');
      // Sposta Vivillon Fancy/Pokeball
      await database.exec('UPDATE pokedex_entries SET pokemonId = pokemonId + 9945 WHERE pokemonId >= 10273 AND pokemonId <= 10274;');
      // Sposta Furfrou tagli (Diamond e Debutante inclusi, liberando 10188 e 10189)
      await database.exec('UPDATE pokedex_entries SET pokemonId = pokemonId + 10115 WHERE pokemonId >= 10186 AND pokemonId <= 10194;');
      
      // Registriamo l'esecuzione della migrazione
      await database.run(
        'INSERT INTO schema_migrations (name, executedAt) VALUES (?, ?);',
        migrationName,
        Date.now()
      );
      
      await database.exec('COMMIT;');
      console.log(`[Database Migration] Migrazione ${migrationName} completata con successo!`);
    }

    // Nuova migrazione per creare e popolare la tabella delle quest
    const migrationNameQuests = 'create_quests_table_v2';
    const rowQuests = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM schema_migrations WHERE name = ?',
      migrationNameQuests
    );
    
    if (rowQuests && rowQuests.count === 0) {
      console.log(`[Database Migration] Esecuzione migrazione tabella quest e seed iniziale: ${migrationNameQuests}...`);
      
      await database.exec('BEGIN TRANSACTION;');
      
      // Creazione tabella
      await database.exec(`
        CREATE TABLE IF NOT EXISTS quests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          rewards TEXT NOT NULL,
          displayOrder INTEGER DEFAULT 0
        );
      `);

      // Default Quests
      const defaultQuests = [
        {
          name: "Cattura 7 Pokémon",
          rewards: JSON.stringify([
            { pokemonId: 129, minCp: 104, maxCp: 117 }, // Magikarp
            { pokemonId: 759, minCp: 540, maxCp: 588 }, // Stufful
            { pokemonId: 767, minCp: 206, maxCp: 231 }  // Wimpod
          ]),
          displayOrder: 1
        },
        {
          name: "Cattura 7 Pokémon di tipo Erba",
          rewards: JSON.stringify([
            { pokemonId: 1, minCp: 442, maxCp: 477 } // Bulbasaur
          ]),
          displayOrder: 2
        },
        {
          name: "Cattura 7 Pokémon di tipo Fuoco",
          rewards: JSON.stringify([
            { pokemonId: 4, minCp: 389, maxCp: 420 } // Charmander
          ]),
          displayOrder: 3
        },
        {
          name: "Cattura 7 Pokémon di tipo Acqua",
          rewards: JSON.stringify([
            { pokemonId: 7, minCp: 372, maxCp: 405 } // Squirtle
          ]),
          displayOrder: 4
        },
        {
          name: "Fai 3 bei tiri di fila",
          rewards: JSON.stringify([
            { pokemonId: 25, minCp: 395, maxCp: 429 } // Pikachu
          ]),
          displayOrder: 5
        },
        {
          name: "Fai 3 ottimi tiri di fila",
          rewards: JSON.stringify([
            { pokemonId: 147, minCp: 399, maxCp: 430 } // Dratini
          ]),
          displayOrder: 6
        },
        {
          name: "Usa 5 bacche per catturare Pokémon",
          rewards: JSON.stringify([
            { pokemonId: 92, minCp: 485, maxCp: 523 } // Gastly
          ]),
          displayOrder: 7
        },
        {
          name: "Potenzia un Pokémon 5 volte",
          rewards: JSON.stringify([
            { pokemonId: 220, minCp: 284, maxCp: 318 } // Swinub
          ]),
          displayOrder: 8
        },
        {
          name: "Sconfiggi 2 Reclute del Team GO Rocket",
          rewards: JSON.stringify([
            { pokemonId: 246, minCp: 402, maxCp: 445 } // Larvitar
          ]),
          displayOrder: 9
        },
        {
          name: "Gira 5 Pokéstop o Palestre",
          rewards: JSON.stringify([
            { pokemonId: 133, minCp: 424, maxCp: 459 } // Eevee
          ]),
          displayOrder: 10
        },
        {
          name: "Vinci 1 Raid",
          rewards: JSON.stringify([
            { pokemonId: 123, minCp: 1076, maxCp: 1160 } // Scyther
          ]),
          displayOrder: 11
        },
        {
          name: "Schiudi un uovo",
          rewards: JSON.stringify([
            { pokemonId: 349, minCp: 101, maxCp: 117 } // Feebas
          ]),
          displayOrder: 12
        },
        {
          name: "Fai 3 tiri curvi di fila",
          rewards: JSON.stringify([
            { pokemonId: 374, minCp: 379, maxCp: 418 } // Beldum
          ]),
          displayOrder: 13
        },
        {
          name: "Fai 5 ottimi tiri curvi di fila",
          rewards: JSON.stringify([
            { pokemonId: 443, minCp: 433, maxCp: 477 } // Gible
          ]),
          displayOrder: 14
        },
        {
          name: "Invia 3 Pacchi amicizia con un adesivo",
          rewards: JSON.stringify([
            { pokemonId: 371, minCp: 454, maxCp: 495 } // Bagon
          ]),
          displayOrder: 15
        }
      ];

      const stmt = await database.prepare('INSERT INTO quests (name, rewards, displayOrder) VALUES (?, ?, ?)');
      for (const q of defaultQuests) {
        await stmt.run(q.name, q.rewards, q.displayOrder);
      }
      await stmt.finalize();

      // Registriamo l'esecuzione della migrazione
      await database.run(
        'INSERT INTO schema_migrations (name, executedAt) VALUES (?, ?);',
        migrationNameQuests,
        Date.now()
      );
      
      await database.exec('COMMIT;');
      console.log(`[Database Migration] Migrazione ${migrationNameQuests} completata con successo!`);
    }

    // Nuova migrazione per creare e popolare la tabella delle uova
    const migrationNameEggs = 'create_eggs_table_v1';
    const rowEggs = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM schema_migrations WHERE name = ?',
      migrationNameEggs
    );
    
    if (rowEggs && rowEggs.count === 0) {
      console.log(`[Database Migration] Esecuzione migrazione tabella uova e seed iniziale: ${migrationNameEggs}...`);
      
      await database.exec('BEGIN TRANSACTION;');
      
      // Creazione tabella
      await database.exec(`
        CREATE TABLE IF NOT EXISTS eggs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          contents TEXT NOT NULL
        );
      `);

      // Default Eggs
      const defaultEggs = [
        {
          name: "Uovo da 2 km",
          type: "2km",
          contents: JSON.stringify([
            { pokemonId: 172, minCp: 240, maxCp: 270 }, // Pichu
            { pokemonId: 175, minCp: 339, maxCp: 375 }, // Togepi
            { pokemonId: 173, minCp: 346, maxCp: 383 }, // Cleffa
            { pokemonId: 174, minCp: 260, maxCp: 291 }, // Igglybuff
            { pokemonId: 636, minCp: 800, maxCp: 855 }  // Larvesta
          ])
        },
        {
          name: "Uovo da 5 km",
          type: "5km",
          contents: JSON.stringify([
            { pokemonId: 66, minCp: 678, maxCp: 730 },  // Machop
            { pokemonId: 108, minCp: 752, maxCp: 806 }, // Lickitung
            { pokemonId: 207, minCp: 1000, maxCp: 1061 }, // Gligar
            { pokemonId: 747, minCp: 512, maxCp: 553 }  // Mareanie
          ])
        },
        {
          name: "Uovo da 7 km",
          type: "7km",
          contents: JSON.stringify([
            { pokemonId: 10103, minCp: 385, maxCp: 504 },  // Vulpix (Alolan)
            { pokemonId: 10162, minCp: 800, maxCp: 969 },  // Ponyta (Galarian)
            { pokemonId: 10229, minCp: 703, maxCp: 755 },  // Growlithe (Hisuian)
            { pokemonId: 10253, minCp: 339, maxCp: 375 },  // Wooper (Paldean)
            { pokemonId: 10107, minCp: 402, maxCp: 456 },  // Meowth (Alolan)
            { pokemonId: 10161, minCp: 521, maxCp: 571 }   // Meowth (Galarian)
          ])
        },
        {
          name: "Uovo da 10 km",
          type: "10km",
          contents: JSON.stringify([
            { pokemonId: 246, minCp: 548, maxCp: 594 },  // Larvitar
            { pokemonId: 374, minCp: 519, maxCp: 558 },  // Beldum
            { pokemonId: 371, minCp: 521, maxCp: 660 },  // Bagon
            { pokemonId: 443, minCp: 498, maxCp: 635 },  // Gible
            { pokemonId: 633, minCp: 560, maxCp: 606 },  // Deino
            { pokemonId: 996, minCp: 662, maxCp: 712 }   // Frigibax
          ])
        },
        {
          name: "Uovo da 12 km",
          type: "12km",
          contents: JSON.stringify([
            { pokemonId: 551, minCp: 458, maxCp: 592 },  // Sandile
            { pokemonId: 624, minCp: 765, maxCp: 819 },  // Pawniard
            { pokemonId: 629, minCp: 579, maxCp: 726 },  // Vullaby
            { pokemonId: 674, minCp: 796, maxCp: 850 },  // Pancham
            { pokemonId: 757, minCp: 593, maxCp: 641 }   // Salandit
          ])
        }
      ];

      const stmt = await database.prepare('INSERT INTO eggs (name, type, contents) VALUES (?, ?, ?)');
      for (const e of defaultEggs) {
        await stmt.run(e.name, e.type, e.contents);
      }
      await stmt.finalize();

      // Registriamo l'esecuzione della migrazione
      await database.run(
        'INSERT INTO schema_migrations (name, executedAt) VALUES (?, ?);',
        migrationNameEggs,
        Date.now()
      );
      
      await database.exec('COMMIT;');
      console.log(`[Database Migration] Migrazione ${migrationNameEggs} completata con successo!`);
    }

    // Nuova migrazione per creare e popolare la tabella dei raid
    const migrationNameRaids = 'create_raids_table_v1';
    const rowRaids = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM schema_migrations WHERE name = ?',
      migrationNameRaids
    );
    
    if (rowRaids && rowRaids.count === 0) {
      console.log(`[Database Migration] Esecuzione migrazione tabella raid e seed iniziale: ${migrationNameRaids}...`);
      
      await database.exec('BEGIN TRANSACTION;');
      
      // Creazione tabella
      await database.exec(`
        CREATE TABLE IF NOT EXISTS raids (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pokemonId INTEGER NOT NULL,
          minCp INTEGER NOT NULL,
          maxCp INTEGER NOT NULL,
          tier TEXT NOT NULL,
          isShadow INTEGER DEFAULT 0,
          isMega INTEGER DEFAULT 0
        );
      `);

      // Default Raids
      const defaultRaids = [
        // Leggendari/Ultracreature
        { pokemonId: 150, minCp: 2294, maxCp: 2387, tier: 'legendary', isShadow: 1, isMega: 0 }, // Shadow Mewtwo
        { pokemonId: 384, minCp: 2102, maxCp: 2191, tier: 'legendary', isShadow: 0, isMega: 0 }, // Rayquaza
        { pokemonId: 382, minCp: 2260, maxCp: 2351, tier: 'legendary', isShadow: 0, isMega: 0 }, // Kyogre
        { pokemonId: 383, minCp: 2260, maxCp: 2351, tier: 'legendary', isShadow: 0, isMega: 0 }, // Groudon
        // Mega Raid
        { pokemonId: 448, minCp: 1971, maxCp: 2186, tier: 'mega', isShadow: 0, isMega: 1 }, // Lucario
        { pokemonId: 6, minCp: 1538, maxCp: 1651, tier: 'mega', isShadow: 0, isMega: 1 },  // Charizard
        { pokemonId: 94, minCp: 1496, maxCp: 1644, tier: 'mega', isShadow: 0, isMega: 1 },  // Gengar
        // Raid Standard
        { pokemonId: 621, minCp: 1487, maxCp: 1561, tier: 'standard', isShadow: 0, isMega: 0 }, // Druddigon
        { pokemonId: 215, minCp: 1107, maxCp: 1172, tier: 'standard', isShadow: 1, isMega: 0 }, // Shadow Sneasel
        { pokemonId: 403, minCp: 458, maxCp: 500, tier: 'standard', isShadow: 1, isMega: 0 },  // Shadow Shinx
        { pokemonId: 66, minCp: 678, maxCp: 730, tier: 'standard', isShadow: 0, isMega: 0 }    // Machop
      ];

      const stmt = await database.prepare('INSERT INTO raids (pokemonId, minCp, maxCp, tier, isShadow, isMega) VALUES (?, ?, ?, ?, ?, ?)');
      for (const r of defaultRaids) {
        await stmt.run(r.pokemonId, r.minCp, r.maxCp, r.tier, r.isShadow, r.isMega);
      }
      await stmt.finalize();

      // Registriamo l'esecuzione della migrazione
      await database.run(
        'INSERT INTO schema_migrations (name, executedAt) VALUES (?, ?);',
        migrationNameRaids,
        Date.now()
      );
      
      await database.exec('COMMIT;');
      console.log(`[Database Migration] Migrazione ${migrationNameRaids} completata con successo!`);
    }
  } catch (err) {
    try { await database.exec('ROLLBACK;'); } catch (_) {}
    console.error('[Database Migration] Errore critico durante la migrazione:', err);
  }
}
