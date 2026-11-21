import { Database } from 'sqlite';

export type FetchWithTimeoutFn = (
  url: string,
  options?: RequestInit,
  timeoutMs?: number
) => Promise<globalThis.Response>;

export interface CostumeSyncResult {
  totalCostumes: number;
  newlyAdded: string[];
  newlyShiny: string[];
  spritesUpgraded: number;
  source: string;
}

const WWM_SPRITE_BASE = 'https://raw.githubusercontent.com/WatWowMap/wwm-uicons-webp/main/pokemon/';
const BULBA_EVENT_URL =
  'https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=Event_Pok%C3%A9mon_(GO)&prop=wikitext&format=json';
const WWM_MASTER_URL =
  'https://raw.githubusercontent.com/WatWowMap/Masterfile-Generator/master/master-latest-raw.json';
const WWM_INDEX_URL =
  'https://raw.githubusercontent.com/WatWowMap/wwm-uicons-webp/main/index.json';

const NON_EVENT_FORMS = new Set([
  'NORMAL', 'ALOLA', 'GALARIAN', 'HISUIAN', 'PALDEA', 'PURIFIED', 'SHADOW', 'MEGA', 'MEGA_X', 'MEGA_Y', 'PRIMAL', 'GIGANTAMAX',
  'PLANT', 'SANDY', 'TRASH', 'SUNNY', 'RAINY', 'SNOWY', 'OVERCAST', 'WEST_SEA', 'EAST_SEA', 'HEAT', 'WASH', 'FROST', 'FAN', 'MOW',
  'ALTERED', 'ORIGIN', 'LAND', 'SKY', 'RED_STRIPED', 'BLUE_STRIPED', 'WHITE_STRIPED', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER',
  'INCARNATE', 'THERIAN', 'BLACK', 'WHITE', 'ORDINARY', 'RESOLUTE', 'ARIA', 'PIROUETTE', 'RED', 'YELLOW', 'ORANGE', 'BLUE',
  'NATURAL', 'HEART', 'STAR', 'DIAMOND', 'DEBUTANTE', 'MATRON', 'DANDY', 'LA_REINE', 'KABUKI', 'PHARAOH',
  'SMALL', 'AVERAGE', 'LARGE', 'SUPER', 'BAILE', 'POMPOM', 'PAU', 'SENSU', 'MIDDAY', 'MIDNIGHT', 'DUSK',
  'METEOR', 'CORE', 'AMPED', 'LOW_KEY', 'PHONY', 'ANTIQUE', 'ICE', 'NOICE', 'FULL_BELLY', 'HANGRY',
  'HERO', 'CROWNED_SWORD', 'CROWNED_SHIELD', 'SINGLE_STRIKE', 'RAPID_STRIKE', 'ROAMING', 'CHEST',
  'COMBAT', 'BLAZE', 'AQUA', 'ZERO', 'CURLY', 'DROOPY', 'STRETCHY', 'FAMILY_OF_THREE', 'FAMILY_OF_FOUR',
  'TWO_SEGMENT', 'THREE_SEGMENT', 'COUNTERFEIT', 'ARTISAN', 'UNREMARKABLE', 'MASTERPIECE', 'BLOODMOON',
  'ATTACK', 'DEFENSE', 'SPEED', 'STANDARD', 'ZEN', 'DUSK_MANE', 'DAWN_WINGS', 'ULTRA', 'APEX', 'UNBOUND', 'CONFINED',
  'BURN', 'CHILL', 'DOUSE', 'SHOCK', 'FEMALE', 'MALE', '50', '10', 'COMPLETE', 'SWORD', 'SHIELD',
]);

const SUFFIX_TO_PROTO: Record<string, string[]> = {
  Holiday2016: ['HOLIDAY_2016'],
  Anniversary: ['ANNIVERSARY'],
  O: ['ONE_YEAR_ANNIVERSARY'],
  W: ['COSTUME_1'],
  Halloween2017: ['HALLOWEEN_2017'],
  Summer2018: ['SUMMER_2018'],
  Fall2018: ['FALL_2018'],
  November2018: ['NOVEMBER_2018'],
  Winter2018: ['WINTER_2018'],
  Feb2019: ['FEB_2019'],
  May2019: ['MAY_2019_NOEVOLVE'],
  Fall2019: ['FALL_2019'],
  Jan2020: ['JAN_2020_NOEVOLVE'],
  Copy2019: ['COPY_2019'],
  Spring2020: ['SPRING_2020_NOEVOLVE', 'SPRING_2020'],
  Visor: ['SPRING_2020_NOEVOLVE'],
  Safari2020: ['SAFARI_2020_NOEVOLVE'],
  April2020: ['APRIL_2020_NOEVOLVE'],
  Summer2020: ['SUMMER_2020_NOEVOLVE', 'SUMMER_2020'],
  Fall2020: ['FALL_2020_NOEVOLVE', 'FALL_2020'],
  Winter2020: ['WINTER_2020_NOEVOLVE', 'WINTER_2020'],
  Kanto2020: ['KANTO_2020_NOEVOLVE'],
  Johto2020: ['JOHTO_2020_NOEVOLVE'],
  Hoenn2020: ['HOENN_2020_NOEVOLVE'],
  Sinnoh2020: ['SINNOH_2020_NOEVOLVE'],
  Costume1: ['COSTUME_1'],
  Costume2: ['COSTUME_2'],
  Costume3: ['COSTUME_3'],
  Holiday2020: ['HOLIDAY_2020_NOEVOLVE', 'HOLIDAY_2020'],
  AdventureHat2020: ['ADVENTURE_HAT_2020'],
  Fashion2020: ['FASHION_2020', 'FALL_2020'],
  Fashion2021: ['FASHION_2021', 'FASHION_2021_NOEVOLVE'],
  Fashion2022: ['FASHION_2022', 'FASHION_2022_NOEVOLVE'],
  Fashion2023: ['FASHION_2023', 'FASHION_2023_NOEVOLVE'],
  Fashion2025: ['FASHION_2025', 'FASHION_2025_NOEVOLVE'],
  GOFest2021: ['GOFEST_2021', 'GOFEST_2021_NOEVOLVE'],
  GGOFest2021: ['GOFEST_2021', 'GOFEST_2021_NOEVOLVE'],
  Halloween2020: ['HALLOWEEN_2020', 'HALLOWEEN_2020_NOEVOLVE'],
  Halloween2021: ['HALLOWEEN_2021', 'HALLOWEEN_2021_NOEVOLVE'],
  Halloween2022: ['HALLOWEEN_2022', 'HALLOWEEN_2022_NOEVOLVE', 'FALL_2022'],
  SmHalloween2022: ['PUMPKABOO_SMALL', 'GOURGEIST_SMALL'],
  LaHalloween2022: ['PUMPKABOO_LARGE', 'GOURGEIST_LARGE'],
  SuHalloween2022: ['PUMPKABOO_SUPER', 'GOURGEIST_SUPER'],
  Halloween2023: ['HALLOWEEN_2023', 'FALL_2023'],
  Halloween2024: ['HALLOWEEN_2024', 'FALL_2024'],
  Halloween2025: ['HALLOWEEN_2025'],
  Halloween2026: ['HALLOWEEN_2026'],
  Holiday2021: ['HOLIDAY_2021', 'WINTER_2021'],
  Holiday2022: ['HOLIDAY_2022', 'WINTER_2022'],
  Holiday2023: ['HOLIDAY_2023', 'WINTER_2023'],
  Holiday2024: ['HOLIDAY_2024', 'WINTER_2024'],
  Holiday2025: ['HOLIDAY_2025', 'WINTER_2025'],
  Holiday2026: ['HOLIDAY_2026', 'WINTER_2026'],
  Jan2021: ['JAN_2021', 'NEW_YEAR_2021', 'COSTUME_2'],
  Jan2022: ['JAN_2022', 'NEW_YEAR_2022', 'COSTUME_3'],
  Jan2023: ['JAN_2023_NOEVOLVE', 'JAN_2023'],
  Jan2024: ['JAN_2024', 'NEW_YEAR_2024'],
  Jan2025: ['JAN_2025', 'NEW_YEAR_2025'],
  Jan2026: ['JAN_2026', 'NEW_YEAR_2026'],
  Spring2021: ['SPRING_2021'],
  Spring2022: ['SPRING_2022'],
  Spring2023: ['SPRING_2023'],
  Spring2024: ['SPRING_2024'],
  Spring2025: ['SPRING_2025'],
  Fall2023: ['FALL_2023_NOEVOLVE', 'FALL_2023'],
  GOFest2022: ['GOFEST_2022_NOEVOLVE', 'GOFEST_2022'],
  GOFest2022Finale: ['PIKACHU_GOFEST_2022'],
  GOFest2023: ['GOFEST_2023'],
  GOFest2024: ['GOFEST_2024'],
  GOFest2025: ['GOFEST_2025'],
  GOFest2026: ['GOFEST_2026'],
  TCG: ['TCG_2022_NOEVOLVE', 'TCG_2022'],
  Anniversary2022: ['ANNIVERSARY_2022_NOEVOLVE'],
  Anniversary2024: ['ANNIVERSARY_2024'],
  Anniversary2025: ['ANNIVERSARY_2025'],
  Gems1: ['BDSP_2021_A', 'GEMS_1', 'COSTUME_1'],
  Gems2: ['BDSP_2021_B', 'GEMS_2', 'COSTUME_2'],
  Li: ['PIKACHU_VS_2019'],
  Po: ['PIKACHU_POP_STAR'],
  Ro: ['PIKACHU_ROCK_STAR'],
  PhD: ['PIKACHU_DOCTOR'],
  Fly: ['PIKACHU_COSTUME_2020'],
  Fly5: ['PIKACHU_FLYING_5TH_ANNIV'],
  FlyOkinawa: ['PIKACHU_FLYING_OKINAWA'],
  FlyGreen: ['PIKACHU_FLYING_01'],
  FlyPurple: ['PIKACHU_FLYING_02'],
  FlyOrange: ['PIKACHU_FLYING_03'],
  FlyRed: ['PIKACHU_FLYING_04'],
  Kariyushi: ['PIKACHU_KARIYUSHI'],
  WCS2022: ['PIKACHU_WCS_2022'],
  WCS2023: ['PIKACHU_WCS_2023'],
  WCS2024: ['PIKACHU_WCS_2024'],
  WCS2025: ['PIKACHU_WCS_2025'],
  WCS2026: ['PIKACHU_WCS_2026'],
  TShirtGreen: ['PIKACHU_TSHIRT_01'],
  TShirtPurple: ['PIKACHU_TSHIRT_02'],
  TShirtBatik: ['PIKACHU_TSHIRT_03'],
  TShirtBlue: ['PIKACHU_JEJU'],
  GoTour2023Brendan: ['GOTOUR_2023_HAT_NOEVOLVE'],
  GoTour2023May: ['GOTOUR_2023_BANDANA_NOEVOLVE'],
  Malachite: ['PIKACHU_SUMMER_2023_A'],
  Aquamarine: ['PIKACHU_SUMMER_2023_B'],
  Quartz: ['PIKACHU_SUMMER_2023_C'],
  Pyrite: ['PIKACHU_SUMMER_2023_D'],
  Amethyst: ['PIKACHU_SUMMER_2023_E'],
  GoTour2024Lucas: ['PIKACHU_GOTOUR_2024_A'],
  GoTour2024Rei: ['PIKACHU_GOTOUR_2024_B'],
  GoTour2024Dawn: ['PIKACHU_GOTOUR_2024_A_02'],
  GoTour2024Akari: ['PIKACHU_GOTOUR_2024_B_02'],
  Captain: ['PIKACHU_HORIZONS'],
  Sun: ['PIKACHU_GOFEST_2024_STIARA', 'GOFEST_2024_STIARA', 'SUN_CROWN'],
  Moon: ['PIKACHU_GOFEST_2024_MTIARA', 'GOFEST_2024_MTIARA', 'MOON_CROWN'],
  Saree: ['PIKACHU_DIWALI_2024'],
  GoTour2025Hilbert: ['PIKACHU_GOTOUR_2025_A'],
  GoTour2025Nate: ['PIKACHU_GOTOUR_2025_B'],
  GoTour2025Hilda: ['PIKACHU_GOTOUR_2025_A_02'],
  GoTour2025Rosa: ['PIKACHU_GOTOUR_2025_B_02'],
  Kurta: ['PIKACHU_KURTA'],
  RedGoggles: ['PIKACHU_GOFEST_2025_GOGGLES_RED'],
  BlueGoggles: ['PIKACHU_GOFEST_2025_GOGGLES_BLUE'],
  YellowGoggles: ['PIKACHU_GOFEST_2025_GOGGLES_YELLOW'],
  RedMonocle: ['PIKACHU_GOFEST_2025_MONOCLE_RED'],
  BlueMonocle: ['PIKACHU_GOFEST_2025_MONOCLE_BLUE'],
  YellowMonocle: ['PIKACHU_GOFEST_2025_MONOCLE_YELLOW'],
  IndonesiaJersey: ['INDONESIA_2025_NOEVOLVE'],
  Red: ['PIKACHU_GOTOUR_2026_A'],
  Leaf: ['PIKACHU_GOTOUR_2026_A_02'],
  Ethan: ['PIKACHU_GOTOUR_2026_B'],
  Lyra: ['PIKACHU_GOTOUR_2026_B_02'],
  GoTour2026Calem: ['PIKACHU_GOTOUR_2026_C'],
  GoTour2026Serena: ['PIKACHU_GOTOUR_2026_C_02'],
  BaseballJersey: ['PIKACHU_BB_2026'],
  MarathonVisor: ['PIKACHU_VISOR_2026'],
  Fossil: ['PIKACHU_FOSSIL_2026'],
  MysticHat: ['PIKACHU_GOFEST_2026_CAP_BLUE'],
  ValorHat: ['PIKACHU_GOFEST_2026_CAP_RED'],
  InstinctHat: ['PIKACHU_GOFEST_2026_CAP_YELLOW'],
  Willow: ['PIKACHU_ANNIVERSARY_2026'],
  Cosmog: ['PIKACHU_PXP_2026'],
  Anniversary2026Malaysia01: ['PIKACHU_ANNIVERSARY_2026_MALAYSIA_01'],
  Anniversary2026Singapore01: ['PIKACHU_ANNIVERSARY_2026_SINGAPORE_01'],
  Anniversary2026Taiwan01: ['PIKACHU_ANNIVERSARY_2026_TAIWAN_01'],
  Anniversary2026Philippine01: ['PIKACHU_ANNIVERSARY_2026_PHILIPPINE_01'],
  Anniversary2026Thailand01: ['PIKACHU_ANNIVERSARY_2026_THAILAND_01'],
  K2026A01: ['PIKACHU_K_2026_A_01'],
  Astronaut: ['PIKACHU_GLASS_HELMET_2026'],
  Capelet: ['PIKACHU_HALLOWEEN_2026'],
  A: ['MEWTWO_A'],
  Friede: ['GOGGLES_2026'],
  SwimRing: ['SWIM_2025'],
  Bow: ['_P_HALLOWEEN_2026_01', 'HALLOWEEN_2026'],
  ABow: ['_A_HALLOWEEN_2026_01'],
  Jacket: ['WILDAREA_2026_01', 'SNORLAX_WILDAREA_2024'],
  TopHat: ['HALLOWEEN_2026'],
  GSunglasses: ['GALARIAN'],
  Sleep: ['NIGHTCAP'],
  Explorer: ['MAY_2023'],
  DayScarf: ['ESPEON_GOFEST_2024_SSCARF'],
  NightScarf: ['UMBREON_GOFEST_2024_MSCARF'],
  Anniversary9: ['GIMMIGHOUL_COIN_A1'],
  Anniversary10: ['GIMMIGHOUL_COIN_A2_2026'],
  PokopiaCap: ['DITTO_SPRING_2026_A'],
  PokopiaHat: ['DITTO_SPRING_2026_B'],
};

function cleanWikiText(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/\{\{anchor\|[^}]+\}\}/gi, '')
    .replace(/\{\{OBP\|([^|}]+)\|[^}]+\}\}/gi, '$1')
    .replace(/\{\{ga\|([^|}]+)(?:\|[^}]+)?\}\}/gi, '$1')
    .replace(/\{\{p\|([^|}]+)(?:\|[^}]+)?\}\}/gi, '$1')
    .replace(/\{\{g\|([^}]+)\}\}/g, 'Pokémon $1')
    .replace(/\{\{GO\|(?:[^|}]+\|)?([^}]+)\}\}/g, '$1')
    .replace(/\{\{tt\|([^|}]+)\|[^}]+\}\}/g, '$1')
    .replace(/\{\{m\|([^}]+)\}\}/g, '$1')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function refineCostumeName(bulbaSuffix: string, baseName: string, species: string): string {
  const map: Record<string, string> = {
    O: 'Original Cap',
    W: 'World Cap',
    Li: 'Pikachu Libre',
    Po: 'Pop Star',
    Ro: 'Rock Star',
    PhD: 'Pikachu, Ph.D.',
    Fly: 'Flying (Multicolor Balloons)',
    Fly5: 'Flying (5th Anniversary)',
    FlyOkinawa: 'Flying (Okinawa)',
    FlyGreen: 'Flying (Green Balloons)',
    FlyPurple: 'Flying (Purple Balloons)',
    FlyOrange: 'Flying (Orange Balloons)',
    FlyRed: 'Flying (Red Balloons)',
    WCS2022: 'World Championships 2022',
    WCS2023: 'World Championships 2023',
    WCS2024: 'World Championships 2024',
    WCS2025: 'World Championships 2025 (Varsity Jacket)',
    WCS2026: 'World Championships 2026',
    TShirtGreen: 'Green T-Shirt (Taipei)',
    TShirtPurple: 'Purple T-Shirt (Singapore)',
    TShirtBlue: 'Blue Citrus T-Shirt (Jeju)',
    TShirtBatik: 'Batik Shirt (Indonesia)',
    Amethyst: 'Amethyst Crown',
    Quartz: 'Quartz Crown',
    Pyrite: 'Pyrite Crown',
    Malachite: 'Malachite Crown',
    Aquamarine: 'Aquamarine Crown',
    Sun: 'Sun Crown',
    Moon: 'Moon Crown',
    Anniversary2026Malaysia01: 'PokéXciting! (Malaysia)',
    Anniversary2026Taiwan01: 'PokéXciting! (Taiwan)',
    Anniversary2026Singapore01: 'PokéXciting! (Singapore)',
    Anniversary2026Philippine01: 'PokéXciting! (Philippines)',
    Anniversary2026Thailand01: 'PokéXciting! (Thailand)',
    SmHalloween2022: 'Spooky Festival (Small)',
    LaHalloween2022: 'Spooky Festival (Large)',
    SuHalloween2022: 'Spooky Festival (Super)',
    ABow: 'Bow (Antique)',
  };
  if (map[bulbaSuffix]) return map[bulbaSuffix];
  if ((species === 'Pumpkaboo' || species === 'Gourgeist') && bulbaSuffix === 'Halloween2022') {
    return 'Spooky Festival (Average)';
  }
  if ((species === 'Sinistea' || species === 'Polteageist') && bulbaSuffix === 'Bow') {
    return 'Bow (Phony)';
  }
  if (bulbaSuffix === 'Friede') {
    return "Friede's Goggles";
  }
  if (baseName.startsWith(species + ' wearing ')) {
    const trimmed = baseName.slice((species + ' wearing ').length);
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return baseName;
}

function normalizeToken(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface ParsedBulbaCostume {
  id: string;
  pokemonId: number;
  speciesName: string;
  bulbaSuffix: string;
  costumeName: string;
  regionalFormName: string | null;
  shinyReleased: boolean;
  sortOrder: number;
}

interface WwmSpriteCandidate {
  key: string;
  base: string;
  file: string;
  shinyFile: string | null;
  formId: number | null;
  formProto: string | null;
  costumeId: number | null;
  costumeProto: string | null;
  proto: string;
}

function parseBulbapediaEventWikitext(wt: string): ParsedBulbaCostume[] {
  const listStart = wt.indexOf('==List of Event Pokémon==');
  if (listStart === -1) {
    throw new Error('Sezione ==List of Event Pokémon== non trovata su Bulbapedia');
  }
  const triviaStart = wt.indexOf('==Trivia==', listStart);
  const section = wt.slice(listStart, triviaStart > -1 ? triviaStart : undefined);
  const rows = section.split(/\n\|-[^\n]*/);

  const entries: ParsedBulbaCostume[] = [];
  const seenCodes = new Set<string>();
  let activeRowspanName: string | null = null;
  let activeRowspanRemaining = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.includes('MSP/GO')) continue;

    const lines = row.split('\n');
    const cols: string[] = [];
    for (const line of lines) {
      if (line.startsWith('|}')) break;
      if (line.startsWith('|')) {
        cols.push(line.slice(1));
      } else if (cols.length > 0) {
        cols[cols.length - 1] += '\n' + line;
      }
    }

    let formCol = '';
    let baseCol = '';
    let evoCol = '';
    let availCol = '';

    if (activeRowspanRemaining > 0 && activeRowspanName !== null) {
      formCol = activeRowspanName;
      activeRowspanRemaining--;
      [baseCol = '', evoCol = '', availCol = ''] = cols;
    } else {
      let rawForm = cols[0] || '';
      const rsMatch = rawForm.match(/rowspan\s*=\s*"?(\d+)"?\s*\|([\s\S]*)/i);
      if (rsMatch) {
        activeRowspanRemaining = parseInt(rsMatch[1], 10) - 1;
        formCol = cleanWikiText(rsMatch[2]);
        activeRowspanName = formCol;
      } else {
        if (rawForm.includes('|') && !rawForm.trim().startsWith('{{') && !rawForm.trim().startsWith('[[')) {
          const pipeIdx = rawForm.indexOf('|');
          const before = rawForm.slice(0, pipeIdx);
          if (/style|class|colspan|align/i.test(before)) {
            rawForm = rawForm.slice(pipeIdx + 1);
          }
        }
        formCol = cleanWikiText(rawForm);
      }
      [baseCol = '', evoCol = '', availCol = ''] = cols.slice(1);
    }

    const hasShinyAnywhere = /Shinystar\/GO/i.test(availCol);

    const extractTemplates = (colText: string) => {
      if (!colText) return;
      const regex = /\{\{MSP\/GO\|([^}]+)\}\}/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(colText)) !== null) {
        const inner = m[1];
        const commentMatch = inner.match(/<!--\s*([^->\s]+)\s*-->/);
        const cleanInner = inner.replace(/<!--[\s\S]*?-->/g, '');
        const positional = cleanInner
          .split('|')
          .filter(p => !/^[a-zA-Z0-9_-]+\s*=/.test(p.trim()));
        let code = (positional[0] || '').trim();
        const species = (positional[1] || '').trim();
        if (/^\d{4}$/.test(code) && commentMatch) {
          code = commentMatch[1];
        }
        if (!code) continue;

        if (seenCodes.has(code)) {
          const existing = entries.find(e => e.id === code);
          if (existing && hasShinyAnywhere) existing.shinyReleased = true;
          continue;
        }
        seenCodes.add(code);

        const dexMatch = code.match(/^0*(\d+)/);
        const dexId = dexMatch ? parseInt(dexMatch[1], 10) : 0;
        if (!dexId) continue;

        const suffix = code.replace(/^0*\d+/, '');
        let regionalFormName: string | null = null;
        if ((dexId === 77 || dexId === 222 || dexId === 263) && suffix.startsWith('G')) {
          regionalFormName = 'Galarian';
        } else if (/^A[A-Z]/.test(suffix) && !/^(Anniversary|April|Adventure|Amethyst|Aquamarine|Astronaut|ABow)/.test(suffix)) {
          regionalFormName = 'Alolan';
        } else if (/^H[A-Z]/.test(suffix) && !/^(Holiday|Halloween|Hoenn|Hanbok|Hat)/.test(suffix)) {
          regionalFormName = 'Hisuian';
        } else if (/^P[A-Z]/.test(suffix) && !/^(Party|Pyrite|Pop|PhD|Purple|Pok|Pink)/.test(suffix)) {
          regionalFormName = 'Paldean';
        }

        entries.push({
          id: code,
          pokemonId: dexId,
          speciesName: species,
          bulbaSuffix: suffix,
          costumeName: refineCostumeName(suffix, formCol, species),
          regionalFormName,
          shinyReleased: hasShinyAnywhere,
          sortOrder: entries.length + 1,
        });
      }
    };

    extractTemplates(baseCol);
    extractTemplates(evoCol);
  }

  return entries;
}

function buildWwmCandidatesByDex(rawMaster: any, uiconsIndex: any): Map<number, WwmSpriteCandidate[]> {
  const pokeFiles: string[] = Array.isArray(uiconsIndex?.pokemon) ? uiconsIndex.pokemon : [];
  const pokeFilesSet = new Set<string>(pokeFiles);
  const byDex = new Map<number, Map<string, WwmSpriteCandidate>>();

  for (const file of pokeFiles) {
    if (!file.endsWith('.webp') || file.includes('_s.webp') || file.includes('_a') || file.includes('_b') || file.includes('_e')) {
      continue;
    }
    const base = file.replace('.webp', '');
    const m = base.match(/^(\d+)(?:_f(\d+))?(?:_g(\d+))?(?:_c(\d+))?$/);
    if (!m) continue;

    const dexId = parseInt(m[1], 10);
    const formId = m[2] ? parseInt(m[2], 10) : null;
    const gender = m[3] ? parseInt(m[3], 10) : null;
    const costumeId = m[4] ? parseInt(m[4], 10) : null;
    if (!formId && !costumeId) continue;

    const formInfo = formId ? rawMaster?.forms?.[String(formId)] : null;
    const costumeInfo = costumeId ? rawMaster?.costumes?.[String(costumeId)] : null;

    let isEvent = !!costumeId;
    if (!isEvent && formInfo) {
      const p: string = formInfo.proto || '';
      const suffix = p.replace(/^[A-Z0-9]+_/, '');
      if (
        formInfo.isCostume ||
        formId === 133 ||
        /COPY_2019|GOGGLES_2026|SWIM_2025|ANNIVERSARY_20\d\d|K_20\d\d|HALLOWEEN|HOLIDAY|WILDAREA|COSTUME|HORIZON/i.test(p)
      ) {
        isEvent = true;
      } else if (
        !NON_EVENT_FORMS.has(suffix) &&
        !/^(ALOLA|GALARIAN|HISUIAN|PALDEA|GALAR|HISUI)/.test(suffix) &&
        !/_(NORMAL|SHADOW|PURIFIED)$/.test(p)
      ) {
        if (/20\d\d|HAT|CAP|CROWN|BOW|JACKET|SCARF|SHIRT|RIBBON|GLASSES|WREATH|TIARA|VISOR|FLOWER|SUN|MOON|WCS|GOFEST|GOTOUR|SAFARI|FASHION|SPRING|SUMMER|FALL|WINTER/i.test(p)) {
          isEvent = true;
        }
      }
    }
    if (!isEvent) continue;

    const key = `${formId || 0}_${costumeId || 0}`;
    if (!byDex.has(dexId)) byDex.set(dexId, new Map());
    const dexMap = byDex.get(dexId)!;
    if (!dexMap.has(key) || gender === null) {
      const shinyFile = `${base}_s.webp`;
      dexMap.set(key, {
        key,
        base,
        file,
        shinyFile: pokeFilesSet.has(shinyFile) ? shinyFile : null,
        formId,
        formProto: formInfo?.proto || null,
        costumeId,
        costumeProto: costumeInfo?.proto || null,
        proto: costumeInfo?.proto || formInfo?.proto || '',
      });
    }
  }

  const result = new Map<number, WwmSpriteCandidate[]>();
  for (const [dexId, map] of byDex.entries()) {
    result.set(dexId, Array.from(map.values()));
  }
  return result;
}

/**
 * Sincronizza automaticamente i Pokémon in costume da Bulbapedia (Event_Pokémon_(GO))
 * abbinando gli sprite ufficiali normali e shiny da WatWowMap UIcons WebP + Masterfile.
 */
export async function performCostumeAutoSync(
  db: Database,
  fetchWithTimeout: FetchWithTimeoutFn
): Promise<CostumeSyncResult> {
  console.log('[Auto-Sync-Costumes] Avvio sincronizzazione costumi da Bulbapedia + WatWowMap UIcons...');

  // 1. Scarica la lista aggiornata di tutti i costumi rilasciati da Bulbapedia
  const bulbaResp = await fetchWithTimeout(BULBA_EVENT_URL, {}, 25000);
  if (!bulbaResp.ok) {
    throw new Error(`Bulbapedia Event Pokémon API status ${bulbaResp.status}`);
  }
  const bulbaJson = (await bulbaResp.json()) as any;
  const wikitext: string = bulbaJson?.parse?.wikitext?.['*'] || '';
  const parsedCostumes = parseBulbapediaEventWikitext(wikitext);

  if (parsedCostumes.length < 250) {
    throw new Error(`Conteggio costumi anomalo da Bulbapedia: ${parsedCostumes.length}`);
  }

  // 2. Scarica WatWowMap Masterfile + UIcons index per abbinare gli sprite (anche dei costumi appena rilasciati)
  let wwmByDex = new Map<number, WwmSpriteCandidate[]>();
  let wwmFilesSet = new Set<string>();
  let source = 'Bulbapedia + WatWowMap UIcons';

  try {
    const [masterResp, indexResp] = await Promise.all([
      fetchWithTimeout(WWM_MASTER_URL, {}, 25000),
      fetchWithTimeout(WWM_INDEX_URL, {}, 25000),
    ]);
    if (masterResp.ok && indexResp.ok) {
      const [rawMaster, uiconsIndex] = await Promise.all([masterResp.json(), indexResp.json()]);
      wwmFilesSet = new Set<string>(Array.isArray((uiconsIndex as any)?.pokemon) ? (uiconsIndex as any).pokemon : []);
      wwmByDex = buildWwmCandidatesByDex(rawMaster, uiconsIndex);
    } else {
      source = 'Bulbapedia (cache sprite locale)';
    }
  } catch (wwmErr) {
    console.warn('[Auto-Sync-Costumes] Impossibile scaricare WatWowMap index/masterfile, uso cache locale:', wwmErr);
    source = 'Bulbapedia (cache sprite locale)';
  }

  // 3. Carica i costumi esistenti nel DB + pokemon validi per verificare foreign key e preservare mapping verificati
  const existingRows = await db.all<any[]>('SELECT * FROM pokemon_costumes');
  const existingById = new Map<string, any>();
  for (const r of existingRows) {
    existingById.set(r.id, r);
  }

  const validPokemonRows = await db.all<{ id: number; spriteUrl: string }[]>(
    'SELECT id, spriteUrl FROM pokemons WHERE parentId IS NULL'
  );
  const validPokemonMap = new Map<number, string>();
  for (const r of validPokemonRows) {
    validPokemonMap.set(r.id, r.spriteUrl);
  }

  // Raggruppa per pokemonId per eseguire il matching 1-to-1 sugli sprite WWM
  const byDex = new Map<number, ParsedBulbaCostume[]>();
  for (const c of parsedCostumes) {
    if (!validPokemonMap.has(c.pokemonId)) continue;
    if (!byDex.has(c.pokemonId)) byDex.set(c.pokemonId, []);
    byDex.get(c.pokemonId)!.push(c);
  }

  const newlyAdded: string[] = [];
  const newlyShiny: string[] = [];
  let spritesUpgraded = 0;

  const toUpsert: Array<{
    id: string;
    pokemonId: number;
    speciesName: string;
    costumeName: string;
    costumeKey: string | null;
    spriteUrl: string;
    shinySpriteUrl: string | null;
    shinyReleased: number;
    regionalFormName: string | null;
    sortOrder: number;
  }> = [];

  for (const [dexId, bList] of byDex.entries()) {
    let wList = (wwmByDex.get(dexId) || []).slice();
    if (dexId === 150) wList = wList.filter(w => w.costumeId !== 3);
    if (dexId === 172) wList = wList.filter(w => w.costumeId !== 6);
    if (dexId === 25 || dexId === 26) wList = wList.filter(w => w.costumeId !== 69);

    const usedKeys = new Set<string>();
    const assignments = bList.map(b => ({ b, w: null as WwmSpriteCandidate | null }));

    // Pass 0: preserva mapping già verificati presenti nel DB (costumeKey)
    for (const a of assignments) {
      const ex = existingById.get(a.b.id);
      if (ex?.costumeKey) {
        const cand = wList.find(w => !usedKeys.has(w.key) && w.base === ex.costumeKey);
        if (cand) {
          a.w = cand;
          usedKeys.add(cand.key);
        }
      }
    }

    // Pass 1: hint table esplicita
    for (const a of assignments) {
      if (a.w) continue;
      const hints = SUFFIX_TO_PROTO[a.b.bulbaSuffix];
      if (hints) {
        for (const h of hints) {
          const cand = wList.find(
            w =>
              !usedKeys.has(w.key) &&
              (w.proto === h || w.costumeProto === h || w.formProto === h || (w.proto && w.proto.includes(h)))
          );
          if (cand) {
            a.w = cand;
            usedKeys.add(cand.key);
            break;
          }
        }
      }
    }

    // Pass 2: fuzzy token match per nuovi costumi futuri
    for (const a of assignments) {
      if (a.w) continue;
      const normSuf = normalizeToken(a.b.bulbaSuffix);
      let best: WwmSpriteCandidate | null = null;
      let bestScore = 0;

      for (const w of wList) {
        if (usedKeys.has(w.key)) continue;
        const normP = normalizeToken(w.proto);
        let score = 0;
        if (normP && normP === normSuf) score = 100;
        else if (normP && (normP.includes(normSuf) || normSuf.includes(normP))) score = 70;
        else {
          const bTokens: string[] = (a.b.bulbaSuffix + ' ' + a.b.costumeName).toLowerCase().match(/[a-z]{3,}|\d{4}/g) || [];
          const wTokens: string[] = (w.proto || '').toLowerCase().match(/[a-z]{3,}|\d{4}/g) || [];
          for (const bt of bTokens) {
            if (wTokens.includes(bt)) score += /^\d{4}$/.test(bt) ? 25 : 15;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = w;
        }
      }
      if (best && bestScore >= 25) {
        a.w = best;
        usedKeys.add(best.key);
      }
    }

    // Pass 3: se resta esattamente 1 costume non abbinato e 1 sprite WWM libero per questa specie, abbinali!
    const remA = assignments.filter(a => !a.w);
    const remW = wList.filter(w => !usedKeys.has(w.key));
    if (remA.length === 1 && remW.length === 1) {
      remA[0].w = remW[0];
      usedKeys.add(remW[0].key);
    }

    for (const a of assignments) {
      const ex = existingById.get(a.b.id);
      const fallbackSprite = validPokemonMap.get(dexId) || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexId}.png`;
      const fallbackShiny = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${dexId}.png`;

      let costumeKey: string | null = ex?.costumeKey || null;
      let spriteUrl: string = ex?.spriteUrl || fallbackSprite;
      let shinySpriteUrl: string | null = ex?.shinySpriteUrl || (a.b.shinyReleased ? fallbackShiny : null);

      if (a.w) {
        const newSprite = WWM_SPRITE_BASE + a.w.file;
        const newShiny = a.w.shinyFile ? WWM_SPRITE_BASE + a.w.shinyFile : null;
        if (ex && !ex.costumeKey && a.w.base) {
          spritesUpgraded++;
        }
        costumeKey = a.w.base;
        spriteUrl = newSprite;
        shinySpriteUrl = newShiny;
      } else if (ex?.costumeKey && wwmFilesSet.size > 0) {
        // Mantieni sprite esistente se valido
        spriteUrl = ex.spriteUrl;
        shinySpriteUrl = ex.shinySpriteUrl;
      }

      const shinyReleased = a.b.shinyReleased || (ex?.shinyReleased === 1) ? 1 : 0;

      if (!ex) {
        newlyAdded.push(`${a.b.speciesName} (${a.b.costumeName})`);
      } else if (ex.shinyReleased === 0 && shinyReleased === 1) {
        newlyShiny.push(`${a.b.speciesName} (${a.b.costumeName})`);
      }

      toUpsert.push({
        id: a.b.id,
        pokemonId: a.b.pokemonId,
        speciesName: a.b.speciesName,
        costumeName: a.b.costumeName,
        costumeKey,
        spriteUrl,
        shinySpriteUrl,
        shinyReleased,
        regionalFormName: a.b.regionalFormName,
        sortOrder: a.b.sortOrder,
      });
    }
  }

  // 4. Salva tutto in una singola transazione SQLite
  await db.run('BEGIN TRANSACTION;');
  try {
    const stmt = await db.prepare(`
      INSERT INTO pokemon_costumes (
        id, pokemonId, speciesName, costumeName, costumeKey,
        spriteUrl, shinySpriteUrl, shinyReleased, regionalFormName, sortOrder
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        pokemonId = excluded.pokemonId,
        speciesName = excluded.speciesName,
        costumeName = excluded.costumeName,
        costumeKey = COALESCE(excluded.costumeKey, pokemon_costumes.costumeKey),
        spriteUrl = excluded.spriteUrl,
        shinySpriteUrl = excluded.shinySpriteUrl,
        shinyReleased = MAX(pokemon_costumes.shinyReleased, excluded.shinyReleased),
        regionalFormName = excluded.regionalFormName,
        sortOrder = excluded.sortOrder;
    `);

    for (const item of toUpsert) {
      await stmt.run(
        item.id,
        item.pokemonId,
        item.speciesName,
        item.costumeName,
        item.costumeKey,
        item.spriteUrl,
        item.shinySpriteUrl,
        item.shinyReleased,
        item.regionalFormName,
        item.sortOrder
      );
    }

    await stmt.finalize();
    await db.run('COMMIT;');
  } catch (err) {
    try { await db.run('ROLLBACK;'); } catch (_) {}
    throw err;
  }

  console.log(
    `[Auto-Sync-Costumes] Sincronizzazione completata da ${source}. Totale: ${toUpsert.length}, Nuovi: ${newlyAdded.length}, Nuovi Shiny: ${newlyShiny.length}, Sprite aggiornati: ${spritesUpgraded}.`
  );

  return {
    totalCostumes: toUpsert.length,
    newlyAdded,
    newlyShiny,
    spritesUpgraded,
    source,
  };
}
