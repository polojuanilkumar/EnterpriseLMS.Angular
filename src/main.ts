import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { cleanAccountEntry } from './app/core/auth/account-entry';

cleanAccountEntry(window.location, path => window.history.replaceState(null, '', path));

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
