import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { 
  SHADOW_CAPABLE_SPECIES, 
  MEGA_CAPABLE_SPECIES, 
  GIGAMAX_CAPABLE_SPECIES, 
  UNRELEASED_SPECIES, 
  SHINY_UNRELEASED_SPECIES 
} from './pokemon-config';

export interface PokedexDTO {
  id: number;
  name: string;
  type1: string;
  type2: string | null;
  generation: number;
  spriteUrl: string;
  regular: boolean;
  shadow: boolean;
  purified: boolean;
  perfect: boolean;
  lucky: boolean;
  xxs: boolean;
  xxl: boolean;
  shiny: boolean; // Pokémon Cromatico (Shiny)
  mega: number;  // Pokémon Mega (0 = none, 1 = Mega X/standard, 2 = Mega Y, 3 = both)
  gigamax: boolean; // Pokémon Gigamax
  megaVarietyId?: number | null;
  megaVarietyId2?: number | null;
  gigamaxVarietyId?: number | null;
  parentId?: number | null;
}

export interface PokedexStats {
  total: number;
  regularCaught: number;
  shadowCaught: number;
  purifiedCaught: number;
  perfectCaught: number;
  luckyCaught: number;
  xxsCaught: number;
  xxlCaught: number;
  shinyCaught: number; // Statistiche cromatici
  megaCaught: number;
  gigamaxCaught: number;
}

@Injectable({
  providedIn: 'root'
})
export class PokedexService {
  private apiUrl = window.location.port === '4205' || window.location.port === '4200'
    ? `http://${window.location.hostname}:8085/api/pokedex`
    : '/api/pokedex';

  // Buffer queue and debounce timers for Pokedex updates
  private updateQueue = new Map<number, PokedexDTO>();
  private debounceTimer: any = null;
  private activeUserId: number | null = null;

  constructor(private http: HttpClient) {
    // Flush any pending queue items immediately if the browser tab is closed/refreshed
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.updateQueue.size > 0 && this.activeUserId !== null) {
          console.log('[PokedexService] Chiusura della pagina rilevata. Salvataggio immediato delle spunte pendenti...');
          this.flushQueue(this.activeUserId);
        }
      });
    }
  }

  /**
   * Invia tutte le modifiche accumulate in blocco al server in una singola transazione SQLite e svuota la coda.
   */
  flushQueue(userId: number) {
    if (this.updateQueue.size === 0) return;

    const updates = Array.from(this.updateQueue.values());
    this.updateQueue.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const batchUrl = this.apiUrl.endsWith('/pokedex')
      ? this.apiUrl.replace('/pokedex', '/pokedex/batch')
      : `${this.apiUrl}/batch`;

    console.log(`[PokedexService] Invio batch di ${updates.length} modifiche al database...`);
    this.http.post<any>(batchUrl, { userId, updates }).subscribe({
      next: (res) => {
        console.log(`[PokedexService] Batch di ${updates.length} modifiche salvato con successo sul database!`);
      },
      error: (err) => {
        console.error('[PokedexService] Errore nel salvataggio in batch delle modifiche:', err);
      }
    });
  }

  /**
   * Recupera la lista di tutti i Pokémon con il relativo stato di cattura di un determinato utente.
   */
  getAllEntries(userId: number): Observable<PokedexDTO[]> {
    return this.http.get<PokedexDTO[]>(this.apiUrl, {
      params: { userId: userId.toString() }
    });
  }

  /**
   * Accoda la modifica per il Pokémon e l'utente correnti, attivando il debounce a 1.5s.
   * Ritorna immediatamente un Observable ottimistico con il DTO modificato.
   */
  updateEntry(userId: number, pokemonId: number, dto: PokedexDTO): Observable<PokedexDTO> {
    this.activeUserId = userId;

    // Accoda o sovrascrive la modifica con il DTO più recente
    this.updateQueue.set(pokemonId, dto);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushQueue(userId);
    }, 1500);

    // Ritorna un observable ottimistico istantaneo per aggiornare la UI a latenza zero
    return of(dto);
  }

  /**
   * Recupera le statistiche di cattura di un determinato utente.
   */
  getStats(userId: number): Observable<PokedexStats> {
    return this.http.get<PokedexStats>(`${this.apiUrl}/stats`, {
      params: { userId: userId.toString() }
    });
  }

  /**
   * Ottiene la stringa di ricerca Pokémon GO per i mancanti di un determinato utente.
   */
  getSearchString(userId: number, category: string, mode: string): Observable<{ searchString: string }> {
    return this.http.get<{ searchString: string }>(`${this.apiUrl}/search-string`, {
      params: { userId: userId.toString(), category, mode }
    });
  }

  /**
   * Aggiorna lo stato di cattura di più Pokémon contemporaneamente (Bulk Import).
   */
  bulkUpdateEntries(userId: number, pokemonIds: number[], category: string, value: boolean): Observable<{ success: boolean, count: number }> {
    return this.http.post<{ success: boolean, count: number }>(`${this.apiUrl}/bulk`, {
      userId,
      pokemonIds,
      category,
      value
    });
  }

  /**
   * Carica dinamicamente la configurazione dal backend e aggiorna in-place gli array statici.
   */
  loadConfig(): Promise<void> {
    const configUrl = window.location.port === '4205' || window.location.port === '4200'
      ? `http://${window.location.hostname}:8085/api/pokemon-config`
      : '/api/pokemon-config';

    return new Promise((resolve) => {
      this.http.get<any>(configUrl).subscribe({
        next: (config) => {
          if (config) {
            if (Array.isArray(config.shadowCapable)) {
              SHADOW_CAPABLE_SPECIES.length = 0;
              SHADOW_CAPABLE_SPECIES.push(...config.shadowCapable);
            }
            if (Array.isArray(config.megaCapable)) {
              MEGA_CAPABLE_SPECIES.length = 0;
              MEGA_CAPABLE_SPECIES.push(...config.megaCapable);
            }
            if (Array.isArray(config.gigamaxCapable)) {
              GIGAMAX_CAPABLE_SPECIES.length = 0;
              GIGAMAX_CAPABLE_SPECIES.push(...config.gigamaxCapable);
            }
            if (Array.isArray(config.unreleasedCapable)) {
              UNRELEASED_SPECIES.length = 0;
              UNRELEASED_SPECIES.push(...config.unreleasedCapable);
            }
            if (Array.isArray(config.shinyUnreleasedCapable)) {
              SHINY_UNRELEASED_SPECIES.length = 0;
              SHINY_UNRELEASED_SPECIES.push(...config.shinyUnreleasedCapable);
            }
            console.log('[PokedexService] Configurazione dinamica caricata ed applicata in-place con successo.');
          }
          resolve();
        },
        error: (err) => {
          console.error('[PokedexService] Errore nel caricamento dinamico della configurazione:', err);
          // Fallback silenzioso per usare i valori statici originari
          resolve();
        }
      });
    });
  }
}
