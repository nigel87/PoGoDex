import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { UserService } from '../../services/user.service';
import { TranslatePipe } from '../../services/translate.pipe';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './landing.html',
  styleUrl: './landing.css'
})
export class LandingComponent implements OnInit, OnDestroy {
  trainerName = signal<string>('');
  showError = signal<boolean>(false);

  // Password Login States
  showPasswordInput = signal<boolean>(false);
  password = signal<string>('');
  confirmPassword = signal<string>('');
  isNewUser = signal<boolean>(false);
  registerMethod = signal<'password' | 'google' | 'none'>('password');

  // Google Login States
  googleClientId = signal<string | null>(null);
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
    // Se c'è già un utente attivo loggato (Google), reindirizza direttamente al suo Pokédex
    const currentUser = this.userService.getCurrentUser();
    if (currentUser && currentUser.isProtected) {
      this.router.navigate(['/' + currentUser.name]);
      return;
    }

    // Carica il Google Client ID dal server per il login diretto
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

  resetForm() {
    this.showPasswordInput.set(false);
    this.isNewUser.set(false);
    this.registerMethod.set('password');
    this.password.set('');
    this.confirmPassword.set('');
    this.loginError.set('');
    this.loginSuccess.set('');
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
              setTimeout(() => this.router.navigate(['/' + current.name]), 1000);
            } else {
              this.loginError.set('Questo profilo è protetto con Google. Accedi tramite Google.');
            }
          } else {
            // Utente non protetto, accede direttamente
            this.userService.createUser(name).subscribe({
              next: (user) => {
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
        this.renderGoogleButton();
      }
    }, 100);
  }

  renderGoogleButton() {
    const google = (window as any).google;
    if (!google) return;

    setTimeout(() => {
      const container = document.getElementById('google-landing-btn-container');
      if (container) {
        google.accounts.id.renderButton(
          container,
          { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 280 }
        );
      }
    }, 200);
  }

  renderGoogleRegisterButton() {
    const google = (window as any).google;
    if (!google) return;

    setTimeout(() => {
      const container = document.getElementById('google-landing-register-btn-container');
      if (container) {
        google.accounts.id.renderButton(
          container,
          { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signup_with', width: 280 }
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

