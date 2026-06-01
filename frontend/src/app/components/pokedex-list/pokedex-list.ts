import { Component, OnInit, OnDestroy, AfterViewInit, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { SHADOW_CAPABLE_SPECIES, MEGA_CAPABLE_SPECIES, GIGAMAX_CAPABLE_SPECIES, UNRELEASED_SPECIES, SHINY_UNRELEASED_SPECIES, EVOLVES_FROM, MODAL_FORMS_SPECIES } from '../../services/pokemon-config';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';

const MEGA_ID_MAP: { [key: number]: number | { x: number, y: number } } = {
  3: 10033, // venusaur-mega
  6: { x: 10034, y: 10035 }, // charizard-mega-x, charizard-mega-y
  9: 10036, // blastoise-mega
  15: 10090, // beedrill-mega
  18: 10073, // pidgeot-mega
  65: 10037, // alakazam-mega
  71: 10279, // victreebel-mega
  80: 10071, // slowbro-mega
  94: 10038, // gengar-mega
  115: 10039, // kangaskhan-mega
  127: 10040, // pinsir-mega
  130: 10041, // gyarados-mega
  142: 10042, // aerodactyl-mega
  149: 10281, // dragonite-mega
  150: { x: 10043, y: 10044 }, // mewtwo-mega-x, mewtwo-mega-y
  181: 10045, // ampharos-mega
  208: 10072, // steelix-mega
  212: 10046, // scizor-mega
  214: 10047, // heracross-mega
  229: 10048, // houndoom-mega
  248: 10049, // tyranitar-mega
  254: 10065, // sceptile-mega
  257: 10050, // blaziken-mega
  260: 10064, // swampert-mega
  282: 10051, // gardevoir-mega
  302: 10066, // sableye-mega
  303: 10052, // mawile-mega
  306: 10053, // aggron-mega
  308: 10054, // medicham-mega
  310: 10055, // manectric-mega
  319: 10070, // sharpedo-mega
  323: 10087, // camerupt-mega
  334: 10067, // altaria-mega
  354: 10056, // banette-mega
  359: 10057, // absol-mega
  362: 10074, // glalie-mega
  373: 10089, // salamence-mega
  376: 10076, // metagross-mega
  380: 10062, // latias-mega
  381: 10063, // latios-mega
  382: 10077, // kyogre-primal
  383: 10078, // groudon-primal
  384: 10079, // rayquaza-mega
  428: 10088, // lopunny-mega
  445: 10058, // garchomp-mega
  448: 10059, // lucario-mega
  460: 10060, // abomasnow-mega
  475: 10068, // gallade-mega
  531: 10069, // audino-mega
  687: 10297, // malamar-mega
  719: 10075, // diancie-mega
  870: 10303, // falinks-mega
};

const GIGAMAX_ID_MAP: { [key: number]: number } = {
  3: 10195, // venusaur-gmax
  6: 10196, // charizard-gmax
  9: 10197, // blastoise-gmax
  12: 10198, // butterfree-gmax
  25: 10199, // pikachu-gmax
  52: 10200, // meowth-gmax
  68: 10201, // machamp-gmax
  94: 10202, // gengar-gmax
  99: 10203, // kingler-gmax
  131: 10204, // lapras-gmax
  133: 10205, // eevee-gmax
  143: 10206, // snorlax-gmax
  569: 10207, // garbodor-gmax
  809: 10208, // melmetal-gmax
  812: 10209, // rillaboom-gmax
  815: 10210, // cinderace-gmax
  818: 10211, // inteleon-gmax
  823: 10212, // corviknight-gmax
  826: 10213, // orbeetle-gmax
  834: 10214, // drednaw-gmax
  839: 10215, // coalossal-gmax
  841: 10216, // flapple-gmax
  842: 10217, // appletun-gmax
  844: 10218, // sandaconda-gmax
  849: 10219, // toxtricity-amped-gmax
  851: 10220, // centiskorch-gmax
  858: 10221, // hatterene-gmax
  861: 10222, // grimmsnarl-gmax
  869: 10223, // alcremie-gmax
  879: 10224, // copperajah-gmax
  884: 10225, // duraludon-gmax
  892: 10226, // urshifu-single-strike-gmax
};


@Component({
  selector: 'app-pokedex-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  templateUrl: './pokedex-list.html',
  styleUrl: './pokedex-list.css'
})
export class PokedexList implements OnInit, OnDestroy, AfterViewInit {
  // Lista originale e stati utente
  pokemonList = signal<PokedexDTO[]>([]);
  usersList = signal<User[]>([]);
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);
  activeModalPokemon = signal<PokedexDTO | null>(null);


  // Stati modale creazione giocatore
  showUserModal = signal<boolean>(false);
  newUserName = signal<string>('');
  isCreatingUser = signal<boolean>(false);

  // Stati del Bottom Sheet (Drawer per griglia compatta)
  activeDetailPokemonId = signal<number | null>(null);
  activeDetailBasePokemonId = signal<number | null>(null);

  activeDetailPokemon = computed(() => {
    const id = this.activeDetailPokemonId();
    if (!id) return null;
    return this.pokemonList().find(p => p.id === id) || null;
  });

  activeDetailBasePokemon = computed(() => {
    const id = this.activeDetailBasePokemonId();
    if (!id) return null;
    return this.pokemonList().find(p => p.id === id) || null;
  });

  @ViewChild('scrollAnchor') scrollAnchor!: ElementRef;
  limit = signal<number>(50);
  visibleList = computed(() => {
    return this.filteredList().slice(0, this.limit());
  });

  // Segnali dei filtri
  searchQuery = signal<string>('');
  showEvolutionFamily = signal<boolean>(false);
  selectedStatus = signal<string>('all'); // 'all', 'caught', 'missing'
  selectedType = signal<string>('all'); // 'all', 'fire', 'water', ecc.
  selectedFormFilter = signal<string>('all'); // 'all', 'shadow', 'purified', 'perfect', 'lucky', 'xxs', 'xxl', 'shiny'
  selectedRegion = signal<string>('all'); // 'all', 'kanto', 'johto', etc.

  onSearchQueryChange(value: string) {
    if (value.startsWith('+')) {
      this.showEvolutionFamily.set(true);
    } else if (this.searchQuery().startsWith('+') && !value.startsWith('+')) {
      this.showEvolutionFamily.set(false);
    }
    this.searchQuery.set(value);
  }

  // Regioni disponibili nel gioco per il filtro a pillole
  pokemonRegions = [
    { value: 'all' },
    { value: 'kanto' },
    { value: 'johto' },
    { value: 'hoenn' },
    { value: 'sinnoh' },
    { value: 'unova' },
    { value: 'kalos' },
    { value: 'alola' },
    { value: 'galar' },
    { value: 'hisui' },
    { value: 'paldea' }
  ];

  // Subscriptions per evitare leak di memoria
  private sub = new Subscription();

  // Elenco completo dei tipi per i filtri grafici
  pokemonTypes = [
    { value: 'all' },
    { value: 'normal' },
    { value: 'fire' },
    { value: 'water' },
    { value: 'electric' },
    { value: 'grass' },
    { value: 'ice' },
    { value: 'fighting' },
    { value: 'poison' },
    { value: 'ground' },
    { value: 'flying' },
    { value: 'psychic' },
    { value: 'bug' },
    { value: 'rock' },
    { value: 'ghost' },
    { value: 'dragon' },
    { value: 'steel' },
    { value: 'fairy' }
  ];

  specialForms = [
    { value: 'all' },
    { value: 'shiny' },
    { value: 'shadow' },
    { value: 'purified' },
    { value: 'perfect' },
    { value: 'lucky' },
    { value: 'xxl' },
    { value: 'xxs' },
    { value: 'mega' },
    { value: 'gigamax' }
  ];

  // Mappa reattiva per tracciare la forma regional selezionata per ogni card (base ID -> forma ID)
  selectedFormMap = signal<{ [key: number]: number }>({});

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
    if (UNRELEASED_SPECIES.includes(name)) {
      return false;
    }
    const baseName = name.split(' (')[0];
    return !UNRELEASED_SPECIES.includes(baseName);
  }

  isShinyUnreleased(name: string): boolean {
    if (SHINY_UNRELEASED_SPECIES.includes(name)) {
      return true;
    }
    const baseName = name.split(' (')[0];
    return SHINY_UNRELEASED_SPECIES.includes(baseName);
  }

  getCardState(p: PokedexDTO, category: string): number {
    if (category === 'all') return 0;

    // 1. Non rilasciato
    if (!this.isReleased(p.name)) {
      return 1;
    }

    // 2. Rilasciato ma forma non disponibile per questa specie
    if (category === 'shiny' && this.isShinyUnreleased(p.name)) {
      return 2;
    }
    if ((category === 'shadow' || category === 'purified') && !this.canShadow(p.name)) {
      return 2;
    }
    if (category === 'mega' && !this.canMega(p.name)) {
      return 2;
    }
    if (category === 'gigamax' && !this.canGigamax(p.name)) {
      return 2;
    }

    // perfect, lucky, xxl, xxs sono disponibili per tutti i pokemon rilasciati

    // 3 & 4. Rilasciato e disponibile
    let isCaught = false;
    if (category === 'mega' && (p as any).megaFormOverride) {
      const override = (p as any).megaFormOverride;
      isCaught = override === 'x' ? (p.mega & 1) > 0 : (p.mega & 2) > 0;
    } else {
      switch (category) {
        case 'shiny': isCaught = p.shiny; break;
        case 'shadow': isCaught = p.shadow; break;
        case 'purified': isCaught = p.purified; break;
        case 'perfect': isCaught = p.perfect; break;
        case 'lucky': isCaught = p.lucky; break;
        case 'xxl': isCaught = p.xxl; break;
        case 'xxs': isCaught = p.xxs; break;
        case 'mega': isCaught = p.mega > 0; break;
        case 'gigamax': isCaught = p.gigamax; break;
        case 'regular': isCaught = p.regular; break;
      }
    }

    return isCaught ? 4 : 3;
  }

  getPokemonCardName(p: any): string {
    let displayName = p.name;
    if (p.megaFormOverride) {
      displayName = p.name + ' (Mega ' + p.megaFormOverride.toUpperCase() + ')';
    }

    const isIt = this.i18n.currentLang() === 'it';
    if (isIt) {
      // Se il Pokémon è Vivillon, traduciamo le sue forme
      if (displayName.startsWith('Vivillon')) {
        const match = displayName.match(/\(([^)]+)\)/);
        if (match) {
          const formName = match[1];
          const itMap: { [key: string]: string } = {
            'Archipelago': 'Motivo Arcipelago',
            'Continental': 'Motivo Continentale',
            'Elegant': 'Motivo Eleganza',
            'Garden': 'Motivo Prato',
            'High Plains': 'Motivo Sabbia',
            'Icy Snow': 'Motivo Manto di Neve',
            'Jungle': 'Motivo Giungla',
            'Marine': 'Motivo Marino',
            'Modern': 'Motivo Moderno',
            'Monsoon': 'Motivo Pluviale',
            'Ocean': 'Motivo Oceanico',
            'Polar': 'Motivo Nordico',
            'River': 'Motivo Fluviale',
            'Sandstorm': 'Motivo Deserto',
            'Savanna': 'Motivo Savana',
            'Sun': 'Motivo Solare',
            'Tundra': 'Motivo Nevi Perenni',
            'Fancy': 'Motivo Trendy',
            'Pokeball': 'Motivo Pokeball'
          };
          const translatedForm = itMap[formName];
          if (translatedForm) {
            return `Vivillon (${translatedForm})`;
          }
        } else if (displayName === 'Vivillon') {
          // La forma base è Meadow (Giardinfiore)
          return 'Vivillon (Motivo Giardinfiore)';
        }
      }
    } else {
      // English: se è il base Vivillon, specifichiamo Meadow Pattern
      if (displayName === 'Vivillon') {
        return 'Vivillon (Meadow Pattern)';
      } else if (displayName.startsWith('Vivillon')) {
        const match = displayName.match(/\(([^)]+)\)/);
        if (match) {
          const formName = match[1];
          return `Vivillon (${formName} Pattern)`;
        }
      }
    }

    return displayName;
  }

  getCardSpriteUrl(p: PokedexDTO, category: string): string {
    // Determiniamo il base ID (utile se p è una forma regionale >= 10000)
    let baseId = p.id;
    if (p.id >= 10000) {
      const baseName = p.name.split(' (')[0];
      const basePoke = this.pokemonList().find(x => x.id < 10000 && x.name === baseName);
      if (basePoke) {
        baseId = basePoke.id;
      }
    }

    // Gestione specifica per i Pokémon con molteplici forme (Unown, Vivillon, Furfrou, Spinda)
    const baseName = p.name.split(' (')[0];
    if (MODAL_FORMS_SPECIES.includes(baseName) && p.id >= 10000) {
      const match = p.name.match(/\(([^)]+)\)/);
      if (match) {
        let formSuffix = match[1].toLowerCase().trim()
          .replace(/\s+/g, '-')
          .replace(/['’]/g, '');
        
        if (formSuffix === 'pokeball') {
          formSuffix = 'poke-ball';
        }
        
        // Se la specie è Spinda, PokeAPI non ha i motivi, usiamo lo sprite base
        if (baseName === 'Spinda') {
          if (category === 'shiny') {
            return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/327.png';
          }
          return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/327.png';
        }
        
        if (category === 'shiny') {
          return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${baseId}-${formSuffix}.png`;
        }
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${baseId}-${formSuffix}.png`;
      }
    }

    if (category === 'shiny') {
      // In modalità shiny, mostriamo sempre lo sprite shiny (se il pokemon ha lo shiny disponibile, altrimenti standard)
      if (this.isShinyUnreleased(p.name)) {
        return p.spriteUrl; // standard grayscale
      }
      return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/' + p.id + '.png';
    }

    if (category === 'mega' && this.canMega(p.name)) {
      let megaId: number | null | undefined = undefined;
      const basePoke = p.id >= 10000 ? this.pokemonList().find(x => x.id < 10000 && x.name.split(' (')[0] === p.name.split(' (')[0]) : p;
      
      const megaVId = basePoke?.megaVarietyId;
      const megaVId2 = basePoke?.megaVarietyId2;

      if (this.hasTwoMegas(p.name)) {
        const override = (p as any).megaFormOverride;
        if (override === 'y') {
          megaId = megaVId2;
        } else if (override === 'x') {
          megaId = megaVId;
        } else {
          megaId = p.mega === 2 ? megaVId2 : megaVId;
        }
      } else {
        megaId = megaVId;
      }

      // Se non risolto dinamicamente dal DB, usiamo il fallback statico
      if (!megaId) {
        const mapping = MEGA_ID_MAP[baseId];
        if (mapping) {
          megaId = typeof mapping === 'number' ? mapping : mapping.x;
          if (typeof mapping === 'object') {
            const override = (p as any).megaFormOverride;
            if (override === 'y') {
              megaId = mapping.y;
            } else if (override === 'x') {
              megaId = mapping.x;
            } else {
              megaId = p.mega === 2 ? mapping.y : mapping.x;
            }
          }
        }
      }

      if (megaId) {
        return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' + megaId + '.png';
      }
    }

    if (category === 'gigamax' && this.canGigamax(p.name)) {
      const basePoke = p.id >= 10000 ? this.pokemonList().find(x => x.id < 10000 && x.name.split(' (')[0] === p.name.split(' (')[0]) : p;
      let gmaxId = basePoke?.gigamaxVarietyId || GIGAMAX_ID_MAP[baseId];
      if (gmaxId) {
        return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' + gmaxId + '.png';
      }
    }

    // Default
    return p.spriteUrl;
  }

  onCardClick(p: PokedexDTO) {
    const category = this.selectedFormFilter();
    if (category === 'all') return; // In modalità 'all', cliccare sulla card non fa nulla, si usano i bottoncini standard

    const state = this.getCardState(p, category);
    if (state < 3) return; // Non disponibile o non rilasciato in PoGO

    // Altrimenti toggliamo la cattura di quella specifica categoria!
    if (category === 'mega') {
      const override = (p as any).megaFormOverride;
      if (override) {
        const bit = override === 'x' ? 1 : 2;
        const nextVal = (p.mega & bit) ? (p.mega & ~bit) : (p.mega | bit);
        this.toggleMegaToValue(p, nextVal);
      } else {
        if (this.hasTwoMegas(p.name)) {
          const nextVal = p.mega === 0 ? 1 : (p.mega === 1 ? 2 : 0);
          this.toggleMegaToValue(p, nextVal);
        } else {
          const nextVal = p.mega > 0 ? 0 : 1;
          this.toggleMegaToValue(p, nextVal);
        }
      }
    } else {
      this.toggleForm(p, category as any);
    }
  }

  toggleMegaToValue(pokemon: PokedexDTO, val: number) {
    const user = this.activeUser();
    if (!user) return;

    const updatedPokemon = { ...pokemon, mega: val };
    this.pokedexService.updateEntry(user.id, pokemon.id, updatedPokemon).subscribe({
      next: (res) => {
        this.pokemonList.update(list =>
          list.map(p => p.id === pokemon.id ? res : p)
        );
      },
      error: (err) => console.error('Errore nell\'aggiornamento Mega:', err)
    });
  }

  hasTwoMegas(name: string): boolean {
    const baseName = name.split(' (')[0];
    return baseName === 'Charizard' || baseName === 'Mewtwo';
  }

  isMegaActive(pokemon: PokedexDTO, formType: 'x' | 'y' | 'standard'): boolean {
    if (formType === 'x') {
      return (pokemon.mega & 1) > 0;
    } else if (formType === 'y') {
      return (pokemon.mega & 2) > 0;
    } else {
      return pokemon.mega > 0;
    }
  }

  toggleMega(pokemon: PokedexDTO, formType: 'x' | 'y' | 'standard') {
    const user = this.activeUser();
    if (!user) return;

    const updatedPokemon = { ...pokemon };
    if (formType === 'x') {
      // Toggle bit 1 (value 1)
      updatedPokemon.mega = (updatedPokemon.mega & 1) ? (updatedPokemon.mega & ~1) : (updatedPokemon.mega | 1);
    } else if (formType === 'y') {
      // Toggle bit 2 (value 2)
      updatedPokemon.mega = (updatedPokemon.mega & 2) ? (updatedPokemon.mega & ~2) : (updatedPokemon.mega | 2);
    } else {
      // Standard: Toggle between 0 and 1
      updatedPokemon.mega = updatedPokemon.mega ? 0 : 1;
    }

    this.pokedexService.updateEntry(user.id, pokemon.id, updatedPokemon).subscribe({
      next: (res) => {
        this.pokemonList.update(list =>
          list.map(p => p.id === pokemon.id ? res : p)
        );
      },
      error: (err) => {
        console.error('Errore nell\'aggiornamento dello stato di cattura Mega:', err);
      }
    });
  }

  // Filtro dinamico reattivo con supporto al raggruppamento delle forme regionali
  filteredList = computed(() => {
    const list = this.pokemonList();
    const rawQuery = this.searchQuery().toLowerCase().trim();
    const showFamily = this.showEvolutionFamily() && rawQuery.length > 0;
    
    let cleanQuery = rawQuery;
    if (rawQuery.startsWith('+')) {
      cleanQuery = rawQuery.substring(1).trim();
    }
    
    const parsedIds = this.parsePokedexQuery(cleanQuery);
    
    // Se "Mostra Famiglia" è attivo, calcoliamo i root ancestors dei match diretti
    let familyRoots: Set<string> | null = null;
    if (showFamily && cleanQuery) {
      familyRoots = new Set<string>();
      for (const p of list) {
        if (this.matchesSearchQuery(p, cleanQuery, parsedIds)) {
          familyRoots.add(this.getRootAncestor(p.name));
        }
      }
    }

    const status = this.selectedStatus();
    const type = this.selectedType();
    const formFilter = this.selectedFormFilter();
    const region = this.selectedRegion();
    const isGrouped = this.settingsService.groupRegionals();

    if (!isGrouped) {
      // Logica classica quando il raggruppamento è disattivato (mostra tutto separato)
      const baseFiltered = list.filter(p => this.matchesFilters(p, cleanQuery, parsedIds, showFamily, familyRoots, status, type, formFilter, region));
      if (formFilter === 'mega') {
        return this.splitDualMegas(baseFiltered);
      }
      return baseFiltered;
    }

    // Logica quando il raggruppamento è attivo:
    // 1. Consideriamo solo i Pokémon base (id < 10000)
    const basePokemons = list.filter(p => p.id < 10000);
    const result: PokedexDTO[] = [];

    for (const base of basePokemons) {
      // 2. Recuperiamo le forme regionali associate a questo Pokémon base tramite parentId (filtrando le non rilasciate se includeUnreleased è disattivato)
      const regionals = list.filter(r => r.parentId === base.id && (this.settingsService.includeUnreleased() || this.isReleased(r.name)));
      const allForms = [base, ...regionals];

      // 3. Troviamo quali forme di questa specie soddisfano i filtri correnti
      const matchingForms = allForms.filter(f => this.matchesFilters(f, cleanQuery, parsedIds, showFamily, familyRoots, status, type, formFilter, region));

      if (matchingForms.length > 0) {
        // Se almeno una forma soddisfa i filtri, la card del Pokémon base deve essere visibile!
        result.push(base);

        // EXTRA UX: Se la forma attualmente attiva non corrisponde ai nuovi filtri inseriti,
        // cambiamo automaticamente la forma attiva sulla card in modo che l'utente veda subito il risultato corretto!
        const currentSelectedId = this.selectedFormMap()[base.id] || base.id;
        const currentStillMatches = matchingForms.some(f => f.id === currentSelectedId);

        if (!currentStillMatches) {
          // Switch automatico alla prima forma che corrisponde
          const targetForm = matchingForms[0];
          setTimeout(() => {
            this.selectFormForCard(base.id, targetForm.id);
          });
        }
      }
    }

    if (formFilter === 'mega') {
      return this.splitDualMegas(result);
    }
    return result;
  });

  splitDualMegas(filtered: PokedexDTO[]): any[] {
    const result: any[] = [];
    for (const p of filtered) {
      if (p.id === 6 || p.id === 150) {
        result.push({ ...p, megaFormOverride: 'x' });
        result.push({ ...p, megaFormOverride: 'y' });
      } else {
        result.push(p);
      }
    }
    return result;
  }

  username: string = '';

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    public settingsService: SettingsService,
    private route: ActivatedRoute,
    private router: Router,
    public i18n: I18nService
  ) {
    // Resetta automaticamente il limite a 50 quando cambia un qualsiasi filtro
    effect(() => {
      this.searchQuery();
      this.showEvolutionFamily();
      this.selectedStatus();
      this.selectedType();
      this.selectedFormFilter();
      this.selectedRegion();
      this.settingsService.groupRegionals();
      
      setTimeout(() => {
        this.limit.set(50);
      });
    });
  }

  getBaseId(p: PokedexDTO): number {
    if (p.id >= 10000) {
      const baseName = p.name.split(' (')[0];
      const basePoke = this.pokemonList().find(x => x.id < 10000 && x.name === baseName);
      if (basePoke) {
        return basePoke.id;
      }
    }
    return p.id;
  }

  getRootAncestor(name: string): string {
    let current = name.split(' (')[0];
    const visited = new Set<string>();
    while (current && EVOLVES_FROM[current] && !visited.has(current)) {
      visited.add(current);
      current = EVOLVES_FROM[current];
    }
    return current;
  }

  parsePokedexQuery(q: string): Set<number> | null {
    const trimmed = q.trim();
    if (!trimmed) return null;
    if (!/^[\d\s\-,]+$/.test(trimmed)) {
      return null;
    }
    const ids = new Set<number>();
    const parts = trimmed.split(',');
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      if (part.includes('-')) {
        const rangeParts = part.split('-');
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0].trim(), 10);
          const end = parseInt(rangeParts[1].trim(), 10);
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            for (let i = min; i <= max; i++) {
              ids.add(i);
            }
          }
        }
      } else {
        const id = parseInt(part, 10);
        if (!isNaN(id)) {
          ids.add(id);
        }
      }
    }
    return ids.size > 0 ? ids : null;
  }

  matchesSearchQuery(p: PokedexDTO, cleanQuery: string, parsedIds: Set<number> | null): boolean {
    if (!cleanQuery) return true;

    if (parsedIds) {
      const baseId = this.getBaseId(p);
      return parsedIds.has(p.id) || parsedIds.has(baseId);
    }

    const nameMatch = p.name.toLowerCase().includes(cleanQuery);
    const idMatch = p.id.toString() === cleanQuery;

    let baseIdMatch = false;
    let baseNameMatch = false;
    if (p.id >= 10000) {
      const baseName = p.name.split(' (')[0].toLowerCase();
      baseNameMatch = baseName.includes(cleanQuery);
      
      const basePoke = this.pokemonList().find(x => x.id < 10000 && x.name.split(' (')[0] === p.name.split(' (')[0]);
      if (basePoke) {
        baseIdMatch = basePoke.id.toString() === cleanQuery;
      }
    }

    return nameMatch || idMatch || baseIdMatch || baseNameMatch;
  }

  // Helper per verificare se un singolo Pokémon soddisfa i filtri attivi
  private matchesFilters(
    p: PokedexDTO, 
    cleanQuery: string, 
    parsedIds: Set<number> | null, 
    showFamily: boolean, 
    familyRoots: Set<string> | null, 
    status: string, 
    type: string, 
    formFilter: string, 
    region: string
  ): boolean {
    // Filtro per pokemon non rilasciati
    if (!this.settingsService.includeUnreleased() && !this.isReleased(p.name)) {
      return false;
    }

    // Filtro per regione
    if (region !== 'all') {
      const pokemonRegion = this.getPokemonRegion(p);
      if (pokemonRegion !== region) {
        return false;
      }
    }

    // Filtro ricerca
    let matchesQuery = true;
    if (cleanQuery) {
      if (showFamily && familyRoots) {
        const root = this.getRootAncestor(p.name);
        matchesQuery = familyRoots.has(root);
      } else {
        matchesQuery = this.matchesSearchQuery(p, cleanQuery, parsedIds);
      }
    }

    const matchesType = type === 'all' ||
      p.type1.toLowerCase() === type ||
      (p.type2 !== null && p.type2.toLowerCase() === type);

    let matchesStatus = true;
    if (status !== 'all') {
      let isCaught = p.regular;
      if (formFilter !== 'all') {
        switch (formFilter) {
          case 'shadow': isCaught = p.shadow; break;
          case 'purified': isCaught = p.purified; break;
          case 'perfect': isCaught = p.perfect; break;
          case 'lucky': isCaught = p.lucky; break;
          case 'xxl': isCaught = p.xxl; break;
          case 'xxs': isCaught = p.xxs; break;
          case 'shiny': isCaught = p.shiny; break;
          case 'mega': isCaught = p.mega > 0; break;
          case 'gigamax': isCaught = p.gigamax; break;
        }
      }

      if (status === 'caught') {
        matchesStatus = isCaught;
      } else if (status === 'missing') {
        matchesStatus = !isCaught;
      }
    }

    // Quando un filtro per forma speciale è attivo, mostriamo solo le specie in grado di avere quella forma
    let matchesForm = true;
    if (formFilter !== 'all') {
      switch (formFilter) {
        case 'shadow':
        case 'purified':
          matchesForm = this.canShadow(p.name);
          break;
        case 'mega':
          matchesForm = this.canMega(p.name);
          break;
        case 'gigamax':
          matchesForm = this.canGigamax(p.name);
          break;
        case 'shiny':
          matchesForm = !this.isShinyUnreleased(p.name);
          break;
      }
    }

    return matchesQuery && matchesType && matchesStatus && matchesForm;
  }

  // Determina a quale regione appartiene il Pokémon in base a generation e nome
  getPokemonRegion(p: PokedexDTO): string {
    switch (p.generation) {
      case 1: return 'kanto';
      case 2: return 'johto';
      case 3: return 'hoenn';
      case 4: return 'sinnoh';
      case 5: return 'unova';
      case 6: return 'kalos';
      case 7: return 'alola';
      case 8:
        return p.name.toLowerCase().includes('(hisuian)') ? 'hisui' : 'galar';
      case 9: return 'paldea';
      default: return 'kanto';
    }
  }

  // Seleziona la regione attiva per filtrare l'elenco
  selectRegion(regionValue: string) {
    this.selectedRegion.set(regionValue);
  }

  // Tira fuori le forme regionali registrate per un Pokémon base (filtrando le non rilasciate se includeUnreleased è disattivato)
  getRegionalForms(basePokemon: PokedexDTO): PokedexDTO[] {
    const list = this.pokemonList();
    return list.filter(p => p.parentId === basePokemon.id && (this.settingsService.includeUnreleased() || this.isReleased(p.name)));
  }

  // Verifica se la specie del Pokémon (compresi eventuali regionali se raggruppati) è completata al 100%
  isSpeciesCompleted(basePokemon: PokedexDTO): boolean {
    const list = this.pokemonList();
    const regionals = this.settingsService.groupRegionals() ? this.getRegionalForms(basePokemon) : [];
    const allForms = [basePokemon, ...regionals];
    const isModalForm = this.isModalFormSpecies(basePokemon.name);

    for (const p of allForms) {
      // Se il Pokémon non è rilasciato e l'impostazione includeUnreleased è falsa, lo ignoriamo nei progressi completamento
      if (!this.isReleased(p.name) && !this.settingsService.includeUnreleased()) {
        continue;
      }

      const checkRegular = this.showButtonForPokemon(p, 'regular');
      if (checkRegular && !p.regular) return false;

      const checkShiny = this.showButtonForPokemon(p, 'shiny');
      if (checkShiny && !p.shiny) return false;

      const checkPerfect = this.showButtonForPokemon(p, 'perfect');
      if (checkPerfect && !p.perfect) return false;

      // Per i Pokémon a modale (Vivillon, Furfrou, ecc.), i bottoni speciali (lucky, taglie, shadow) 
      // si tracciano solo sulla card generale/base (p.id < 10000), le altre varianti nel modale richiedono solo reg/shiny/100!
      const isAltOfModalForm = isModalForm && p.id >= 10000;

      if (!isAltOfModalForm) {
        const checkShadow = this.showButtonForPokemon(p, 'shadow');
        if (checkShadow && this.canShadow(p.name) && !p.shadow) return false;

        const checkPurified = this.showButtonForPokemon(p, 'purified');
        if (checkPurified && this.canShadow(p.name) && !p.purified) return false;

        const checkLucky = this.showButtonForPokemon(p, 'lucky');
        if (checkLucky && !p.lucky) return false;

        const checkXxl = this.showButtonForPokemon(p, 'xxl');
        if (checkXxl && !p.xxl) return false;

        const checkXxs = this.showButtonForPokemon(p, 'xxs');
        if (checkXxs && !p.xxs) return false;
      }

      // Per le mega e gigamax, verifichiamo solo per la specie base
      if (p.id < 10000) {
        if (this.canMega(p.name)) {
          const checkMega = this.showButtonForPokemon(p, 'mega');
          if (checkMega) {
            if (this.hasTwoMegas(p.name)) {
              if (p.mega !== 3) return false;
            } else {
              if (!p.mega) return false;
            }
          }
        }

        if (this.canGigamax(p.name)) {
          const checkGiga = this.showButtonForPokemon(p, 'gigamax');
          if (checkGiga && !p.gigamax) return false;
        }
      }
    }

    return true;
  }

  // Restituisce la forma (DTO) da visualizzare correntemente sulla card
  getActiveForm(basePokemon: PokedexDTO): PokedexDTO {
    if (!this.settingsService.groupRegionals()) {
      return basePokemon; // Mostra solo se stesso se non raggruppati
    }
    const selectedId = this.selectedFormMap()[basePokemon.id];
    if (selectedId) {
      const found = this.pokemonList().find(p => p.id === selectedId);
      if (found) return found;
    }
    return basePokemon; // Default
  }

  // Ottiene l'etichetta abbreviata della regione o della forma speciale (es. Base, Alola, Galar, Attack, Sunny, ecc.)
  getFormRegion(p: PokedexDTO): string {
    const isIt = this.i18n.currentLang() === 'it';
    const baseName = p.name.split(' (')[0];

    if (baseName === 'Vivillon') {
      let formName = 'Meadow'; // Default for base
      if (p.id >= 10000) {
        const match = p.name.match(/\(([^)]+)\)/);
        if (match) {
          formName = match[1];
        }
      }

      if (isIt) {
        const itMap: { [key: string]: string } = {
          'Meadow': 'Giardinfiore',
          'Archipelago': 'Arcipelago',
          'Continental': 'Continentale',
          'Elegant': 'Eleganza',
          'Garden': 'Prato',
          'High Plains': 'Sabbia',
          'Icy Snow': 'Manto di Neve',
          'Jungle': 'Giungla',
          'Marine': 'Marino',
          'Modern': 'Moderno',
          'Monsoon': 'Pluviale',
          'Ocean': 'Oceanico',
          'Polar': 'Nordico',
          'River': 'Fluviale',
          'Sandstorm': 'Deserto',
          'Savanna': 'Savana',
          'Sun': 'Solare',
          'Tundra': 'Nevi Perenni',
          'Fancy': 'Trendy',
          'Pokeball': 'Pokeball'
        };
        return itMap[formName] || formName;
      } else {
        return formName;
      }
    }

    if (p.id < 10000) return 'Base';
    const name = p.name.toLowerCase();
    if (name.includes('alolan')) return this.i18n.translate('region.alola');
    if (name.includes('galarian')) return this.i18n.translate('region.galar');
    if (name.includes('hisuian')) return this.i18n.translate('region.hisui');
    if (name.includes('paldean')) return this.i18n.translate('region.paldea');
    
    // Fallback: estrae il testo tra parentesi per altre forme speciali (es. Attack, Sunny, Pattern 2, ecc.)
    const match = p.name.match(/\(([^)]+)\)/);
    if (match) {
      const formName = match[1];
      return formName.charAt(0).toUpperCase() + formName.slice(1);
    }
    return this.i18n.currentLang() === 'it' ? 'Forma' : 'Form';
  }

  isModalFormSpecies(name: string): boolean {
    const baseName = name.split(' (')[0];
    return MODAL_FORMS_SPECIES.includes(baseName);
  }

  getModalButtonLabel(name: string): string {
    const baseName = name.split(' (')[0];
    const isIt = this.i18n.currentLang() === 'it';
    if (baseName === 'Unown') return isIt ? 'Mostra Lettere' : 'Show Letters';
    if (baseName === 'Vivillon') return isIt ? 'Mostra Motivi' : 'Show Patterns';
    if (baseName === 'Furfrou') return isIt ? 'Mostra Tagli' : 'Show Trims';
    return isIt ? 'Mostra Forme' : 'Show Forms';
  }


  // Ottiene l'etichetta tradotta del tipo Pokémon
  getTypeLabel(typeValue: string): string {
    const itMap: { [key: string]: string } = {
      all: 'Tutti', normal: 'Normale', fire: 'Fuoco', water: 'Acqua', electric: 'Elettro',
      grass: 'Erba', ice: 'Ghiaccio', fighting: 'Lotta', poison: 'Veleno', ground: 'Terra',
      flying: 'Volante', psychic: 'Psico', bug: 'Coleottero', rock: 'Roccia', ghost: 'Spettro',
      dragon: 'Drago', steel: 'Acciaio', fairy: 'Folletto'
    };
    const enMap: { [key: string]: string } = {
      all: 'All', normal: 'Normal', fire: 'Fire', water: 'Water', electric: 'Electric',
      grass: 'Grass', ice: 'Ice', fighting: 'Fighting', poison: 'Poison', ground: 'Ground',
      flying: 'Flying', psychic: 'Psychic', bug: 'Bug', rock: 'Rock', ghost: 'Ghost',
      dragon: 'Dragon', steel: 'Steel', fairy: 'Fairy'
    };
    const lower = typeValue.toLowerCase();
    return this.i18n.currentLang() === 'it' 
      ? (itMap[lower] || typeValue) 
      : (enMap[lower] || typeValue);
  }

  // Cambia la forma attiva per una determinata card
  selectFormForCard(cardId: number, formId: number) {
    this.selectedFormMap.update(map => ({
      ...map,
      [cardId]: formId
    }));
  }

  // Verifica se un certo bottone di azione deve essere visualizzato per il Pokémon corrente
  showButtonForPokemon(p: PokedexDTO, buttonType: string): boolean {
    return this.settingsService.isButtonVisible(p.name, p.id, buttonType);
  }

  ngOnInit() {
    this.loadUsers();

    // Sottoscrizione ai parametri della rotta dinamica (:username)
    this.sub.add(
      this.route.params.subscribe(params => {
        const routeUser = params['username'];
        if (routeUser) {
          const reserved = ['about', 'admin', 'settings', 'stats', 'export', 'assets', 'favicon.ico', 'landing', 'api'];
          if (reserved.includes(routeUser.toLowerCase())) {
            return;
          }
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

    // Si iscrive reattivamente all'utente attivo. Quando cambia, ricarica il Pokedex!
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        if (user && user.name.toLowerCase() === this.username.toLowerCase()) {
          this.activeUser.set(user);
          this.loadPokedex(user.id);
        }
      })
    );
  }

  private observer: IntersectionObserver | null = null;

  ngAfterViewInit() {
    this.setupIntersectionObserver();
  }

  setupIntersectionObserver() {
    if (typeof window === 'undefined') return;

    this.observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        if (this.limit() < this.filteredList().length) {
          console.log('[Lazy Rendering] Caricamento di ulteriori 50 Pokémon...');
          this.limit.set(this.limit() + 50);
        }
      }
    }, {
      root: null,
      rootMargin: '200px', // inizia a caricare prima che entri a schermo per una transizione fluida
      threshold: 0.1
    });

    if (this.scrollAnchor) {
      this.observer.observe(this.scrollAnchor.nativeElement);
    }
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  // Carica l'elenco dei giocatori
  loadUsers() {
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.usersList.set(users);

        // Se non c'è ancora un utente attivo nel localStorage, seleziona il primo caricato (es: default seed)
        const currentUser = this.userService.getCurrentUser();
        if (!currentUser && users.length > 0) {
          this.userService.setActiveUser(users[0]);
        }
      },
      error: (err) => console.error('Errore nel recupero degli utenti:', err)
    });
  }

  // Carica i Pokémon specifici dell'utente loggato
  loadPokedex(userId: number) {
    this.isLoading.set(true);
    this.pokedexService.getAllEntries(userId).subscribe({
      next: (data) => {
        this.pokemonList.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Errore nel recupero del Pokedex dell\'utente:', err);
        this.isLoading.set(false);
      }
    });
  }

  // Cambia il profilo giocatore attivo (reindirizzando alla nuova rotta)
  switchUser(user: User) {
    this.router.navigate(['/' + user.name]);
  }

  // Mostra il popup modale per aggiungere un utente
  openNewUserModal() {
    this.newUserName.set('');
    this.showUserModal.set(true);
  }

  // Chiude il modale
  closeNewUserModal() {
    this.showUserModal.set(false);
  }

  // Registra un nuovo profilo giocatore locale
  createNewUser() {
    const name = this.newUserName().trim();
    if (!name) return;

    this.isCreatingUser.set(true);
    this.userService.createUser(name).subscribe({
      next: (newUser) => {
        this.usersList.update(list => [...list, newUser]);
        this.userService.setActiveUser(newUser);

        this.isCreatingUser.set(false);
        this.closeNewUserModal();
      },
      error: (err) => {
        console.error('Errore nella creazione dell\'utente:', err);
        this.isCreatingUser.set(false);
      }
    });
  }

  // Elimina un profilo giocatore locale
  deleteUser(event: Event, userToDelete: User) {
    event.stopPropagation(); // Evita il switchUser causato dal click sul pulsante genitore
    
    if (userToDelete.name.toLowerCase() === 'default') {
      alert('Non è possibile eliminare il profilo predefinito.');
      return;
    }
    
    if (confirm(`Sei sicuro di voler eliminare il profilo di ${userToDelete.name}? Questa azione cancellerà tutti i suoi progressi nel Pokedex.`)) {
      this.userService.deleteUser(userToDelete.id).subscribe({
        next: () => {
          // Rimuovi dalla lista locale
          this.usersList.update(list => list.filter(u => u.id !== userToDelete.id));
          
          // Se era l'utente attivo, reindirizza al primo rimanente o alla landing
          const currentActive = this.activeUser();
          if (currentActive && currentActive.id === userToDelete.id) {
            const remaining = this.usersList().filter(u => u.id !== userToDelete.id);
            if (remaining.length > 0) {
              this.router.navigate(['/' + remaining[0].name]);
            } else {
              this.router.navigate(['/']);
            }
          }
        },
        error: (err) => {
          console.error('Errore durante l\'eliminazione del profilo allenatore:', err);
        }
      });
    }
  }

  // Seleziona un tipo dal filtro
  selectType(type: string) {
    this.selectedType.set(type);
  }

  // Seleziona un filtro per forma speciale
  selectFormFilter(form: string) {
    this.selectedFormFilter.set(form);
  }

  // Aggiorna lo stato di cattura di un Pokémon per il giocatore attivo
  toggleForm(pokemon: PokedexDTO, formType: 'regular' | 'shadow' | 'purified' | 'perfect' | 'lucky' | 'xxl' | 'xxs' | 'shiny' | 'gigamax') {
    const user = this.activeUser();
    if (!user) return;

    const updatedPokemon = { ...pokemon };
    (updatedPokemon as any)[formType] = !(updatedPokemon as any)[formType];

    this.pokedexService.updateEntry(user.id, pokemon.id, updatedPokemon).subscribe({
      next: (res) => {
        this.pokemonList.update(list =>
          list.map(p => p.id === pokemon.id ? res : p)
        );
        // Forza l'aggiornamento del Pokémon attivo nel modale per sincronizzare lo stato in tempo reale
        const activeModal = this.activeModalPokemon();
        if (activeModal && activeModal.id === pokemon.id) {
          this.activeModalPokemon.set(res);
        }
      },
      error: (err) => {
        console.error('Errore nell\'aggiornamento dello stato di cattura:', err);
      }
    });
  }

  // Bottom Sheet Drawer Methods
  openBottomSheet(basePokemon: any) {
    const activeForm = this.getActiveForm(basePokemon);
    this.activeDetailBasePokemonId.set(basePokemon.id);
    this.activeDetailPokemonId.set(activeForm.id);
  }

  closeBottomSheet() {
    this.activeDetailBasePokemonId.set(null);
    this.activeDetailPokemonId.set(null);
  }

  selectFormForDetailCard(pokemonId: number) {
    this.activeDetailPokemonId.set(pokemonId);
  }

  formatId(pokemon: PokedexDTO): string {
    let baseId = pokemon.id;
    if (pokemon.id >= 10000) {
      const baseName = pokemon.name.split(' (')[0];
      const basePoke = this.pokemonList().find(p => p.id < 10000 && p.name === baseName);
      if (basePoke) {
        baseId = basePoke.id;
      }
    }
    return '#' + baseId.toString().padStart(3, '0');
  }
}
