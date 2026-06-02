import { Component, OnInit, OnDestroy, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { UserService, User } from '../../services/user.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() activeTab: string = '';
  @Input() username: string = '';

  version = APP_VERSION;
  activeUser = signal<User | null>(null);
  googleClientId = signal<string | null>(null);

  // Login Modal States
  showLoginModal = signal<boolean>(false);
  isUsernameRequired = signal<boolean>(false);
  requestedTrainerName = signal<string>('');
  loginError = signal<string>('');
  loginSuccess = signal<string>('');
  isProcessing = signal<boolean>(false);
  
  private googleCredentialTemp: string = '';
  private sub = new Subscription();

  constructor(
    private userService: UserService,
    private router: Router
  ) {}

  ngOnInit() {
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        this.activeUser.set(user);
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

  logout() {
    this.userService.logout();
    this.closeLoginModal();
    this.router.navigate(['/']);
  }

  openLoginModal() {
    this.loginError.set('');
    this.loginSuccess.set('');
    this.isUsernameRequired.set(false);
    this.requestedTrainerName.set('');
    this.googleCredentialTemp = '';
    this.showLoginModal.set(true);
    
    // Rende il bottone se presente
    const clientId = this.googleClientId();
    if (clientId) {
      this.renderGoogleButton();
    }
  }

  closeLoginModal() {
    this.showLoginModal.set(false);
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
      }
    }, 100);
  }

  renderGoogleButton() {
    const google = (window as any).google;
    if (!google) return;

    setTimeout(() => {
      const container = document.getElementById('google-header-btn-container');
      if (container) {
        google.accounts.id.renderButton(
          container,
          { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 250 }
        );
      }
    }, 200);
  }

  handleGoogleCredential(credential: string) {
    this.loginError.set('');
    this.loginSuccess.set('');
    this.isProcessing.set(true);

    this.userService.loginWithGoogle(credential).subscribe({
      next: (res) => {
        this.isProcessing.set(false);
        if (res.status === 'username_required') {
          this.googleCredentialTemp = credential;
          this.isUsernameRequired.set(true);
        } else {
          this.loginSuccess.set('Accesso effettuato!');
          setTimeout(() => {
            this.closeLoginModal();
            this.router.navigate(['/' + res.user.name]);
          }, 1000);
        }
      },
      error: (err) => {
        this.isProcessing.set(false);
        console.error(err);
        this.loginError.set('Errore durante l\'accesso Google.');
      }
    });
  }

  onTrainerNameInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.requestedTrainerName.set(val);
  }

  submitTrainerName() {
    const name = this.requestedTrainerName().trim();
    if (!name || !this.googleCredentialTemp) return;

    this.isProcessing.set(true);
    this.loginError.set('');

    this.userService.loginWithGoogle(this.googleCredentialTemp, name).subscribe({
      next: (res) => {
        this.isProcessing.set(false);
        this.loginSuccess.set('Profilo creato!');
        setTimeout(() => {
          this.closeLoginModal();
          this.router.navigate(['/' + res.user.name]);
        }, 1000);
      },
      error: (err) => {
        this.isProcessing.set(false);
        console.error(err);
        const backendError = err.error?.error || 'Errore nella creazione del profilo.';
        this.loginError.set(backendError);
      }
    });
  }
}
