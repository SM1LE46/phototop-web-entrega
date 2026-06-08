import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';

import { routes } from './app.routes';
import { API_BASE_URL } from './core/tokens/api-base-url.token';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),

    { provide: API_BASE_URL, useValue: '/api' },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },

    provideAppInitializer(() => {
      const auth = inject(AuthService);
      return auth.me();
    }),
  ],
};