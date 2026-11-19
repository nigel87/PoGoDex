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
    
    // Download pokedex.json to get base stats from GameMaster
    let pokedexData: any[] = [];
    try {
      console.log('[Seeder] Download statistiche base da pokemon-go-api...');
      pokedexData = await fetchPokeAPI('https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json');
      console.log(`[Seeder] Scaricati dati per ${pokedexData.length} specie.`);
    } catch (err) {
      console.warn('[Seeder] Impossibile scaricare le statistiche da pokemon-go-api, procedo senza statistiche:', String(err));
    }

    const statsMap = new Map<string, { attack: number, defense: number, stamina: number }>();
    if (pokedexData.length > 0) {
      const pByDex: Record<number, any[]> = {};
      for (const p of pokedexData) {
        if (p.dexNr) {
          if (!pByDex[p.dexNr]) pByDex[p.dexNr] = [];
          pByDex[p.dexNr].push(p);
        }
      }

      for (const lp of pokemonData) {
        const isBase = lp.parentId === null || lp.parentId === undefined;
        const dex = isBase ? lp.id : (lp.parentId || 0);
        const candidates = pByDex[dex] || [];
        
        let foundStats = null;
        let parentStats = null;
        
        const parentCand = candidates.find((c: any) => c.id === c.formId) || candidates[0];
        if (parentCand) {
          parentStats = parentCand.stats;
        }
        
        if (isBase) {
          foundStats = parentStats;
        } else {
          const match = lp.name.match(/\(([^)]+)\)/);
          if (match) {
            let formName = match[1].toLowerCase()
              .replace("alolan", "alola")
              .replace("galarian", "galar")
              .replace("hisuian", "hisui")
              .replace("paldean", "paldea")
              .replace("pa'u", "pau")
              .replace("’", "")
              .trim();
            
            for (const c of candidates) {
              if (c.formId && c.formId.toLowerCase().includes(formName)) {
                foundStats = c.stats;
                break;
              }
              if (c.regionForms) {
                for (const rfKey of Object.keys(c.regionForms)) {
                  const rf = c.regionForms[rfKey];
                  const formIdLower = (rf.formId || "").toLowerCase();
                  const engName = (rf.names?.English || "").toLowerCase();
                  if (formIdLower.includes(formName) || engName.includes(formName)) {
                    foundStats = rf.stats;
                    break;
                  }
                }
              }
              if (foundStats) break;
            }
          }
          if (!foundStats && parentStats) {
            foundStats = parentStats;
          }
        }
        
        if (foundStats) {
          statsMap.set(`${lp.id}`, {
            attack: foundStats.attack,
            defense: foundStats.defense,
            stamina: foundStats.stamina
          });
        }
      }
    }

    // Sincronizzazione in transazione singola per massimizzare le performance
    await db.run('BEGIN TRANSACTION;');
    
    const insertStmt = await db.prepare(`
      INSERT INTO pokemons (id, name, type1, type2, generation, spriteUrl, parentId, attack, defense, stamina)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type1 = excluded.type1,
        type2 = excluded.type2,
        generation = excluded.generation,
        spriteUrl = excluded.spriteUrl,
        parentId = excluded.parentId,
        attack = excluded.attack,
        defense = excluded.defense,
        stamina = excluded.stamina;
    `);

    for (const p of pokemonData) {
      const stats = statsMap.get(`${p.id}`) || null;
      await insertStmt.run(
        p.id,
        p.name,
        p.type1,
        p.type2 || null,
        p.generation,
        p.spriteUrl,
        p.parentId !== undefined ? p.parentId : null,
        stats ? stats.attack : null,
        stats ? stats.defense : null,
        stats ? stats.stamina : null
      );
    }

    await insertStmt.finalize();
    await db.run('COMMIT;');
    
    console.log(`Catalogo Pokémon sincronizzato con successo. Totale specie: ${pokemonData.length}`);
    
    // Migra eventuali riferimenti a ID di forme errati e rimuove gli ID obsoleti
    await migrateWrongFormIds(db);

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

/**
 * Migra i riferimenti agli ID delle forme corretti (Dialga/Palkia Origin, Kyurem, Oricorio, Lycanroc Midnight)
 * e rimuove gli ID obsoleti dalla tabella pokemons.
 */
async function migrateWrongFormIds(db: Database) {
  const migrationName = 'fix_wrong_form_ids_v1';
  const row = await db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM schema_migrations WHERE name = ?',
    migrationName
  );
  if (row && row.count > 0) return;

  const idRemap: Record<number, number> = {
    10022: 10023, // Kyurem (White)
    10023: 10022, // Kyurem (Black)
    10026: 10126, // Lycanroc (Midnight)
    10121: 10123, // Oricorio (Pom-Pom)
    10122: 10124, // Oricorio (Pa'u)
    10123: 10125, // Oricorio (Sensu)
    10227: 10245, // Dialga (Origin)
    10228: 10246, // Palkia (Origin)
  };
  const oldIds = Object.keys(idRemap).map(Number);
  const obsoleteIds = [10026, 10121, 10122, 10227, 10228];

  await db.run('BEGIN TRANSACTION;');
  try {
    const placeholders = oldIds.map(() => '?').join(',');
    const entries = await db.all<any[]>(
      `SELECT * FROM pokedex_entries WHERE pokemonId IN (${placeholders})`,
      ...oldIds
    );

    if (entries.length > 0) {
      await db.run(
        `DELETE FROM pokedex_entries WHERE pokemonId IN (${placeholders})`,
        ...oldIds
      );
      const upsertStmt = await db.prepare(`
        INSERT INTO pokedex_entries (userId, pokemonId, regular, shadow, purified, perfect, lucky, xxs, xxl, shiny, mega, gigamax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId, pokemonId) DO UPDATE SET
          regular = MAX(regular, excluded.regular),
          shadow = MAX(shadow, excluded.shadow),
          purified = MAX(purified, excluded.purified),
          perfect = MAX(perfect, excluded.perfect),
          lucky = MAX(lucky, excluded.lucky),
          xxs = MAX(xxs, excluded.xxs),
          xxl = MAX(xxl, excluded.xxl),
          shiny = MAX(shiny, excluded.shiny),
          mega = MAX(mega, excluded.mega),
          gigamax = MAX(gigamax, excluded.gigamax);
      `);
      for (const e of entries) {
        const newId = idRemap[e.pokemonId] ?? e.pokemonId;
        await upsertStmt.run(
          e.userId, newId, e.regular, e.shadow, e.purified,
          e.perfect, e.lucky, e.xxs, e.xxl, e.shiny, e.mega, e.gigamax
        );
      }
      await upsertStmt.finalize();
    }

    // Aggiorna eventuali raid che puntavano ai vecchi ID
    const raids = await db.all<any[]>(
      `SELECT id, pokemonId FROM raids WHERE pokemonId IN (${placeholders})`,
      ...oldIds
    );
    for (const r of raids) {
      await db.run('UPDATE raids SET pokemonId = ? WHERE id = ?', idRemap[r.pokemonId], r.id);
    }

    // Aggiorna eventuali JSON in quests (rewards) ed eggs (contents)
    const remapJsonList = (jsonStr: string): string | null => {
      try {
        const arr = JSON.parse(jsonStr);
        if (!Array.isArray(arr)) return null;
        let changed = false;
        for (const item of arr) {
          if (item && typeof item.pokemonId === 'number' && idRemap[item.pokemonId] !== undefined) {
            item.pokemonId = idRemap[item.pokemonId];
            changed = true;
          }
        }
        return changed ? JSON.stringify(arr) : null;
      } catch {
        return null;
      }
    };

    const quests = await db.all<any[]>('SELECT id, rewards FROM quests');
    for (const q of quests) {
      const updated = remapJsonList(q.rewards);
      if (updated) await db.run('UPDATE quests SET rewards = ? WHERE id = ?', updated, q.id);
    }

    const eggs = await db.all<any[]>('SELECT id, contents FROM eggs');
    for (const eg of eggs) {
      const updated = remapJsonList(eg.contents);
      if (updated) await db.run('UPDATE eggs SET contents = ? WHERE id = ?', updated, eg.id);
    }

    // Rimuove gli ID obsoleti non più presenti in pokemon.json
    const obsPlaceholders = obsoleteIds.map(() => '?').join(',');
    await db.run(`DELETE FROM pokemons WHERE id IN (${obsPlaceholders})`, ...obsoleteIds);

    await db.run(
      'INSERT INTO schema_migrations (name, executedAt) VALUES (?, ?);',
      migrationName,
      Date.now()
    );
    await db.run('COMMIT;');
    console.log(`[Database Migration] Migrazione ${migrationName} completata con successo!`);
  } catch (err) {
    await db.run('ROLLBACK;');
    console.error(`[Database Migration] Errore durante ${migrationName}:`, err);
    throw err;
  }
}
