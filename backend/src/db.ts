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
  } catch (err) {
    try { await database.exec('ROLLBACK;'); } catch (_) {}
    console.error('[Database Migration] Errore critico durante la migrazione:', err);
  }
}
