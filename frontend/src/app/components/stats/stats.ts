import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexStats, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SHADOW_CAPABLE_SPECIES } from '../../services/shadow-list';

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './stats.html',
  styleUrl: './stats.css'
})
export class StatsComponent implements OnInit, OnDestroy {
  pokemonList = signal<PokedexDTO[]>([]);

  // Specie idonee alle forme speciali
  megaCapableSpecies = ['Venusaur', 'Charizard', 'Blastoise', 'Beedrill', 'Pidgeot', 'Alakazam', 'Slowbro', 'Gengar', 'Kangaskhan', 'Pinsir', 'Gyarados', 'Aerodactyl', 'Mewtwo', 'Ampharos', 'Steelix', 'Scizor', 'Heracross', 'Houndoom', 'Tyranitar', 'Sceptile', 'Blaziken', 'Swampert', 'Gardevoir', 'Sableye', 'Mawile', 'Aggron', 'Medicham', 'Manectric', 'Sharpedo', 'Camerupt', 'Altaria', 'Banette', 'Absol', 'Glalie', 'Salamence', 'Metagross', 'Latias', 'Latios', 'Rayquaza', 'Lopunny', 'Lucario', 'Abomasnow', 'Gallade', 'Audino', 'Diancie', 'Kyogre', 'Groudon', 'Victreebel', 'Dragonite'];
  gigamaxCapableSpecies = ['Venusaur', 'Charizard', 'Blastoise', 'Butterfree', 'Pikachu', 'Meowth', 'Machamp', 'Gengar', 'Kingler', 'Lapras', 'Eevee', 'Snorlax', 'Garbodor', 'Melmetal', 'Rillaboom', 'Cinderace', 'Inteleon', 'Corviknight', 'Orbeetle', 'Drednaw', 'Coalossal', 'Flapple', 'Appletun', 'Sandaconda', 'Toxtricity', 'Centiskorch', 'Hatterene', 'Grimmsnarl', 'Alcremie', 'Duraludon', 'Urshifu'];

  canMega(name: string): boolean {
    const baseName = name.split(' (')[0];
    return this.megaCapableSpecies.includes(baseName);
  }

  canGigamax(name: string): boolean {
    const baseName = name.split(' (')[0];
    return this.gigamaxCapableSpecies.includes(baseName);
  }

  canShadow(name: string): boolean {
    const baseName = name.split(' (')[0];
    return SHADOW_CAPABLE_SPECIES.includes(baseName);
  }
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);
  selectedRegion = signal<string>('all');

  // Regioni disponibili nel gioco per il calcolo delle statistiche
  pokemonRegions = [
    { value: 'all', label: 'Tutte le Regioni' },
    { value: 'kanto', label: 'Kanto' },
    { value: 'johto', label: 'Johto' },
    { value: 'hoenn', label: 'Hoenn' },
    { value: 'sinnoh', label: 'Sinnoh' },
    { value: 'unova', label: 'Unova' },
    { value: 'kalos', label: 'Kalos' },
    { value: 'alola', label: 'Alola' },
    { value: 'galar', label: 'Galar' },
    { value: 'hisui', label: 'Hisui' },
    { value: 'paldea', label: 'Paldea' }
  ];

  // Calcolo reattivo della lista Pokémon filtrata per la regione attiva
  filteredPokemon = computed(() => {
    const list = this.pokemonList();
    const region = this.selectedRegion();
    if (region === 'all') return list;
    return list.filter(p => this.getPokemonRegion(p) === region);
  });

  // Calcolo delle statistiche reattive
  computedStats = computed<PokedexStats>(() => {
    const filtered = this.filteredPokemon();
    const total = filtered.length;

    let regularCaught = 0;
    let shadowCaught = 0;
    let purifiedCaught = 0;
    let perfectCaught = 0;
    let luckyCaught = 0;
    let xxlCaught = 0;
    let xxsCaught = 0;
    let shinyCaught = 0;
    let megaCaught = 0;
    let gigamaxCaught = 0;

    for (const p of filtered) {
      if (p.regular) regularCaught++;
      if (p.shadow) shadowCaught++;
      if (p.purified) purifiedCaught++;
      if (p.perfect) perfectCaught++;
      if (p.lucky) luckyCaught++;
      if (p.xxl) xxlCaught++;
      if (p.xxs) xxsCaught++;
      if (p.shiny) shinyCaught++;
      if (p.mega) megaCaught += (p.mega === 3 ? 2 : 1);
      if (p.gigamax) gigamaxCaught++;
    }

    return {
      total,
      regularCaught,
      shadowCaught,
      purifiedCaught,
      perfectCaught,
      luckyCaught,
      xxlCaught,
      xxsCaught,
      shinyCaught,
      megaCaught,
      gigamaxCaught
    };
  });

  // Espone stats per mantenere la retrocompatibilità del template HTML
  stats = computed(() => this.computedStats());

  // Totabili idonei dinamici
  shadowCapableTotal = computed(() => {
    return this.filteredPokemon().filter(p => this.canShadow(p.name)).length;
  });

  megaCapableTotal = computed(() => {
    let count = 0;
    for (const p of this.filteredPokemon()) {
      if (this.canMega(p.name)) {
        const baseName = p.name.split(' (')[0];
        const isDouble = baseName === 'Charizard' || baseName === 'Mewtwo';
        count += isDouble ? 2 : 1;
      }
    }
    return count;
  });

  gigamaxCapableTotal = computed(() => {
    return this.filteredPokemon().filter(p => this.canGigamax(p.name)).length;
  });

  // Percentuali computate reattivamente basate su computedStats ed i corretti denominatori
  regularPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().regularCaught / this.computedStats().total) * 100) : 0);
  shadowPct = computed(() => this.shadowCapableTotal() > 0 ? Math.round((this.computedStats().shadowCaught / this.shadowCapableTotal()) * 100) : 0);
  purifiedPct = computed(() => this.shadowCapableTotal() > 0 ? Math.round((this.computedStats().purifiedCaught / this.shadowCapableTotal()) * 100) : 0);
  perfectPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().perfectCaught / this.computedStats().total) * 100) : 0);
  luckyPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().luckyCaught / this.computedStats().total) * 100) : 0);
  xxlPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().xxlCaught / this.computedStats().total) * 100) : 0);
  xxsPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().xxsCaught / this.computedStats().total) * 100) : 0);
  shinyPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().shinyCaught / this.computedStats().total) * 100) : 0);
  megaPct = computed(() => this.megaCapableTotal() > 0 ? Math.round((this.computedStats().megaCaught / this.megaCapableTotal()) * 100) : 0);
  gigamaxPct = computed(() => this.gigamaxCapableTotal() > 0 ? Math.round((this.computedStats().gigamaxCaught / this.gigamaxCapableTotal()) * 100) : 0);

  username = '';
  private sub = new Subscription();

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

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

    // Si iscrive reattivamente all'utente attivo. Quando cambia, ricarica le statistiche!
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        if (user && user.name.toLowerCase() === this.username.toLowerCase()) {
          this.activeUser.set(user);
          this.fetchStats(user.id);
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  fetchStats(userId: number) {
    this.isLoading.set(true);
    this.pokedexService.getAllEntries(userId).subscribe({
      next: (data) => {
        this.pokemonList.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Errore nel caricamento del Pokédex per l\'elaborazione statistiche:', err);
        this.isLoading.set(false);
      }
    });
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

  // Seleziona la regione attiva per filtrare i conteggi statistici
  selectRegion(regionValue: string) {
    this.selectedRegion.set(regionValue);
  }

  // Restituisce l'etichetta testuale della regione selezionata
  getActiveRegionLabel(): string {
    const found = this.pokemonRegions.find(r => r.value === this.selectedRegion());
    return found ? found.label : 'Tutte le Regioni';
  }
}
