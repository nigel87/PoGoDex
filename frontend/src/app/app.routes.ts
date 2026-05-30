import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/landing/landing').then(m => m.LandingComponent)
  },
  {
    path: ':username',
    loadComponent: () => import('./components/pokedex-list/pokedex-list').then(m => m.PokedexList)
  },
  {
    path: ':username/stats',
    loadComponent: () => import('./components/stats/stats').then(m => m.StatsComponent)
  },
  {
    path: ':username/export',
    loadComponent: () => import('./components/export/export').then(m => m.ExportComponent)
  },
  {
    path: ':username/settings',
    loadComponent: () => import('./components/settings/settings').then(m => m.SettingsComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
