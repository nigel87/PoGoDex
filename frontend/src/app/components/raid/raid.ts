import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, Raid, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { SHINY_UNRELEASED_SPECIES, EVOLVES_FROM } from '../../services/pokemon-config';
import { APP_VERSION } from '../../version';
import { HeaderComponent } from '../header/header';

@Component({
  selector: 'app-raid',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, HeaderComponent],
  templateUrl: './raid.html',
  styleUrl: './raid.css'
})
export class RaidComponent implements OnInit, OnDestroy {
  version = APP_VERSION;
  raidsList = signal<Raid[]>([]);
  pokemonEntries = signal<Map<number, PokedexDTO>>(new Map());
  usersList = signal<User[]>([]);
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);

  private sub = new Subscription();

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    public settingsService: SettingsService,
    private router: Router,
    public i18n: I18nService
  ) {}

  ngOnInit() {
    this.loadUsers();

    // Sottoscrizione all'utente attivo
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        if (user) {
          this.activeUser.set(user);
          this.loadData(user.id);
        } else {
          this.activeUser.set(null);
          this.loadData();
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  loadUsers() {
    this.userService.getUsers().subscribe({
      next: (users) => this.usersList.set(users),
      error: (err) => console.error('Errore nel caricamento degli allenatori:', err)
    });
  }

  switchUser(user: User) {
    this.userService.setActiveUser(user);
  }

  loadData(userId?: number) {
    this.isLoading.set(true);
    this.pokedexService.getRaids().subscribe({
      next: (raids) => {
        this.raidsList.set(raids);
        
        if (userId) {
          this.pokedexService.getAllEntries(userId).subscribe({
            next: (entries) => {
              const map = new Map<number, PokedexDTO>();
              for (const e of entries) {
                map.set(e.id, e);
              }
              this.pokemonEntries.set(map);
              this.isLoading.set(false);
            },
            error: (err) => {
              console.error('Errore nel caricamento del Pokédex per l\'allenatore:', err);
              this.isLoading.set(false);
            }
          });
        } else {
          this.pokemonEntries.set(new Map());
          this.isLoading.set(false);
        }
      },
      error: (err) => {
        console.error('Errore nel caricamento dei raid:', err);
        this.isLoading.set(false);
      }
    });
  }

  isShinyUnavailable(name: string | undefined): boolean {
    if (!name) return false;
    const baseName = name.split(' (')[0];
    return SHINY_UNRELEASED_SPECIES.includes(baseName);
  }

  userNeedsPokemon(r: Raid): boolean {
    const p = this.pokemonEntries().get(r.pokemonId);
    if (!p) return true;

    const showShiny = this.settingsService.isButtonVisible(p.name, p.id, 'shiny');
    const showPerfect = this.settingsService.isButtonVisible(p.name, p.id, 'perfect');
    const isShinyReleased = !this.isShinyUnavailable(p.name);

    const needsShiny = showShiny && isShinyReleased && !p.shiny;
    const needsPerfect = showPerfect && !p.perfect;
    
    if (r.isMega) {
      const showMega = this.settingsService.isButtonVisible(p.name, p.id, 'mega');
      const needsMega = showMega && !p.mega;
      return needsShiny || needsPerfect || needsMega;
    }

    if (r.isShadow) {
      const showShadow = this.settingsService.isButtonVisible(p.name, p.id, 'shadow');
      const showPurified = this.settingsService.isButtonVisible(p.name, p.id, 'purified');
      const needsShadow = showShadow && !p.shadow;
      const needsPurified = showPurified && !p.purified;
      return needsShiny || needsPerfect || needsShadow || needsPurified;
    }

    const showRegular = this.settingsService.isButtonVisible(p.name, p.id, 'regular');
    const needsRegular = showRegular && !p.regular;

    return needsShiny || needsPerfect || needsRegular;
  }

  isEvolvableInGo(fromName: string, toName: string): boolean {
    const fromBase = fromName.split(' (')[0];
    const toBase = toName.split(' (')[0];
    
    let current = toBase;
    let isDescendant = false;
    while (EVOLVES_FROM[current]) {
      if (EVOLVES_FROM[current] === fromBase) {
        isDescendant = true;
        break;
      }
      current = EVOLVES_FROM[current];
    }
    if (!isDescendant && toBase !== fromBase) {
      return false;
    }

    // Casi speciali in cui l'evoluzione non è possibile in GO
    if (fromBase === 'Scyther' && toBase === 'Kleavor') return false;
    if (fromBase === 'Stantler' && toBase === 'Wyrdeer') return false;
    if (fromBase === 'Rufflet' && toName.includes('(Hisuian)')) return false;
    if (fromBase === 'Petilil' && toName.includes('(Hisuian)')) return false;
    if (fromBase === 'Bergmite' && toName.includes('(Hisuian)')) return false;
    if (fromBase === 'Quilava' && toName.includes('(Hisuian)')) return false;
    if (fromBase === 'Dewott' && toName.includes('(Hisuian)')) return false;
    if (fromBase === 'Dartrix' && toName.includes('(Hisuian)')) return false;
    if (fromBase === 'Koffing' && toName.includes('(Galarian)')) return false;
    if (fromBase === 'Cubone' && toName.includes('(Alolan)')) return false;
    if (fromBase === 'Exeggcute' && toName.includes('(Alolan)')) return false;
    
    const fromSuffix = this.getFormSuffix(fromName);
    const toSuffix = this.getFormSuffix(toName);
    
    if (toSuffix && toSuffix !== fromSuffix) {
      return false;
    }
    
    return true;
  }

  getFormSuffix(name: string): string | null {
    const match = name.match(/\(([^)]+)\)/);
    return match ? match[1] : null;
  }

  getRewardPriority(r: Raid): 'high' | 'medium' | 'low' {
    const p = this.pokemonEntries().get(r.pokemonId);
    if (!p) return 'high';

    const needsR = this.userNeedsPokemon(r);
    
    const descendants: PokedexDTO[] = [];
    for (const entry of this.pokemonEntries().values()) {
      if (this.isEvolvableInGo(p.name, entry.name) && entry.id !== p.id) {
        descendants.push(entry);
      }
    }

    const finals = descendants.filter(d => {
      return !descendants.some(d2 => this.isEvolvableInGo(d.name, d2.name) && d2.id !== d.id);
    });

    const missingFinals = finals.filter(f => {
      const showShiny = this.settingsService.isButtonVisible(f.name, f.id, 'shiny');
      const showPerfect = this.settingsService.isButtonVisible(f.name, f.id, 'perfect');
      const isShinyReleased = !this.isShinyUnavailable(f.name);
      
      const needsFShiny = showShiny && isShinyReleased && !f.shiny;
      const needsFPerfect = showPerfect && !f.perfect;
      const needsFMega = r.isMega && this.settingsService.isButtonVisible(f.name, f.id, 'mega') && !f.mega;
      const needsFShadow = r.isShadow && this.settingsService.isButtonVisible(f.name, f.id, 'shadow') && !f.shadow;
      const needsFPurified = r.isShadow && this.settingsService.isButtonVisible(f.name, f.id, 'purified') && !f.purified;
      const needsFRegular = !r.isShadow && !r.isMega && this.settingsService.isButtonVisible(f.name, f.id, 'regular') && !f.regular;

      return needsFShiny || needsFPerfect || needsFMega || needsFShadow || needsFPurified || needsFRegular;
    });

    const numMissingFinals = missingFinals.length;

    if (!needsR && numMissingFinals === 0) {
      return 'low';
    }
    if (needsR && numMissingFinals === 0) {
      return 'medium';
    }
    return 'high';
  }

  private sortRaids(raids: Raid[]): Raid[] {
    const map = this.pokemonEntries();
    if (map.size === 0) return raids;

    return [...raids].sort((a, b) => {
      const prioA = this.getRewardPriority(a);
      const prioB = this.getRewardPriority(b);
      
      const weight = { 'high': 3, 'medium': 2, 'low': 1 };
      const diff = weight[prioB] - weight[prioA];
      if (diff !== 0) return diff;
      
      return a.pokemonId - b.pokemonId;
    });
  }

  legendaryRaids = computed(() => {
    return this.sortRaids(this.raidsList().filter(r => r.tier === 'legendary'));
  });

  megaRaids = computed(() => {
    return this.sortRaids(this.raidsList().filter(r => r.tier === 'mega'));
  });

  standardRaids = computed(() => {
    return this.sortRaids(this.raidsList().filter(r => r.tier === 'standard'));
  });
}
