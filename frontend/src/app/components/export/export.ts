import { Component, OnInit, OnDestroy, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { SHADOW_CAPABLE_SPECIES, MEGA_CAPABLE_SPECIES, GIGAMAX_CAPABLE_SPECIES, UNRELEASED_SPECIES } from '../../services/pokemon-config';

// Evolutionary parent mapping (child -> parent)
const EVOLVES_FROM: Record<string, string> = {
  // Gen 1
  'Ivysaur': 'Bulbasaur',
  'Venusaur': 'Ivysaur',
  'Charmeleon': 'Charmander',
  'Charizard': 'Charmeleon',
  'Wartortle': 'Squirtle',
  'Blastoise': 'Wartortle',
  'Metapod': 'Caterpie',
  'Butterfree': 'Metapod',
  'Kakuna': 'Weedle',
  'Beedrill': 'Kakuna',
  'Pidgeotto': 'Pidgey',
  'Pidgeot': 'Pidgeotto',
  'Raticate': 'Rattata',
  'Fearow': 'Spearow',
  'Arbok': 'Ekans',
  'Raichu': 'Pikachu',
  'Pikachu': 'Pichu',
  'Sandslash': 'Sandshrew',
  'Nidorina': 'Nidoran♀',
  'Nidoqueen': 'Nidorina',
  'Nidorino': 'Nidoran♂',
  'Nidoking': 'Nidorino',
  'Clefairy': 'Cleffa',
  'Clefable': 'Clefairy',
  'Jigglypuff': 'Igglybuff',
  'Wigglytuff': 'Jigglypuff',
  'Golbat': 'Zubat',
  'Crobat': 'Golbat',
  'Gloom': 'Oddish',
  'Vileplume': 'Gloom',
  'Bellossom': 'Gloom',
  'Parasect': 'Paras',
  'Venomoth': 'Venonat',
  'Dugtrio': 'Diglett',
  'Persian': 'Meowth',
  'Perrserker': 'Meowth',
  'Golduck': 'Psyduck',
  'Primeape': 'Mankey',
  'Annihilape': 'Primeape',
  'Arcanine': 'Growlithe',
  'Poliwhirl': 'Poliwag',
  'Poliwrath': 'Poliwhirl',
  'Politoed': 'Poliwhirl',
  'Kadabra': 'Abra',
  'Alakazam': 'Kadabra',
  'Machoke': 'Machop',
  'Machamp': 'Machoke',
  'Weepinbell': 'Bellsprout',
  'Victreebel': 'Weepinbell',
  'Tentacruel': 'Tentacool',
  'Graveler': 'Geodude',
  'Golem': 'Graveler',
  'Rapidash': 'Ponyta',
  'Slowbro': 'Slowpoke',
  'Slowking': 'Slowpoke',
  'Magneton': 'Magnemite',
  'Magnezone': 'Magneton',
  'Sirfetch\'d': 'Farfetch\'d',
  'Dodrio': 'Doduo',
  'Dewgong': 'Seel',
  'Muk': 'Grimer',
  'Haunter': 'Gastly',
  'Gengar': 'Haunter',
  'Steelix': 'Onix',
  'Hypno': 'Drowzee',
  'Kingler': 'Krabby',
  'Electrode': 'Voltorb',
  'Exeggutor': 'Exeggcute',
  'Marowak': 'Cubone',
  'Hitmonlee': 'Tyrogue',
  'Hitmonchan': 'Tyrogue',
  'Hitmontop': 'Tyrogue',
  'Lickilicky': 'Lickitung',
  'Weezing': 'Koffing',
  'Rhydon': 'Rhyhorn',
  'Rhyperior': 'Rhydon',
  'Chansey': 'Happiny',
  'Blissey': 'Chansey',
  'Tangrowth': 'Tangela',
  'Seadra': 'Horsea',
  'Kingdra': 'Seadra',
  'Seaking': 'Goldeen',
  'Starmie': 'Staryu',
  'Mr. Mime': 'Mime Jr.',
  'Mr. Rime': 'Mr. Mime',
  'Scizor': 'Scyther',
  'Kleavor': 'Scyther',
  'Jynx': 'Smoochum',
  'Electabuzz': 'Elekid',
  'Electivire': 'Electabuzz',
  'Magmar': 'Magby',
  'Magmortar': 'Magmar',
  'Gyarados': 'Magikarp',
  'Vaporeon': 'Eevee',
  'Jolteon': 'Eevee',
  'Flareon': 'Eevee',
  'Espeon': 'Eevee',
  'Umbreon': 'Eevee',
  'Leafeon': 'Eevee',
  'Glaceon': 'Eevee',
  'Sylveon': 'Eevee',
  'Porygon2': 'Porygon',
  'Porygon-Z': 'Porygon2',
  'Omastar': 'Omanyte',
  'Kabutops': 'Kabuto',
  'Snorlax': 'Munchlax',
  'Dragonair': 'Dratini',
  'Dragonite': 'Dragonair',

  // Gen 2
  'Bayleef': 'Chikorita',
  'Meganium': 'Bayleef',
  'Quilava': 'Cyndaquil',
  'Typhlosion': 'Quilava',
  'Croconaw': 'Totodile',
  'Feraligatr': 'Croconaw',
  'Furret': 'Sentret',
  'Noctowl': 'Hoothoot',
  'Ledian': 'Ledyba',
  'Ariados': 'Spinarak',
  'Lanturn': 'Chinchou',
  'Togetic': 'Togepi',
  'Togekiss': 'Togetic',
  'Xatu': 'Natu',
  'Flaaffy': 'Mareep',
  'Ampharos': 'Flaaffy',
  'Azumarill': 'Marill',
  'Marill': 'Azurill',
  'Sudowoodo': 'Bonsly',
  'Jumpluff': 'Skiploom',
  'Skiploom': 'Hoppip',
  'Sunflora': 'Sunkern',
  'Quagsire': 'Wooper',
  'Wobbuffet': 'Wynaut',
  'Farigiraf': 'Girafarig',
  'Forretress': 'Pineco',
  'Dudunsparce': 'Dunsparce',
  'Granbull': 'Snubbull',
  'Ursaring': 'Teddiursa',
  'Ursaluna': 'Ursaring',
  'Magcargo': 'Slugma',
  'Piloswine': 'Swinub',
  'Mamoswine': 'Piloswine',
  'Octillery': 'Remoraid',
  'Mantine': 'Mantyke',
  'Houndoom': 'Houndour',
  'Donphan': 'Phanpy',
  'Pupitar': 'Larvitar',
  'Tyranitar': 'Pupitar',

  // Gen 3
  'Grovyle': 'Treecko',
  'Sceptile': 'Grovyle',
  'Combusken': 'Torchic',
  'Blaziken': 'Combusken',
  'Marshtomp': 'Mudkip',
  'Swampert': 'Marshtomp',
  'Mightyena': 'Poochyena',
  'Linoone': 'Zigzagoon',
  'Obstagoon': 'Linoone',
  'Beautifly': 'Silcoon',
  'Silcoon': 'Wurmple',
  'Dustox': 'Cascoon',
  'Cascoon': 'Wurmple',
  'Lombre': 'Lotad',
  'Ludicolo': 'Lombre',
  'Nuzleaf': 'Seedot',
  'Shiftry': 'Nuzleaf',
  'Swellow': 'Taillow',
  'Pelipper': 'Wingull',
  'Kirlia': 'Ralts',
  'Gardevoir': 'Kirlia',
  'Gallade': 'Kirlia',
  'Masquerain': 'Surskit',
  'Breloom': 'Shroomish',
  'Vigoroth': 'Slakoth',
  'Slaking': 'Vigoroth',
  'Ninjask': 'Nincada',
  'Shedinja': 'Nincada',
  'Loudred': 'Whismur',
  'Exploud': 'Loudred',
  'Hariyama': 'Makuhita',
  'Delcatty': 'Skitty',
  'Lairon': 'Aron',
  'Aggron': 'Lairon',
  'Medicham': 'Meditite',
  'Manectric': 'Electrike',
  'Roselia': 'Budew',
  'Roserade': 'Roselia',
  'Swalot': 'Gulpin',
  'Sharpedo': 'Carvanha',
  'Wailord': 'Wailmer',
  'Camerupt': 'Numel',
  'Grumpig': 'Spoink',
  'Vibrava': 'Trapinch',
  'Flygon': 'Vibrava',
  'Cacturne': 'Cacnea',
  'Altaria': 'Swablu',
  'Crawdaunt': 'Corphish',
  'Claydol': 'Baltoy',
  'Cradily': 'Lileep',
  'Armaldo': 'Anorith',
  'Milotic': 'Feebas',
  'Banette': 'Shuppet',
  'Dusclops': 'Duskull',
  'Dusknoir': 'Dusclops',
  'Chimecho': 'Chingling',
  'Glalie': 'Snorunt',
  'Froslass': 'Snorunt',
  'Sealeo': 'Spheal',
  'Walrein': 'Sealeo',
  'Huntail': 'Clamperl',
  'Gorebyss': 'Clamperl',
  'Shelgon': 'Bagon',
  'Salamence': 'Shelgon',
  'Metang': 'Beldum',
  'Metagross': 'Metang',

  // Gen 4
  'Grotle': 'Turtwig',
  'Torterra': 'Grotle',
  'Monferno': 'Chimchar',
  'Infernape': 'Monferno',
  'Prinplup': 'Piplup',
  'Empoleon': 'Prinplup',
  'Staravia': 'Starly',
  'Staraptor': 'Staravia',
  'Bibarel': 'Bidoof',
  'Kricketune': 'Kricketot',
  'Luxio': 'Shinx',
  'Luxray': 'Luxio',
  'Rampardos': 'Cranidos',
  'Bastiodon': 'Shieldon',
  'Wormadam': 'Burmy',
  'Mothim': 'Burmy',
  'Vespiquen': 'Combee',
  'Floatzel': 'Buizel',
  'Cherrim': 'Cherubi',
  'Gastrodon': 'Shellos',
  'Ambipom': 'Aipom',
  'Drifblim': 'Drifloon',
  'Lopunny': 'Buneary',
  'Mismagius': 'Misdreavus',
  'Honchkrow': 'Murkrow',
  'Purugly': 'Glameow',
  'Skuntank': 'Stunky',
  'Bronzong': 'Bronzor',
  'Lucario': 'Riolu',
  'Hippowdon': 'Hippopotas',
  'Drapion': 'Skorupi',
  'Toxicroak': 'Croagunk',
  'Lumineon': 'Finneon',
  'Abomasnow': 'Snover',
  'Weavile': 'Sneasel',
  'Sneasler': 'Sneasel',
  'Yanmega': 'Yanma',
  'Gliscor': 'Gligar',

  // Gen 5
  'Servine': 'Snivy',
  'Serperior': 'Servine',
  'Pignite': 'Tepig',
  'Emboar': 'Pignite',
  'Dewott': 'Oshawott',
  'Samurott': 'Dewott',
  'Watchog': 'Patrat',
  'Herdier': 'Lillipup',
  'Stoutland': 'Herdier',
  'Liepard': 'Purrloin',
  'Simisage': 'Pansage',
  'Simisear': 'Pansear',
  'Simipour': 'Panpour',
  'Musharna': 'Munna',
  'Tranquill': 'Pidove',
  'Unfezant': 'Tranquill',
  'Zebstrika': 'Blitzle',
  'Boldore': 'Roggenrola',
  'Gigalith': 'Boldore',
  'Swoobat': 'Woobat',
  'Excadrill': 'Drilbur',
  'Gurdurr': 'Timburr',
  'Conkeldurr': 'Gurdurr',
  'Palpitoad': 'Tympole',
  'Seismitoad': 'Palpitoad',
  'Swadloon': 'Sewaddle',
  'Leavanny': 'Swadloon',
  'Whimsicott': 'Cottonee',
  'Lilligant': 'Petilil',
  'Krokorok': 'Sandile',
  'Krookodile': 'Krokorok',
  'Darmanitan': 'Darumaka',
  'Crustle': 'Dwebble',
  'Scrafty': 'Scraggy',
  'Cofagrigus': 'Yamask',
  'Carracosta': 'Tirtouga',
  'Archeops': 'Archen',
  'Garbodor': 'Trubbish',
  'Zoroark': 'Zorua',
  'Cinccino': 'Minccino',
  'Gothorita': 'Gothita',
  'Gothitelle': 'Gothorita',
  'Duosion': 'Solosis',
  'Reuniclus': 'Duosion',
  'Swanna': 'Ducklett',
  'Vanillish': 'Vanillite',
  'Vanilluxe': 'Vanillish',
  'Sawsbuck': 'Deerling',
  'Escavalier': 'Karrablast',
  'Amoonguss': 'Foongus',
  'Jellicent': 'Frillish',
  'Galvantula': 'Joltik',
  'Ferrothorn': 'Ferroseed',
  'Klang': 'Klink',
  'Klinklang': 'Klang',
  'Eelektrik': 'Tynamo',
  'Eelektross': 'Eelektrik',
  'Beheeyem': 'Elgyem',
  'Lampent': 'Litwick',
  'Chandelure': 'Lampent',
  'Fraxure': 'Axew',
  'Haxorus': 'Fraxure',
  'Beartic': 'Cubchoo',
  'Accelgor': 'Shelmet',
  'Mienshao': 'Mienfoo',
  'Golurk': 'Golett',
  'Bisharp': 'Pawniard',
  'Kingambit': 'Bisharp',
  'Braviary': 'Rufflet',
  'Mandibuzz': 'Vullaby',
  'Zweilous': 'Deino',
  'Hydreigon': 'Zweilous',
  'Volcarona': 'Larvesta',

  // Gen 6
  'Quilladin': 'Chespin',
  'Chesnaught': 'Quilladin',
  'Braixen': 'Fennekin',
  'Delphox': 'Braixen',
  'Frogadier': 'Froakie',
  'Greninja': 'Frogadier',
  'Diggersby': 'Bunnelby',
  'Fletchinder': 'Fletchling',
  'Talonflame': 'Fletchinder',
  'Spewpa': 'Scatterbug',
  'Vivillon': 'Spewpa',
  'Pyroar': 'Litleo',
  'Floette': 'Flabebe',
  'Florges': 'Floette',
  'Gogoat': 'Skiddo',
  'Pangoro': 'Pancham',
  'Meowstic': 'Espurr',
  'Doublade': 'Honedge',
  'Aegislash': 'Doublade',
  'Aromatisse': 'Spritzee',
  'Slurpuff': 'Swirlix',
  'Malamar': 'Inkay',
  'Barbaracle': 'Binacle',
  'Dragalge': 'Skrelp',
  'Clawitzer': 'Clauncher',
  'Heliolisk': 'Helioptile',
  'Tyrantrum': 'Tyrunt',
  'Aurorus': 'Amaura',
  'Sliggoo': 'Goomy',
  'Goodra': 'Sliggoo',
  'Trevenant': 'Phantump',
  'Gourgeist': 'Pumpkaboo',
  'Avalugg': 'Bergmite',
  'Noivern': 'Noibat',

  // Gen 7
  'Dartrix': 'Rowlet',
  'Decidueye': 'Dartrix',
  'Torracat': 'Litten',
  'Incineroar': 'Torracat',
  'Brionne': 'Popplio',
  'Primarina': 'Brionne',
  'Trumbeak': 'Pikipek',
  'Toucannon': 'Trumbeak',
  'Gumshoos': 'Yungoos',
  'Charjabug': 'Grubbin',
  'Vikavolt': 'Charjabug',
  'Crabominable': 'Crabrawler',
  'Ribombee': 'Cutiefly',
  'Lycanroc': 'Rockruff',
  'Toxapex': 'Mareanie',
  'Mudsdale': 'Mudbray',
  'Araquanid': 'Dewpider',
  'Lurantis': 'Fomantis',
  'Shiinotic': 'Morelull',
  'Salazzle': 'Salandit',
  'Bewear': 'Stufful',
  'Steenee': 'Bounsweet',
  'Tsareena': 'Steenee',
  'Golisopod': 'Wimpod',
  'Palossand': 'Sandygast',
  'Silvally': 'Type: Null',
  'Hakamo-o': 'Jangmo-o',
  'Kommo-o': 'Hakamo-o',
  'Cosmoem': 'Cosmog',
  'Solgaleo': 'Cosmoem',
  'Lunala': 'Cosmoem',
  'Melmetal': 'Meltan',

  // Gen 8
  'Thwackey': 'Grookey',
  'Rillaboom': 'Thwackey',
  'Raboot': 'Scorbunny',
  'Cinderace': 'Raboot',
  'Drizzile': 'Sobble',
  'Inteleon': 'Drizzile',
  'Greedent': 'Skwovet',
  'Corvisquire': 'Rookidee',
  'Corviknight': 'Corvisquire',
  'Dottler': 'Blipbug',
  'Orbeetle': 'Dottler',
  'Thievul': 'Nickit',
  'Eldegoss': 'Gossifleur',
  'Dubwool': 'Wooloo',
  'Drednaw': 'Chewtle',
  'Boltund': 'Yamper',
  'Carkol': 'Rolycoly',
  'Coalossal': 'Carkol',
  'Flapple': 'Applin',
  'Appletun': 'Applin',
  'Dipplin': 'Applin',
  'Hydrapple': 'Dipplin',
  'Sandaconda': 'Silicobra',
  'Barraskewda': 'Arrokuda',
  'Toxtricity': 'Toxel',
  'Centiskorch': 'Sizzlipede',
  'Grapploct': 'Clobbopus',
  'Polteageist': 'Sinistea',
  'Hattrem': 'Hatenna',
  'Hatterene': 'Hattrem',
  'Morgrem': 'Impidimp',
  'Grimmsnarl': 'Morgrem',
  'Alcremie': 'Milcery',
  'Frosmoth': 'Snom',
  'Copperajah': 'Cufant',
  'Drakloak': 'Dreepy',
  'Dragapult': 'Drakloak',

  // Gen 9
  'Floragato': 'Sprigatito',
  'Meowscarada': 'Floragato',
  'Crocalor': 'Fuecoco',
  'Skeledirge': 'Crocalor',
  'Quaxwell': 'Quaxly',
  'Quaquaval': 'Quaxwell',
  'Oinkologne': 'Lechonk',
  'Lokix': 'Nymble',
  'Pawmo': 'Pawmi',
  'Pawmot': 'Pawmo',
  'Maushold': 'Tandemaus',
  'Dachsbun': 'Fidough',
  'Dolliv': 'Smoliv',
  'Arboliva': 'Dolliv',
  'Naclstack': 'Nacli',
  'Garganacl': 'Naclstack',
  'Armarouge': 'Charcadet',
  'Ceruledge': 'Charcadet',
  'Bellibolt': 'Tadbulb',
  'Kilowattrel': 'Wattrel',
  'Mabosstiff': 'Maschiff',
  'Grafaiai': 'Shroodle',
  'Scovillain': 'Capsakid',
  'Rabsca': 'Rellor',
  'Espathra': 'Flittle',
  'Tinkatuff': 'Tinkatink',
  'Tinkaton': 'Tinkatuff',
  'Wugtrio': 'Wiglett',
  'Palafin': 'Finizen',
  'Revavroom': 'Varoom',
  'Gholdengo': 'Gimmighoul',
  'Arctibax': 'Frigibax',
  'Baxcalibur': 'Arctibax'
};

const MYTHICAL_POKEMON = new Set([
  'Mew', 'Celebi', 'Jirachi', 'Deoxys', 'Phione', 'Manaphy', 'Darkrai', 'Shaymin', 'Arceus',
  'Victini', 'Meloetta', 'Genesect', 'Keldeo', 'Diancie', 'Hoopa', 'Volcanion', 'Magearna',
  'Marshadow', 'Zeraora', 'Meltan', 'Melmetal', 'Zarude', 'Pecharunt'
]);

const LEGENDARY_POKEMON = new Set([
  'Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Raikou', 'Entei', 'Suicune', 'Lugia', 'Ho-Oh',
  'Regirock', 'Regice', 'Registeel', 'Latias', 'Latios', 'Kyogre', 'Groudon', 'Rayquaza',
  'Uxie', 'Mesprit', 'Azelf', 'Dialga', 'Palkia', 'Heatran', 'Regigigas', 'Giratina', 'Cresselia',
  'Cobalion', 'Terrakion', 'Virizion', 'Tornadus', 'Thundurus', 'Reshiram', 'Zekrom', 'Landorus',
  'Kyurem', 'Xerneas', 'Yveltal', 'Zygarde', 'Type: Null', 'Silvally', 'Tapu Koko', 'Tapu Lele',
  'Tapu Bulu', 'Tapu Fini', 'Cosmog', 'Cosmoem', 'Solgaleo', 'Lunala', 'Necrozma', 'Zacian',
  'Zamazenta', 'Eternatus', 'Kubfu', 'Urshifu', 'Regieleki', 'Regidrago', 'Glastrier', 'Spectrier',
  'Calyrex', 'Enamorus', 'Wo-Chien', 'Chien-Pao', 'Ting-Lu', 'Chi-Yu', 'Koraidon', 'Miraidon',
  'Okidogi', 'Munkidori', 'Fezandipiti', 'Ogerpon', 'Gouging Fire', 'Raging Bolt', 'Iron Boulder',
  'Iron Crown', 'Terapagos'
]);

const ULTRA_BEASTS = new Set([
  'Nihilego', 'Buzzwole', 'Pheromosa', 'Xurkitree', 'Celesteela', 'Kartana', 'Guzzlord',
  'Poipole', 'Naganadel', 'Stakataka', 'Blacephalon'
]);

@Component({
  selector: 'app-export',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  templateUrl: './export.html',
  styleUrl: './export.css'
})
export class ExportComponent implements OnInit, OnDestroy {
  // Categorie del Dex
  categories = [
    { value: 'regular' },
    { value: 'shadow' },
    { value: 'purified' },
    { value: 'perfect' },
    { value: 'lucky' },
    { value: 'xxs' },
    { value: 'xxl' },
    { value: 'shiny' },
    { value: 'mega' },
    { value: 'gigamax' }
  ];

  // Stati reattivi
  pokemonList = signal<PokedexDTO[]>([]);
  selectedCategory = signal<string>('regular');
  selectedMode = signal<string>('list'); // 'list' o 'negation'
  selectedFormat = signal<string>('number'); // 'number' o 'name'
  searchString = signal<string>('');
  includeLegendaries = signal<boolean>(false);
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);
  showCopyToast = signal<boolean>(false);

  // Sotto-navigazione Esporta / Importa / Volantino
  activeTab = signal<string>('export'); // 'export', 'import', 'flyer'
  importInput = signal<string>('');
  importCategory = signal<string>('regular');
  importSuccessMessage = signal<string>('');
  importErrorMessage = signal<string>('');
  flyerGenFilter = signal<number>(0); // 0 = tutte le generazioni

  username = '';
  private sub = new Subscription();

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router,
    public settingsService: SettingsService,
    public i18n: I18nService
  ) {
    // Ricalcola automaticamente la stringa quando cambiano i segnali
    effect(() => {
      // Esegui la generazione in reazione ai cambiamenti dei segnali
      this.pokemonList();
      this.selectedCategory();
      this.selectedMode();
      this.selectedFormat();
      this.settingsService.simplifyExport();
      this.includeLegendaries();
      
      this.generateString();
    });
  }

  ngOnInit() {
    // Sottoscrizione ai parametri della rotta dinamica (:username)
    this.sub.add(
      this.route.params.subscribe(params => {
        const routeUser = params['username'];
        if (routeUser) {
          this.username = routeUser;
          // Esegue la find-or-create automatica sul backend
          this.userService.createUser(routeUser).subscribe({
            next: (user) => {
              this.userService.setActiveUser(user);
            },
            error: (err) => console.error('Errore nella registrazione/ricerca dell\'allenatore:', err)
          });
        }
      })
    );

    // Si iscrive all'utente attivo. Quando cambia, carica la lista dei pokemon dal backend
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        if (user && user.name.toLowerCase() === this.username.toLowerCase()) {
          this.activeUser.set(user);
          this.loadPokedexData(user.id);
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  // Carica i dati del Pokédex per l'utente attivo
  loadPokedexData(userId: number) {
    this.isLoading.set(true);
    this.pokedexService.getAllEntries(userId).subscribe({
      next: (list) => {
        this.pokemonList.set(list);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Errore nel caricamento dei dati del Pokedex:', err);
        this.isLoading.set(false);
      }
    });
  }

  // Cambia sotto-tab
  onTabChange(tab: string) {
    this.activeTab.set(tab);
    this.importSuccessMessage.set('');
    this.importErrorMessage.set('');
  }

  // Restituisce la lista di tutti i pokemon rilasciati, raggruppati per generazione
  releasedByGeneration(): { gen: number; label: string; pokemon: PokedexDTO[] }[] {
    const list = this.pokemonList();
    const filterGen = this.flyerGenFilter();
    const genLabels: Record<number, string> = {
      1: 'Gen I — Kanto',
      2: 'Gen II — Johto',
      3: 'Gen III — Hoenn',
      4: 'Gen IV — Sinnoh',
      5: 'Gen V — Unova',
      6: 'Gen VI — Kalos',
      7: 'Gen VII — Alola',
      8: 'Gen VIII — Galar',
      9: 'Gen IX — Paldea',
    };

    const byGen = new Map<number, PokedexDTO[]>();
    for (const p of list) {
      if (!this.isReleased(p.name)) continue;
      const gen = p.generation ?? 1;
      if (!byGen.has(gen)) byGen.set(gen, []);
      byGen.get(gen)!.push(p);
    }

    const result = Array.from(byGen.entries())
      .sort(([a], [b]) => a - b)
      .filter(([gen]) => filterGen === 0 || gen === filterGen)
      .map(([gen, pokemon]) => ({
        gen,
        label: genLabels[gen] ?? `Gen ${gen}`,
        pokemon: pokemon.sort((a, b) => a.id - b.id)
      }));

    return result;
  }

  // Conta totale pokemon rilasciati
  releasedTotal(): number {
    return this.pokemonList().filter(p => this.isReleased(p.name)).length;
  }

  // Copia il volantino come testo
  copyFlyer() {
    const groups = this.releasedByGeneration();
    const lines: string[] = [`=== PoGODex — Pokemon Rilasciati (${this.releasedTotal()}) ===`];
    for (const g of groups) {
      lines.push(`\n${g.label} (${g.pokemon.length})`);
      lines.push(g.pokemon.map(p => `#${p.id} ${p.name}`).join('\n'));
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      this.showCopyToast.set(true);
      setTimeout(() => this.showCopyToast.set(false), 2500);
    });
  }

  // Esegue il parsing delle stringhe del tipo: "1-6, 9, 25-30"
  parsePokemonIds(input: string): number[] {
    const ids = new Set<number>();
    const segments = input.split(',');
    
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      
      if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts.length === 2) {
          const start = parseInt(parts[0].trim(), 10);
          const end = parseInt(parts[1].trim(), 10);
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) {
              ids.add(i);
            }
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num)) {
          ids.add(num);
        }
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }

  // Esegue l'importazione massiva richiamando l'API bulk backend
  onImport(value: boolean) {
    const user = this.activeUser();
    if (!user) return;

    const ids = this.parsePokemonIds(this.importInput());
    if (ids.length === 0) {
      this.importSuccessMessage.set('');
      this.importErrorMessage.set(this.i18n.translate('import.error.empty'));
      return;
    }

    this.isLoading.set(true);
    this.pokedexService.bulkUpdateEntries(user.id, ids, this.importCategory(), value).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.importErrorMessage.set('');
        this.importSuccessMessage.set(this.i18n.translate('import.success') + res.count);
        this.importInput.set(''); // Pulisce il campo al successo
        
        // Ricarica i dati del pokedex locale per aggiornare istantaneamente tutte le viste
        this.loadPokedexData(user.id);
      },
      error: (err) => {
        console.error('Errore nell\'importazione massiva:', err);
        this.isLoading.set(false);
        this.importSuccessMessage.set('');
        this.importErrorMessage.set(this.i18n.translate('import.error.failed'));
      }
    });
  }

  // Helpers per la qualificazione e il rilascio del Pokemon
  canMega(name: string): boolean {
    const baseName = name.split(' (')[0];
    return MEGA_CAPABLE_SPECIES.includes(baseName);
  }

  canGigamax(name: string): boolean {
    const baseName = name.split(' (')[0];
    return GIGAMAX_CAPABLE_SPECIES.includes(baseName);
  }

  canShadow(name: string): boolean {
    const baseName = name.split(' (')[0];
    return SHADOW_CAPABLE_SPECIES.includes(baseName);
  }

  isReleased(name: string): boolean {
    const baseName = name.split(' (')[0];
    return !UNRELEASED_SPECIES.includes(baseName);
  }

  // Risolve il genitore del Pokémon supportando le forme regionali
  getParentName(name: string): string | null {
    if (EVOLVES_FROM[name]) {
      return EVOLVES_FROM[name];
    }

    // Estrae i suffissi regionali
    const match = name.match(/^(.+?)\s*\((Alolan|Galarian|Hisuian|Paldean|Alola|Galar|Hisui|Paldea)\)$/i);
    if (match) {
      const baseName = match[1];
      const suffix = match[2];
      const baseParent = EVOLVES_FROM[baseName];
      if (baseParent) {
        return `${baseParent} (${suffix})`;
      }
    }
    return null;
  }

  // Ottiene la lista di tutti gli antenati evolutivi di un Pokemon
  getAncestors(name: string): string[] {
    const ancestors: string[] = [];
    const visited = new Set<string>(); // Guardia anti-ciclo
    let parent = this.getParentName(name);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      ancestors.push(parent);
      parent = this.getParentName(parent);
    }
    return ancestors;
  }

  isMythical(name: string): boolean {
    const baseName = name.split(' (')[0];
    return MYTHICAL_POKEMON.has(baseName);
  }

  isLegendaryOrUltraBeast(name: string): boolean {
    const baseName = name.split(' (')[0];
    return LEGENDARY_POKEMON.has(baseName) || ULTRA_BEASTS.has(baseName);
  }

  // Verifica se un Pokemon specifico manca nella categoria selezionata
  isMissingForCategory(p: PokedexDTO, category: string): boolean {
    if (!this.isReleased(p.name)) {
      return false; // Se non rilasciato non è da esportare
    }

    // 1) Esclude i misteriosi in quanto non scambiabili
    if (this.isMythical(p.name)) {
      return false;
    }

    // 2) Esclude leggendari e ultracreature se disattivato
    if (!this.includeLegendaries() && this.isLegendaryOrUltraBeast(p.name)) {
      return false;
    }

    switch (category) {
      case 'regular':
        return !p.regular;
      case 'shiny':
        return !p.shiny;
      case 'shadow':
        return this.canShadow(p.name) && !p.shadow;
      case 'purified':
        return this.canShadow(p.name) && !p.purified;
      case 'perfect':
        return !p.perfect;
      case 'lucky':
        return !p.lucky;
      case 'xxs':
        return !p.xxs;
      case 'xxl':
        return !p.xxl;
      case 'mega':
        return this.canMega(p.name) && p.mega === 0;
      case 'gigamax':
        return this.canGigamax(p.name) && !p.gigamax;
      default:
        return false;
    }
  }

  // Verifica se un Pokemon specifico è catturato nella categoria selezionata
  isCaughtForCategory(p: PokedexDTO, category: string): boolean {
    switch (category) {
      case 'regular':
        return p.regular;
      case 'shiny':
        return p.shiny;
      case 'shadow':
        return p.shadow;
      case 'purified':
        return p.purified;
      case 'perfect':
        return p.perfect;
      case 'lucky':
        return p.lucky;
      case 'xxs':
        return p.xxs;
      case 'xxl':
        return p.xxl;
      case 'mega':
        return p.mega > 0;
      case 'gigamax':
        return p.gigamax;
      default:
        return false;
    }
  }

  // Risolve il nome tradotto in base alla lingua
  getPokemonExportName(englishName: string): string {
    const key = 'pokemon.name.' + englishName;
    const translated = this.i18n.translate(key);
    return translated !== key ? translated : englishName;
  }

  // Genera offline in locale la query string in tempo reale
  generateString() {
    const list = this.pokemonList();
    if (!list || list.length === 0) {
      this.searchString.set('');
      return;
    }

    const category = this.selectedCategory();
    const nameToPokemon = new Map<string, PokedexDTO>();
    for (const p of list) {
      nameToPokemon.set(p.name, p);
    }

    const resultList: PokedexDTO[] = [];

    for (const p of list) {
      if (!this.isMissingForCategory(p, category)) {
        continue;
      }

      const ancestors = this.getAncestors(p.name);

      // Regola 1: Escludi se hai già registrato un pre-evoluzione (sempre attiva)
      let hasCaughtAncestor = false;
      for (const ancestorName of ancestors) {
        const ancestorP = nameToPokemon.get(ancestorName);
        if (ancestorP && this.isCaughtForCategory(ancestorP, category)) {
          hasCaughtAncestor = true;
          break;
        }
      }

      if (hasCaughtAncestor) {
        continue;
      }

      // Regola 2: Escludi se manca anche un pre-evoluzione (semplificazione evolutiva - configurable)
      if (this.settingsService.simplifyExport()) {
        let hasMissingAncestor = false;
        for (const ancestorName of ancestors) {
          const ancestorP = nameToPokemon.get(ancestorName);
          if (ancestorP && this.isMissingForCategory(ancestorP, category)) {
            hasMissingAncestor = true;
            break;
          }
        }
        if (hasMissingAncestor) {
          continue;
        }
      }

      resultList.push(p);
    }

    if (resultList.length === 0) {
      this.searchString.set('');
      return;
    }

    // Mappa al formato di output corretto (Numero o Nome Pokémon)
    const items = resultList.map(p => {
      if (this.selectedFormat() === 'name') {
        return this.getPokemonExportName(p.name);
      } else {
        return p.id.toString();
      }
    });

    let generatedQuery = '';
    if (this.selectedMode() === 'negation') {
      generatedQuery = items.map(item => `!${item}`).join('&');
    } else {
      generatedQuery = items.join(',');
    }

    this.searchString.set(generatedQuery);
  }

  // Cambia la categoria selezionata
  onCategoryChange(category: string) {
    this.selectedCategory.set(category);
  }

  // Cambia la modalità selezionata (list vs negation)
  onModeChange(mode: string) {
    this.selectedMode.set(mode);
  }

  // Cambia il formato selezionato (number vs name)
  onFormatChange(format: string) {
    this.selectedFormat.set(format);
  }

  // Copia la stringa negli appunti
  copyToClipboard() {
    if (!this.searchString()) return;
    
    navigator.clipboard.writeText(this.searchString()).then(() => {
      this.showCopyToast.set(true);
      setTimeout(() => {
        this.showCopyToast.set(false);
      }, 2500);
    });
  }
}
