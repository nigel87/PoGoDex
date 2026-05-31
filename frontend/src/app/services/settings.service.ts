import { Injectable, signal } from '@angular/core';
import { MYTHICAL_POKEMON, LEGENDARY_POKEMON, ULTRA_BEASTS } from './pokemon-config';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly GROUP_REGIONALS_KEY = 'pogodex_group_regionals';
  private readonly REGIONAL_BUTTONS_KEY = 'pogodex_regional_buttons';
  private readonly NORMAL_BUTTONS_KEY = 'pogodex_normal_buttons';
  private readonly MYTHICAL_BUTTONS_KEY = 'pogodex_mythical_buttons';
  private readonly LEGENDARY_BUTTONS_KEY = 'pogodex_legendary_buttons';
  private readonly INCLUDE_UNRELEASED_KEY = 'pogodex_include_unreleased';
  private readonly SIMPLIFY_EXPORT_KEY = 'pogodex_simplify_export';
  private readonly LAYOUT_KEY = 'pogodex_layout_view';

  // Segnale reattivo per l'impostazione "Raggruppa Forme Regionali" (attiva di default)
  groupRegionals = signal<boolean>(true);

  // Segnale per decidere quali pulsanti mostrare/registrare specificamente per le forme regionali
  regionalButtons = signal<string[]>(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);

  // Segnale per decidere quali pulsanti abilitare per Pokémon Normali (Default: tutti attivi)
  normalButtons = signal<string[]>(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);

  // Segnale per decidere quali pulsanti abilitare per Pokémon Misteriosi (Default: registrato, cromatico, 100, mega)
  mythicalButtons = signal<string[]>(['regular', 'shiny', 'perfect', 'mega']);

  // Segnale per decidere quali pulsanti abilitare per Pokémon Leggendari/Ultracreature (Default: tutti attivi)
  legendaryButtons = signal<string[]>(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);

  // Segnale reattivo per includere o meno i Pokémon non rilasciati nei progressi totali (attivo di default, stile Pokémon GO)
  includeUnreleased = signal<boolean>(true);

  // Segnale reattivo per la semplificazione dell'esportazione (Rule 2 - attiva di default)
  simplifyExport = signal<boolean>(true);

  // Segnale reattivo per il layout della griglia ('detailed' o 'compact')
  layout = signal<'detailed' | 'compact'>('detailed');

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

    const savedNormal = localStorage.getItem(this.NORMAL_BUTTONS_KEY);
    if (savedNormal !== null) {
      try {
        this.normalButtons.set(JSON.parse(savedNormal));
      } catch (e) {
        this.normalButtons.set(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);
      }
    } else {
      this.normalButtons.set(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);
    }

    const savedMythical = localStorage.getItem(this.MYTHICAL_BUTTONS_KEY);
    if (savedMythical !== null) {
      try {
        let loaded = JSON.parse(savedMythical);
        // Filtra lucky per sicurezza sui Pokémon Misteriosi
        loaded = loaded.filter((b: string) => b !== 'lucky');
        this.mythicalButtons.set(loaded);
      } catch (e) {
        this.mythicalButtons.set(['regular', 'shiny', 'perfect', 'mega']);
      }
    } else {
      this.mythicalButtons.set(['regular', 'shiny', 'perfect', 'mega']);
    }

    const savedLegendary = localStorage.getItem(this.LEGENDARY_BUTTONS_KEY);
    if (savedLegendary !== null) {
      try {
        this.legendaryButtons.set(JSON.parse(savedLegendary));
      } catch (e) {
        this.legendaryButtons.set(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);
      }
    } else {
      this.legendaryButtons.set(['regular', 'shiny', 'perfect', 'lucky', 'xxl', 'xxs', 'mega', 'gigamax', 'shadow', 'purified']);
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

    const savedLayout = localStorage.getItem(this.LAYOUT_KEY);
    if (savedLayout === 'compact') {
      this.layout.set('compact');
    } else {
      this.layout.set('detailed');
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

  // Cambia la lista dei pulsanti attivi per i Pokémon Normali
  setNormalButtons(value: string[]) {
    this.normalButtons.set(value);
    localStorage.setItem(this.NORMAL_BUTTONS_KEY, JSON.stringify(value));
  }

  // Cambia la lista dei pulsanti attivi per i Pokémon Misteriosi (filtrando 'lucky')
  setMythicalButtons(value: string[]) {
    const filtered = value.filter(b => b !== 'lucky');
    this.mythicalButtons.set(filtered);
    localStorage.setItem(this.MYTHICAL_BUTTONS_KEY, JSON.stringify(filtered));
  }

  // Cambia la lista dei pulsanti attivi per i Pokémon Leggendari/Ultracreature
  setLegendaryButtons(value: string[]) {
    this.legendaryButtons.set(value);
    localStorage.setItem(this.LEGENDARY_BUTTONS_KEY, JSON.stringify(value));
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

  // Cambia il layout della griglia
  setLayout(value: 'detailed' | 'compact') {
    this.layout.set(value);
    localStorage.setItem(this.LAYOUT_KEY, value);
  }

  // Verifica se un pulsante specifico è abilitato per le forme regionali
  isButtonEnabledForRegional(buttonType: string): boolean {
    return this.regionalButtons().includes(buttonType);
  }

  isMythical(name: string): boolean {
    const baseName = name.split(' (')[0];
    if (baseName === 'Meltan' || baseName === 'Melmetal') return false;
    return MYTHICAL_POKEMON.includes(baseName);
  }

  isLegendaryOrUltraBeast(name: string): boolean {
    const baseName = name.split(' (')[0];
    if (baseName === 'Meltan' || baseName === 'Melmetal') return true;
    return LEGENDARY_POKEMON.includes(baseName) || ULTRA_BEASTS.includes(baseName);
  }

  // Metodo centralizzato reattivo per determinare se mostrare un pulsante di cattura per qualsiasi Pokémon
  isButtonVisible(pName: string, pId: number, buttonType: string): boolean {
    // 1. Pokémon Misteriosi (il fortunato non è mai visibile)
    if (this.isMythical(pName)) {
      if (buttonType === 'lucky') return false;
      return this.mythicalButtons().includes(buttonType);
    }
    
    // 2. Leggendari & Ultracreature
    if (this.isLegendaryOrUltraBeast(pName)) {
      return this.legendaryButtons().includes(buttonType);
    }
    
    // 3. Forme Regionali (ID >= 10000)
    if (pId >= 10000) {
      return this.regionalButtons().includes(buttonType);
    }
    
    // 4. Pokémon Normali/Standard
    return this.normalButtons().includes(buttonType);
  }
}
