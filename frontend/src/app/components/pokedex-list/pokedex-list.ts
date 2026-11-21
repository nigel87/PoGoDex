import { Component, OnInit, OnDestroy, AfterViewInit, signal, computed, effect, viewChild, ElementRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexDTO, CostumeDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { APP_VERSION } from '../../version';
import { SHADOW_CAPABLE_SPECIES, MEGA_CAPABLE_SPECIES, GIGAMAX_CAPABLE_SPECIES, UNRELEASED_SPECIES, SHINY_UNRELEASED_SPECIES, EVOLVES_FROM, MODAL_FORMS_SPECIES } from '../../services/pokemon-config';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { HeaderComponent } from '../header/header';

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


export interface DexProgressCount {
  caught: number;            // Registered count within available pool
  caughtTotal: number;       // Registered count within full dex pool
  availableTotal: number;    // Eligible & released in Pokémon GO
  dexTotal: number;          // Full Pokédex total for this scope
  availablePct: number;      // 0..100
  dexPct: number;            // 0..100
  availableCeilingPct: number; // availableTotal / dexTotal * 100 (for dual-track bar)
  missingAvailable: number;  // Math.max(0, availableTotal - caught)
  hasDualTotal: boolean;     // dexTotal > availableTotal
  costumeShinyCaught?: number;
  costumeShinyTotal?: number;
  costumeShinyPct?: number;
}

@Component({
  selector: 'app-pokedex-list',
  standalone: true,
  imports: [FormsModule, RouterModule, TranslatePipe, HeaderComponent],
  templateUrl: './pokedex-list.html',
  styleUrl: './pokedex-list.css'
})
export class PokedexList implements OnInit, OnDestroy, AfterViewInit {
  // Lista originale e stati utente
  pokemonList = signal<PokedexDTO[]>([]);
  costumesList = signal<CostumeDTO[]>([]);
  usersList = signal<User[]>([]);
  activeUser = signal<User | null>(null);
  isReadOnly = signal<boolean>(false);
  isPrivateError = signal<boolean>(false);
  profileUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);
  activeModalPokemon = signal<PokedexDTO | null>(null);
  version = APP_VERSION;

  // Stati Modale Costumi (native <dialog>)
  costumeDialog = viewChild<ElementRef<HTMLDialogElement>>('costumeDialog');
  activeCostumePokemon = signal<PokedexDTO | null>(null);
  costumeSearchQuery = signal<string>('');
  costumeStatusFilter = signal<'all' | 'missing'>('all');
  costumeShinyPreview = signal<boolean>(false);
  private costumeDialogFallbackBound = false;

  costumesByPokemonId = computed(() => {
    const map = new Map<number, CostumeDTO[]>();
    for (const c of this.costumesList()) {
      const arr = map.get(c.pokemonId);
      if (arr) arr.push(c);
      else map.set(c.pokemonId, [c]);
    }
    return map;
  });

  activePokemonCostumes = computed(() => {
    const bp = this.activeCostumePokemon();
    if (!bp) return [];
    const baseId = this.getBaseId(bp);
    const list = this.costumesByPokemonId().get(baseId) || [];
    const q = this.costumeSearchQuery().toLowerCase().trim();
    const filter = this.costumeStatusFilter();

    return list.filter(c => {
      if (q) {
        const hay = `${c.costumeName} ${c.regionalFormName || ''} ${c.speciesName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'missing') {
        const missingReg = !c.regular;
        const missingShiny = c.shinyReleased && !c.shiny;
        return missingReg || missingShiny;
      }
      return true;
    });
  });

  activePokemonCostumeStats = computed(() => {
    const bp = this.activeCostumePokemon();
    if (!bp) return { total: 0, regularCaught: 0, shinyTotal: 0, shinyCaught: 0 };
    const list = this.costumesByPokemonId().get(this.getBaseId(bp)) || [];
    let regularCaught = 0;
    let shinyTotal = 0;
    let shinyCaught = 0;
    for (const c of list) {
      if (c.regular) regularCaught++;
      if (c.shinyReleased) {
        shinyTotal++;
        if (c.shiny) shinyCaught++;
      }
    }
    return { total: list.length, regularCaught, shinyTotal, shinyCaught };
  });


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

  scrollAnchor = viewChild<ElementRef>('scrollAnchor');
  searchInput = viewChild<ElementRef>('searchInput');

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      this.searchInput()?.nativeElement?.focus();
    }
  }
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
  // Toggle stile Pokémon GO: di default false (es. Ninetales di Alola resta nel Pokédex di Kanto come forma regionale;
  // se attivo, selezionando Alola/Galar/Hisui/Paldea include anche le relative forme regionali nei risultati e nei conteggi).
  includeRegionalFormsInRegion = signal<boolean>(false);

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

  visibleSpecialForms = computed(() => {
    if (this.settingsService.showCostumes()) {
      return [...this.specialForms, { value: 'costume' }];
    }
    return this.specialForms;
  });

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
    if (category === 'costume') {
      const costumes = this.getCostumesForPokemon(p);
      if (costumes.length === 0) return 2;
      return this.areAllCostumesCaught(p) ? 4 : 3;
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
    let displayName = p.name.split(' (')[0];
    if (p.megaFormOverride) {
      displayName += ' (Mega ' + p.megaFormOverride.toUpperCase() + ')';
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

    if (category === 'costume') {
      this.openCostumeModal(p);
      return;
    }

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
    if (this.isReadOnly()) return;
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
    if (baseName === 'Charizard' || baseName === 'Mewtwo' || baseName === 'Raichu') {
      return true;
    }
    const basePoke = this.pokemonList().find(x => x.id < 10000 && x.name.split(' (')[0] === baseName);
    return !!(basePoke?.megaVarietyId2);
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
    if (this.isReadOnly()) return;
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

  // Verifica se una voce è una variante regionale estera (Alola, Galar, Hisui, Paldea)
  isRegionalVariant(p: PokedexDTO): boolean {
    if (p.id < 10000) return false;
    const lower = p.name.toLowerCase();
    return (
      lower.includes('(alolan)') ||
      lower.includes('(galarian)') ||
      lower.includes('(hisuian)') ||
      lower.includes('(paldean)')
    );
  }

  // Indice pre-calcolato per conteggi rapidissimi (specie base, forme regionali, forme non regionali)
  speciesIndex = computed(() => {
    const list = this.pokemonList();
    const baseList: PokedexDTO[] = [];
    const baseById = new Map<number, PokedexDTO>();
    const formsByBaseId = new Map<number, PokedexDTO[]>();
    const nonRegionalFormsByBaseId = new Map<number, PokedexDTO[]>();
    const regionalVariants: PokedexDTO[] = [];
    const regionalVariantCountByRegion: Record<string, number> = { all: 0 };

    for (const p of list) {
      if (p.id < 10000) {
        baseList.push(p);
        baseById.set(p.id, p);
      }
    }

    for (const p of list) {
      if (p.id >= 10000) {
        const parentId = p.parentId || this.getBaseId(p);
        const arr = formsByBaseId.get(parentId);
        if (arr) arr.push(p);
        else formsByBaseId.set(parentId, [p]);

        if (this.isRegionalVariant(p)) {
          regionalVariants.push(p);
          const reg = this.getPokemonRegion(p);
          regionalVariantCountByRegion[reg] = (regionalVariantCountByRegion[reg] || 0) + 1;
          regionalVariantCountByRegion['all']++;
        } else {
          const nonRegArr = nonRegionalFormsByBaseId.get(parentId);
          if (nonRegArr) nonRegArr.push(p);
          else nonRegionalFormsByBaseId.set(parentId, [p]);
        }
      }
    }

    return {
      baseList,
      baseById,
      formsByBaseId,
      nonRegionalFormsByBaseId,
      regionalVariants,
      regionalVariantCountByRegion
    };
  });

  // Quante forme regionali extra aggiunge il toggle nella regione corrente (es. +18 in Alola, +19 in Galar, +53 in Tutte)
  activeRegionExtraVariantsCount = computed(() => {
    const region = this.selectedRegion();
    const idx = this.speciesIndex();
    return idx.regionalVariantCountByRegion[region] || 0;
  });

  // Helper per verificare se un singolo Pokémon è catturato in una data categoria
  private isSingleEntryCaughtForCategory(p: PokedexDTO, category: string): boolean {
    switch (category) {
      case 'shiny': return p.shiny;
      case 'shadow': return p.shadow;
      case 'purified': return p.purified;
      case 'perfect': return p.perfect;
      case 'lucky': return p.lucky;
      case 'xxl': return p.xxl;
      case 'xxs': return p.xxs;
      case 'mega': return p.mega > 0;
      case 'gigamax': return p.gigamax;
      case 'costume': return this.areAllCostumesCaught(p);
      case 'all':
      case 'regular':
      default:
        return p.regular;
    }
  }

  // Verifica se una specie (base + eventuali forme nel pool) è registrata in una categoria
  private isSpeciesGroupCaught(primary: PokedexDTO, relatedForms: PokedexDTO[], category: string): boolean {
    if (this.isSingleEntryCaughtForCategory(primary, category)) return true;
    for (const f of relatedForms) {
      if (this.isSingleEntryCaughtForCategory(f, category)) return true;
    }
    return false;
  }

  // Verifica se un Pokémon corrisponde al filtro Tipo
  private matchesTypeFilter(p: PokedexDTO, type: string, extraForms?: PokedexDTO[]): boolean {
    if (type === 'all') return true;
    if (p.type1.toLowerCase() === type || (p.type2 !== null && p.type2.toLowerCase() === type)) {
      return true;
    }
    if (extraForms) {
      for (const f of extraForms) {
        if (f.type1.toLowerCase() === type || (f.type2 !== null && f.type2.toLowerCase() === type)) {
          return true;
        }
      }
    }
    return false;
  }

  // Calcola il conteggio registrati / disponibili / totale Pokédex per una combinazione di filtri
  private computeProgress(
    region: string,
    formFilter: string,
    type: string,
    includeRegionals: boolean,
    searchCtx?: { cleanQuery: string; parsedIds: Set<number> | null; showFamily: boolean; familyRoots: Set<string> | null }
  ): DexProgressCount {
    const idx = this.speciesIndex();

    const matchesSearch = (p: PokedexDTO, extraForms?: PokedexDTO[]): boolean => {
      if (!searchCtx || !searchCtx.cleanQuery) return true;
      const checkOne = (item: PokedexDTO) => {
        if (searchCtx.showFamily && searchCtx.familyRoots) {
          return searchCtx.familyRoots.has(this.getRootAncestor(item.name));
        }
        return this.matchesSearchQuery(item, searchCtx.cleanQuery, searchCtx.parsedIds);
      };
      if (checkOne(p)) return true;
      if (extraForms) {
        for (const f of extraForms) {
          if (checkOne(f)) return true;
        }
      }
      return false;
    };

    // Caso speciale: Costumi Eventi (conta i singoli costumi e gli shiny costumi nello scope attivo)
    if (formFilter === 'costume') {
      const costumes = this.costumesList();
      let regularCaught = 0;
      let totalCostumes = 0;
      let shinyCaught = 0;
      let shinyTotal = 0;

      for (const c of costumes) {
        const base = idx.baseById.get(c.pokemonId);
        if (!base) continue;
        if (region !== 'all' && this.getPokemonRegion(base) !== region) continue;
        if (!this.matchesTypeFilter(base, type)) continue;
        if (!matchesSearch(base)) continue;

        totalCostumes++;
        if (c.regular) regularCaught++;
        if (c.shinyReleased) {
          shinyTotal++;
          if (c.shiny) shinyCaught++;
        }
      }

      const availablePct = totalCostumes > 0 ? Math.round((regularCaught / totalCostumes) * 100) : 0;
      const costumeShinyPct = shinyTotal > 0 ? Math.round((shinyCaught / shinyTotal) * 100) : 0;

      return {
        caught: regularCaught,
        caughtTotal: regularCaught,
        availableTotal: totalCostumes,
        dexTotal: totalCostumes,
        availablePct,
        dexPct: availablePct,
        availableCeilingPct: 100,
        missingAvailable: Math.max(0, totalCostumes - regularCaught),
        hasDualTotal: false,
        costumeShinyCaught: shinyCaught,
        costumeShinyTotal: shinyTotal,
        costumeShinyPct
      };
    }

    // Mega & Gigamax si applicano solo alle specie base (id < 10000)
    const isBaseOnlyForm = formFilter === 'mega' || formFilter === 'gigamax';
    const candidates: Array<{ entry: PokedexDTO; relatedForms: PokedexDTO[]; isVariant: boolean }> = [];

    for (const base of idx.baseList) {
      if (region !== 'all' && this.getPokemonRegion(base) !== region) continue;
      // In modalità pura Pokémon GO (includeRegionals = false):
      // una specie conta come registrata se catturata in forma base o in una qualsiasi sua forma (es. Ninetales Alola registra #038 in Kanto).
      // In modalità includeRegionals = true:
      // le forme regionali (Alola/Galar/Hisui/Paldea) vengono contate separatamente nelle rispettive regioni, quindi per la specie base
      // aggreghiamo solo eventuali forme non regionali (es. Unown, Deoxys, Vivillon).
      const related = includeRegionals
        ? (idx.nonRegionalFormsByBaseId.get(base.id) || [])
        : (idx.formsByBaseId.get(base.id) || []);

      const typeCheckForms = includeRegionals
        ? (idx.nonRegionalFormsByBaseId.get(base.id) || [])
        : (idx.nonRegionalFormsByBaseId.get(base.id) || []);

      if (!this.matchesTypeFilter(base, type, typeCheckForms)) continue;
      if (!matchesSearch(base, related)) continue;

      candidates.push({ entry: base, relatedForms: related, isVariant: false });
    }

    if (includeRegionals && !isBaseOnlyForm) {
      for (const variant of idx.regionalVariants) {
        if (region !== 'all' && this.getPokemonRegion(variant) !== region) continue;
        if (!this.matchesTypeFilter(variant, type)) continue;
        if (!matchesSearch(variant)) continue;
        candidates.push({ entry: variant, relatedForms: [], isVariant: true });
      }
    }

    let caughtAvailable = 0;
    let caughtTotal = 0;
    let availableTotal = 0;
    let dexTotal = 0;

    for (const { entry, relatedForms } of candidates) {
      const released = this.isReleased(entry.name);

      if (formFilter === 'mega') {
        if (!this.canMega(entry.name)) continue;
        const slots = this.hasTwoMegas(entry.name) ? 2 : 1;
        const caughtSlots = this.hasTwoMegas(entry.name)
          ? (((entry.mega & 1) > 0 ? 1 : 0) + ((entry.mega & 2) > 0 ? 1 : 0))
          : (entry.mega > 0 ? 1 : 0);
        dexTotal += slots;
        caughtTotal += caughtSlots;
        if (released) {
          availableTotal += slots;
          caughtAvailable += caughtSlots;
        }
        continue;
      }

      if (formFilter === 'gigamax') {
        if (!this.canGigamax(entry.name)) continue;
        const isCaught = entry.gigamax;
        dexTotal++;
        if (isCaught) caughtTotal++;
        if (released) {
          availableTotal++;
          if (isCaught) caughtAvailable++;
        }
        continue;
      }

      if (formFilter === 'shadow' || formFilter === 'purified') {
        if (!this.canShadow(entry.name)) continue;
        const isCaught = this.isSpeciesGroupCaught(entry, relatedForms, formFilter);
        dexTotal++;
        if (isCaught) caughtTotal++;
        if (released) {
          availableTotal++;
          if (isCaught) caughtAvailable++;
        }
        continue;
      }

      const isCaught = this.isSpeciesGroupCaught(entry, relatedForms, formFilter);

      // Per all/regular, shiny, perfect, lucky, xxl, xxs:
      // dexTotal = totale completo del Pokédex nello scope (es. 151 Kanto, 72 Kalos, 120 Paldea)
      // availableTotal = effettivamente rilasciati e idonei in Pokémon GO
      dexTotal++;
      if (isCaught) caughtTotal++;

      let isAvailable = released;
      if (isAvailable && formFilter === 'shiny' && this.isShinyUnreleased(entry.name)) {
        isAvailable = false;
      }
      if (isAvailable && formFilter === 'lucky' && this.settingsService.isMythical(entry.name)) {
        isAvailable = false;
      }

      if (isAvailable) {
        availableTotal++;
        if (isCaught) caughtAvailable++;
      }
    }

    const availablePct = availableTotal > 0 ? Math.min(100, Math.round((caughtAvailable / availableTotal) * 100)) : 0;
    const dexPct = dexTotal > 0 ? Math.min(100, Math.round((caughtTotal / dexTotal) * 100)) : 0;
    const availableCeilingPct = dexTotal > 0 ? Math.min(100, Math.round((availableTotal / dexTotal) * 1000) / 10) : 100;

    return {
      caught: caughtAvailable,
      caughtTotal,
      availableTotal,
      dexTotal,
      availablePct,
      dexPct,
      availableCeilingPct,
      missingAvailable: Math.max(0, availableTotal - caughtAvailable),
      hasDualTotal: dexTotal > availableTotal
    };
  }

  // Contesto di ricerca memorizzato per riutilizzo sia nella griglia che nei contatori
  private parsedSearchContext = computed(() => {
    const rawQuery = this.searchQuery().toLowerCase().trim();
    const showFamily = this.showEvolutionFamily() && rawQuery.length > 0;
    let cleanQuery = rawQuery;
    if (rawQuery.startsWith('+')) {
      cleanQuery = rawQuery.substring(1).trim();
    }
    const parsedIds = this.parsePokedexQuery(cleanQuery);
    let familyRoots: Set<string> | null = null;
    if (showFamily && cleanQuery) {
      familyRoots = new Set<string>();
      for (const p of this.pokemonList()) {
        if (this.matchesSearchQuery(p, cleanQuery, parsedIds)) {
          familyRoots.add(this.getRootAncestor(p.name));
        }
      }
    }
    return { cleanQuery, parsedIds, showFamily, familyRoots };
  });

  // Riepilogo principale sopra la griglia (reattivo a Regione, Forma Speciale, Tipo, Ricerca e Toggle Forme Regionali)
  summaryProgress = computed<DexProgressCount>(() => {
    return this.computeProgress(
      this.selectedRegion(),
      this.selectedFormFilter(),
      this.selectedType(),
      this.includeRegionalFormsInRegion(),
      this.parsedSearchContext()
    );
  });

  // Mini contatori per ogni pillola Regione (reattivi a Forma Speciale, Tipo e Toggle Forme Regionali)
  regionProgressMap = computed<Record<string, DexProgressCount>>(() => {
    const formFilter = this.selectedFormFilter();
    const type = this.selectedType();
    const includeRegionals = this.includeRegionalFormsInRegion();
    const map: Record<string, DexProgressCount> = {};
    for (const reg of this.pokemonRegions) {
      map[reg.value] = this.computeProgress(reg.value, formFilter, type, includeRegionals);
    }
    return map;
  });

  // Mini contatori per ogni pillola Forma Speciale (reattivi a Regione, Tipo e Toggle Forme Regionali)
  formProgressMap = computed<Record<string, DexProgressCount>>(() => {
    const region = this.selectedRegion();
    const type = this.selectedType();
    const includeRegionals = this.includeRegionalFormsInRegion();
    const map: Record<string, DexProgressCount> = {};
    for (const form of this.visibleSpecialForms()) {
      map[form.value] = this.computeProgress(region, form.value, type, includeRegionals);
    }
    return map;
  });

  // Filtro dinamico reattivo con supporto al raggruppamento delle forme regionali e modalità Pokédex regionale puro
  filteredList = computed(() => {
    const list = this.pokemonList();
    const { cleanQuery, parsedIds, showFamily, familyRoots } = this.parsedSearchContext();

    const status = this.selectedStatus();
    const type = this.selectedType();
    const formFilter = this.selectedFormFilter();
    const region = this.selectedRegion();
    const isGrouped = this.settingsService.groupRegionals();
    const includeRegionals = this.includeRegionalFormsInRegion();
    const effectiveStatusForPreSplit = formFilter === 'mega' ? 'all' : status;

    const finalizeMega = (items: PokedexDTO[]) => {
      if (formFilter !== 'mega') return items;
      const split = this.splitDualMegas(items);
      if (status === 'caught') {
        return split.filter(item =>
          item.megaFormOverride
            ? (item.megaFormOverride === 'x' ? (item.mega & 1) > 0 : (item.mega & 2) > 0)
            : item.mega > 0
        );
      }
      if (status === 'missing') {
        return split.filter(item =>
          item.megaFormOverride
            ? (item.megaFormOverride === 'x' ? (item.mega & 1) === 0 : (item.mega & 2) === 0)
            : item.mega === 0
        );
      }
      return split;
    };

    if (!isGrouped) {
      // Logica quando il raggruppamento è disattivato (mostra tutto separato)
      const baseFiltered = list.filter(p => {
        if (!includeRegionals && region !== 'all' && this.isRegionalVariant(p)) {
          return false;
        }
        return this.matchesFilters(p, cleanQuery, parsedIds, showFamily, familyRoots, effectiveStatusForPreSplit, type, formFilter, region);
      });
      return finalizeMega(baseFiltered);
    }

    // Logica quando il raggruppamento è attivo:
    const idx = this.speciesIndex();
    const basePokemons = idx.baseList;
    const result: PokedexDTO[] = [];

    for (const base of basePokemons) {
      const regionals = (idx.formsByBaseId.get(base.id) || []).filter(
        r => this.settingsService.includeUnreleased() || this.isReleased(r.name)
      );
      const allForms = [base, ...regionals];

      // Modalità Pokédex regionale puro stile Pokémon GO (includeRegionals === false e regione specifica selezionata)
      if (!includeRegionals && region !== 'all') {
        if (this.getPokemonRegion(base) !== region) {
          continue;
        }

        const nonRegionals = (idx.nonRegionalFormsByBaseId.get(base.id) || []).filter(
          r => this.settingsService.includeUnreleased() || this.isReleased(r.name)
        );
        const nativeForms = [base, ...nonRegionals];

        // Verifica filtro base (rilascio, ricerca, tipo, forma speciale) sul Pokémon nativo della regione
        const matchesCore = nativeForms.some(f =>
          this.matchesFilters(f, cleanQuery, parsedIds, showFamily, familyRoots, 'all', type, formFilter, region)
        );
        if (!matchesCore) continue;

        // Verifica status a livello di specie (come in Pokémon GO: se possiedi una forma regionale es. Ninetales Alola shiny,
        // la specie #038 risulta registrata nel Pokédex Shiny di Kanto!)
        if (effectiveStatusForPreSplit !== 'all') {
          const speciesCaught = this.isSpeciesGroupCaught(base, regionals, formFilter);
          if (effectiveStatusForPreSplit === 'caught' && !speciesCaught) continue;
          if (effectiveStatusForPreSplit === 'missing' && speciesCaught) continue;
        }

        result.push(base);

        // Se stiamo filtrando per 'caught' e la forma base non è catturata ma una forma regionale sì,
        // switchiamo automaticamente alla forma catturata per chiarezza visiva!
        if (effectiveStatusForPreSplit === 'caught' && !this.isSingleEntryCaughtForCategory(base, formFilter)) {
          const caughtForm = regionals.find(r => this.isSingleEntryCaughtForCategory(r, formFilter));
          const currentSelectedId = this.selectedFormMap()[base.id] || base.id;
          if (caughtForm && currentSelectedId === base.id) {
            setTimeout(() => this.selectFormForCard(base.id, caughtForm.id));
          }
        }
        continue;
      }

      // Modalità standard (Tutte le Regioni oppure Toggle "Includi Forme Regionali" attivo)
      const matchingForms = allForms.filter(f =>
        this.matchesFilters(f, cleanQuery, parsedIds, showFamily, familyRoots, effectiveStatusForPreSplit, type, formFilter, region)
      );

      if (matchingForms.length > 0) {
        result.push(base);

        const currentSelectedId = this.selectedFormMap()[base.id] || base.id;
        const currentStillMatches = matchingForms.some(f => f.id === currentSelectedId);

        if (!currentStillMatches) {
          const targetForm = matchingForms[0];
          setTimeout(() => {
            this.selectFormForCard(base.id, targetForm.id);
          });
        }
      }
    }

    return finalizeMega(result);
  });

  splitDualMegas(filtered: PokedexDTO[]): any[] {
    const result: any[] = [];
    for (const p of filtered) {
      if (p.id < 10000 && this.hasTwoMegas(p.name)) {
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
      this.includeRegionalFormsInRegion();
      this.settingsService.groupRegionals();
      this.settingsService.showCostumes();
      
      setTimeout(() => {
        this.limit.set(50);
        if (!this.settingsService.showCostumes() && this.selectedFormFilter() === 'costume') {
          this.selectedFormFilter.set('all');
        }
      });
    });

    // Quando cambia la regione o il toggle forme regionali, ripristina le forme selezionate sulle card
    effect(() => {
      this.selectedRegion();
      this.includeRegionalFormsInRegion();
      setTimeout(() => {
        this.selectedFormMap.set({});
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
          case 'costume': isCaught = this.areAllCostumesCaught(p); break;
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
          matchesForm = p.id < 10000 && this.canMega(p.name);
          break;
        case 'gigamax':
          matchesForm = p.id < 10000 && this.canGigamax(p.name);
          break;
        case 'shiny':
          matchesForm = !this.isShinyUnreleased(p.name);
          break;
        case 'costume':
          matchesForm = p.id < 10000 && this.getCostumesForPokemon(p).length > 0;
          break;
      }
    }

    return matchesQuery && matchesType && matchesStatus && matchesForm;
  }

  // Determina a quale regione appartiene il Pokémon in base a ID, generation e nome
  getPokemonRegion(p: PokedexDTO): string {
    // Specie native di Hisui (#899 Wyrdeer – #905 Enamorus) come nel Pokédex di Pokémon GO
    if (p.id >= 899 && p.id <= 905) {
      return 'hisui';
    }
    if (p.id >= 10000) {
      const lower = p.name.toLowerCase();
      if (lower.includes('(alolan)')) return 'alola';
      if (lower.includes('(galarian)')) return 'galar';
      if (lower.includes('(hisuian)')) return 'hisui';
      if (lower.includes('(paldean)')) return 'paldea';
    }
    switch (p.generation) {
      case 1: return 'kanto';
      case 2: return 'johto';
      case 3: return 'hoenn';
      case 4: return 'sinnoh';
      case 5: return 'unova';
      case 6: return 'kalos';
      case 7: return 'alola';
      case 8: return 'galar';
      case 9: return 'paldea';
      default: return 'kanto';
    }
  }

  // Seleziona la regione attiva per filtrare l'elenco
  selectRegion(regionValue: string) {
    this.selectedRegion.set(regionValue);
  }

  // Attiva/disattiva l'inclusione delle forme regionali nelle rispettive regioni (es. Ninetales di Alola in Alola)
  toggleIncludeRegionalForms(checked: boolean) {
    this.includeRegionalFormsInRegion.set(checked);
  }

  // Determina se mostrare i bottoncini di cambio forma regionale sulla card (es. Base | Alola dentro Kanto in stile Pokémon GO)
  canShowFormSwitcher(base: PokedexDTO): boolean {
    const region = this.selectedRegion();
    if (region === 'all') return true;
    if (!this.includeRegionalFormsInRegion()) return true;
    // Se il toggle forme regionali è attivo su una regione specifica, mostra lo switcher solo se la specie base appartiene a quella regione
    // (es. Deoxys / Castform in Hoenn o forme native della regione)
    return this.getPokemonRegion(base) === region;
  }

  // Shortcut cliccabile sul badge "mancanti" nella barra progressi
  toggleMissingShortcut() {
    if (this.selectedStatus() === 'missing') {
      this.selectedStatus.set('all');
    } else {
      this.selectedStatus.set('missing');
    }
  }

  // Restituisce il simbolo visivo per la categoria attiva nella barra progressi
  getCategoryIcon(form: string): string {
    switch (form) {
      case 'shiny': return '✨';
      case 'shadow': return '🔮';
      case 'purified': return '💎';
      case 'perfect': return '★★★';
      case 'lucky': return '🍀';
      case 'xxl': return 'XXL';
      case 'xxs': return 'XXS';
      case 'mega': return '🧬';
      case 'gigamax': return '🌋';
      case 'costume': return '🎭';
      default: return 'pokeball';
    }
  }

  // Tooltip informativo dettagliato per ogni pillola Regione (mostra entrambi i numeri quando differiscono)
  getRegionPillTooltip(regionValue: string): string {
    const p = this.regionProgressMap()[regionValue];
    const regName = this.i18n.translate('region.' + regionValue);
    if (!p) return regName;
    if (this.selectedFormFilter() === 'costume') {
      return `${regName}: ${p.caught}/${p.availableTotal} (${p.availablePct}%) · ✨ ${p.costumeShinyCaught ?? 0}/${p.costumeShinyTotal ?? 0}`;
    }
    if (p.hasDualTotal) {
      const availLabel = this.i18n.translate('pokedex.progress.available');
      const fullLabel = this.i18n.translate('pokedex.progress.full_dex');
      return `${regName}: ${p.caught}/${p.availableTotal} ${availLabel} (${p.availablePct}%) · ${p.caughtTotal}/${p.dexTotal} ${fullLabel} (${p.dexPct}%)`;
    }
    return `${regName}: ${p.caught}/${p.availableTotal} (${p.availablePct}%)`;
  }

  // Tooltip informativo dettagliato per ogni pillola Forma Speciale
  getFormPillTooltip(formValue: string): string {
    const p = this.formProgressMap()[formValue];
    const formName = this.i18n.translate('form.' + formValue);
    if (!p) return formName;
    if (formValue === 'costume') {
      return `${formName}: ${p.caught}/${p.availableTotal} (${p.availablePct}%) · ✨ ${p.costumeShinyCaught ?? 0}/${p.costumeShinyTotal ?? 0}`;
    }
    if (p.hasDualTotal) {
      const availLabel = this.i18n.translate('pokedex.progress.available');
      const fullLabel = this.i18n.translate('pokedex.progress.full_dex');
      return `${formName}: ${p.caught}/${p.availableTotal} ${availLabel} (${p.availablePct}%) · ${p.caughtTotal}/${p.dexTotal} ${fullLabel} (${p.dexPct}%)`;
    }
    return `${formName}: ${p.caught}/${p.availableTotal} (${p.availablePct}%)`;
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
    if (name.includes('origin')) return this.i18n.translate('form.origin');
    
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
          const reserved = ['about', 'admin', 'settings', 'stats', 'export', 'assets', 'favicon.ico', 'landing', 'api', 'quest', 'quests', 'egg', 'eggs', 'raid', 'raids'];
          if (reserved.includes(routeUser.toLowerCase())) {
            return;
          }
          this.username = routeUser;
          this.isPrivateError.set(false);

          // Esegue la find-or-create automatica sul backend
          this.userService.createUser(routeUser).subscribe({
            next: (user) => {
              this.profileUser.set(user);
              
              const currentUser = this.userService.getCurrentUser();
              const isOwner = currentUser && currentUser.name.toLowerCase() === routeUser.toLowerCase();
              
              if (user.isProtected) {
                if (isOwner) {
                  this.activeUser.set(currentUser);
                  this.isReadOnly.set(false);
                } else {
                  this.activeUser.set(null);
                  this.isReadOnly.set(true);
                }
              } else {
                // Non protetto
                this.userService.setActiveUser(user);
                this.activeUser.set(user);
                this.isReadOnly.set(false);
              }
              
              this.loadPokedex(user.id);
            },
            error: (err) => {
              console.error('Errore nella registrazione/ricerca dell\'allenatore:', err);
              if (err.status === 403) {
                this.isPrivateError.set(true);
              }
            }
          });
        }
      })
    );

    // Si iscrive reattivamente all'utente attivo. Quando cambia, ricarica il Pokedex!
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        const routeUser = this.username;
        if (!routeUser) return;
        
        const isOwner = user && user.name.toLowerCase() === routeUser.toLowerCase();
        const profile = this.profileUser();
        
        if (profile) {
          if (profile.isProtected) {
            if (isOwner) {
              this.activeUser.set(user);
              this.isReadOnly.set(false);
              this.loadPokedex(user!.id);
            } else {
              this.activeUser.set(null);
              this.isReadOnly.set(true);
              this.loadPokedex(profile.id);
            }
          } else {
            this.activeUser.set(user);
            this.isReadOnly.set(false);
            if (profile.id) this.loadPokedex(profile.id);
          }
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

    const anchor = this.scrollAnchor()?.nativeElement;
    if (anchor) {
      this.observer.observe(anchor);
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
        if (err.status === 403) {
          this.isPrivateError.set(true);
        }
      }
    });

    this.pokedexService.getCostumes(userId).subscribe({
      next: (costumes) => {
        this.costumesList.set(costumes);
      },
      error: (err) => {
        console.error('Errore nel recupero dei costumi dell\'utente:', err);
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
    if (this.isReadOnly()) return;
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

  // --- Gestione Pokémon in Costume ---
  getCostumesForPokemon(p: PokedexDTO): CostumeDTO[] {
    const baseId = this.getBaseId(p);
    return this.costumesByPokemonId().get(baseId) || [];
  }

  getCostumeProgress(p: PokedexDTO): { caught: number; total: number; shinyCaught: number; shinyTotal: number } {
    const list = this.getCostumesForPokemon(p);
    let caught = 0;
    let shinyCaught = 0;
    let shinyTotal = 0;
    for (const c of list) {
      if (c.regular) caught++;
      if (c.shinyReleased) {
        shinyTotal++;
        if (c.shiny) shinyCaught++;
      }
    }
    return { caught, total: list.length, shinyCaught, shinyTotal };
  }

  areAllCostumesCaught(p: PokedexDTO): boolean {
    const list = this.getCostumesForPokemon(p);
    if (list.length === 0) return false;
    return list.every(c => c.regular);
  }

  openCostumeModal(p: PokedexDTO) {
    const baseId = this.getBaseId(p);
    const basePoke = p.id < 10000 ? p : (this.pokemonList().find(x => x.id === baseId) || p);
    this.activeCostumePokemon.set(basePoke);
    this.costumeSearchQuery.set('');
    this.costumeStatusFilter.set('all');
    this.costumeShinyPreview.set(false);

    setTimeout(() => {
      const dialog = this.costumeDialog()?.nativeElement;
      if (dialog && !dialog.open) {
        dialog.showModal();
        this.bindCostumeDialogLightDismissFallback(dialog);
      }
    });
  }

  closeCostumeModal() {
    const dialog = this.costumeDialog()?.nativeElement;
    if (dialog && dialog.open) {
      dialog.close();
    } else {
      this.activeCostumePokemon.set(null);
    }
  }

  onCostumeDialogClose() {
    const dialog = this.costumeDialog()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.activeCostumePokemon.set(null);
  }

  private bindCostumeDialogLightDismissFallback(dialog: HTMLDialogElement) {
    if (this.costumeDialogFallbackBound || typeof HTMLDialogElement === 'undefined') return;
    if ('closedBy' in HTMLDialogElement.prototype) {
      this.costumeDialogFallbackBound = true;
      return;
    }
    this.costumeDialogFallbackBound = true;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = isOutside(e);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
    });
  }

  toggleCostume(costume: CostumeDTO, field: 'regular' | 'shiny') {
    if (this.isReadOnly()) return;
    if (field === 'shiny' && !costume.shinyReleased) return;
    const user = this.activeUser();
    if (!user) return;

    const updated: CostumeDTO = {
      ...costume,
      [field]: !costume[field]
    };

    this.pokedexService.updateCostumeEntry(user.id, updated).subscribe({
      next: (res) => {
        this.costumesList.update(list =>
          list.map(c => c.id === costume.id ? res : c)
        );
      },
      error: (err) => {
        console.error('Errore aggiornamento costume:', err);
      }
    });
  }

  getCostumeSpriteUrl(c: CostumeDTO): string {
    if (this.costumeShinyPreview() && c.shinyReleased && c.shinySpriteUrl) {
      return c.shinySpriteUrl;
    }
    return c.spriteUrl;
  }

  onCostumeImageError(event: Event, c: CostumeDTO) {
    const img = event.target as HTMLImageElement | null;
    if (!img || img.dataset['fallbackApplied']) return;
    img.dataset['fallbackApplied'] = 'true';
    const isShiny = this.costumeShinyPreview() && c.shinyReleased;
    img.src = isShiny
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${c.pokemonId}.png`
      : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${c.pokemonId}.png`;
  }
}
