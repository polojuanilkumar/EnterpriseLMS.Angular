import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { OrganizationOption } from '../../core/auth/auth.models';
import { BrandComponent } from '../../shared/ui/brand/brand.component';
import { workspacePath } from '../../core/auth/workspace-routing';

@Component({
  selector: 'app-organization-chooser',
  imports: [RouterLink, BrandComponent],
  template: `
    <main class="min-h-dvh bg-slate-100 px-4 py-10 text-slate-900">
      <section class="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10" aria-labelledby="chooser-title">
        <app-brand />
        <h1 id="chooser-title" class="mt-8 text-2xl font-bold">Choose an organization</h1>
        <p class="mt-3 text-slate-600">Select the organization you want to work in. Access is checked when you select it.</p>
        @if (auth.state.session()?.recoveryCode === 'organization_selection_cleared') {
          <p role="status" class="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900">Your previous organization access is no longer available. Your account remains signed in. Choose another organization.</p>
        }
        @if (auth.checking() || loading()) {
          <p role="status" class="mt-6">Checking available organizations...</p>
        } @else {
          @if (error()) {
            <p role="alert" class="mt-6 text-red-700">{{ error() }}</p>
            <button type="button" (click)="load()" [disabled]="pending()" class="mt-3 rounded border px-4 py-2 focus-visible:outline-2 focus-visible:outline-blue-600">Reload organizations</button>
          } @else if (organizations().length === 0) {
            <p role="status" class="mt-6">No active organizations are available to your account. Contact your administrator.</p>
          } @else {
            <ul class="mt-6 space-y-3" aria-label="Available organizations">
              @for (organization of organizations(); track organization.id) {
                <li>
                  <button type="button" (click)="select(organization.id)" [disabled]="pending() || auth.mutating()"
                    class="w-full rounded-xl border border-slate-300 p-4 text-left hover:border-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">
                    <span class="block font-semibold">{{ organization.name }}</span>
                    <span class="text-sm text-slate-600">{{ organization.code }}</span>
                    <span class="mt-2 block text-sm font-semibold text-blue-700">{{ pending() === organization.id ? 'Selecting...' : 'Select organization' }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        }
        @if (selectionError()) { <p role="alert" class="mt-4 text-red-700">{{ selectionError() }}</p> }
        @if (auth.state.contextUncertain()) {
          <p role="status" class="mt-4 text-slate-700">Organization selection is unconfirmed. Previous workspace content is hidden until you reload or verify the session.</p>
          <button type="button" (click)="auth.revalidate()" [disabled]="auth.checking() || !!pending()" class="mt-3 rounded border px-4 py-2 focus-visible:outline-2 focus-visible:outline-blue-600">Verify session</button>
        } @else if (auth.state.session()?.selectedOrganization || auth.state.session()?.isSuperAdmin) {
          <a [routerLink]="destination()" class="mt-6 inline-block rounded text-blue-700 underline focus-visible:outline-2 focus-visible:outline-blue-600">Back to workspace</a>
        }
        <button type="button" (click)="logout()" [disabled]="!!pending() || auth.mutating() || auth.checking()"
          class="mt-6 ml-4 rounded px-3 py-2 text-blue-700 underline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60">Sign out</button>
      </section>
    </main>
  `,
})
export class OrganizationChooserComponent {
  readonly auth = inject(AuthService);
  readonly organizations = signal<OrganizationOption[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selectionError = signal('');
  readonly pending = signal<string | null>(null);
  private generation = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => { ++this.generation; this.organizations.set([]); });
    effect(() => {
      // Each verified session refresh discards the previous discovery list, including cross-tab changes.
      const session = this.auth.state.session();
      const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      untracked(() => {
        ++this.generation; this.organizations.set([]); this.loading.set(false); this.error.set('');
        if (session && !blocked) void this.load();
      });
    });
  }
  destination(): string { return workspacePath(this.auth.state.session()); }
  async load(): Promise<void> {
    const session = this.auth.state.session();
    const current = () => session !== null && this.auth.state.session() === session
      && Date.parse(session.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain();
    if (!current()) return;
    const generation = ++this.generation;
    this.organizations.set([]); this.loading.set(true); this.error.set('');
    try {
      const organizations = await this.auth.organizations();
      if (generation === this.generation && current()) this.organizations.set(organizations);
    } catch {
      if (generation === this.generation && current()) this.error.set('Available organizations could not be loaded. Please try again.');
    } finally { if (generation === this.generation && current()) this.loading.set(false); }
  }
  async select(id: string): Promise<void> {
    if (this.pending() || this.auth.checking() || this.auth.mutating()) return;
    this.pending.set(id); this.selectionError.set('');
    try { await this.auth.selectOrganization(id); }
    catch { this.selectionError.set('Selection could not be confirmed. Reload to check your session before trying again.'); }
    finally { this.pending.set(null); }
  }
  async logout(): Promise<void> {
    if (this.pending() || this.auth.mutating() || this.auth.checking()) return;
    this.pending.set('logout'); this.selectionError.set('');
    try { await this.auth.logout(); }
    catch { this.selectionError.set('Sign-out could not be confirmed. Reload to check your session before trying again.'); }
    finally { this.pending.set(null); }
  }
}
