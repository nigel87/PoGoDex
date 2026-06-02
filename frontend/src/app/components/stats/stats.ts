import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexStats, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { SHADOW_CAPABLE_SPECIES, MEGA_CAPABLE_SPECIES, GIGAMAX_CAPABLE_SPECIES, UNRELEASED_SPECIES, MODAL_FORMS_SPECIES } from '../../services/pokemon-config';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './stats.html',
  styleUrl: './stats.css'
})
export class StatsComponent implements OnInit, OnDestroy {
  version = APP_VERSION;
  pokemonList = signal<PokedexDTO[]>([]);

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

  activeUser = signal<User | null>(null);
  profileUser = signal<User | null>(null);
  isReadOnly = signal<boolean>(false);
  isPrivateError = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  selectedRegion = signal<string>('all');

  // Regioni disponibili nel gioco per il calcolo delle statistiche
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

  // Calcolo reattivo della lista Pokémon filtrata per la regione attiva
  filteredPokemon = computed(() => {
    const list = this.pokemonList();
    const region = this.selectedRegion();
    
    // Filtra in base all'impostazione "Includi non rilasciati"
    let result = list;
    if (!this.settingsService.includeUnreleased()) {
      result = list.filter(p => this.isReleased(p.name));
    }
    
    if (region === 'all') return result;
    return result.filter(p => this.getPokemonRegion(p) === region);
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
      if (p.regular && this.settingsService.isButtonVisible(p.name, p.id, 'regular')) regularCaught++;
      if (p.shadow && this.settingsService.isButtonVisible(p.name, p.id, 'shadow')) shadowCaught++;
      if (p.purified && this.settingsService.isButtonVisible(p.name, p.id, 'purified')) purifiedCaught++;
      if (p.perfect && this.settingsService.isButtonVisible(p.name, p.id, 'perfect')) perfectCaught++;
      if (p.lucky && this.settingsService.isButtonVisible(p.name, p.id, 'lucky')) luckyCaught++;
      if (p.xxl && this.settingsService.isButtonVisible(p.name, p.id, 'xxl')) xxlCaught++;
      if (p.xxs && this.settingsService.isButtonVisible(p.name, p.id, 'xxs')) xxsCaught++;
      if (p.shiny && this.settingsService.isButtonVisible(p.name, p.id, 'shiny')) shinyCaught++;
      if (p.mega && this.settingsService.isButtonVisible(p.name, p.id, 'mega')) {
        megaCaught += (p.mega === 3 ? 2 : 1);
      }
      if (p.gigamax && this.settingsService.isButtonVisible(p.name, p.id, 'gigamax')) gigamaxCaught++;
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

  isModalFormSpecies(name: string): boolean {
    const baseName = name.split(' (')[0];
    return MODAL_FORMS_SPECIES.includes(baseName);
  }

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

  luckyCapableTotal = computed(() => {
    return this.filteredPokemon().filter(p => {
      const isAltOfModal = this.isModalFormSpecies(p.name) && p.id >= 10000;
      return !isAltOfModal && this.settingsService.isButtonVisible(p.name, p.id, 'lucky');
    }).length;
  });

  xxlCapableTotal = computed(() => {
    return this.filteredPokemon().filter(p => {
      const isAltOfModal = this.isModalFormSpecies(p.name) && p.id >= 10000;
      return !isAltOfModal && this.settingsService.isButtonVisible(p.name, p.id, 'xxl');
    }).length;
  });

  xxsCapableTotal = computed(() => {
    return this.filteredPokemon().filter(p => {
      const isAltOfModal = this.isModalFormSpecies(p.name) && p.id >= 10000;
      return !isAltOfModal && this.settingsService.isButtonVisible(p.name, p.id, 'xxs');
    }).length;
  });

  // Percentuali computate reattivamente basate su computedStats ed i corretti denominatori
  regularPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().regularCaught / this.computedStats().total) * 100) : 0);
  shadowPct = computed(() => this.shadowCapableTotal() > 0 ? Math.round((this.computedStats().shadowCaught / this.shadowCapableTotal()) * 100) : 0);
  purifiedPct = computed(() => this.shadowCapableTotal() > 0 ? Math.round((this.computedStats().purifiedCaught / this.shadowCapableTotal()) * 100) : 0);
  perfectPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().perfectCaught / this.computedStats().total) * 100) : 0);
  luckyPct = computed(() => this.luckyCapableTotal() > 0 ? Math.round((this.computedStats().luckyCaught / this.luckyCapableTotal()) * 100) : 0);
  xxlPct = computed(() => this.xxlCapableTotal() > 0 ? Math.round((this.computedStats().xxlCaught / this.xxlCapableTotal()) * 100) : 0);
  xxsPct = computed(() => this.xxsCapableTotal() > 0 ? Math.round((this.computedStats().xxsCaught / this.xxsCapableTotal()) * 100) : 0);
  shinyPct = computed(() => this.computedStats().total > 0 ? Math.round((this.computedStats().shinyCaught / this.computedStats().total) * 100) : 0);
  megaPct = computed(() => this.megaCapableTotal() > 0 ? Math.round((this.computedStats().megaCaught / this.megaCapableTotal()) * 100) : 0);
  gigamaxPct = computed(() => this.gigamaxCapableTotal() > 0 ? Math.round((this.computedStats().gigamaxCaught / this.gigamaxCapableTotal()) * 100) : 0);

  username = '';
  private sub = new Subscription();

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    public settingsService: SettingsService,
    private route: ActivatedRoute,
    private router: Router,
    public i18n: I18nService
  ) { }

  ngOnInit() {
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
              
              this.fetchStats(user.id);
            },
            error: (err) => {
              console.error('Errore nel recupero del profilo per le statistiche:', err);
              if (err.status === 403) {
                this.isPrivateError.set(true);
              }
              this.isLoading.set(false);
            }
          });
        }
      })
    );

    // Si iscrive reattivamente all'utente attivo. Quando cambia, ricarica le statistiche!
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
              this.fetchStats(user!.id);
            } else {
              this.activeUser.set(null);
              this.isReadOnly.set(true);
              this.fetchStats(profile.id);
            }
          } else {
            this.activeUser.set(user);
            this.isReadOnly.set(false);
            if (profile.id) this.fetchStats(profile.id);
          }
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
    return this.i18n.translate('region.' + this.selectedRegion());
  }
}
