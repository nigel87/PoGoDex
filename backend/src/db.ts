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
      lastUpdated INTEGER DEFAULT 0
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
  } catch (err) {
    try { await database.exec('ROLLBACK;'); } catch (_) {}
    console.error('[Database Migration] Errore critico durante la migrazione:', err);
  }
}
