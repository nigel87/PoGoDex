import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, Quest, QuestReward, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { SHINY_UNRELEASED_SPECIES } from '../../services/pokemon-config';
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
          // Se non c'è nessun utente attivo (es: caricamento diretto di /quest), proviamo a impostare il primo
          this.userService.getUsers().subscribe(users => {
            if (users && users.length > 0) {
              this.userService.setActiveUser(users[0]);
            } else {
              this.isLoading.set(false);
            }
          });
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

  loadData(userId: number) {
    this.isLoading.set(true);
    // Carica contemporaneamente le quest e le entries dell'utente
    this.pokedexService.getQuests().subscribe({
      next: (quests) => {
        this.questsList.set(quests);
        
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

  // Classificazione Quests ad Alta Priorità: l'utente ha bisogno di TUTTI i possibili pokemon di ricompensa della quest
  highPriorityQuests = computed(() => {
    const list = this.questsList();
    return list.filter(q => {
      // Se tutte le ricompense servono all'utente
      return q.rewards.every(r => this.userNeedsPokemon(r.pokemonId));
    });
  });

  // Classificazione Quests a Media Priorità: l'utente ha bisogno di ALMENO UNO ma NON di tutti i possibili pokemon di ricompensa
  mediumPriorityQuests = computed(() => {
    const list = this.questsList();
    return list.filter(q => {
      const needsSome = q.rewards.some(r => this.userNeedsPokemon(r.pokemonId));
      const needsAll = q.rewards.every(r => this.userNeedsPokemon(r.pokemonId));
      return needsSome && !needsAll;
    });
  });

  // Classificazione Quests a Bassa Priorità/Completate: l'utente ha già registrato sia lo Shiny che il 100% per tutte le possibili ricompense
  lowPriorityQuests = computed(() => {
    const list = this.questsList();
    return list.filter(q => {
      // Se per tutte le ricompense, l'utente le possiede già completate (non ne ha bisogno)
      return q.rewards.every(r => !this.userNeedsPokemon(r.pokemonId));
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
