import { Component, OnInit, OnDestroy, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';
import { SHADOW_CAPABLE_SPECIES, MEGA_CAPABLE_SPECIES, GIGAMAX_CAPABLE_SPECIES, UNRELEASED_SPECIES, MYTHICAL_POKEMON, LEGENDARY_POKEMON, ULTRA_BEASTS, EVOLVES_FROM } from '../../services/pokemon-config';

const MYTHICAL_POKEMON_SET = new Set(MYTHICAL_POKEMON);
const LEGENDARY_POKEMON_SET = new Set(LEGENDARY_POKEMON);
const ULTRA_BEASTS_SET = new Set(ULTRA_BEASTS);


@Component({
  selector: 'app-export',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  templateUrl: './export.html',
  styleUrl: './export.css'
})
export class ExportComponent implements OnInit, OnDestroy {
  // Categorie del Dex
  categories = [
    { value: 'regular' },
    { value: 'shadow' },
    { value: 'purified' },
    { value: 'perfect' },
    { value: 'lucky' },
    { value: 'xxs' },
    { value: 'xxl' },
    { value: 'shiny' },
    { value: 'mega' },
    { value: 'gigamax' }
  ];

  // Stati reattivi
  pokemonList = signal<PokedexDTO[]>([]);
  selectedCategory = signal<string>('regular');
  selectedMode = signal<string>('list'); // 'list' o 'negation'
  selectedFormat = signal<string>('number'); // 'number' o 'name'
  searchString = signal<string>('');
  includeLegendaries = signal<boolean>(false);
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);
  showCopyToast = signal<boolean>(false);

  // Sotto-navigazione Esporta / Importa / Volantino
  activeTab = signal<string>('export'); // 'export', 'import', 'flyer'
  importInput = signal<string>('');
  importCategory = signal<string>('regular');
  importSuccessMessage = signal<string>('');
  importErrorMessage = signal<string>('');
  flyerGenFilter = signal<number>(0); // 0 = tutte le generazioni

  username = '';
  private sub = new Subscription();

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router,
    public settingsService: SettingsService,
    public i18n: I18nService
  ) {
    // Ricalcola automaticamente la stringa quando cambiano i segnali
    effect(() => {
      // Esegui la generazione in reazione ai cambiamenti dei segnali
      this.pokemonList();
      this.selectedCategory();
      this.selectedMode();
      this.selectedFormat();
      this.settingsService.simplifyExport();
      this.includeLegendaries();
      
      this.generateString();
    });
  }

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

    // Si iscrive all'utente attivo. Quando cambia, carica la lista dei pokemon dal backend
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        if (user && user.name.toLowerCase() === this.username.toLowerCase()) {
          this.activeUser.set(user);
          this.loadPokedexData(user.id);
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  // Carica i dati del Pokédex per l'utente attivo
  loadPokedexData(userId: number) {
    this.isLoading.set(true);
    this.pokedexService.getAllEntries(userId).subscribe({
      next: (list) => {
        this.pokemonList.set(list);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Errore nel caricamento dei dati del Pokedex:', err);
        this.isLoading.set(false);
      }
    });
  }

  // Cambia sotto-tab
  onTabChange(tab: string) {
    this.activeTab.set(tab);
    this.importSuccessMessage.set('');
    this.importErrorMessage.set('');
  }

  // Restituisce la lista di tutti i pokemon rilasciati, raggruppati per generazione
  releasedByGeneration(): { gen: number; label: string; pokemon: PokedexDTO[] }[] {
    const list = this.pokemonList();
    const filterGen = this.flyerGenFilter();
    const genLabels: Record<number, string> = {
      1: 'Gen I — Kanto',
      2: 'Gen II — Johto',
      3: 'Gen III — Hoenn',
      4: 'Gen IV — Sinnoh',
      5: 'Gen V — Unova',
      6: 'Gen VI — Kalos',
      7: 'Gen VII — Alola',
      8: 'Gen VIII — Galar',
      9: 'Gen IX — Paldea',
    };

    const byGen = new Map<number, PokedexDTO[]>();
    for (const p of list) {
      if (!this.isReleased(p.name)) continue;
      const gen = p.generation ?? 1;
      if (!byGen.has(gen)) byGen.set(gen, []);
      byGen.get(gen)!.push(p);
    }

    const result = Array.from(byGen.entries())
      .sort(([a], [b]) => a - b)
      .filter(([gen]) => filterGen === 0 || gen === filterGen)
      .map(([gen, pokemon]) => ({
        gen,
        label: genLabels[gen] ?? `Gen ${gen}`,
        pokemon: pokemon.sort((a, b) => a.id - b.id)
      }));

    return result;
  }

  // Conta totale pokemon rilasciati
  releasedTotal(): number {
    return this.pokemonList().filter(p => this.isReleased(p.name)).length;
  }

  // Copia il volantino come testo
  copyFlyer() {
    const groups = this.releasedByGeneration();
    const lines: string[] = [`=== PoGODex — Pokemon Rilasciati (${this.releasedTotal()}) ===`];
    for (const g of groups) {
      lines.push(`\n${g.label} (${g.pokemon.length})`);
      lines.push(g.pokemon.map(p => `#${p.id} ${p.name}`).join('\n'));
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      this.showCopyToast.set(true);
      setTimeout(() => this.showCopyToast.set(false), 2500);
    });
  }

  // Esegue il parsing delle stringhe del tipo: "1-6, 9, 25-30"
  parsePokemonIds(input: string): number[] {
    const ids = new Set<number>();
    const segments = input.split(',');
    
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      
      if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts.length === 2) {
          const start = parseInt(parts[0].trim(), 10);
          const end = parseInt(parts[1].trim(), 10);
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) {
              ids.add(i);
            }
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num)) {
          ids.add(num);
        }
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }

  // Esegue l'importazione massiva richiamando l'API bulk backend
  onImport(value: boolean) {
    const user = this.activeUser();
    if (!user) return;

    const ids = this.parsePokemonIds(this.importInput());
    if (ids.length === 0) {
      this.importSuccessMessage.set('');
      this.importErrorMessage.set(this.i18n.translate('import.error.empty'));
      return;
    }

    this.isLoading.set(true);
    this.pokedexService.bulkUpdateEntries(user.id, ids, this.importCategory(), value).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.importErrorMessage.set('');
        this.importSuccessMessage.set(this.i18n.translate('import.success') + res.count);
        this.importInput.set(''); // Pulisce il campo al successo
        
        // Ricarica i dati del pokedex locale per aggiornare istantaneamente tutte le viste
        this.loadPokedexData(user.id);
      },
      error: (err) => {
        console.error('Errore nell\'importazione massiva:', err);
        this.isLoading.set(false);
        this.importSuccessMessage.set('');
        this.importErrorMessage.set(this.i18n.translate('import.error.failed'));
      }
    });
  }

  // Helpers per la qualificazione e il rilascio del Pokemon
  canMega(name: string): boolean {
    const baseName = name.split(' (')[0];
    return MEGA_CAPABLE_SPECIES.includes(baseName);
  }

  canGigamax(name: string): boolean {
    const baseName = name.split(' (')[0];
    return GIGAMAX_CAPABLE_SPECIES.includes(baseName);
  }

  canShadow(name: string): boolean {
    const baseName = name.split(' (')[0];
    return SHADOW_CAPABLE_SPECIES.includes(baseName);
  }

  isReleased(name: string): boolean {
    const baseName = name.split(' (')[0];
    return !UNRELEASED_SPECIES.includes(baseName);
  }

  // Risolve il genitore del Pokémon supportando le forme regionali
  getParentName(name: string): string | null {
    if (EVOLVES_FROM[name]) {
      return EVOLVES_FROM[name];
    }

    // Estrae i suffissi regionali
    const match = name.match(/^(.+?)\s*\((Alolan|Galarian|Hisuian|Paldean|Alola|Galar|Hisui|Paldea)\)$/i);
    if (match) {
      const baseName = match[1];
      const suffix = match[2];
      const baseParent = EVOLVES_FROM[baseName];
      if (baseParent) {
        return `${baseParent} (${suffix})`;
      }
    }
    return null;
  }

  // Ottiene la lista di tutti gli antenati evolutivi di un Pokemon
  getAncestors(name: string): string[] {
    const ancestors: string[] = [];
    const visited = new Set<string>(); // Guardia anti-ciclo
    let parent = this.getParentName(name);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      ancestors.push(parent);
      parent = this.getParentName(parent);
    }
    return ancestors;
  }

  isMythical(name: string): boolean {
    const baseName = name.split(' (')[0];
    if (baseName === 'Meltan' || baseName === 'Melmetal') return false;
    return MYTHICAL_POKEMON_SET.has(baseName);
  }

  isLegendaryOrUltraBeast(name: string): boolean {
    const baseName = name.split(' (')[0];
    if (baseName === 'Meltan' || baseName === 'Melmetal') return true;
    return LEGENDARY_POKEMON_SET.has(baseName) || ULTRA_BEASTS_SET.has(baseName);
  }

  // Verifica se un Pokemon specifico manca nella categoria selezionata
  isMissingForCategory(p: PokedexDTO, category: string): boolean {
    if (!this.isReleased(p.name)) {
      return false; // Se non rilasciato non è da esportare
    }

    // 1) Esclude i misteriosi in quanto non scambiabili
    if (this.isMythical(p.name)) {
      return false;
    }

    // 2) Esclude leggendari e ultracreature se disattivato
    if (!this.includeLegendaries() && this.isLegendaryOrUltraBeast(p.name)) {
      return false;
    }

    // 3) Verifica se il tracciamento di questa qualità è abilitato per questa specie
    if (!this.settingsService.isButtonVisible(p.name, p.id, category)) {
      return false;
    }

    switch (category) {
      case 'regular':
        return !p.regular;
      case 'shiny':
        return !p.shiny;
      case 'shadow':
        return this.canShadow(p.name) && !p.shadow;
      case 'purified':
        return this.canShadow(p.name) && !p.purified;
      case 'perfect':
        return !p.perfect;
      case 'lucky':
        return !p.lucky;
      case 'xxs':
        return !p.xxs;
      case 'xxl':
        return !p.xxl;
      case 'mega':
        return this.canMega(p.name) && p.mega === 0;
      case 'gigamax':
        return this.canGigamax(p.name) && !p.gigamax;
      default:
        return false;
    }
  }

  // Verifica se un Pokemon specifico è catturato nella categoria selezionata
  isCaughtForCategory(p: PokedexDTO, category: string): boolean {
    switch (category) {
      case 'regular':
        return p.regular;
      case 'shiny':
        return p.shiny;
      case 'shadow':
        return p.shadow;
      case 'purified':
        return p.purified;
      case 'perfect':
        return p.perfect;
      case 'lucky':
        return p.lucky;
      case 'xxs':
        return p.xxs;
      case 'xxl':
        return p.xxl;
      case 'mega':
        return p.mega > 0;
      case 'gigamax':
        return p.gigamax;
      default:
        return false;
    }
  }

  // Risolve il nome tradotto in base alla lingua
  getPokemonExportName(englishName: string): string {
    const key = 'pokemon.name.' + englishName;
    const translated = this.i18n.translate(key);
    return translated !== key ? translated : englishName;
  }

  // Genera offline in locale la query string in tempo reale
  generateString() {
    const list = this.pokemonList();
    if (!list || list.length === 0) {
      this.searchString.set('');
      return;
    }

    const category = this.selectedCategory();
    const nameToPokemon = new Map<string, PokedexDTO>();
    for (const p of list) {
      nameToPokemon.set(p.name, p);
    }

    const resultList: PokedexDTO[] = [];

    for (const p of list) {
      if (!this.isMissingForCategory(p, category)) {
        continue;
      }

      const ancestors = this.getAncestors(p.name);

      // Regola 1: Escludi se hai già registrato un pre-evoluzione (sempre attiva)
      let hasCaughtAncestor = false;
      for (const ancestorName of ancestors) {
        const ancestorP = nameToPokemon.get(ancestorName);
        if (ancestorP && this.isCaughtForCategory(ancestorP, category)) {
          hasCaughtAncestor = true;
          break;
        }
      }

      if (hasCaughtAncestor) {
        continue;
      }

      // Regola 2: Escludi se manca anche un pre-evoluzione (semplificazione evolutiva - configurable)
      if (this.settingsService.simplifyExport()) {
        let hasMissingAncestor = false;
        for (const ancestorName of ancestors) {
          const ancestorP = nameToPokemon.get(ancestorName);
          if (ancestorP && this.isMissingForCategory(ancestorP, category)) {
            hasMissingAncestor = true;
            break;
          }
        }
        if (hasMissingAncestor) {
          continue;
        }
      }

      resultList.push(p);
    }

    if (resultList.length === 0) {
      this.searchString.set('');
      return;
    }

    // Mappa al formato di output corretto (Numero o Nome Pokémon)
    const items = resultList.map(p => {
      if (this.selectedFormat() === 'name') {
        return this.getPokemonExportName(p.name);
      } else {
        return p.id.toString();
      }
    });

    let generatedQuery = '';
    if (this.selectedMode() === 'negation') {
      generatedQuery = items.map(item => `!${item}`).join('&');
    } else {
      generatedQuery = items.join(',');
    }

    this.searchString.set(generatedQuery);
  }

  // Cambia la categoria selezionata
  onCategoryChange(category: string) {
    this.selectedCategory.set(category);
  }

  // Cambia la modalità selezionata (list vs negation)
  onModeChange(mode: string) {
    this.selectedMode.set(mode);
  }

  // Cambia il formato selezionato (number vs name)
  onFormatChange(format: string) {
    this.selectedFormat.set(format);
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
