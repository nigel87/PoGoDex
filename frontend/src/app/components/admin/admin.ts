import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { PokedexService, PokedexDTO } from '../../services/pokedex.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminComponent implements OnInit {
  isLocal = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  saveSuccess = signal<boolean>(false);
  saveError = signal<string>('');

  // Liste di capacità recuperate dal backend
  shadowSet = new Set<string>();
  megaSet = new Set<string>();
  gigamaxSet = new Set<string>();
  unreleasedSet = new Set<string>();

  // Elenco completo di tutti i Pokémon del catalogo
  pokemonList = signal<PokedexDTO[]>([]);
  searchQuery = signal<string>('');

  private adminApiUrl = window.location.port === '4205' || window.location.port === '4200'
    ? `http://${window.location.hostname}:8085/api/admin/config`
    : '/api/admin/config';

  constructor(
    private http: HttpClient,
    private pokedexService: PokedexService,
    private userService: UserService
  ) {
    // Verifica rigorosa dell'host locale del browser
    const hostname = window.location.hostname.toLowerCase();
    this.isLocal.set(hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]');
  }

  ngOnInit() {
    if (!this.isLocal()) {
      this.isLoading.set(false);
      return;
    }

    this.loadCatalogAndConfig();
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
    const baseName = name.split(' (')[0];
    return !this.unreleasedSet.has(baseName);
  }

  // Toggle delle checkbox
  toggleCapability(name: string, type: 'shadow' | 'mega' | 'gigamax' | 'release') {
    const baseName = name.split(' (')[0];
    let set: Set<string>;

    if (type === 'shadow') set = this.shadowSet;
    else if (type === 'mega') set = this.megaSet;
    else if (type === 'gigamax') set = this.gigamaxSet;
    else {
      // Per 'release', la checkbox rappresenta se è rilasciato.
      // Se era rilasciato (NON nel set dei non rilasciati), lo togliamo dai rilasciati -> lo aggiungiamo a unreleasedSet.
      // Se non era rilasciato (nel set dei non rilasciati), lo togliamo da unreleasedSet.
      if (this.unreleasedSet.has(baseName)) {
        this.unreleasedSet.delete(baseName);
      } else {
        this.unreleasedSet.add(baseName);
      }
      return;
    }

    if (set.has(baseName)) {
      set.delete(baseName);
    } else {
      set.add(baseName);
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
      unreleasedCapable: Array.from(this.unreleasedSet).sort()
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
}
