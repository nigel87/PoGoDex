import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly GROUP_REGIONALS_KEY = 'pogodex_group_regionals';
  private readonly REGIONAL_BUTTONS_KEY = 'pogodex_regional_buttons';

  // Segnale reattivo per l'impostazione "Raggruppa Forme Regionali" (attiva di default)
  groupRegionals = signal<boolean>(true);

  // Segnale per decidere quali pulsanti mostrare/registrare specificamente per le forme regionali
  regionalButtons = signal<string[]>(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);

  constructor() {
    this.loadSettings();
  }

  // Carica le impostazioni salvate da localStorage
  private loadSettings() {
    const saved = localStorage.getItem(this.GROUP_REGIONALS_KEY);
    if (saved !== null) {
      this.groupRegionals.set(saved === 'true');
    } else {
      this.groupRegionals.set(true); // Default attivo
    }

    const savedButtons = localStorage.getItem(this.REGIONAL_BUTTONS_KEY);
    if (savedButtons !== null) {
      try {
        this.regionalButtons.set(JSON.parse(savedButtons));
      } catch (e) {
        this.regionalButtons.set(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);
      }
    } else {
      this.regionalButtons.set(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);
    }
  }

  // Cambia il valore dell'impostazione e salva in localStorage
  setGroupRegionals(value: boolean) {
    this.groupRegionals.set(value);
    localStorage.setItem(this.GROUP_REGIONALS_KEY, value.toString());
  }

  // Cambia la lista dei pulsanti attivi per le forme regionali
  setRegionalButtons(value: string[]) {
    this.regionalButtons.set(value);
    localStorage.setItem(this.REGIONAL_BUTTONS_KEY, JSON.stringify(value));
  }

  // Verifica se un pulsante specifico è abilitato per le forme regionali
  isButtonEnabledForRegional(buttonType: string): boolean {
    return this.regionalButtons().includes(buttonType);
  }
}
