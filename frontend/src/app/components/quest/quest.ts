import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, Quest, QuestReward, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { SHINY_UNRELEASED_SPECIES, EVOLVES_FROM } from '../../services/pokemon-config';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-quest',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './quest.html',
  styleUrl: './quest.css'
})
export class QuestComponent implements OnInit, OnDestroy {
  version = APP_VERSION;
  questsList = signal<Quest[]>([]);
  pokemonEntries = signal<Map<number, PokedexDTO>>(new Map());
  usersList = signal<User[]>([]);
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);
  showCompleted = signal<boolean>(true); // Di default mostra anche le completate

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

    // Sottoscrizione reattiva all'utente attivo.
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
    // Carica contemporaneamente le quest e le entries dell'utente
    this.pokedexService.getQuests().subscribe({
      next: (quests) => {
        this.questsList.set(quests);
        
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
        console.error('Errore nel caricamento delle quest:', err);
        this.isLoading.set(false);
      }
    });
  }

  isShinyUnavailable(name: string | undefined): boolean {
    if (!name) return false;
    const baseName = name.split(' (')[0];
    return SHINY_UNRELEASED_SPECIES.includes(baseName);
  }

  // Verifica se il giocatore loggato ha bisogno di una specifica ricompensa (Shiny mancante o 100% mancante)
  userNeedsPokemon(pokemonId: number): boolean {
    const p = this.pokemonEntries().get(pokemonId);
    if (!p) return true; // Se non c'è spunta, manca sicuramente tutto

    const showShiny = this.settingsService.isButtonVisible(p.name, p.id, 'shiny');
    const showPerfect = this.settingsService.isButtonVisible(p.name, p.id, 'perfect');

    const isShinyReleased = !this.isShinyUnavailable(p.name);

    const needsPerfect = showPerfect && !p.perfect;
    const needsShiny = showShiny && isShinyReleased && !p.shiny;

    return needsPerfect || needsShiny;
  }

  // Determina se una specie può evolversi in un'altra in Pokémon GO
  isEvolvableInGo(fromName: string, toName: string): boolean {
    const fromBase = fromName.split(' (')[0];
    const toBase = toName.split(' (')[0];
    
    // Verifica se toBase evolve da fromBase nella catena evolutiva di base
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
    
    // Forme regionali evolutive in GO (es. Pikachu non evolve in Raichu Alolan)
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

  // Determina la priorità di una singola ricompensa basandosi su buchi evolutivi o necessità di evoluzione
  getRewardPriority(pokemonId: number): 'high' | 'medium' | 'low' {
    const p = this.pokemonEntries().get(pokemonId);
    if (!p) return 'high';

    const needsP = this.userNeedsPokemon(pokemonId);
    
    // Trova tutti i discendenti evolutivi di p in GO
    const descendants: PokedexDTO[] = [];
    for (const entry of this.pokemonEntries().values()) {
      if (this.isEvolvableInGo(p.name, entry.name) && entry.id !== p.id) {
        descendants.push(entry);
      }
    }

    // Filtra i discendenti per ottenere solo le evoluzioni finali
    const finals = descendants.filter(d => {
      return !descendants.some(d2 => this.isEvolvableInGo(d.name, d2.name) && d2.id !== d.id);
    });

    const missingFinals = finals.filter(f => this.userNeedsPokemon(f.id));
    const numMissingFinals = missingFinals.length;

    if (!needsP && numMissingFinals === 0) {
      return 'low';
    }
    if (needsP && numMissingFinals === 0) {
      // Caso "buco": l'utente ha già il finale ma gli manca la forma base/intermedia
      return 'medium';
    }
    // Negli altri casi (needsP && missingFinals > 0, oppure !needsP && missingFinals > 0) è Alta Priorità
    return 'high';
  }

  // Classificazione Quests ad Alta Priorità: tutte le ricompense della quest hanno priorità 'high'
  highPriorityQuests = computed(() => {
    const list = this.questsList();
    return list.filter(q => {
      return q.rewards.every(r => this.getRewardPriority(r.pokemonId) === 'high');
    });
  });

  // Classificazione Quests a Media Priorità: almeno una ricompensa serve all'utente, ma non tutte hanno priorità 'high'
  mediumPriorityQuests = computed(() => {
    const list = this.questsList();
    return list.filter(q => {
      const hasSomeNeed = q.rewards.some(r => this.getRewardPriority(r.pokemonId) !== 'low');
      const allHigh = q.rewards.every(r => this.getRewardPriority(r.pokemonId) === 'high');
      return hasSomeNeed && !allHigh;
    });
  });

  // Classificazione Quests a Bassa Priorità/Completate: tutte le ricompense hanno priorità 'low'
  lowPriorityQuests = computed(() => {
    const list = this.questsList();
    return list.filter(q => {
      return q.rewards.every(r => this.getRewardPriority(r.pokemonId) === 'low');
    });
  });

  // Toggles per mostrare o meno le quest completate
  toggleCompleted() {
    this.showCompleted.set(!this.showCompleted());
  }

  // Gestione del riordino delle quest
  moveUp(quest: Quest, section: 'high' | 'medium' | 'low') {
    let list: Quest[] = [];
    if (section === 'high') list = [...this.highPriorityQuests()];
    else if (section === 'medium') list = [...this.mediumPriorityQuests()];
    else list = [...this.lowPriorityQuests()];

    const index = list.findIndex(q => q.id === quest.id);
    if (index > 0) {
      // Scambia con l'elemento precedente all'interno della stessa sezione visibile
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
      
      this.saveNewOrder(list, section);
    }
  }

  moveDown(quest: Quest, section: 'high' | 'medium' | 'low') {
    let list: Quest[] = [];
    if (section === 'high') list = [...this.highPriorityQuests()];
    else if (section === 'medium') list = [...this.mediumPriorityQuests()];
    else list = [...this.lowPriorityQuests()];

    const index = list.findIndex(q => q.id === quest.id);
    if (index !== -1 && index < list.length - 1) {
      // Scambia con l'elemento successivo all'interno della stessa sezione visibile
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;

      this.saveNewOrder(list, section);
    }
  }

  private saveNewOrder(updatedSectionQuests: Quest[], section: 'high' | 'medium' | 'low') {
    // Per salvare l'ordine coerentemente, ricombiniamo le tre liste rispettando l'ordinamento
    // L'ordine finale del database sarà: alta priorità -> media priorità -> bassa priorità.
    let fullList: Quest[] = [];
    
    if (section === 'high') {
      fullList = [...updatedSectionQuests, ...this.mediumPriorityQuests(), ...this.lowPriorityQuests()];
    } else if (section === 'medium') {
      fullList = [...this.highPriorityQuests(), ...updatedSectionQuests, ...this.lowPriorityQuests()];
    } else {
      fullList = [...this.highPriorityQuests(), ...this.mediumPriorityQuests(), ...updatedSectionQuests];
    }

    // Estrae gli ID ordinati da persistere
    const orderedIds = fullList.map(q => q.id);
    
    // Ottimisticamente aggiorniamo lo stato locale
    this.questsList.set(fullList);

    this.pokedexService.reorderQuests(orderedIds).subscribe({
      error: (err) => {
        console.error('Errore durante il salvataggio del riordino delle quest:', err);
        // In caso di errore ricarica l'ordine originale
        const user = this.activeUser();
        if (user) this.loadData(user.id);
      }
    });
  }
}
