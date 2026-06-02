import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { PokedexService } from './services/pokedex.service';
import { authInterceptor } from './services/auth.interceptor';

import { routes } from './app.routes';

export function initializeApp(pokedexService: PokedexService) {
  return () => pokedexService.loadConfig();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [PokedexService],
      multi: true
    }
  ]
};
