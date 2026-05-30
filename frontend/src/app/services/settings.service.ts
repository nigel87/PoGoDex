import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly GROUP_REGIONALS_KEY = 'pogodex_group_regionals';
  private readonly REGIONAL_BUTTONS_KEY = 'pogodex_regional_buttons';
  private readonly INCLUDE_UNRELEASED_KEY = 'pogodex_include_unreleased';
  private readonly SIMPLIFY_EXPORT_KEY = 'pogodex_simplify_export';

  // Segnale reattivo per l'impostazione "Raggruppa Forme Regionali" (attiva di default)
  groupRegionals = signal<boolean>(true);

  // Segnale per decidere quali pulsanti mostrare/registrare specificamente per le forme regionali
  regionalButtons = signal<string[]>(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);

  // Segnale reattivo per includere o meno i Pokémon non rilasciati nei progressi totali (attivo di default, stile Pokémon GO)
  includeUnreleased = signal<boolean>(true);

  // Segnale reattivo per la semplificazione dell'esportazione (Rule 2 - attiva di default)
  simplifyExport = signal<boolean>(true);

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

    const savedUnreleased = localStorage.getItem(this.INCLUDE_UNRELEASED_KEY);
    if (savedUnreleased !== null) {
      this.includeUnreleased.set(savedUnreleased === 'true');
    } else {
      this.includeUnreleased.set(true); // Default attivo (stile Pokémon GO)
    }

    const savedSimplify = localStorage.getItem(this.SIMPLIFY_EXPORT_KEY);
    if (savedSimplify !== null) {
      this.simplifyExport.set(savedSimplify === 'true');
    } else {
      this.simplifyExport.set(true); // Default attivo
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

  // Cambia l'impostazione di inclusione Pokémon non rilasciati
  setIncludeUnreleased(value: boolean) {
    this.includeUnreleased.set(value);
    localStorage.setItem(this.INCLUDE_UNRELEASED_KEY, value.toString());
  }

  // Cambia la semplificazione evolutiva dell'esportazione
  setSimplifyExport(value: boolean) {
    this.simplifyExport.set(value);
    localStorage.setItem(this.SIMPLIFY_EXPORT_KEY, value.toString());
  }

  // Verifica se un pulsante specifico è abilitato per le forme regionali
  isButtonEnabledForRegional(buttonType: string): boolean {
    return this.regionalButtons().includes(buttonType);
  }
}
