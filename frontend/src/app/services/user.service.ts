import { Injectable, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface User {
  id: number;
  name: string;
  email?: string;
  avatarUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = window.location.port === '4205' || window.location.port === '4200'
    ? `http://${window.location.hostname}:8085/api/users`
    : '/api/users';
  
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
        // Se non c'è ancora nessun utente attivo, imposta il nuovo utente come attivo
        if (!this.activeUserSubject.value) {
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
}
