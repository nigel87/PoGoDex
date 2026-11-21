import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, BehaviorSubject } from 'rxjs';
import { PokedexList } from './pokedex-list';
import { PokedexService, PokedexDTO, CostumeDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { I18nService } from '../../services/i18n.service';

function makePokemon(overrides: Partial<PokedexDTO> & { id: number; name: string; generation: number }): PokedexDTO {
  return {
    type1: 'Normal',
    type2: null,
    spriteUrl: '',
    regular: false,
    shadow: false,
    purified: false,
    perfect: false,
    lucky: false,
    xxs: false,
    xxl: false,
    shiny: false,
    mega: 0,
    gigamax: false,
    parentId: null,
    ...overrides
  };
}

describe('PokedexList registration counters & regional forms toggle', () => {
  let component: PokedexList;
  let settings: SettingsService;

  beforeEach(async () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); }
      }
    });
    const activeUser$ = new BehaviorSubject<User | null>(null);

    await TestBed.configureTestingModule({
      imports: [PokedexList],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { params: of({}) }
        },
        {
          provide: PokedexService,
          useValue: {
            getAllEntries: () => of([]),
            getCostumes: () => of([]),
            updateEntry: (_u: number, _id: number, dto: PokedexDTO) => of(dto),
            updateCostumeEntry: (_u: number, dto: CostumeDTO) => of(dto)
          }
        },
        {
          provide: UserService,
          useValue: {
            activeUser$: activeUser$.asObservable(),
            getUsers: () => of([]),
            getCurrentUser: () => null,
            createUser: (name: string) => of({ id: 1, name }),
            setActiveUser: () => {}
          }
        },
        SettingsService,
        I18nService
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PokedexList);
    component = fixture.componentInstance;
    settings = TestBed.inject(SettingsService);
    component.isLoading.set(false);
  });

  it('computes pure Pokémon GO Kanto Shiny counts and registers species via regional form when toggle is OFF', () => {
    // 2 Kanto base species (#37 Vulpix, #38 Ninetales) + Alolan Ninetales (gen 7, parentId 38) + 1 native Alola (#722 Rowlet)
    component.pokemonList.set([
      makePokemon({ id: 37, name: 'Vulpix', generation: 1, type1: 'Fire', regular: true, shiny: true }),
      makePokemon({ id: 38, name: 'Ninetales', generation: 1, type1: 'Fire', regular: false, shiny: false }),
      makePokemon({ id: 10104, name: 'Ninetales (Alolan)', generation: 7, type1: 'Ice', type2: 'Fairy', parentId: 38, regular: true, shiny: true }),
      makePokemon({ id: 722, name: 'Rowlet', generation: 7, type1: 'Grass', type2: 'Flying', regular: true, shiny: false })
    ]);

    // Default: includeRegionalFormsInRegion is OFF (pure Pokémon GO Pokédex)
    expect(component.includeRegionalFormsInRegion()).toBe(false);

    component.selectRegion('kanto');
    component.selectFormFilter('shiny');

    // In pure Kanto Shiny mode, catching Alolan Ninetales shiny registers #38 Ninetales -> 2/2!
    const kantoShiny = component.summaryProgress();
    expect(kantoShiny.caught).toBe(2);
    expect(kantoShiny.availableTotal).toBe(2);
    expect(kantoShiny.dexTotal).toBe(2);
    expect(kantoShiny.hasDualTotal).toBe(false);

    // Pure Alola Shiny mode only counts native Rowlet -> 0/1 (does NOT include Alolan Ninetales)
    const alolaPillOff = component.regionProgressMap()['alola'];
    expect(alolaPillOff.caught).toBe(0);
    expect(alolaPillOff.availableTotal).toBe(1);
    expect(alolaPillOff.dexTotal).toBe(1);

    // Selecting Alola with toggle OFF only displays Rowlet in filteredList
    component.selectRegion('alola');
    expect(component.filteredList().map(p => p.id)).toEqual([722]);

    // Now turn ON "Include Regional Forms" toggle!
    component.toggleIncludeRegionalForms(true);

    // Alola Shiny now includes Alolan Ninetales -> 1/2!
    const alolaShinyOn = component.summaryProgress();
    expect(alolaShinyOn.caught).toBe(1);
    expect(alolaShinyOn.availableTotal).toBe(2);
    expect(alolaShinyOn.dexTotal).toBe(2);

    // Alola filteredList now includes both Ninetales (auto-switched to Alolan) and Rowlet
    expect(component.filteredList().map(p => p.id)).toEqual([38, 722]);

    // Meanwhile Kanto Shiny tracks base Kanto Ninetales independently -> 1/2
    const kantoPillOn = component.regionProgressMap()['kanto'];
    expect(kantoPillOn.caught).toBe(1);
    expect(kantoPillOn.availableTotal).toBe(2);

    // All Regions with toggle ON = Kanto (2) + Alola (2) -> total 4 entries, 2 caught
    const allPillOn = component.regionProgressMap()['all'];
    expect(allPillOn.caught).toBe(2);
    expect(allPillOn.availableTotal).toBe(4);
  });

  it('displays dual totals (available vs full Pokédex) when unreleased or shiny-locked Pokémon exist', () => {
    // Sinnoh: Turtwig (released + shiny), Arceus (unreleased in Pokémon GO)
    component.pokemonList.set([
      makePokemon({ id: 387, name: 'Turtwig', generation: 4, type1: 'Grass', regular: true, shiny: true }),
      makePokemon({ id: 493, name: 'Arceus', generation: 4, type1: 'Normal', regular: false, shiny: false })
    ]);

    component.selectRegion('sinnoh');
    component.selectFormFilter('all');

    const sp = component.summaryProgress();
    expect(sp.caught).toBe(1);
    expect(sp.availableTotal).toBe(1);
    expect(sp.dexTotal).toBe(2);
    expect(sp.hasDualTotal).toBe(true);
    expect(sp.availablePct).toBe(100);
    expect(sp.dexPct).toBe(50);
    expect(sp.missingAvailable).toBe(0);
  });

  it('counts dual Megas (Mega X and Mega Y) accurately and matches Missing filter', () => {
    component.pokemonList.set([
      makePokemon({ id: 6, name: 'Charizard', generation: 1, type1: 'Fire', type2: 'Flying', regular: true, mega: 1 }), // only Mega X caught
      makePokemon({ id: 9, name: 'Blastoise', generation: 1, type1: 'Water', regular: true, mega: 1 })
    ]);

    component.selectRegion('kanto');
    component.selectFormFilter('mega');

    const sp = component.summaryProgress();
    expect(sp.caught).toBe(2);          // Charizard Mega X + Blastoise Mega
    expect(sp.availableTotal).toBe(3);  // Charizard X, Charizard Y, Blastoise
    expect(sp.missingAvailable).toBe(1);

    // Toggle Missing shortcut -> only Charizard Mega Y remains
    component.toggleMissingShortcut();
    expect(component.selectedStatus()).toBe('missing');
    const missingCards = component.filteredList();
    expect(missingCards.length).toBe(1);
    expect((missingCards[0] as any).megaFormOverride).toBe('y');
  });

  it('maps Hisui native species (#899-#905) to Hisui and tracks Hisuian variants when toggle is ON', () => {
    component.pokemonList.set([
      makePokemon({ id: 58, name: 'Growlithe', generation: 1, type1: 'Fire', regular: true }),
      makePokemon({ id: 10229, name: 'Growlithe (Hisuian)', generation: 8, type1: 'Fire', type2: 'Rock', parentId: 58, regular: true }),
      makePokemon({ id: 899, name: 'Wyrdeer', generation: 9, type1: 'Normal', type2: 'Psychic', regular: true }),
      makePokemon({ id: 902, name: 'Basculegion', generation: 8, type1: 'Water', type2: 'Ghost', regular: false })
    ]);

    component.selectRegion('hisui');
    expect(component.summaryProgress().dexTotal).toBe(2); // Wyrdeer + Basculegion
    expect(component.activeRegionExtraVariantsCount()).toBe(1); // Growlithe (Hisuian)

    component.toggleIncludeRegionalForms(true);
    expect(component.summaryProgress().dexTotal).toBe(3); // + Growlithe (Hisuian)
    expect(component.summaryProgress().caught).toBe(2);   // Wyrdeer + Growlithe (Hisuian)
  });

  it('tracks Event Costumes (Normal & Shiny) accurately per region', () => {
    settings.setShowCostumes(true);
    component.pokemonList.set([
      makePokemon({ id: 25, name: 'Pikachu', generation: 1, type1: 'Electric', regular: true })
    ]);
    component.costumesList.set([
      {
        id: 'pika-1',
        pokemonId: 25,
        speciesName: 'Pikachu',
        costumeName: 'Party Hat',
        spriteUrl: '',
        shinyReleased: true,
        sortOrder: 1,
        regular: true,
        shiny: true
      },
      {
        id: 'pika-2',
        pokemonId: 25,
        speciesName: 'Pikachu',
        costumeName: 'Witch Hat',
        spriteUrl: '',
        shinyReleased: true,
        sortOrder: 2,
        regular: true,
        shiny: false
      }
    ]);

    component.selectRegion('kanto');
    component.selectFormFilter('costume');

    const sp = component.summaryProgress();
    expect(sp.caught).toBe(2);
    expect(sp.availableTotal).toBe(2);
    expect(sp.costumeShinyCaught).toBe(1);
    expect(sp.costumeShinyTotal).toBe(2);
    expect(sp.costumeShinyPct).toBe(50);
  });
});
