import { Component, OnInit, AfterViewInit, OnDestroy, signal, computed, effect, viewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { PokedexService, PokedexDTO } from '../../services/pokedex.service';
import { UserService } from '../../services/user.service';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, RouterModule, TranslatePipe],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminComponent implements OnInit, AfterViewInit, OnDestroy {
  isLocal = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);

  // Sistema di notifiche Toast
  toasts = signal<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  private toastIdCounter = 0;

  // Stato Console di Sincronizzazione Live
  showSyncConsole = signal<boolean>(false);
  syncConsoleTitle = signal<string>('');
  syncConsoleLogs = signal<string[]>([]);
  syncConsoleStatus = signal<'running' | 'success' | 'error'>('running');

  // Filtro Rapido
  activeFilter = signal<'all' | 'unreleased' | 'shiny-unreleased' | 'shadow' | 'mega' | 'gigamax'>('all');

  // Gestione dei Tab e della lista utenti
  activeTab = signal<'pokemon' | 'users'>('pokemon');
  usersList = signal<any[]>([]);
  isLoadingUsers = signal<boolean>(false);

  scrollAnchor = viewChild<ElementRef>('scrollAnchor');
  searchInput = viewChild<ElementRef>('searchInput');
  limit = signal<number>(50);
  private observer: IntersectionObserver | null = null;

  visibleList = computed(() => {
    return this.filteredList().slice(0, this.limit());
  });

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

  // Autorizzazione: locale oppure admin loggato
  isAuthorized = computed(() => {
    const user = this.userService.getCurrentUser();
    return this.isLocal() || (user ? user.isAdmin === 1 : false);
  });

  // Liste di capacità recuperate dal backend
  shadowSet = new Set<string>();
  megaSet = new Set<string>();
  gigamaxSet = new Set<string>();
  unreleasedSet = new Set<string>();
  shinyUnreleasedSet = new Set<string>();
  isSyncing = signal<boolean>(false);

  // Elenco completo di tutti i Pokémon del catalogo
  pokemonList = signal<PokedexDTO[]>([]);
  searchQuery = signal<string>('');

  private adminApiUrl = window.location.port === '4205' || window.location.port === '4200'
    ? `http://${window.location.hostname}:8085/api/admin/config`
    : '/api/admin/config';

  constructor(
    private http: HttpClient,
    private pokedexService: PokedexService,
    private userService: UserService,
    public i18n: I18nService
  ) {
    // Verifica rigorosa dell'host locale del browser
    const hostname = window.location.hostname.toLowerCase();
    this.isLocal.set(hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]');

    // Resetta automaticamente il limite a 50 quando cambia la ricerca, il tab o il filtro rapido
    effect(() => {
      this.searchQuery();
      this.activeTab();
      this.activeFilter();
      setTimeout(() => {
        this.limit.set(50);
      });
    });
  }

  ngOnInit() {
    if (!this.isAuthorized()) {
      this.isLoading.set(false);
      return;
    }

    this.loadCatalogAndConfig();
    this.loadUsersList();
  }

  loadCatalogAndConfig() {
    console.log('[Admin Debug] loadCatalogAndConfig avviato');
    this.isLoading.set(true);

    const activeUserId = this.userService.getCurrentUser()?.id || 1;
    console.log('[Admin Debug] Rilevato userId attivo:', activeUserId);
    console.log('[Admin Debug] Avvio chiamata parallela forkJoin a:', this.adminApiUrl);

    forkJoin({
      pokemons: this.pokedexService.getAllEntries(activeUserId),
      config: this.http.get<any>(this.adminApiUrl)
    }).subscribe({
      next: ({ pokemons, config }) => {
        console.log('[Admin Debug] forkJoin NEXT ricevuto con successo!');
        console.log('[Admin Debug] Pokémon scaricati:', pokemons?.length);
        console.log('[Admin Debug] Config scaricata:', config);
        
        this.pokemonList.set(pokemons);
        this.shadowSet = new Set(config.shadowCapable || []);
        this.megaSet = new Set(config.megaCapable || []);
        this.gigamaxSet = new Set(config.gigamaxCapable || []);
        this.unreleasedSet = new Set(config.unreleasedCapable || []);
        this.shinyUnreleasedSet = new Set(config.shinyUnreleasedCapable || []);
        this.isLoading.set(false);
        
        console.log('[Admin Debug] isLoading impostato a false. shadowCapable size:', this.shadowSet.size);
      },
      error: (err) => {
        console.error('[Admin Debug] forkJoin ERROR rilevato:', err);
        this.showToast('Impossibile caricare il catalogo dei Pokémon o le configurazioni. Assicurati che il backend Node sia in esecuzione.', 'error');
        this.isLoading.set(false);
      }
    });
  }

  // Lista filtrata in tempo reale in base alla ricerca
  filteredList = computed(() => {
    let list = this.pokemonList();
    
    // Filtro rapido per tipo abilità/stato
    const filter = this.activeFilter();
    if (filter === 'unreleased') {
      list = list.filter(p => !this.isReleased(p.name));
    } else if (filter === 'shiny-unreleased') {
      list = list.filter(p => !this.isShinyReleased(p.name));
    } else if (filter === 'shadow') {
      list = list.filter(p => this.isShadow(p.name));
    } else if (filter === 'mega') {
      list = list.filter(p => this.isMega(p.name));
    } else if (filter === 'gigamax') {
      list = list.filter(p => this.isGigamax(p.name));
    }

    // Ricerca testuale
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(p => p.name.toLowerCase().includes(query) || p.id.toString() === query);
  });

  // Getter per verificare lo stato delle checkbox
  isShadow(name: string): boolean {
    const baseName = name.split(' (')[0];
    return this.shadowSet.has(baseName);
  }

  isMega(name: string): boolean {
    const baseName = name.split(' (')[0];
    return this.megaSet.has(baseName);
  }

  isGigamax(name: string): boolean {
    const baseName = name.split(' (')[0];
    return this.gigamaxSet.has(baseName);
  }

  isReleased(name: string): boolean {
    if (this.unreleasedSet.has(name)) return false;
    const baseName = name.split(' (')[0];
    return !this.unreleasedSet.has(baseName);
  }

  isShinyReleased(name: string): boolean {
    if (this.shinyUnreleasedSet.has(name)) return false;
    const baseName = name.split(' (')[0];
    return !this.shinyUnreleasedSet.has(baseName);
  }

  // Toggle delle checkbox
  toggleCapability(name: string, type: 'shadow' | 'mega' | 'gigamax' | 'release' | 'shiny') {
    const baseName = name.split(' (')[0];
    let set: Set<string>;

    if (type === 'shadow') {
      set = this.shadowSet;
      if (set.has(baseName)) set.delete(baseName);
      else set.add(baseName);
    } else if (type === 'mega') {
      set = this.megaSet;
      if (set.has(baseName)) set.delete(baseName);
      else set.add(baseName);
    } else if (type === 'gigamax') {
      set = this.gigamaxSet;
      if (set.has(baseName)) set.delete(baseName);
      else set.add(baseName);
    } else if (type === 'release') {
      if (this.unreleasedSet.has(name)) {
        this.unreleasedSet.delete(name);
      } else {
        this.unreleasedSet.add(name);
      }
    } else if (type === 'shiny') {
      if (this.shinyUnreleasedSet.has(name)) {
        this.shinyUnreleasedSet.delete(name);
      } else {
        this.shinyUnreleasedSet.add(name);
      }
    }
  }

  // Toast notifications helpers
  showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    const id = ++this.toastIdCounter;
    this.toasts.update(list => [...list, { id, message, type }]);
    setTimeout(() => {
      this.removeToast(id);
    }, 3500);
  }

  removeToast(id: number) {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  // Salva le configurazioni riscrivendo la tabella nel database SQLite
  saveConfig() {
    if (this.isSaving()) return;

    this.isSaving.set(true);

    const payload = {
      shadowCapable: Array.from(this.shadowSet).sort(),
      megaCapable: Array.from(this.megaSet).sort(),
      gigamaxCapable: Array.from(this.gigamaxSet).sort(),
      unreleasedCapable: Array.from(this.unreleasedSet).sort(),
      shinyUnreleasedCapable: Array.from(this.shinyUnreleasedSet).sort()
    };

    this.http.post<any>(this.adminApiUrl, payload).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.showToast(this.i18n.currentLang() === 'it' ? 'Configurazione salvata con successo!' : 'Configuration saved successfully!');
      },
      error: (err) => {
        console.error('Errore nel salvataggio della configurazione:', err);
        this.showToast(err.error?.error || (this.i18n.currentLang() === 'it' ? 'Errore di connessione o permessi.' : 'Connection error or permissions.'), 'error');
        this.isSaving.set(false);
      }
    });
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

  getPokemonAdminName(p: any): string {
    let displayName = p.name;
    const isIt = this.i18n.currentLang() === 'it';
    if (isIt && displayName.startsWith('Vivillon')) {
      const match = displayName.match(/\(([^)]+)\)/);
      if (match) {
        const formName = match[1];
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
        const translatedForm = itMap[formName];
        if (translatedForm) {
          return `Vivillon (Motivo ${translatedForm})`;
        }
      } else if (displayName === 'Vivillon') {
        return 'Vivillon (Motivo Giardinfiore)';
      }
    }
    return displayName;
  }

  runSyncShiniesWithConsole() {
    this.showSyncConsole.set(true);
    this.syncConsoleTitle.set(this.i18n.currentLang() === 'it' ? 'Sincronizzazione Pokémon Shiny' : 'Shiny Pokémon Synchronization');
    this.syncConsoleLogs.set([]);
    this.syncConsoleStatus.set('running');

    const addLog = (msg: string, delay: number) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          this.syncConsoleLogs.update(logs => [...logs, msg]);
          setTimeout(() => {
            const el = document.querySelector('.terminal-body');
            if (el) el.scrollTop = el.scrollHeight;
          });
          resolve();
        }, delay);
      });
    };

    (async () => {
      await addLog('[INFO] Avvio worker di sincronizzazione...', 100);
      await addLog('[INFO] Connessione a pogoapi.net in corso...', 400);
      await addLog('[INFO] Download del database shiny_pokemon.json...', 600);

      const syncApiUrl = window.location.port === '4205' || window.location.port === '4200'
        ? `http://${window.location.hostname}:8085/api/admin/sync-shinies`
        : '/api/admin/sync-shinies';

      this.http.post<any>(syncApiUrl, {}).subscribe({
        next: async (res) => {
          const count = res.shinyUnreleasedCapable?.length || 0;
          await addLog(`[SUCCESS] Dati shiny scaricati correttamente!`, 200);
          await addLog(`[INFO] Analisi del Pokédex e confronto delle specie...`, 400);
          await addLog(`[INFO] Trovate ${count} specie con shiny non ancora rilasciato.`, 400);
          await addLog(`[INFO] Scrittura delle chiavi di configurazione nel database...`, 500);
          await addLog(`[SUCCESS] Database aggiornato ed allineato con successo!`, 500);
          
          this.syncConsoleStatus.set('success');
          this.showToast(this.i18n.currentLang() === 'it' ? 'Sincronizzazione shiny completata!' : 'Shiny sync completed!');
          this.loadCatalogAndConfig();
        },
        error: async (err) => {
          await addLog(`[ERROR] Connessione a pogoapi.net fallita o errore del server.`, 200);
          await addLog(`[ERROR] Dettaglio: ${err.error?.error || err.message}`, 400);
          
          this.syncConsoleStatus.set('error');
          this.showToast(this.i18n.currentLang() === 'it' ? 'Errore durante la sincronizzazione shiny.' : 'Error during shiny sync.', 'error');
        }
      });
    })();
  }

  runSyncRaidsWithConsole() {
    this.showSyncConsole.set(true);
    this.syncConsoleTitle.set(this.i18n.currentLang() === 'it' ? 'Sincronizzazione Raid Boss' : 'Raid Bosses Synchronization');
    this.syncConsoleLogs.set([]);
    this.syncConsoleStatus.set('running');

    const addLog = (msg: string, delay: number) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          this.syncConsoleLogs.update(logs => [...logs, msg]);
          setTimeout(() => {
            const el = document.querySelector('.terminal-body');
            if (el) el.scrollTop = el.scrollHeight;
          });
          resolve();
        }, delay);
      });
    };

    (async () => {
      await addLog('[INFO] Inizializzazione sincronizzazione dei Raid...', 100);
      await addLog('[INFO] Contatto pokemon-go-api.github.io/pokemon-go-api...', 400);
      await addLog('[INFO] Download del file raidboss.json in corso...', 500);

      const syncRaidsUrl = window.location.port === '4205' || window.location.port === '4200'
        ? `http://${window.location.hostname}:8085/api/admin/sync-raids`
        : '/api/admin/sync-raids';

      this.http.post<any>(syncRaidsUrl, {}).subscribe({
        next: async (res) => {
          await addLog(`[SUCCESS] File raidboss.json scaricato ed elaborato con successo.`, 300);
          await addLog(`[INFO] Svuotamento e aggiornamento della tabella dei raid in corso...`, 500);
          await addLog(`[INFO] Calcolo dei punti lotta (normali e potenziati dal meteo) per ciascun boss...`, 500);
          await addLog(`[SUCCESS] Database SQLite aggiornato ed allineato con successo!`, 500);
          
          this.syncConsoleStatus.set('success');
          this.showToast(this.i18n.currentLang() === 'it' ? 'Raid Boss aggiornati con successo!' : 'Raid Bosses updated successfully!');
        },
        error: async (err) => {
          await addLog(`[ERROR] Connessione all'API dei raid fallita.`, 200);
          await addLog(`[ERROR] Dettaglio: ${err.error?.error || err.message}`, 400);
          
          this.syncConsoleStatus.set('error');
          this.showToast(this.i18n.currentLang() === 'it' ? 'Errore durante l\'aggiornamento dei Raid.' : 'Error during raid sync.', 'error');
        }
      });
    })();
  }

  runSyncQuestsWithConsole() {
    this.showSyncConsole.set(true);
    this.syncConsoleTitle.set(this.i18n.currentLang() === 'it' ? 'Sincronizzazione Ricerche sul Campo' : 'Field Research Synchronization');
    this.syncConsoleLogs.set([]);
    this.syncConsoleStatus.set('running');

    const addLog = (msg: string, delay: number) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          this.syncConsoleLogs.update(logs => [...logs, msg]);
          setTimeout(() => {
            const el = document.querySelector('.terminal-body');
            if (el) el.scrollTop = el.scrollHeight;
          });
          resolve();
        }, delay);
      });
    };

    (async () => {
      await addLog('[INFO] Inizializzazione sincronizzazione Ricerche...', 100);
      await addLog('[INFO] Contatto leekduck.com/research/ in corso...', 400);
      await addLog('[INFO] Download dell\'HTML e avvio del parsing...', 500);

      const syncQuestsUrl = window.location.port === '4205' || window.location.port === '4200'
        ? `http://${window.location.hostname}:8085/api/admin/sync-quests`
        : '/api/admin/sync-quests';

      this.http.post<any>(syncQuestsUrl, {}).subscribe({
        next: async (res) => {
          await addLog(`[SUCCESS] HTML scaricato ed elaborato con successo.`, 300);
          await addLog(`[INFO] Analisi delle categorie di ricerca sul campo...`, 400);
          await addLog(`[INFO] Svuotamento e aggiornamento della tabella quests nel database...`, 500);
          await addLog(`[SUCCESS] Database SQLite allineato con le ricerche attive di Leek Duck!`, 500);
          
          this.syncConsoleStatus.set('success');
          this.showToast(this.i18n.currentLang() === 'it' ? 'Ricerche aggiornate con successo!' : 'Field research updated successfully!');
        },
        error: async (err) => {
          await addLog(`[ERROR] Connessione a Leek Duck o parsing fallito.`, 200);
          await addLog(`[ERROR] Dettaglio: ${err.error?.error || err.message}`, 400);
          
          this.syncConsoleStatus.set('error');
          this.showToast(this.i18n.currentLang() === 'it' ? 'Errore durante l\'aggiornamento delle ricerche.' : 'Error during research sync.', 'error');
        }
      });
    })();
  }

  loadUsersList() {
    this.isLoadingUsers.set(true);
    const usersUrl = window.location.port === '4205' || window.location.port === '4200'
      ? `http://${window.location.hostname}:8085/api/admin/users`
      : '/api/admin/users';
      
    this.http.get<any[]>(usersUrl).subscribe({
      next: (data) => {
        this.usersList.set(data);
        this.isLoadingUsers.set(false);
      },
      error: (err) => {
        console.error('[Admin] Errore caricamento utenti:', err);
        this.isLoadingUsers.set(false);
      }
    });
  }

  toggleAdminRole(user: any) {
    const newIsAdmin = user.isAdmin === 1 ? 0 : 1;
    const roleUrl = window.location.port === '4205' || window.location.port === '4200'
      ? `http://${window.location.hostname}:8085/api/admin/users/${user.id}/admin-role`
      : `/api/admin/users/${user.id}/admin-role`;
      
    this.http.put<any>(roleUrl, { isAdmin: newIsAdmin }).subscribe({
      next: (res) => {
        this.usersList.update(list => list.map(u => u.id === user.id ? { ...u, isAdmin: newIsAdmin } : u));
        this.showToast(this.i18n.currentLang() === 'it' ? 'Ruolo amministratore aggiornato con successo!' : 'Administrator role updated successfully!');
        
        // Se stiamo modificando noi stessi, aggiorna l'utente attivo nel servizio
        const current = this.userService.getCurrentUser();
        if (current && current.id === user.id) {
          current.isAdmin = newIsAdmin;
          this.userService.setActiveUser(current);
        }
      },
      error: (err) => {
        console.error('[Admin] Errore aggiornamento ruolo admin:', err);
        this.showToast(err.error?.error || 'Impossibile aggiornare il ruolo dell\'utente.', 'error');
      }
    });
  }

  isOwnUser(user: any): boolean {
    const current = this.userService.getCurrentUser();
    return current ? current.id === user.id : false;
  }

  setDefaultAvatar(event: any) {
    event.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  }

  ngAfterViewInit() {
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  setupIntersectionObserver() {
    if (typeof window === 'undefined') return;

    this.observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        if (this.limit() < this.filteredList().length) {
          console.log('[Admin Lazy Rendering] Caricamento di ulteriori 50 Pokémon...');
          this.limit.set(this.limit() + 50);
        }
      }
    }, {
      root: null,
      rootMargin: '200px',
      threshold: 0.1
    });

    const anchor = this.scrollAnchor();
    if (anchor) {
      this.observer.observe(anchor.nativeElement);
    }
  }
}
