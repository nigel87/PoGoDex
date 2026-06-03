import { Component, OnInit, AfterViewInit, OnDestroy, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
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
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminComponent implements OnInit, AfterViewInit, OnDestroy {
  isLocal = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  saveSuccess = signal<boolean>(false);
  saveError = signal<string>('');

  // Gestione dei Tab e della lista utenti
  activeTab = signal<'pokemon' | 'users'>('pokemon');
  usersList = signal<any[]>([]);
  isLoadingUsers = signal<boolean>(false);

  @ViewChild('scrollAnchor') scrollAnchor!: ElementRef;
  limit = signal<number>(50);
  private observer: IntersectionObserver | null = null;

  visibleList = computed(() => {
    return this.filteredList().slice(0, this.limit());
  });

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

    // Resetta automaticamente il limite a 50 quando cambia la ricerca o il tab
    effect(() => {
      this.searchQuery();
      this.activeTab();
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
    this.saveSuccess.set(false);
    this.saveError.set('');

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
        this.saveError.set('Impossibile caricare il catalogo dei Pokémon o le configurazioni. Assicurati che il backend Node (porta 8085) sia avviato e in esecuzione.');
        this.isLoading.set(false);
      }
    });
  }

  // Lista filtrata in tempo reale in base alla ricerca
  filteredList = computed(() => {
    const list = this.pokemonList();
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

  // Salva le configurazioni riscrvendo il file locale sul Mac
  saveConfig() {
    if (this.isSaving()) return;

    this.isSaving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set('');

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
        this.saveSuccess.set(true);
        // Scrolla in alto per mostrare il banner di successo
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err) => {
        console.error('Errore nel salvataggio della configurazione:', err);
        this.saveError.set(err.error?.error || 'Errore di connessione o permessi insufficienti sul server locale.');
        this.isSaving.set(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

  syncShinies() {
    if (this.isSyncing()) return;

    this.isSyncing.set(true);
    this.saveSuccess.set(false);
    this.saveError.set('');

    const syncApiUrl = window.location.port === '4205' || window.location.port === '4200'
      ? `http://${window.location.hostname}:8085/api/admin/sync-shinies`
      : '/api/admin/sync-shinies';

    this.http.post<any>(syncApiUrl, {}).subscribe({
      next: (res) => {
        this.isSyncing.set(false);
        this.saveSuccess.set(true);
        this.loadCatalogAndConfig();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err) => {
        console.error('Errore nella sincronizzazione degli shiny:', err);
        this.saveError.set(err.error?.error || 'Errore durante la sincronizzazione automatica degli shiny.');
        this.isSyncing.set(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
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
        
        // Se stiamo modificando noi stessi, aggiorna l'utente attivo nel servizio
        const current = this.userService.getCurrentUser();
        if (current && current.id === user.id) {
          current.isAdmin = newIsAdmin;
          this.userService.setActiveUser(current);
        }
      },
      error: (err) => {
        console.error('[Admin] Errore aggiornamento ruolo admin:', err);
        this.saveError.set(err.error?.error || 'Impossibile aggiornare il ruolo dell\'utente.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

    if (this.scrollAnchor) {
      this.observer.observe(this.scrollAnchor.nativeElement);
    }
  }
}
