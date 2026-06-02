import { Component, OnInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { SettingsService } from '../../services/settings.service';
import { I18nService, Language } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { Subscription } from 'rxjs';
import { APP_VERSION } from '../../version';
import { UserService, User } from '../../services/user.service';
import { HeaderComponent } from '../header/header';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, HeaderComponent],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class SettingsComponent implements OnInit, OnDestroy {
  version = APP_VERSION;
  groupRegionals = signal<boolean>(true);
  includeUnreleased = signal<boolean>(true);
  simplifyExport = signal<boolean>(true);
  username = '';
  
  // Google Auth & Privacy states
  googleClientId = signal<string | null>(null);
  activeProfileUser = signal<User | null>(null);
  isCurrentUserOwner = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  
  private sub = new Subscription();

  // Lista delle categorie di pulsanti disponibili per la configurazione
  availableButtons = [
    { value: 'regular' },
    { value: 'shiny' },
    { value: 'perfect' },
    { value: 'lucky' },
    { value: 'xxl' },
    { value: 'xxs' },
    { value: 'mega' },
    { value: 'gigamax' },
    { value: 'shadow' },
    { value: 'purified' }
  ];

  constructor(
    public settingsService: SettingsService,
    public i18n: I18nService,
    private route: ActivatedRoute,
    public userService: UserService,
    private router: Router
  ) {}

  ngOnInit() {
    // Si iscrive reattivamente all'impostazione corrente
    this.groupRegionals.set(this.settingsService.groupRegionals());
    this.includeUnreleased.set(this.settingsService.includeUnreleased());
    this.simplifyExport.set(this.settingsService.simplifyExport());

    this.sub.add(
      this.route.params.subscribe(params => {
         const routeUser = params['username'];
         if (routeUser) {
           this.username = routeUser;
           this.loadProfileDetails(routeUser);
         }
      })
    );

    // Sottoscrizione al cambio utente
    this.sub.add(
      this.userService.activeUser$.subscribe(() => {
        this.checkOwnership();
      })
    );

    // Carica il Google Client ID dal server
    this.userService.getGoogleClientId().subscribe({
      next: (res) => {
        if (res.googleClientId) {
          this.googleClientId.set(res.googleClientId);
          this.initGoogleSignIn(res.googleClientId);
        }
      },
      error: (err) => console.error('Errore nel recupero del Google Client ID:', err)
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  loadProfileDetails(name: string) {
    this.userService.createUser(name).subscribe({
      next: (user) => {
        this.activeProfileUser.set(user);
        this.checkOwnership();
      },
      error: (err) => console.error('Errore nel recupero del profilo settings:', err)
    });
  }

  checkOwnership() {
    const current = this.userService.getCurrentUser();
    const profile = this.activeProfileUser();
    if (current && profile && current.id === profile.id) {
      this.isCurrentUserOwner.set(true);
    } else {
      this.isCurrentUserOwner.set(false);
    }
  }

  initGoogleSignIn(clientId: string) {
    if (typeof window === 'undefined') return;
    
    // Attendi che lo script di Google sia caricato
    const checkGsi = setInterval(() => {
      const google = (window as any).google;
      if (google && google.accounts && google.accounts.id) {
        clearInterval(checkGsi);
        
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: any) => {
            this.handleGoogleCredential(response.credential);
          }
        });
        
        // Rendi il bottone se presente
        this.renderGoogleButton();
      }
    }, 100);
  }

  renderGoogleButton() {
    const google = (window as any).google;
    if (!google) return;

    setTimeout(() => {
      const container = document.getElementById('google-btn-container');
      if (container) {
        google.accounts.id.renderButton(
          container,
          { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 250 }
        );
      }
    }, 200);
  }

  handleGoogleCredential(credential: string) {
    this.errorMessage.set('');
    this.successMessage.set('');
    
    const profile = this.activeProfileUser();
    if (!profile) return;

    if (profile.isProtected === 1) {
      // Login flow: l'utente sta cercando di autenticarsi come owner di questo profilo protetto
      this.userService.loginWithGoogle(credential).subscribe({
        next: (res) => {
          if (res.status === 'username_required') {
            this.errorMessage.set(this.i18n.currentLang() === 'it' ? 'Account Google non associato a questo profilo.' : 'Google account not linked to this profile.');
          } else {
            this.successMessage.set(this.i18n.currentLang() === 'it' ? 'Accesso effettuato con successo!' : 'Login successful!');
            this.loadProfileDetails(this.username);
          }
        },
        error: (err) => {
          console.error(err);
          this.errorMessage.set(this.i18n.currentLang() === 'it' ? 'Errore durante l\'accesso Google.' : 'Error during Google login.');
        }
      });
    } else {
      // Link/Protect flow: il profilo non è ancora protetto, lo colleghiamo a questo account Google
      this.userService.linkGoogle(profile.id, credential).subscribe({
        next: () => {
          this.successMessage.set(this.i18n.currentLang() === 'it' ? 'Profilo protetto con successo!' : 'Profile protected successfully!');
          this.loadProfileDetails(this.username);
        },
        error: (err) => {
          console.error(err);
          const msg = err.error?.error || '';
          if (msg.includes('già collegato')) {
            this.errorMessage.set(this.i18n.currentLang() === 'it' ? 'Questo account Google è già collegato ad un altro allenatore' : 'This Google account is already linked to another trainer');
          } else {
            this.errorMessage.set(this.i18n.currentLang() === 'it' ? 'Errore durante la protezione del profilo.' : 'Error protecting profile.');
          }
        }
      });
    }
  }

  changePrivacyMode(mode: string) {
    this.errorMessage.set('');
    this.successMessage.set('');
    const profile = this.activeProfileUser();
    if (!profile) return;

    this.userService.updatePrivacy(profile.id, mode).subscribe({
      next: (res) => {
        this.successMessage.set(this.i18n.currentLang() === 'it' ? 'Privacy aggiornata con successo!' : 'Privacy updated successfully!');
        if (this.activeProfileUser()) {
          this.activeProfileUser.update(p => p ? { ...p, privacyMode: res.privacyMode } : null);
        }
      },
      error: (err) => {
        console.error(err);
        this.errorMessage.set(this.i18n.currentLang() === 'it' ? 'Errore nell\'aggiornamento della privacy.' : 'Error updating privacy.');
      }
    });
  }

  logout() {
    this.userService.logout();
    this.successMessage.set(this.i18n.currentLang() === 'it' ? 'Disconnessione effettuata.' : 'Disconnected.');
    this.checkOwnership();
    // Renderizza di nuovo il bottone Google dopo il logout per consentire un nuovo login
    setTimeout(() => {
      this.renderGoogleButton();
    }, 200);
  }

  // Cambia il valore dell'impostazione nel servizio
  toggleGroupRegionals() {
    const newVal = !this.groupRegionals();
    this.groupRegionals.set(newVal);
    this.settingsService.setGroupRegionals(newVal);
  }

  toggleIncludeUnreleased() {
    const newVal = !this.includeUnreleased();
    this.includeUnreleased.set(newVal);
    this.settingsService.setIncludeUnreleased(newVal);
  }

  toggleSimplifyExport() {
    const newVal = !this.simplifyExport();
    this.simplifyExport.set(newVal);
    this.settingsService.setSimplifyExport(newVal);
  }

  // Verifica se un bottone è selezionato per una determinata categoria
  isButtonCheckedForCategory(category: 'normal' | 'regional' | 'legendary' | 'mythical', value: string): boolean {
    if (category === 'normal') {
      return this.settingsService.normalButtons().includes(value);
    } else if (category === 'regional') {
      return this.settingsService.regionalButtons().includes(value);
    } else if (category === 'legendary') {
      return this.settingsService.legendaryButtons().includes(value);
    } else {
      return this.settingsService.mythicalButtons().includes(value);
    }
  }

  // Togglare la selezione di un bottone per una determinata categoria
  toggleButtonForCategory(category: 'normal' | 'regional' | 'legendary' | 'mythical', value: string) {
    if (category === 'mythical' && value === 'lucky') {
      return; // Misteriosi non scambiabili
    }

    let current: string[] = [];
    if (category === 'normal') {
      current = [...this.settingsService.normalButtons()];
    } else if (category === 'regional') {
      current = [...this.settingsService.regionalButtons()];
    } else if (category === 'legendary') {
      current = [...this.settingsService.legendaryButtons()];
    } else {
      current = [...this.settingsService.mythicalButtons()];
    }

    const index = current.indexOf(value);
    if (index > -1) {
      // Consenti rimozione solo se rimane almeno un bottone attivo per evitare card vuote
      if (current.length > 1) {
        current.splice(index, 1);
      }
    } else {
      current.push(value);
    }

    if (category === 'normal') {
      this.settingsService.setNormalButtons(current);
    } else if (category === 'regional') {
      this.settingsService.setRegionalButtons(current);
    } else if (category === 'legendary') {
      this.settingsService.setLegendaryButtons(current);
    } else {
      this.settingsService.setMythicalButtons(current);
    }
  }

  changeLanguage(lang: Language) {
    this.i18n.setLanguage(lang);
  }
}
