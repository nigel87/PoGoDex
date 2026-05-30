import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  constructor(private http: HttpClient) {}

  /**
   * Recupera la lista di tutti i Pokémon con il relativo stato di cattura di un determinato utente.
   */
  getAllEntries(userId: number): Observable<PokedexDTO[]> {
    return this.http.get<PokedexDTO[]>(this.apiUrl, {
      params: { userId: userId.toString() }
    });
  }

  /**
   * Aggiorna lo stato di cattura di un determinato Pokémon e utente.
   */
  updateEntry(userId: number, pokemonId: number, dto: PokedexDTO): Observable<PokedexDTO> {
    return this.http.put<PokedexDTO>(`${this.apiUrl}/${pokemonId}`, dto, {
      params: { userId: userId.toString() }
    });
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
}
