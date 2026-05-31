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
      gigamaxVarietyId INTEGER DEFAULT NULL
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
}
