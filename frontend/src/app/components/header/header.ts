import { Component, OnInit, OnDestroy, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { UserService, User } from '../../services/user.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, FormsModule],
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
  trainerName = signal<string>('');
  showError = signal<boolean>(false);

  // Password Login States
  showPasswordInput = signal<boolean>(false);
  password = signal<string>('');
  confirmPassword = signal<string>('');
  isNewUser = signal<boolean>(false);
  registerMethod = signal<'password' | 'google' | 'none'>('password');

  // Google Login States
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
    this.resetForm();
    this.showLoginModal.set(true);
    
    // Rende il bottone se presente
    const clientId = this.googleClientId();
    if (clientId) {
      this.renderGoogleButton();
    }
  }

  closeLoginModal() {
    this.resetForm();
    this.showLoginModal.set(false);
  }

  resetForm() {
    this.showPasswordInput.set(false);
    this.isNewUser.set(false);
    this.registerMethod.set('password');
    this.trainerName.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.loginError.set('');
    this.loginSuccess.set('');
    this.isUsernameRequired.set(false);
    this.requestedTrainerName.set('');
  }

  onSubmit() {
    const name = this.trainerName().trim();
    if (!name) {
      this.showError.set(true);
      setTimeout(() => this.showError.set(false), 2000);
      return;
    }

    this.isProcessing.set(true);
    this.loginError.set('');

    this.userService.checkAuthStatus(name).subscribe({
      next: (status) => {
        this.isProcessing.set(false);
        if (status.exists) {
          if (status.hasPassword) {
            this.showPasswordInput.set(true);
            this.isNewUser.set(false);
          } else if (status.hasGoogle) {
            const current = this.userService.getCurrentUser();
            if (current && current.name.toLowerCase() === name.toLowerCase()) {
              this.loginSuccess.set('Sei già autenticato!');
              setTimeout(() => {
                this.closeLoginModal();
                this.router.navigate(['/' + current.name]);
              }, 1000);
            } else {
              this.loginError.set('Questo profilo è protetto con Google. Accedi tramite Google.');
            }
          } else {
            // Utente non protetto, accede direttamente
            this.userService.createUser(name).subscribe({
              next: (user) => {
                this.closeLoginModal();
                this.router.navigate(['/' + user.name]);
              },
              error: (err) => {
                this.loginError.set('Errore nell\'accesso.');
              }
            });
          }
        } else {
          // Nuovo utente
          this.isNewUser.set(true);
          this.showPasswordInput.set(false);
        }
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.loginError.set('Errore nella verifica dell\'utente.');
      }
    });
  }

  onLoginWithPassword() {
    const name = this.trainerName().trim();
    const pwd = this.password().trim();
    if (!pwd) return;

    this.isProcessing.set(true);
    this.loginError.set('');

    this.userService.loginWithPassword(name, pwd).subscribe({
      next: (res) => {
        this.isProcessing.set(false);
        this.loginSuccess.set('Accesso effettuato!');
        setTimeout(() => {
          this.closeLoginModal();
          this.router.navigate(['/' + res.user.name]);
        }, 1000);
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.loginError.set(err.error?.error || 'Password errata.');
      }
    });
  }

  onRegisterWithPassword() {
    const name = this.trainerName().trim();
    const pwd = this.password().trim();
    const confirm = this.confirmPassword().trim();

    if (!pwd || !confirm) {
      this.loginError.set('La password e la conferma sono richieste.');
      return;
    }
    if (pwd !== confirm) {
      this.loginError.set('Le password non corrispondono.');
      return;
    }

    this.isProcessing.set(true);
    this.loginError.set('');

    this.userService.registerWithPassword(name, pwd).subscribe({
      next: (res) => {
        this.isProcessing.set(false);
        this.loginSuccess.set('Profilo creato con password!');
        setTimeout(() => {
          this.closeLoginModal();
          this.router.navigate(['/' + res.user.name]);
        }, 1000);
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.loginError.set(err.error?.error || 'Errore durante la registrazione.');
      }
    });
  }

  onRegisterPasswordless() {
    const name = this.trainerName().trim();
    if (!name) return;

    this.isProcessing.set(true);
    this.loginError.set('');

    this.userService.createUser(name).subscribe({
      next: (user) => {
        this.isProcessing.set(false);
        this.loginSuccess.set('Profilo creato!');
        setTimeout(() => {
          this.closeLoginModal();
          this.router.navigate(['/' + user.name]);
        }, 1000);
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.loginError.set('Errore durante la registrazione.');
      }
    });
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

  renderGoogleRegisterButton() {
    const google = (window as any).google;
    if (!google) return;

    setTimeout(() => {
      const container = document.getElementById('google-header-register-btn-container');
      if (container) {
        google.accounts.id.renderButton(
          container,
          { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signup_with', width: 250 }
        );
      }
    }, 100);
  }

  setRegisterMethod(method: 'password' | 'google' | 'none') {
    this.registerMethod.set(method);
    this.loginError.set('');
    this.loginSuccess.set('');
    if (method === 'google') {
      this.renderGoogleRegisterButton();
    }
  }

  handleGoogleCredential(credential: string) {
    this.loginError.set('');
    this.loginSuccess.set('');
    this.isProcessing.set(true);

    const requestedName = (this.isNewUser() && this.registerMethod() === 'google')
      ? this.trainerName().trim()
      : undefined;

    this.userService.loginWithGoogle(credential, requestedName).subscribe({
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
        const errorMsg = err.error?.error || 'Errore durante l\'accesso Google.';
        this.loginError.set(errorMsg);
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
