import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';
import { SHADOW_CAPABLE_SPECIES, MEGA_CAPABLE_SPECIES, GIGAMAX_CAPABLE_SPECIES, UNRELEASED_SPECIES } from '../../services/pokemon-config';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../services/translate.pipe';

@Component({
  selector: 'app-pokedex-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  templateUrl: './pokedex-list.html',
  styleUrl: './pokedex-list.css'
})
export class PokedexList implements OnInit, OnDestroy {
  // Lista originale e stati utente
  pokemonList = signal<PokedexDTO[]>([]);
  usersList = signal<User[]>([]);
  activeUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);

  // Stati modale creazione giocatore
  showUserModal = signal<boolean>(false);
  newUserName = signal<string>('');
  isCreatingUser = signal<boolean>(false);

  // Segnali dei filtri
  searchQuery = signal<string>('');
  selectedStatus = signal<string>('all'); // 'all', 'caught', 'missing'
  selectedType = signal<string>('all'); // 'all', 'fire', 'water', ecc.
  selectedFormFilter = signal<string>('all'); // 'all', 'shadow', 'purified', 'perfect', 'lucky', 'xxs', 'xxl', 'shiny'
  selectedRegion = signal<string>('all'); // 'all', 'kanto', 'johto', etc.

  // Regioni disponibili nel gioco per il filtro a pillole
  pokemonRegions = [
    { value: 'all' },
    { value: 'kanto' },
    { value: 'johto' },
    { value: 'hoenn' },
    { value: 'sinnoh' },
    { value: 'unova' },
    { value: 'kalos' },
    { value: 'alola' },
    { value: 'galar' },
    { value: 'hisui' },
    { value: 'paldea' }
  ];

  // Subscriptions per evitare leak di memoria
  private sub = new Subscription();

  // Elenco completo dei tipi per i filtri grafici
  pokemonTypes = [
    { value: 'all' },
    { value: 'normal' },
    { value: 'fire' },
    { value: 'water' },
    { value: 'electric' },
    { value: 'grass' },
    { value: 'ice' },
    { value: 'fighting' },
    { value: 'poison' },
    { value: 'ground' },
    { value: 'flying' },
    { value: 'psychic' },
    { value: 'bug' },
    { value: 'rock' },
    { value: 'ghost' },
    { value: 'dragon' },
    { value: 'steel' },
    { value: 'fairy' }
  ];

  specialForms = [
    { value: 'all' },
    { value: 'shiny' },
    { value: 'shadow' },
    { value: 'purified' },
    { value: 'perfect' },
    { value: 'lucky' },
    { value: 'xxl' },
    { value: 'xxs' },
    { value: 'mega' },
    { value: 'gigamax' }
  ];

  // Mappa reattiva per tracciare la forma regional selezionata per ogni card (base ID -> forma ID)
  selectedFormMap = signal<{ [key: number]: number }>({});

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

  hasTwoMegas(name: string): boolean {
    const baseName = name.split(' (')[0];
    return baseName === 'Charizard' || baseName === 'Mewtwo';
  }

  isMegaActive(pokemon: PokedexDTO, formType: 'x' | 'y' | 'standard'): boolean {
    if (formType === 'x') {
      return (pokemon.mega & 1) > 0;
    } else if (formType === 'y') {
      return (pokemon.mega & 2) > 0;
    } else {
      return pokemon.mega > 0;
    }
  }

  toggleMega(pokemon: PokedexDTO, formType: 'x' | 'y' | 'standard') {
    const user = this.activeUser();
    if (!user) return;

    const updatedPokemon = { ...pokemon };
    if (formType === 'x') {
      // Toggle bit 1 (value 1)
      updatedPokemon.mega = (updatedPokemon.mega & 1) ? (updatedPokemon.mega & ~1) : (updatedPokemon.mega | 1);
    } else if (formType === 'y') {
      // Toggle bit 2 (value 2)
      updatedPokemon.mega = (updatedPokemon.mega & 2) ? (updatedPokemon.mega & ~2) : (updatedPokemon.mega | 2);
    } else {
      // Standard: Toggle between 0 and 1
      updatedPokemon.mega = updatedPokemon.mega ? 0 : 1;
    }

    this.pokedexService.updateEntry(user.id, pokemon.id, updatedPokemon).subscribe({
      next: (res) => {
        this.pokemonList.update(list =>
          list.map(p => p.id === pokemon.id ? res : p)
        );
      },
      error: (err) => {
        console.error('Errore nell\'aggiornamento dello stato di cattura Mega:', err);
      }
    });
  }

  // Filtro dinamico reattivo con supporto al raggruppamento delle forme regionali
  filteredList = computed(() => {
    const list = this.pokemonList();
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.selectedStatus();
    const type = this.selectedType();
    const formFilter = this.selectedFormFilter();
    const region = this.selectedRegion();
    const isGrouped = this.settingsService.groupRegionals();

    if (!isGrouped) {
      // Logica classica quando il raggruppamento è disattivato (mostra tutto separato)
      return list.filter(p => this.matchesFilters(p, query, status, type, formFilter, region));
    }

    // Logica quando il raggruppamento è attivo:
    // 1. Consideriamo solo i Pokémon base (id < 10000)
    const basePokemons = list.filter(p => p.id < 10000);
    const result: PokedexDTO[] = [];

    for (const base of basePokemons) {
      // 2. Recuperiamo le forme regionali associate a questo Pokémon base
      const regionals = list.filter(r => r.id >= 10000 && r.name.startsWith(base.name + ' ('));
      const allForms = [base, ...regionals];

      // 3. Troviamo quali forme di questa specie soddisfano i filtri correnti
      const matchingForms = allForms.filter(f => this.matchesFilters(f, query, status, type, formFilter, region));

      if (matchingForms.length > 0) {
        // Se almeno una forma soddisfa i filtri, la card del Pokémon base deve essere visibile!
        result.push(base);

        // EXTRA UX: Se la forma attualmente attiva non corrisponde ai nuovi filtri inseriti,
        // cambiamo automaticamente la forma attiva sulla card in modo che l'utente veda subito il risultato corretto!
        const currentSelectedId = this.selectedFormMap()[base.id] || base.id;
        const currentStillMatches = matchingForms.some(f => f.id === currentSelectedId);

        if (!currentStillMatches) {
          // Switch automatico alla prima forma che corrisponde
          const targetForm = matchingForms[0];
          setTimeout(() => {
            this.selectFormForCard(base.id, targetForm.id);
          });
        }
      }
    }

    return result;
  });

  username: string = '';

  constructor(
    private pokedexService: PokedexService,
    private userService: UserService,
    public settingsService: SettingsService,
    private route: ActivatedRoute,
    private router: Router,
    public i18n: I18nService
  ) { }

  // Helper per verificare se un singolo Pokémon soddisfa i filtri attivi
  private matchesFilters(p: PokedexDTO, query: string, status: string, type: string, formFilter: string, region: string): boolean {
    // Filtro per regione
    if (region !== 'all') {
      const pokemonRegion = this.getPokemonRegion(p);
      if (pokemonRegion !== region) {
        return false;
      }
    }

    const matchesQuery = p.name.toLowerCase().includes(query) || p.id.toString() === query;

    const matchesType = type === 'all' ||
      p.type1.toLowerCase() === type ||
      (p.type2 !== null && p.type2.toLowerCase() === type);

    let matchesStatus = true;
    if (status === 'caught') {
      matchesStatus = p.regular;
    } else if (status === 'missing') {
      matchesStatus = !p.regular;
    }

    let matchesForm = true;
    if (formFilter !== 'all') {
      switch (formFilter) {
        case 'shadow': matchesForm = p.shadow; break;
        case 'purified': matchesForm = p.purified; break;
        case 'perfect': matchesForm = p.perfect; break;
        case 'lucky': matchesForm = p.lucky; break;
        case 'xxl': matchesForm = p.xxl; break;
        case 'xxs': matchesForm = p.xxs; break;
        case 'shiny': matchesForm = p.shiny; break;
        case 'mega': matchesForm = p.mega > 0; break;
        case 'gigamax': matchesForm = p.gigamax; break;
      }
    }

    return matchesQuery && matchesType && matchesStatus && matchesForm;
  }

  // Determina a quale regione appartiene il Pokémon in base a generation e nome
  getPokemonRegion(p: PokedexDTO): string {
    switch (p.generation) {
      case 1: return 'kanto';
      case 2: return 'johto';
      case 3: return 'hoenn';
      case 4: return 'sinnoh';
      case 5: return 'unova';
      case 6: return 'kalos';
      case 7: return 'alola';
      case 8:
        return p.name.toLowerCase().includes('(hisuian)') ? 'hisui' : 'galar';
      case 9: return 'paldea';
      default: return 'kanto';
    }
  }

  // Seleziona la regione attiva per filtrare l'elenco
  selectRegion(regionValue: string) {
    this.selectedRegion.set(regionValue);
  }

  // Tira fuori le forme regionali registrate per un Pokémon base
  getRegionalForms(basePokemon: PokedexDTO): PokedexDTO[] {
    const list = this.pokemonList();
    return list.filter(p => p.id >= 10000 && p.name.startsWith(basePokemon.name + ' ('));
  }

  // Verifica se la specie del Pokémon (compresi eventuali regionali se raggruppati) è completata al 100%
  isSpeciesCompleted(basePokemon: PokedexDTO): boolean {
    const list = this.pokemonList();
    const regionals = this.settingsService.groupRegionals() ? this.getRegionalForms(basePokemon) : [];
    const allForms = [basePokemon, ...regionals];

    for (const p of allForms) {
      // Se il Pokémon non è rilasciato e l'impostazione includeUnreleased è falsa, lo ignoriamo nei progressi completamento
      if (!this.isReleased(p.name) && !this.settingsService.includeUnreleased()) {
        continue;
      }

      const isRegional = p.id >= 10000;

      const checkRegular = isRegional ? this.settingsService.isButtonEnabledForRegional('regular') : true;
      if (checkRegular && !p.regular) return false;

      const checkShiny = isRegional ? this.settingsService.isButtonEnabledForRegional('shiny') : true;
      if (checkShiny && !p.shiny) return false;

      const checkShadow = isRegional ? this.settingsService.isButtonEnabledForRegional('shadow') : true;
      if (checkShadow && this.canShadow(p.name) && !p.shadow) return false;

      const checkPurified = isRegional ? this.settingsService.isButtonEnabledForRegional('purified') : true;
      if (checkPurified && this.canShadow(p.name) && !p.purified) return false;

      const checkPerfect = isRegional ? this.settingsService.isButtonEnabledForRegional('perfect') : true;
      if (checkPerfect && !p.perfect) return false;

      const checkLucky = isRegional ? this.settingsService.isButtonEnabledForRegional('lucky') : true;
      if (checkLucky && !p.lucky) return false;

      const checkXxl = isRegional ? this.settingsService.isButtonEnabledForRegional('xxl') : true;
      if (checkXxl && !p.xxl) return false;

      const checkXxs = isRegional ? this.settingsService.isButtonEnabledForRegional('xxs') : true;
      if (checkXxs && !p.xxs) return false;

      if (this.canMega(p.name)) {
        const checkMega = isRegional ? this.settingsService.isButtonEnabledForRegional('mega') : true;
        if (checkMega) {
          if (this.hasTwoMegas(p.name)) {
            if (p.mega !== 3) return false;
          } else {
            if (!p.mega) return false;
          }
        }
      }

      if (this.canGigamax(p.name)) {
        const checkGiga = isRegional ? this.settingsService.isButtonEnabledForRegional('gigamax') : true;
        if (checkGiga && !p.gigamax) return false;
      }
    }

    return true;
  }

  // Restituisce la forma (DTO) da visualizzare correntemente sulla card
  getActiveForm(basePokemon: PokedexDTO): PokedexDTO {
    if (!this.settingsService.groupRegionals()) {
      return basePokemon; // Mostra solo se stesso se non raggruppati
    }
    const selectedId = this.selectedFormMap()[basePokemon.id];
    if (selectedId) {
      const found = this.pokemonList().find(p => p.id === selectedId);
      if (found) return found;
    }
    return basePokemon; // Default
  }

  // Ottiene l'etichetta abbreviata della regione (es. Base, Alola, Galar, Hisui, Paldea)
  getFormRegion(p: PokedexDTO): string {
    if (p.id < 10000) return 'Base';
    const name = p.name.toLowerCase();
    if (name.includes('alolan')) return this.i18n.translate('region.alola');
    if (name.includes('galarian')) return this.i18n.translate('region.galar');
    if (name.includes('hisuian')) return this.i18n.translate('region.hisui');
    if (name.includes('paldean')) return this.i18n.translate('region.paldea');
    return this.i18n.currentLang() === 'it' ? 'Forma' : 'Form';
  }

  // Ottiene l'etichetta tradotta del tipo Pokémon
  getTypeLabel(typeValue: string): string {
    const itMap: { [key: string]: string } = {
      all: 'Tutti', normal: 'Normale', fire: 'Fuoco', water: 'Acqua', electric: 'Elettro',
      grass: 'Erba', ice: 'Ghiaccio', fighting: 'Lotta', poison: 'Veleno', ground: 'Terra',
      flying: 'Volante', psychic: 'Psico', bug: 'Coleottero', rock: 'Roccia', ghost: 'Spettro',
      dragon: 'Drago', steel: 'Acciaio', fairy: 'Folletto'
    };
    const enMap: { [key: string]: string } = {
      all: 'All', normal: 'Normal', fire: 'Fire', water: 'Water', electric: 'Electric',
      grass: 'Grass', ice: 'Ice', fighting: 'Fighting', poison: 'Poison', ground: 'Ground',
      flying: 'Flying', psychic: 'Psychic', bug: 'Bug', rock: 'Rock', ghost: 'Ghost',
      dragon: 'Dragon', steel: 'Steel', fairy: 'Fairy'
    };
    const lower = typeValue.toLowerCase();
    return this.i18n.currentLang() === 'it' 
      ? (itMap[lower] || typeValue) 
      : (enMap[lower] || typeValue);
  }

  // Cambia la forma attiva per una determinata card
  selectFormForCard(cardId: number, formId: number) {
    this.selectedFormMap.update(map => ({
      ...map,
      [cardId]: formId
    }));
  }

  // Verifica se un certo bottone di azione deve essere visualizzato per il Pokémon corrente
  showButtonForPokemon(p: PokedexDTO, buttonType: string): boolean {
    if (p.id >= 10000 && this.settingsService.groupRegionals()) {
      return this.settingsService.isButtonEnabledForRegional(buttonType);
    }
    return true; // Sempre visibile per i Pokémon base o se il raggruppamento è disattivato
  }

  ngOnInit() {
    this.loadUsers();

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

    // Si iscrive reattivamente all'utente attivo. Quando cambia, ricarica il Pokedex!
    this.sub.add(
      this.userService.activeUser$.subscribe(user => {
        if (user && user.name.toLowerCase() === this.username.toLowerCase()) {
          this.activeUser.set(user);
          this.loadPokedex(user.id);
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  // Carica l'elenco dei giocatori
  loadUsers() {
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.usersList.set(users);

        // Se non c'è ancora un utente attivo nel localStorage, seleziona il primo caricato (es: default seed)
        const currentUser = this.userService.getCurrentUser();
        if (!currentUser && users.length > 0) {
          this.userService.setActiveUser(users[0]);
        }
      },
      error: (err) => console.error('Errore nel recupero degli utenti:', err)
    });
  }

  // Carica i Pokémon specifici dell'utente loggato
  loadPokedex(userId: number) {
    this.isLoading.set(true);
    this.pokedexService.getAllEntries(userId).subscribe({
      next: (data) => {
        this.pokemonList.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Errore nel recupero del Pokedex dell\'utente:', err);
        this.isLoading.set(false);
      }
    });
  }

  // Cambia il profilo giocatore attivo (reindirizzando alla nuova rotta)
  switchUser(user: User) {
    this.router.navigate(['/' + user.name]);
  }

  // Mostra il popup modale per aggiungere un utente
  openNewUserModal() {
    this.newUserName.set('');
    this.showUserModal.set(true);
  }

  // Chiude il modale
  closeNewUserModal() {
    this.showUserModal.set(false);
  }

  // Registra un nuovo profilo giocatore locale
  createNewUser() {
    const name = this.newUserName().trim();
    if (!name) return;

    this.isCreatingUser.set(true);
    this.userService.createUser(name).subscribe({
      next: (newUser) => {
        this.usersList.update(list => [...list, newUser]);
        this.userService.setActiveUser(newUser);

        this.isCreatingUser.set(false);
        this.closeNewUserModal();
      },
      error: (err) => {
        console.error('Errore nella creazione dell\'utente:', err);
        this.isCreatingUser.set(false);
      }
    });
  }

  // Seleziona un tipo dal filtro
  selectType(type: string) {
    this.selectedType.set(type);
  }

  // Seleziona un filtro per forma speciale
  selectFormFilter(form: string) {
    this.selectedFormFilter.set(form);
  }

  // Aggiorna lo stato di cattura di un Pokémon per il giocatore attivo
  toggleForm(pokemon: PokedexDTO, formType: 'regular' | 'shadow' | 'purified' | 'perfect' | 'lucky' | 'xxl' | 'xxs' | 'shiny' | 'gigamax') {
    const user = this.activeUser();
    if (!user) return;

    const updatedPokemon = { ...pokemon };
    (updatedPokemon as any)[formType] = !(updatedPokemon as any)[formType];

    this.pokedexService.updateEntry(user.id, pokemon.id, updatedPokemon).subscribe({
      next: (res) => {
        this.pokemonList.update(list =>
          list.map(p => p.id === pokemon.id ? res : p)
        );
      },
      error: (err) => {
        console.error('Errore nell\'aggiornamento dello stato di cattura:', err);
      }
    });
  }

  formatId(pokemon: PokedexDTO): string {
    let baseId = pokemon.id;
    if (pokemon.id >= 10000) {
      const baseName = pokemon.name.split(' (')[0];
      const basePoke = this.pokemonList().find(p => p.id < 10000 && p.name === baseName);
      if (basePoke) {
        baseId = basePoke.id;
      }
    }
    return '#' + baseId.toString().padStart(3, '0');
  }
}
