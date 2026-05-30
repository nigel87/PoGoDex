import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';

@Component({
  selector: 'app-export',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './export.html',
  styleUrl: './export.css'
})
export class ExportComponent implements OnInit, OnDestroy {
  // Categorie del Dex
  categories = [
    { value: 'regular', label: 'Pokedex Regolare' },
    { value: 'shadow', label: 'Pokémon Shadow' },
    { value: 'purified', label: 'Pokémon Purificati' },
    { value: 'perfect', label: 'Pokémon 100% (Perfect)' },
    { value: 'lucky', label: 'Pokémon Lucky (Fortunati)' },
    { value: 'xxs', label: 'Pokémon XXS' },
    { value: 'xxl', label: 'Pokémon XXL' },
    { value: 'shiny', label: 'Pokémon Cromatici (Shiny)' }
  ];

  // Stati reattivi
  selectedCategory = signal<string>('regular');
  selectedMode = signal<string>('list'); // 'list' o 'negation'
  searchString = signal<string>('');
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(false);
  showCopyToast = signal<boolean>(false);

  username = '';
  private sub = new Subscription();

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // Sottoscrizione ai parametri della rotta dinamica (:username)
    this.sub.add(
      this.route.params.subscribe(params => {
        const routeUser = params['username'];
        if (routeUser) {
          this.username = routeUser;
          // Esegue la find-or-create automatica sul backend
          this.userService.createUser(routeUser).subscribe({
            next: (user) => {
              this.userService.setActiveUser(user);
            },
            error: (err) => console.error('Errore nella registrazione/ricerca dell\'allenatore:', err)
          });
        }
      })
    );

    // Si iscrive all'utente attivo. Quando cambia, rigenera la stringa per quell'utente!
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        if (user && user.name.toLowerCase() === this.username.toLowerCase()) {
          this.activeUser.set(user);
          this.generateString(user.id);
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  // Genera la stringa di ricerca richiamando il servizio backend per l'utente specifico
  generateString(userId?: number) {
    const targetUserId = userId || this.activeUser()?.id;
    if (!targetUserId) return;

    this.isLoading.set(true);
    this.pokedexService.getSearchString(targetUserId, this.selectedCategory(), this.selectedMode()).subscribe({
      next: (res) => {
        this.searchString.set(res.searchString);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Errore nella generazione della stringa dell\'utente:', err);
        this.isLoading.set(false);
      }
    });
  }

  // Cambia la categoria selezionata
  onCategoryChange(category: string) {
    this.selectedCategory.set(category);
    this.generateString();
  }

  // Cambia la modalità selezionata
  onModeChange(mode: string) {
    this.selectedMode.set(mode);
    this.generateString();
  }

  // Copia la stringa negli appunti
  copyToClipboard() {
    if (!this.searchString()) return;
    
    navigator.clipboard.writeText(this.searchString()).then(() => {
      this.showCopyToast.set(true);
      setTimeout(() => {
        this.showCopyToast.set(false);
      }, 2500);
    });
  }
}
