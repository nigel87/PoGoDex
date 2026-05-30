import { Component, OnInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { SettingsService } from '../../services/settings.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class SettingsComponent implements OnInit, OnDestroy {
  groupRegionals = signal<boolean>(true);
  includeUnreleased = signal<boolean>(true);
  username = '';
  private sub = new Subscription();

  // Lista delle categorie di pulsanti disponibili per la configurazione
  availableButtons = [
    { value: 'regular', label: 'Normale' },
    { value: 'shiny', label: 'Shiny' },
    { value: 'perfect', label: '100% IV' },
    { value: 'lucky', label: 'Fortunato' },
    { value: 'xxl', label: 'XXL' },
    { value: 'xxs', label: 'XXS' },
    { value: 'mega', label: 'Mega' },
    { value: 'gigamax', label: 'Gigamax' },
    { value: 'shadow', label: 'Ombra' },
    { value: 'purified', label: 'Purificato' }
  ];

  constructor(
    public settingsService: SettingsService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Si iscrive reattivamente all'impostazione corrente
    this.groupRegionals.set(this.settingsService.groupRegionals());
    this.includeUnreleased.set(this.settingsService.includeUnreleased());

    this.sub.add(
      this.route.params.subscribe(params => {
        const routeUser = params['username'];
        if (routeUser) {
          this.username = routeUser;
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
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

  // Verifica se un bottone è selezionato
  isButtonChecked(value: string): boolean {
    return this.settingsService.isButtonEnabledForRegional(value);
  }

  // Togglare la selezione di un bottone
  toggleRegionalButton(value: string) {
    const current = [...this.settingsService.regionalButtons()];
    const index = current.indexOf(value);
    if (index > -1) {
      // Consenti rimozione solo se rimane almeno un bottone attivo per evitare card vuote
      if (current.length > 1) {
        current.splice(index, 1);
      }
    } else {
      current.push(value);
    }
    this.settingsService.setRegionalButtons(current);
  }
}
