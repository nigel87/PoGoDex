import { Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { Pokemon } from './types';

/**
 * Gestisce il popolamento iniziale del database SQLite se vuoto.
 */
export async function runSeeder(db: Database) {
  // 1. Crea l'utente di ripiego predefinito se non ci sono utenti
  const userCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (userCount && userCount.count === 0) {
    console.log("Inizializzazione database: creazione dell'utente predefinito...");
    await db.run(
      `INSERT INTO users (name, email, avatarUrl) VALUES (?, ?, ?);`,
      'Allenatore Pogodex',
      'allenatore@pogodex.com',
      'https://api.dicebear.com/7.x/bottts/svg?seed=pogodex'
    );
    console.log("Utente predefinito 'Allenatore Pogodex' creato con successo.");
  }

  // 2. Sincronizza o pre-popola la lista dei Pokémon da pokemon.json (Supporto self-healing per nuove specie)
  console.log('Sincronizzazione catalogo Pokémon da pokemon.json...');
  const seedPath = path.join(__dirname, 'pokemon.json');
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Impossibile trovare il file pokemon.json in: ${seedPath}`);
  }

  try {
    const pokemonData = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as Pokemon[];
    
    // Sincronizzazione in transazione singola per massimizzare le performance
    await db.run('BEGIN TRANSACTION;');
    
    const insertStmt = await db.prepare(`
      INSERT OR IGNORE INTO pokemons (id, name, type1, type2, generation, spriteUrl)
      VALUES (?, ?, ?, ?, ?, ?);
    `);

    for (const p of pokemonData) {
      await insertStmt.run(
        p.id,
        p.name,
        p.type1,
        p.type2 || null,
        p.generation,
        p.spriteUrl
      );
    }

    await insertStmt.finalize();
    await db.run('COMMIT;');
    
    console.log(`Catalogo Pokémon sincronizzato con successo. Totale specie: ${pokemonData.length}`);
  } catch (e) {
    await db.run('ROLLBACK;');
    console.error("Errore durante la sincronizzazione dei Pokémon:", e);
    throw e;
  }
}
