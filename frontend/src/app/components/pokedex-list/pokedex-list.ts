import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PokedexService, PokedexDTO } from '../../services/pokedex.service';
import { UserService, User } from '../../services/user.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-pokedex-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
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
    { value: 'all', label: 'Tutte le Regioni' },
    { value: 'kanto', label: 'Kanto' },
    { value: 'johto', label: 'Johto' },
    { value: 'hoenn', label: 'Hoenn' },
    { value: 'sinnoh', label: 'Sinnoh' },
    { value: 'unova', label: 'Unova' },
    { value: 'kalos', label: 'Kalos' },
    { value: 'alola', label: 'Alola' },
    { value: 'galar', label: 'Galar' },
    { value: 'hisui', label: 'Hisui' },
    { value: 'paldea', label: 'Paldea' }
  ];

  // Subscriptions per evitare leak di memoria
  private sub = new Subscription();

  // Elenco completo dei tipi per i filtri grafici
  pokemonTypes = [
    { value: 'all', label: 'Tutti' },
    { value: 'normal', label: 'Normale' },
    { value: 'fire', label: 'Fuoco' },
    { value: 'water', label: 'Acqua' },
    { value: 'electric', label: 'Elettro' },
    { value: 'grass', label: 'Erba' },
    { value: 'ice', label: 'Ghiaccio' },
    { value: 'fighting', label: 'Lotta' },
    { value: 'poison', label: 'Veleno' },
    { value: 'ground', label: 'Terra' },
    { value: 'flying', label: 'Volante' },
    { value: 'psychic', label: 'Psico' },
    { value: 'bug', label: 'Coleottero' },
    { value: 'rock', label: 'Roccia' },
    { value: 'ghost', label: 'Spettro' },
    { value: 'dragon', label: 'Drago' },
    { value: 'steel', label: 'Acciaio' },
    { value: 'fairy', label: 'Folletto' }
  ];

  specialForms = [
    { value: 'all', label: 'Qualsiasi' },
    { value: 'shiny', label: 'Cromatici (Shiny)' }, // Aggiunto filtro Shiny!
    { value: 'shadow', label: 'Shadow' },
    { value: 'purified', label: 'Purificati' },
    { value: 'perfect', label: '100% IV' },
    { value: 'lucky', label: 'Lucky' },
    { value: 'xxl', label: 'XXL' },
    { value: 'xxs', label: 'XXS' },
    { value: 'mega', label: 'Mega' },
    { value: 'gigamax', label: 'Gigamax' }
  ];

  // Mappa reattiva per tracciare la forma regional selezionata per ogni card (base ID -> forma ID)
  selectedFormMap = signal<{ [key: number]: number }>({});

  // Specie idonee alle forme Mega e Gigamax in Pokémon GO
  megaCapableSpecies = ['Venusaur', 'Charizard', 'Blastoise', 'Beedrill', 'Pidgeot', 'Alakazam', 'Slowbro', 'Gengar', 'Kangaskhan', 'Pinsir', 'Gyarados', 'Aerodactyl', 'Mewtwo', 'Ampharos', 'Steelix', 'Scizor', 'Heracross', 'Houndoom', 'Tyranitar', 'Sceptile', 'Blaziken', 'Swampert', 'Gardevoir', 'Sableye', 'Mawile', 'Aggron', 'Medicham', 'Manectric', 'Sharpedo', 'Camerupt', 'Altaria', 'Banette', 'Absol', 'Glalie', 'Salamence', 'Metagross', 'Latias', 'Latios', 'Rayquaza', 'Lopunny', 'Lucario', 'Abomasnow', 'Gallade', 'Audino', 'Diancie', 'Kyogre', 'Groudon'];
  gigamaxCapableSpecies = ['Venusaur', 'Charizard', 'Blastoise', 'Butterfree', 'Pikachu', 'Meowth', 'Machamp', 'Gengar', 'Kingler', 'Lapras', 'Eevee', 'Snorlax', 'Garbodor', 'Melmetal', 'Rillaboom', 'Cinderace', 'Inteleon', 'Corviknight', 'Orbeetle', 'Drednaw', 'Coalossal', 'Flapple', 'Appletun', 'Sandaconda', 'Toxtricity', 'Centiskorch', 'Hatterene', 'Grimmsnarl', 'Alcremie', 'Duraludon', 'Urshifu'];

  canMega(name: string): boolean {
    const baseName = name.split(' (')[0];
    return this.megaCapableSpecies.includes(baseName);
  }

  canGigamax(name: string): boolean {
    const baseName = name.split(' (')[0];
    return this.gigamaxCapableSpecies.includes(baseName);
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
    private router: Router
  ) {}
 
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
      const isRegional = p.id >= 10000;
      
      const checkRegular = isRegional ? this.settingsService.isButtonEnabledForRegional('regular') : true;
      if (checkRegular && !p.regular) return false;

      const checkShiny = isRegional ? this.settingsService.isButtonEnabledForRegional('shiny') : true;
      if (checkShiny && !p.shiny) return false;

      const checkShadow = isRegional ? this.settingsService.isButtonEnabledForRegional('shadow') : true;
      if (checkShadow && !p.shadow) return false;

      const checkPurified = isRegional ? this.settingsService.isButtonEnabledForRegional('purified') : true;
      if (checkPurified && !p.purified) return false;

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
    if (name.includes('alolan')) return 'Alola';
    if (name.includes('galarian')) return 'Galar';
    if (name.includes('hisuian')) return 'Hisui';
    if (name.includes('paldean')) return 'Paldea';
    return 'Forma';
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
