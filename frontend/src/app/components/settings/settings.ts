import { Component, OnInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { SettingsService } from '../../services/settings.service';
import { I18nService, Language } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class SettingsComponent implements OnInit, OnDestroy {
  groupRegionals = signal<boolean>(true);
  includeUnreleased = signal<boolean>(true);
  simplifyExport = signal<boolean>(true);
  username = '';
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
    private route: ActivatedRoute
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
