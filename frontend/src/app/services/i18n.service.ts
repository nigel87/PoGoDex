import { Injectable, signal } from '@angular/core';

export type Language = 'it' | 'en';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  currentLang = signal<Language>('it');

  // Dizionario multilingua centralizzato ed estensibile
  private dictionary: Record<Language, Record<string, string>> = {
    it: {
      // Navigazione
      'nav.pokedex': 'Pokédex',
      'nav.stats': 'Statistiche',
      'nav.export': 'Esporta',
      'nav.settings': 'Impostazioni',

      // Landing Page
      'landing.title': 'Benvenuto Allenatore',
      'landing.subtitle': 'Traccia le tue catture Pokémon GO in tempo reale su database persistente.',
      'landing.placeholder': 'Inserisci il tuo nome allenatore...',
      'landing.error': 'Per favore, inserisci un nome valido!',
      'landing.btn': 'Inizia Avventura',

      // Pokédex List
      'pokedex.search': 'Cerca per nome o numero di Pokédex...',
      'pokedex.shown': 'Mostrati:',
      'pokedex.pokemon': 'Pokémon',
      'pokedex.no_results': 'Nessun Pokémon corrisponde ai criteri di ricerca e ai filtri selezionati.',
      'pokedex.modal.title': 'Aggiungi Giocatore',
      'pokedex.modal.label': 'Nome del Giocatore',
      'pokedex.modal.placeholder': 'Es: Nigel, Sofia, Allenatore1...',
      'pokedex.modal.help': 'Creando il profilo, avrai un Pokédex personale e statistiche indipendenti salvate stabilmente su disco.',
      'pokedex.modal.cancel': 'Annulla',
      'pokedex.modal.create': 'Crea Profilo',
      'pokedex.unreleased': '🔒 Non Rilasciato',
      'pokedex.crown_title': 'Specie Completata al 100% (Tutte le spunte attive)',
      'pokedex.add_player': 'Aggiungi Giocatore',
      'pokedex.select_player': 'Cambia Giocatore',

      // Pokédex buttons abbreviations & titles
      'pokedex.btn.regular': 'Reg',
      'pokedex.btn.regular.title': 'Catturato Regolare',
      'pokedex.btn.shiny': 'Shy',
      'pokedex.btn.shiny.title': 'Shiny (Cromatico)',
      'pokedex.btn.shiny.unavailable_label': 'N/D',
      'pokedex.btn.shiny.unavailable': 'Shiny non rilasciato in Pokémon GO',
      'pokedex.btn.perfect': '100',
      'pokedex.btn.perfect.title': 'Perfect (100% IV)',
      'pokedex.btn.lucky': 'Lck',
      'pokedex.btn.lucky.title': 'Lucky (Fortunato)',
      'pokedex.btn.xxl': 'XXL',
      'pokedex.btn.xxl.title': 'Taglia XXL',
      'pokedex.btn.xxs': 'XXS',
      'pokedex.btn.xxs.title': 'Taglia XXS',
      'pokedex.btn.megax': 'Meg X',
      'pokedex.btn.megax.title': 'Mega Evoluzione X',
      'pokedex.btn.megay': 'Meg Y',
      'pokedex.btn.megay.title': 'Mega Evoluzione Y',
      'pokedex.btn.mega': 'Meg',
      'pokedex.btn.mega.title': 'Mega Evoluzione',
      'pokedex.btn.gigamax': 'Gmx',
      'pokedex.btn.gigamax.title': 'Forma Gigamax',
      'pokedex.btn.shadow': 'Sha',
      'pokedex.btn.shadow.title': 'Shadow (Ombra)',
      'pokedex.btn.purified': 'Pur',
      'pokedex.btn.purified.title': 'Purificato',

      // Region Filter Row Labels
      'region.all': 'Tutte le Regioni',
      'region.kanto': 'Kanto',
      'region.johto': 'Johto',
      'region.hoenn': 'Hoenn',
      'region.sinnoh': 'Sinnoh',
      'region.unova': 'Unova',
      'region.kalos': 'Kalos',
      'region.alola': 'Alola',
      'region.galar': 'Galar',
      'region.hisui': 'Hisui',
      'region.paldea': 'Paldea',

      // Special form filters
      'form.all': 'Qualsiasi',
      'form.shiny': 'Cromatici (Shiny)',
      'form.shadow': 'Shadow',
      'form.purified': 'Purificati',
      'form.perfect': '100% IV',
      'form.lucky': 'Lucky',
      'form.xxl': 'XXL',
      'form.xxs': 'XXS',
      'form.mega': 'Mega',
      'form.gigamax': 'Gigamax',

      // Caught Status filters
      'status.all': 'Tutti i Pokémon',
      'status.caught': 'Catturati',
      'status.missing': 'Mancanti',

      // Stats Dashboard
      'stats.title': 'Dashboard Progressi',
      'stats.subtitle': 'Monitora le percentuali di completamento per tipo di cattura e regione geografica.',
      'stats.select_region': 'Filtra per Regione',
      'stats.overall': 'Progressi Complessivi',
      'stats.caught': 'Catturati',
      'stats.shadow': 'Ombra (Shadow)',
      'stats.purified': 'Purificati',
      'stats.perfect': '100% IV',
      'stats.lucky': 'Fortunati',
      'stats.xxl': 'Taglia XXL',
      'stats.xxs': 'Taglia XXS',
      'stats.shiny': 'Cromatici (Shiny)',
      'stats.mega': 'Mega Evoluzioni',
      'stats.gigamax': 'Forme Gigamax',
      'stats.overall_title': 'Totale Specie',

      // Export Screen
      'export.title': 'Esporta Stringhe Pokémon GO',
      'export.subtitle': 'Genera query di ricerca pre-formattate per trovare rapidamente nel gioco i Pokémon mancanti o da registrare.',
      'export.instructions': 'Copia la stringa generata, incollala nella barra di ricerca di Pokémon GO e gestisci facilmente la tua collezione!',
      'export.category.missing_reg': 'Mancanti Registrazione Regolare',
      'export.category.missing_shiny': 'Mancanti Cromatici (Shiny)',
      'export.category.missing_shadow': 'Mancanti Shadow (Ombra)',
      'export.category.missing_purified': 'Mancanti Purificati',
      'export.category.missing_perfect': 'Mancanti 100% IV',
      'export.category.missing_lucky': 'Mancanti Fortunati',
      'export.category.missing_xxl': 'Mancanti Taglia XXL',
      'export.category.missing_xxs': 'Mancanti Taglia XXS',
      'export.category.missing_mega': 'Mancanti Mega Evoluzioni',
      'export.category.missing_gigamax': 'Mancanti Forme Gigamax',
      'export.copy': 'Copia Stringa',
      'export.copied': 'Copiato!',
      'export.no_missing': 'Complimenti! Hai registrato tutte le specie idonee per questa categoria!',
      'export.format.label': 'Formato Elementi',
      'export.format.number': 'Numero Pokédex',
      'export.format.name': 'Nome Pokémon',
      'export.tab.export': 'Esporta Stringhe',
      'export.tab.import': 'Importazione Rapida',
      'import.title': 'Importazione Rapida Pokémon',
      'import.subtitle': 'Registra o rimuovi massivamente le catture dei Pokémon indicando i loro numeri di Pokédex o specifici intervalli.',
      'import.label.category': 'Seleziona Qualità / Categoria',
      'import.label.input': 'Inserisci Numeri o Intervalli (es. 1-6, 9, 25-30)',
      'import.placeholder': 'Esempio: 1-6, 9, 25-30',
      'import.btn.register': 'Registra Come Catturati',
      'import.btn.remove': 'Rimuovi Catture (Segna Mancanti)',
      'import.success': 'Importazione completata con successo! Pokémon aggiornati: ',
      'import.error.empty': 'Per favore, inserisci un numero o intervallo di Pokédex valido!',
      'import.error.failed': 'Si è verificato un errore durante l\'importazione massiva dei dati.',

      // Settings Panel
      'settings.title': 'Centro Impostazioni PoGODex',
      'settings.subtitle': 'Personalizza la tua esperienza di gioco, configura l\'aspetto visivo delle schede Pokédex e predisponi le tue preferenze.',
      'settings.display_card.title': 'Visualizzazione & Griglia',
      'settings.display_card.desc': 'Controlla come le diverse specie di Pokémon e le loro varianti geografiche compaiono nell\'elenco principale.',
      'settings.group_regionals.title': 'Raggruppa Forme Regionali',
      'settings.group_regionals.desc': 'Se attivo, raggruppa le varianti regionali (Alola, Galar, Hisui, Paldea) all\'interno della scheda del Pokémon base. Potrai cambiare forma dinamicamente con un selettore integrato sulla card.',
      'settings.include_unreleased.title': 'Includi Pokémon non rilasciati nei progressi',
      'settings.include_unreleased.desc': 'Se attivo (stile Pokémon GO), i Pokémon non ancora rilasciati (es. Phione, Arceus) faranno parte del totale regionale e delle statistiche, impedendo il completamento al 100% della regione fino al rilascio effettivo. Se disattivato, verranno considerati solo i Pokémon disponibili in-game.',
      'settings.simplify_export.title': 'Semplificazione Evolutiva Esportazione',
      'settings.simplify_export.desc': 'Se attivo, nel box di esportazione dei Pokémon mancanti viene visualizzato solo il Pokémon base (es. se mancano Bulbasaur, Ivysaur e Venusaur, mostra solo Bulbasaur poiché le evoluzioni si possono ottenere evolvendo il base). Inoltre, nasconde le evoluzioni mancanti se possiedi già un loro antenato.',
      'settings.regional_buttons.title': 'Qualità da registrare per le Forme Regionali:',
      'settings.regional_buttons.desc': 'Seleziona quali pulsanti di cattura abilitare sulle schede dei Pokémon regionali quando sono raggruppate.',
      'settings.tracking_card.title': 'Configurazione Qualità Pokémon',
      'settings.tracking_card.desc': 'Seleziona quali pulsanti di cattura abilitare sulle schede dei Pokémon in base alla loro categoria.',
      'settings.normal_buttons.title': 'Qualità da registrare per Pokémon Normali:',
      'settings.normal_buttons.desc': 'Seleziona quali pulsanti di cattura abilitare sulle schede dei Pokémon standard.',
      'settings.legendary_buttons.title': 'Qualità da registrare per Pokémon Leggendari & Ultracreature:',
      'settings.legendary_buttons.desc': 'Seleziona quali pulsanti di cattura abilitare sulle schede dei Pokémon Leggendari e delle Ultracreature.',
      'settings.mythical_buttons.title': 'Qualità da registrare per Pokémon Misteriosi:',
      'settings.mythical_buttons.desc': 'Seleziona quali pulsanti di cattura abilitare sulle schede dei Pokémon Misteriosi (Nota: i Misteriosi non possono essere scambiati, quindi il pulsante Fortunato (Lck) non è disponibile. Meltan & Melmetal vengono considerati Leggendari/Ultracreature poiché lo scambio è sempre uno scambio speciale).',
      'settings.account.title': 'Sincronizzazione & Account',
      'settings.account.desc': 'Collega il tuo profilo Google o Niantic per sincronizzare automaticamente i tuoi progressi su più dispositivi.',
      'settings.notifications.title': 'Notifiche & Eventi',
      'settings.notifications.desc': 'Ricevi avvisi ed evidenziazioni speciali nel Pokédex durante i Community Day e gli eventi globali di Pokémon GO.',
      'settings.coming_soon': 'Prossimamente',
      'settings.language.title': 'Lingua / Language',
      'settings.language.desc': 'Seleziona la lingua dell\'interfaccia utente di PoGODex (Italiano o Inglese).',

      // Developer Admin Console
      'admin.title': 'PoGO dex Dev Console',
      'admin.subtitle': 'Configurazione grafica delle forme speciali (Shadow, Mega, Gigamax) e stato di rilascio.',
      'admin.search': 'Cerca per nome o numero di Pokédex...',
      'admin.shown': 'Mostrati:',
      'admin.pokemon': 'Pokémon',
      'admin.col.id': 'ID',
      'admin.col.sprite': 'Sprite',
      'admin.col.name': 'Nome Pokémon',
      'admin.col.types': 'Tipi',
      'admin.col.released': '🚀 Rilasciato in GO',
      'admin.col.shadow': '💀 Shadow (Ombra)',
      'admin.col.mega': '🧬 Mega Evoluzione',
      'admin.col.gigamax': '🌋 Forma Gigamax',
      'admin.col.shiny': '✨ Shiny Rilasciato',
      'admin.btn.exit': 'Esci',
      'admin.btn.sync': 'Sincronizza Shiny (Auto)',
      'admin.btn.save': 'Salva Configurazione',
      'admin.banner.success.title': 'Configurazione Salvata con Successo!',
      'admin.banner.success.desc': 'Il file pokemon-config.ts locale è stato riscritto ed è aggiornato. Per rendere effettive le modifiche sul Raspberry Pi remoto, esegui il commit su Git e lancia ./deploy.sh.',
      'admin.banner.error.title': 'Errore di Salvataggio',
      'admin.barrier.title': 'Accesso Negato / Access Denied',
      'admin.barrier.desc': 'Questa console di amministrazione è disponibile esclusivamente per gli sviluppatori in ambiente locale sul computer host dell\'amministratore.',
      'admin.barrier.help': 'Per motivi di sicurezza, qualsiasi operazione di scrittura delle configurazioni è bloccata a livello di rete IP per connessioni non-loopback.',
      'admin.barrier.btn': 'Torna alla Home'
    },
    en: {
      // Navigation
      'nav.pokedex': 'Pokédex',
      'nav.stats': 'Stats',
      'nav.export': 'Export',
      'nav.settings': 'Settings',

      // Landing Page
      'landing.title': 'Welcome Trainer',
      'landing.subtitle': 'Track your Pokémon GO catches in real-time on a persistent database.',
      'landing.placeholder': 'Enter your trainer name...',
      'landing.error': 'Please enter a valid name!',
      'landing.btn': 'Start Adventure',

      // Pokédex List
      'pokedex.search': 'Search by name or Pokédex number...',
      'pokedex.shown': 'Shown:',
      'pokedex.pokemon': 'Pokémon',
      'pokedex.no_results': 'No Pokémon match the search criteria and selected filters.',
      'pokedex.modal.title': 'Add Player',
      'pokedex.modal.label': 'Player Name',
      'pokedex.modal.placeholder': 'E.g., Nigel, Sofia, Trainer1...',
      'pokedex.modal.help': 'By creating a profile, you will have a personal Pokédex and independent stats saved permanently on disk.',
      'pokedex.modal.cancel': 'Cancel',
      'pokedex.modal.create': 'Create Profile',
      'pokedex.unreleased': '🔒 Unreleased',
      'pokedex.crown_title': 'Species Completed 100% (All checkboxes active)',
      'pokedex.add_player': 'Add Player',
      'pokedex.select_player': 'Switch Player',

      // Pokédex buttons abbreviations & titles
      'pokedex.btn.regular': 'Reg',
      'pokedex.btn.regular.title': 'Caught Regular',
      'pokedex.btn.shiny': 'Shy',
      'pokedex.btn.shiny.title': 'Shiny (Chromatic)',
      'pokedex.btn.shiny.unavailable_label': 'N/A',
      'pokedex.btn.shiny.unavailable': 'Shiny not yet released in Pokémon GO',
      'pokedex.btn.perfect': '100',
      'pokedex.btn.perfect.title': 'Perfect (100% IV)',
      'pokedex.btn.lucky': 'Lck',
      'pokedex.btn.lucky.title': 'Lucky (Fortunate)',
      'pokedex.btn.xxl': 'XXL',
      'pokedex.btn.xxl.title': 'Size XXL',
      'pokedex.btn.xxs': 'XXS',
      'pokedex.btn.xxs.title': 'Size XXS',
      'pokedex.btn.megax': 'Meg X',
      'pokedex.btn.megax.title': 'Mega Evolution X',
      'pokedex.btn.megay': 'Meg Y',
      'pokedex.btn.megay.title': 'Mega Evolution Y',
      'pokedex.btn.mega': 'Meg',
      'pokedex.btn.mega.title': 'Mega Evolution',
      'pokedex.btn.gigamax': 'Gmx',
      'pokedex.btn.gigamax.title': 'Gigamax Form',
      'pokedex.btn.shadow': 'Sha',
      'pokedex.btn.shadow.title': 'Shadow (Dark)',
      'pokedex.btn.purified': 'Pur',
      'pokedex.btn.purified.title': 'Purified',

      // Region Filter Row Labels
      'region.all': 'All Regions',
      'region.kanto': 'Kanto',
      'region.johto': 'Johto',
      'region.hoenn': 'Hoenn',
      'region.sinnoh': 'Sinnoh',
      'region.unova': 'Unova',
      'region.kalos': 'Kalos',
      'region.alola': 'Alola',
      'region.galar': 'Galar',
      'region.hisui': 'Hisui',
      'region.paldea': 'Paldea',

      // Special form filters
      'form.all': 'Any Form',
      'form.shiny': 'Shiny',
      'form.shadow': 'Shadow',
      'form.purified': 'Purified',
      'form.perfect': '100% IV',
      'form.lucky': 'Lucky',
      'form.xxl': 'XXL',
      'form.xxs': 'XXS',
      'form.mega': 'Mega',
      'form.gigamax': 'Gigamax',

      // Caught Status filters
      'status.all': 'All Pokémon',
      'status.caught': 'Caught',
      'status.missing': 'Missing',

      // Stats Dashboard
      'stats.title': 'Progress Dashboard',
      'stats.subtitle': 'Monitor completion percentages by catch type and geographic region.',
      'stats.select_region': 'Filter by Region',
      'stats.overall': 'Overall Progress',
      'stats.caught': 'Caught',
      'stats.shadow': 'Shadow',
      'stats.purified': 'Purified',
      'stats.perfect': '100% IV',
      'stats.lucky': 'Lucky',
      'stats.xxl': 'Size XXL',
      'stats.xxs': 'Size XXS',
      'stats.shiny': 'Shiny',
      'stats.mega': 'Mega Evolutions',
      'stats.gigamax': 'Gigamax Forms',
      'stats.overall_title': 'Total Species',

      // Export Screen
      'export.title': 'Export Pokémon GO Search Strings',
      'export.subtitle': 'Generate pre-formatted search queries to quickly find missing or to-be-registered Pokémon in-game.',
      'export.instructions': 'Copy the generated string, paste it into the Pokémon GO search bar, and easily manage your collection!',
      'export.category.missing_reg': 'Missing Regular Registration',
      'export.category.missing_shiny': 'Missing Shiny (Chromatic)',
      'export.category.missing_shadow': 'Missing Shadow (Dark)',
      'export.category.missing_purified': 'Missing Purified',
      'export.category.missing_perfect': 'Missing 100% IV',
      'export.category.missing_lucky': 'Missing Lucky',
      'export.category.missing_xxl': 'Missing Size XXL',
      'export.category.missing_xxs': 'Missing Size XXS',
      'export.category.missing_mega': 'Missing Mega Evolutions',
      'export.category.missing_gigamax': 'Missing Gigamax Forms',
      'export.copy': 'Copy String',
      'export.copied': 'Copied!',
      'export.no_missing': 'Congratulations! You have registered all eligible species for this category!',
      'export.format.label': 'Element Format',
      'export.format.number': 'Pokédex Number',
      'export.format.name': 'Pokémon Name',
      'export.tab.export': 'Export Strings',
      'export.tab.import': 'Quick Import',
      'import.title': 'Quick Pokémon Import',
      'import.subtitle': 'Bulk register or remove catches for multiple Pokémon by entering their Pokédex numbers or ranges.',
      'import.label.category': 'Select Quality / Category',
      'import.label.input': 'Enter Numbers or Ranges (e.g. 1-6, 9, 25-30)',
      'import.placeholder': 'Example: 1-6, 9, 25-30',
      'import.btn.register': 'Register As Caught',
      'import.btn.remove': 'Remove Catches (Mark Missing)',
      'import.success': 'Import completed successfully! Pokémon updated: ',
      'import.error.empty': 'Please enter a valid Pokédex number or range!',
      'import.error.failed': 'An error occurred during the bulk data import.',

      // Settings Panel
      'settings.title': 'PoGODex Settings Center',
      'settings.subtitle': 'Customize your gaming experience, configure Pokédex cards display, and prepare your preferences.',
      'settings.display_card.title': 'Display & Grid',
      'settings.display_card.desc': 'Control how different Pokémon species and their geographical variants appear in the main list.',
      'settings.group_regionals.title': 'Group Regional Forms',
      'settings.group_regionals.desc': 'If active, groups regional variants (Alola, Galar, Hisui, Paldea) inside the base Pokémon card. You can change forms dynamically with an integrated selector on the card.',
      'settings.include_unreleased.title': 'Include unreleased Pokémon in progress',
      'settings.include_unreleased.desc': 'If active (like Pokémon GO), unreleased Pokémon (e.g. Phione, Arceus) are included in regional totals and statistics, blocking 100% completion of the region until actually released. If disabled, only available in-game Pokémon are considered.',
      'settings.simplify_export.title': 'Evolutionary Export Simplification',
      'settings.simplify_export.desc': 'If active, the export box for missing species displays only the base Pokémon of an evolutionary line (e.g. if Bulbasaur, Ivysaur, and Venusaur are all missing, only Bulbasaur is shown since evolutions can be obtained by evolving it). It also hides missing evolutions if you already own any of their ancestors.',
      'settings.regional_buttons.title': 'Buttons to display for Regional Forms:',
      'settings.regional_buttons.desc': 'Select which action buttons to enable on regional Pokémon cards when grouped.',
      'settings.tracking_card.title': 'Pokémon Quality Tracking',
      'settings.tracking_card.desc': 'Select which capture buttons to enable on cards based on their category.',
      'settings.normal_buttons.title': 'Buttons to display for Standard Pokémon:',
      'settings.normal_buttons.desc': 'Select which action buttons to enable on standard Pokémon cards.',
      'settings.legendary_buttons.title': 'Buttons to display for Legendary & Ultra Beasts:',
      'settings.legendary_buttons.desc': 'Select which action buttons to enable on Legendary and Ultra Beast cards.',
      'settings.mythical_buttons.title': 'Buttons to display for Mythical Pokémon:',
      'settings.mythical_buttons.desc': 'Select which action buttons to enable on Mythical Pokémon cards (Note: Mythical Pokémon cannot be traded, so the Lucky (Lck) button is unavailable. Meltan & Melmetal are treated as Legendary/Ultra Beasts since their trade is always a special trade).',
      'settings.account.title': 'Sync & Account',
      'settings.account.desc': 'Connect your Google or Niantic profile to automatically sync progress across multiple devices.',
      'settings.notifications.title': 'Notifications & Events',
      'settings.notifications.desc': 'Receive special alerts and highlights in the Pokédex during Pokémon GO Community Days and global events.',
      'settings.coming_soon': 'Coming Soon',
      'settings.language.title': 'Language / Lingua',
      'settings.language.desc': 'Select the interface language for PoGODex (Italian or English).',

      // Developer Admin Console
      'admin.title': 'PoGO dex Dev Console',
      'admin.subtitle': 'Graphical configuration of special forms (Shadow, Mega, Gigamax) and release status.',
      'admin.search': 'Search by name or Pokédex number...',
      'admin.shown': 'Shown:',
      'admin.pokemon': 'Pokémon',
      'admin.col.id': 'ID',
      'admin.col.sprite': 'Sprite',
      'admin.col.name': 'Pokémon Name',
      'admin.col.types': 'Types',
      'admin.col.released': '🚀 Released in GO',
      'admin.col.shadow': '💀 Shadow (Dark)',
      'admin.col.mega': '🧬 Mega Evolution',
      'admin.col.gigamax': '🌋 Gigamax Form',
      'admin.col.shiny': '✨ Shiny Released',
      'admin.btn.exit': 'Exit',
      'admin.btn.sync': 'Sync Shinies (Auto)',
      'admin.btn.save': 'Save Configuration',
      'admin.banner.success.title': 'Configuration Saved Successfully!',
      'admin.banner.success.desc': 'The local pokemon-config.ts file has been rewritten. To apply changes to the remote Raspberry Pi, commit and deploy.',
      'admin.banner.error.title': 'Saving Error',
      'admin.barrier.title': 'Access Denied / Accesso Negato',
      'admin.barrier.desc': 'This admin console is exclusively available for developers in the local environment of the host computer.',
      'admin.barrier.help': 'For security reasons, any configuration writing operation is blocked at the IP network level for non-loopback connections.',
      'admin.barrier.btn': 'Back to Home'
    }
  };

  constructor() {
    this.detectLanguage();
  }

  private detectLanguage() {
    const saved = localStorage.getItem('pogodex_language') as Language;
    if (saved === 'it' || saved === 'en') {
      this.currentLang.set(saved);
      return;
    }

    // Auto-rilevamento client-side della lingua del browser
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('it')) {
      this.currentLang.set('it');
    } else {
      this.currentLang.set('en');
    }
  }

  setLanguage(lang: Language) {
    this.currentLang.set(lang);
    localStorage.setItem('pogodex_language', lang);
  }

  // Funzione di traduzione base
  translate(key: string): string {
    const lang = this.currentLang();
    return this.dictionary[lang]?.[key] || key;
  }
}
