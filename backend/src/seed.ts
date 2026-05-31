import { Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
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
    
    // Avvia l'auto-risolutore in background (senza bloccare l'avvio del server)
    resolveVarietyIds(db).catch(err => {
      console.error("[Auto-Resolver] Errore critico nel thread in background:", err);
    });
  } catch (e) {
    await db.run('ROLLBACK;');
    console.error("Errore durante la sincronizzazione dei Pokémon:", e);
    throw e;
  }
}

/**
 * Pulisce e uniforma il nome del Pokémon secondo lo standard di PokeAPI.
 */
function cleanPokeName(name: string): string {
  return name.toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\./g, '')
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .replace(/é/g, 'e')
    .replace(/\s+/g, '-');
}

/**
 * Esegue una richiesta HTTP GET asincrona a PokeAPI con intestazione User-Agent.
 */
function fetchPokeAPI(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PoGODex-Backend/1.0'
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP Status ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Legge pokemon-config.ts ed estrae le liste di Pokémon Mega e Gigamax capaci.
 */
function loadConfigLists() {
  const configPath = path.join(__dirname, '../../frontend/src/app/services/pokemon-config.ts');
  if (!fs.existsSync(configPath)) {
    return { megaCapable: [], gigamaxCapable: [] };
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

  return {
    megaCapable: extractArray(content, 'MEGA_CAPABLE_SPECIES'),
    gigamaxCapable: extractArray(content, 'GIGAMAX_CAPABLE_SPECIES')
  };
}

/**
 * Risolve dinamicamente da PokeAPI le varietà Mega e Gigamax salvandole nel database.
 */
async function resolveVarietyIds(db: Database) {
  const { megaCapable, gigamaxCapable } = loadConfigLists();
  if (megaCapable.length === 0 && gigamaxCapable.length === 0) {
    console.log('[Auto-Resolver] pokemon-config.ts non trovato o vuoto. Skip.');
    return;
  }

  console.log('[Auto-Resolver] Avvio scansione automatica varietà Mega/Gigamax...');

  // Carichiamo tutti i pokemon dal DB
  const pokemons = await db.all('SELECT * FROM pokemons ORDER BY id ASC');

  for (const p of pokemons) {
    const baseName = p.name.split(' (')[0];
    const canMega = megaCapable.includes(baseName);
    const canGiga = gigamaxCapable.includes(baseName);

    if (!canMega && !canGiga) continue;

    // Controlliamo se c'è bisogno di risolvere
    const needsMegaResolve = canMega && (p.megaVarietyId === null || (baseName === 'Charizard' || baseName === 'Mewtwo' ? p.megaVarietyId2 === null : false));
    const needsGigaResolve = canGiga && p.gigamaxVarietyId === null;

    if (!needsMegaResolve && !needsGigaResolve) continue;

    console.log(`[Auto-Resolver] Risoluzione varietà PokeAPI per #${p.id} ${p.name}...`);
    try {
      const clean = cleanPokeName(baseName);
      const url = `https://pokeapi.co/api/v2/pokemon-species/${p.id}`;
      const speciesData = await fetchPokeAPI(url);
      
      let megaVarietyId: number | null = p.megaVarietyId;
      let megaVarietyId2: number | null = p.megaVarietyId2;
      let gigamaxVarietyId: number | null = p.gigamaxVarietyId;

      if (speciesData && speciesData.varieties) {
        for (const v of speciesData.varieties) {
          const varName = v.pokemon.name;
          const varUrl = v.pokemon.url;
          
          // Estrae ID dall'url (es: https://pokeapi.co/api/v2/pokemon/10279/ -> 10279)
          const match = varUrl.match(/\/pokemon\/(\d+)\//);
          if (!match) continue;
          const varietyId = parseInt(match[1], 10);

          if (canMega) {
            if (baseName === 'Charizard' || baseName === 'Mewtwo') {
              if (varName === `${clean}-mega-x`) {
                megaVarietyId = varietyId;
              } else if (varName === `${clean}-mega-y`) {
                megaVarietyId2 = varietyId;
              }
            } else {
              if (varName === `${clean}-mega` || varName === `${clean}-primal`) {
                megaVarietyId = varietyId;
              }
            }
          }

          if (canGiga) {
            if (varName === `${clean}-gmax`) {
              gigamaxVarietyId = varietyId;
            }
          }
        }
      }

      // Salva nel database
      await db.run(
        `UPDATE pokemons SET megaVarietyId = ?, megaVarietyId2 = ?, gigamaxVarietyId = ? WHERE id = ?`,
        megaVarietyId,
        megaVarietyId2,
        gigamaxVarietyId,
        p.id
      );

      console.log(`  ✓ Mapped PokeAPI per #${p.id} ${p.name}: Mega=${megaVarietyId}${megaVarietyId2 ? '/' + megaVarietyId2 : ''}, Gigamax=${gigamaxVarietyId}`);
      
      // Cortesia PokeAPI: pausa per evitare rate limit
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (err) {
      console.error(`  ✗ Errore nella risoluzione PokeAPI per #${p.id} ${p.name}:`, String(err));
      // Attesa leggermente più lunga in caso di errore per evitare spam
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('[Auto-Resolver] Scansione varietà completata.');
}
