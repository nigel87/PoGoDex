import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../services/translate.pipe';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './landing.html',
  styleUrl: './landing.css'
})
export class LandingComponent {
  trainerName = signal<string>('');
  showError = signal<boolean>(false);

  constructor(private router: Router) {}

  onSubmit() {
    const name = this.trainerName().trim();
    if (!name) {
      this.showError.set(true);
      setTimeout(() => this.showError.set(false), 2000);
      return;
    }
    // Reindirizza alla rotta dinamica del Pokédex di quel giocatore
    this.router.navigate(['/' + name]);
  }
}
