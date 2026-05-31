import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    if ('serviceWorker' in navigator && typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('[PWA] Service Worker registrato con successo!', reg.scope))
          .catch((err) => console.error('[PWA] Registrazione Service Worker fallita:', err));
      });
    }
  })
  .catch((err) => console.error(err));

