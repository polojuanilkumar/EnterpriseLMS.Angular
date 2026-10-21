import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, authErrorMessage } from '../../../core/auth/auth.service';
import { BrandComponent } from '../../../shared/ui/brand/brand.component';

@Component({
  selector: 'app-session',
  imports: [BrandComponent, RouterLink],
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10 text-slate-900">
      <section class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm" aria-labelledby="session-title">
        <app-brand />
        <h1 id="session-title" class="mt-8 text-2xl font-bold">You are signed in</h1>
        <p class="mt-3 leading-6 text-slate-600">Your account session is active. Organization selection is the next step. Choose an authorized organization to enter your workspace.</p>
        @if (auth.state.session()?.recoveryCode === 'organization_selection_cleared') {
          <p role="status" class="mt-4 text-sm text-slate-700">Your previous organization access is no longer available. Your account remains signed in.</p>
        }
        <a routerLink="/organizations" class="mt-6 block rounded text-blue-700 underline focus-visible:outline-2 focus-visible:outline-blue-600">Choose organization</a>
        <button type="button" (click)="logout()" [disabled]="pending()"
          class="mt-6 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">
          {{ pending() ? 'Signing out…' : 'Sign out' }}
        </button>
        <p role="alert" class="mt-4 text-sm text-red-700">{{ error() }}</p>
      </section>
    </main>
  `,
})
export class SessionComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly pending = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => { if (!this.auth.state.session()) void this.router.navigateByUrl('/login'); });
  }

  async logout(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    try { await this.auth.logout(); }
    catch (error) { this.error.set(authErrorMessage(error)); }
    finally { this.pending.set(false); }
  }
}
