import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { APP_BASE_HREF } from '@angular/common';
import { environment } from '../environments/environment';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { bffInterceptor } from './core/http/bff.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: APP_BASE_HREF, useValue: environment.baseHref },
    provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes),
    provideHttpClient(withNoXsrfProtection(), withInterceptors([bffInterceptor])),
    provideAppInitializer(() => inject(AuthService).restore()),
  ]
};
