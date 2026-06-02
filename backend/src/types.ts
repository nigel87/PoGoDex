export interface User {
  id?: number;
  name: string;
  email?: string | null;
  googleId?: string | null;
  avatarUrl?: string | null;
  lastUpdated?: number;
  googleSubId?: string | null;
  isProtected?: number;
  privacyMode?: 'public_edit' | 'public_readonly' | 'private';
}

export interface Pokemon {
  id: number;
  name: string;
  type1: string;
  type2?: string | null;
  generation: number;
  spriteUrl: string;
  megaVarietyId?: number | null;
  megaVarietyId2?: number | null;
  gigamaxVarietyId?: number | null;
  parentId?: number | null;
}

export interface PokedexEntry {
  userId: number;
  pokemonId: number;
  regular: boolean;
  shadow: boolean;
  purified: boolean;
  perfect: boolean;
  lucky: boolean;
  xxs: boolean;
  xxl: boolean;
  shiny: boolean;
  mega: number;
  gigamax: boolean;
}

export interface PokedexDTO {
  id: number;
  name: string;
  type1: string;
  type2: string | null;
  generation: number;
  spriteUrl: string;
  regular: boolean;
  shadow: boolean;
  purified: boolean;
  perfect: boolean;
  lucky: boolean;
  xxs: boolean;
  xxl: boolean;
  shiny: boolean;
  mega: number;
  gigamax: boolean;
  megaVarietyId?: number | null;
  megaVarietyId2?: number | null;
  gigamaxVarietyId?: number | null;
  parentId?: number | null;
}

export interface PokedexStats {
  total: number;
  regularCaught: number;
  shadowCaught: number;
  purifiedCaught: number;
  perfectCaught: number;
  luckyCaught: number;
  xxsCaught: number;
  xxlCaught: number;
  shinyCaught: number;
  megaCaught: number;
  gigamaxCaught: number;
}
