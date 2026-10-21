import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService, authErrorMessage } from '../core/auth/auth.service';
import { adminAllowed, staffAllowed, workspaceAllows, workspacePath } from '../core/auth/workspace-routing';
import { BrandComponent } from '../shared/ui/brand/brand.component';

@Component({
  selector: 'app-application-shell',
  imports: [RouterLink, RouterOutlet, BrandComponent],
  template: `
    <div class="min-h-dvh bg-slate-100 text-slate-900">
      <a href="#workspace-content" class="sr-only rounded bg-white p-3 focus:not-sr-only focus:fixed focus:z-50">Skip to content</a>
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-8">
        <app-brand />
        <div class="flex items-center gap-4">
          @if (!auth.checking() && !auth.mutating() && !auth.state.contextUncertain()) {
            <div class="text-right text-sm"><p class="font-semibold">{{ auth.state.session()?.selectedOrganization?.name || 'Platform workspace' }}</p><p class="text-slate-600">{{ role() }}</p></div>
          }
          <button #menuButton type="button" aria-controls="mobile-navigation" [attr.aria-expanded]="menuOpen()" (click)="menuOpen.set(!menuOpen())"
            class="rounded border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-blue-600 md:hidden">Menu</button>
        </div>
      </header>
      @if (menuOpen()) {
        <nav id="mobile-navigation" aria-label="Mobile workspace" (keydown.escape)="menuOpen.set(false); menuButton.focus()" class="border-b bg-white p-4 md:hidden">
          <a [routerLink]="destination()" (click)="menuOpen.set(false)" class="block rounded p-3 font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Workspace overview</a>
          @if (auth.state.session()?.isSuperAdmin) { <a routerLink="/workspace/platform/organizations" class="block rounded p-3 text-blue-700">Platform organizations</a><a routerLink="/workspace/platform/audit" class="block rounded p-3 text-blue-700">Platform/account audit</a> }
          @if (isStaff()) { <a routerLink="/workspace/staff/courses" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Course authoring</a> }
          @if (isStaff()) { <a routerLink="/workspace/staff/reports" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Course reports</a> }
          @if (isAdmin()) { <a routerLink="/workspace/organization/members" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Organization members</a><a routerLink="/workspace/organization/invitations" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Invitations</a><a routerLink="/workspace/organization/audit" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Organization audit</a> }
          @if (isStudent()) {
            <a routerLink="/workspace/student/catalog" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Course catalog</a>
            <a routerLink="/workspace/student/my-courses" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">My Courses</a>
            <a routerLink="/workspace/student/assignments/history" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">My submission history</a>
            <a routerLink="/workspace/student/grades" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">My Grades</a>
          }
          <a routerLink="/organizations" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Switch organization</a>
        </nav>
      }
      <div class="mx-auto flex max-w-7xl">
        <aside class="hidden min-h-[75dvh] w-64 shrink-0 border-r border-slate-200 bg-white p-6 md:block">
          <nav aria-label="Workspace"><a [routerLink]="destination()" class="block rounded-lg bg-blue-50 p-3 font-semibold text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600">Workspace overview</a>
            @if (auth.state.session()?.isSuperAdmin) { <a routerLink="/workspace/platform/organizations" class="block rounded p-3 text-blue-700">Platform organizations</a><a routerLink="/workspace/platform/audit" class="block rounded p-3 text-blue-700">Platform/account audit</a> }
          @if (isStaff()) { <a routerLink="/workspace/staff/courses" class="mt-3 block rounded p-3 text-blue-700">Course authoring</a> }
            @if (isStaff()) { <a routerLink="/workspace/staff/reports" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Course reports</a> }
          @if (isAdmin()) { <a routerLink="/workspace/organization/members" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Organization members</a><a routerLink="/workspace/organization/invitations" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Invitations</a><a routerLink="/workspace/organization/audit" (click)="menuOpen.set(false)" class="block rounded p-3 text-blue-700">Organization audit</a> }
          @if (isStudent()) {
              <a routerLink="/workspace/student/catalog" class="mt-3 block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Course catalog</a>
              <a routerLink="/workspace/student/my-courses" class="mt-3 block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">My Courses</a>
              <a routerLink="/workspace/student/assignments/history" class="mt-3 block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">My submission history</a>
              <a routerLink="/workspace/student/grades" class="mt-3 block rounded p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">My Grades</a>
            }
            <a routerLink="/organizations" class="mt-3 block rounded-lg p-3 text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Switch organization</a></nav>
        </aside>
        <main id="workspace-content" tabindex="-1" class="min-w-0 flex-1 p-5 sm:p-10">
          @if (auth.checking() || auth.mutating()) {
            <p role="status">Verifying your session...</p>
          } @else if (auth.state.contextUncertain()) {
            <p role="status">Organization selection is unconfirmed. Verify your session before continuing.</p>
            <button type="button" (click)="auth.revalidate()" class="mt-4 rounded border px-4 py-2 focus-visible:outline-2 focus-visible:outline-blue-600">Verify session</button>
          } @else {
            <router-outlet />
          }
          <button type="button" (click)="logout()" [disabled]="pending() || auth.mutating() || auth.checking()"
            class="mt-8 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60">{{ pending() ? 'Signing out...' : 'Sign out' }}</button>
          @if (error()) { <p role="alert" class="mt-4 text-red-700">{{ error() }}</p> }
        </main>
      </div>
    </div>
  `,
})
export class ApplicationShellComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly menuOpen = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  private lastSession: ReturnType<AuthService['state']['session']> | undefined;
  readonly role = computed(() => this.auth.state.session()?.isSuperAdmin ? 'SuperAdmin' : this.auth.state.session()?.selectedOrganization?.role ?? 'Account');
  readonly isStudent = computed(() => workspacePath(this.auth.state.session()) === '/workspace/student');
  readonly isAdmin = computed(() => adminAllowed(this.auth.state.session()));
  readonly isStaff = computed(() => staffAllowed(this.auth.state.session()));
  destination(): string { return workspacePath(this.auth.state.session()); }
  constructor() {
    effect(() => {
      // No organization data is cached in the shell. Destroy routed UI while checking a new context.
      const session = this.auth.state.session();
      if (this.auth.checking() || this.auth.mutating()) return;
      if (session !== this.lastSession) {
        this.lastSession = session;
        this.menuOpen.set(false); this.error.set('');
      }
      if (!workspaceAllows(session, this.router.url)) void this.router.navigateByUrl(workspacePath(session));
    });
  }
  async logout(): Promise<void> {
    if (this.pending() || this.auth.mutating() || this.auth.checking()) return;
    this.pending.set(true); this.error.set('');
    try { await this.auth.logout(); }
    catch (error) { this.error.set(authErrorMessage(error)); }
    finally { this.pending.set(false); }
  }
}
