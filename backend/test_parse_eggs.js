const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

function normalizeEggPokemonName(name) {
  name = name.trim();
  if (name.startsWith('Galarian ')) {
    return name.replace('Galarian ', '') + ' (Galarian)';
  }
  if (name.startsWith('Alolan ')) {
    return name.replace('Alolan ', '') + ' (Alolan)';
  }
  if (name.startsWith('Hisuian ')) {
    return name.replace('Hisuian ', '') + ' (Hisuian)';
  }
  if (name.startsWith('Paldean ')) {
    return name.replace('Paldean ', '') + ' (Paldean)';
  }
  if (name.includes('Origin Forme') || name.includes('Origin Form')) {
    return name.replace(' Origin Forme', '').replace(' Origin Form', '') + ' (Origin)';
  }
  return name;
}

const cpMultiplier2 = 0.35688677; // Level 20 CPM squared

function calculateCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta) {
  const atk = baseAtk + ivAtk;
  const def = baseDef + ivDef;
  const sta = baseSta + ivSta;
  return Math.floor((atk * Math.sqrt(def) * Math.sqrt(sta) * cpMultiplier2) / 10);
}

async function testParse() {
  const dbPath = path.join(__dirname, 'data/pogodex.sqlite');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Load pokemons list
  const pokemonsList = await db.all('SELECT id, name, attack, defense, stamina FROM pokemons;');
  const pokemonMap = new Map();
  for (const p of pokemonsList) {
    pokemonMap.set(p.name.toLowerCase().trim(), p);
  }

  const htmlPath = '/Users/nigelpllaha/.gemini/antigravity/brain/ad5f8153-5412-4e2e-ab18-0f3a86969431/scratch/leekduck_eggs.html';
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Split by <h2
  const parts = html.split(/<h2[^>]*>/);
  const eggPools = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const headingMatch = part.match(/^([\s\S]*?)<\/h2>/);
    if (!headingMatch) continue;
    const heading = headingMatch[1].trim();

    // Determine egg distance type (e.g. 2km, 5km, 7km, 10km, 12km)
    let distanceType = null;
    if (heading.includes('2 km')) distanceType = '2km';
    else if (heading.includes('5 km')) distanceType = '5km';
    else if (heading.includes('7 km')) distanceType = '7km';
    else if (heading.includes('10 km')) distanceType = '10km';
    else if (heading.includes('12 km')) distanceType = '12km';

    if (!distanceType) {
      continue;
    }

    if (!eggPools[distanceType]) {
      eggPools[distanceType] = new Set();
    }

    // Extract pokemon cards
    const cardRegex = /<li class="pokemon-card[^>]*>([\s\S]*?)<\/li>/g;
    let cardMatch;
    while ((cardMatch = cardRegex.exec(part)) !== null) {
      const cardHtml = cardMatch[1];
      const nameMatch = cardHtml.match(/<span class="name">([^<]+)<\/span>/);
      if (!nameMatch) continue;
      const originalName = nameMatch[1].trim();
      const normalizedName = normalizeEggPokemonName(originalName);

      const p = pokemonMap.get(normalizedName.toLowerCase().trim());
      if (p) {
        eggPools[distanceType].add(JSON.stringify({
          pokemonId: p.id,
          name: p.name,
          attack: p.attack,
          defense: p.defense,
          stamina: p.stamina
        }));
      } else {
        console.warn(`Could not map: "${originalName}" (normalized: "${normalizedName}")`);
      }
    }
  }

  for (const [type, set] of Object.entries(eggPools)) {
    console.log(`\nEgg Type: ${type} (${set.size} pokemon)`);
    const list = Array.from(set).map(JSON.parse);
    list.forEach(p => {
      const minCp = calculateCp(p.attack, p.defense, p.stamina, 10, 10, 10);
      const maxCp = calculateCp(p.attack, p.defense, p.stamina, 15, 15, 15);
      console.log(`  - ${p.name} (ID: ${p.pokemonId}) | Stats: A=${p.attack} D=${p.defense} S=${p.stamina} | CP: ${minCp} - ${maxCp}`);
    });
  }

  await db.close();
}

testParse().catch(console.error);
