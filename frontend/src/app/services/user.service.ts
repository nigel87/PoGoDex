import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface User {
  id: number;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  googleSubId?: string | null;
  isProtected?: number;
  privacyMode?: 'public_edit' | 'public_readonly' | 'private';
  isAdmin?: number;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiBaseUrl = window.location.port === '4205' || window.location.port === '4200'
    ? `http://${window.location.hostname}:8085/api`
    : '/api';
    
  private apiUrl = `${this.apiBaseUrl}/users`;
  
  // Gestione dello stato del giocatore attivo tramite BehaviorSubject reattivo
  private activeUserSubject = new BehaviorSubject<User | null>(null);
  activeUser$ = this.activeUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.initializeActiveUser();
  }

  /**
   * Inizializza l'utente attivo dal localStorage o attende il caricamento iniziale.
   */
  private initializeActiveUser() {
    const savedUser = localStorage.getItem('active_pogo_user');
    if (savedUser) {
      try {
        this.activeUserSubject.next(JSON.parse(savedUser));
      } catch (e) {
        console.error('Errore nel parsing dell\'utente salvato:', e);
      }
    }
  }

  /**
   * Recupera tutti i profili giocatore dal server.
   */
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.apiUrl);
  }

  /**
   * Registra un nuovo giocatore locale.
   */
  createUser(name: string): Observable<User> {
    return this.http.post<User>(this.apiUrl, { name }).pipe(
      tap(newUser => {
        // Se non c'è ancora nessun utente attivo ed il profilo non è protetto, imposta come attivo
        if (!this.activeUserSubject.value && newUser.isProtected !== 1) {
          this.setActiveUser(newUser);
        }
      })
    );
  }

  /**
   * Restituisce l'utente attivo corrente.
   */
  getCurrentUser(): User | null {
    return this.activeUserSubject.value;
  }

  /**
   * Imposta il giocatore attivo e lo persiste in localStorage.
   */
  setActiveUser(user: User) {
    localStorage.setItem('active_pogo_user', JSON.stringify(user));
    this.activeUserSubject.next(user);
  }

  /**
   * Elimina un profilo giocatore locale.
   */
  deleteUser(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  /**
   * Esegue l'autenticazione tramite Google Token.
   */
  loginWithGoogle(idToken: string, requestedUsername?: string): Observable<any> {
    return this.http.post<any>(`${this.apiBaseUrl}/auth/google`, { idToken, requestedUsername }).pipe(
      tap(res => {
        if (res.token && res.user) {
          localStorage.setItem('pogodex_jwt_token', res.token);
          this.setActiveUser(res.user);
        }
      })
    );
  }

  /**
   * Collega un Google Account ad un profilo locale esistente.
   */
  linkGoogle(userId: number, idToken: string): Observable<any> {
    return this.http.post<any>(`${this.apiBaseUrl}/users/${userId}/link-google`, { idToken }).pipe(
      tap(res => {
        if (res.token && res.user) {
          localStorage.setItem('pogodex_jwt_token', res.token);
          this.setActiveUser(res.user);
        }
      })
    );
  }

  /**
   * Aggiorna le impostazioni di privacy di un utente.
   */
  updatePrivacy(userId: number, privacyMode: string): Observable<any> {
    return this.http.put<any>(`${this.apiBaseUrl}/users/${userId}/privacy`, { privacyMode }).pipe(
      tap(res => {
        const current = this.getCurrentUser();
        if (current && current.id === userId) {
          current.privacyMode = res.privacyMode;
          this.setActiveUser(current);
        }
      })
    );
  }

  /**
   * Disconnette l'utente cancellando la sessione e il token.
   */
  logout() {
    localStorage.removeItem('pogodex_jwt_token');
    localStorage.removeItem('active_pogo_user');
    this.activeUserSubject.next(null);
  }

  /**
   * Recupera il Google Client ID dal server
   */
  getGoogleClientId(): Observable<{ googleClientId: string | null }> {
    return this.http.get<{ googleClientId: string | null }>(`${this.apiBaseUrl}/auth/config`);
  }
}
