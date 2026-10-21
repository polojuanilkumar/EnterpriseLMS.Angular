import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AntiforgeryResponse, LoginRequest, LoginResponse, OrganizationOption, SessionResponse } from './auth.models';
import { AuthState } from './auth-state';
import { workspaceAllows, workspacePath } from './workspace-routing';

export function authErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 400: return error.error?.code === 'csrf_validation_failed'
        ? 'Your security check expired. Please try again.' : 'Check your email and password values.';
      case 401: return 'Sign-in was not accepted. Check your credentials or sign in again.';
      case 403: return 'You do not have access to this resource.';
      case 429: return 'Too many requests. Please wait before trying again.';
    }
  }
  // Never display upstream response bodies, exception details or submitted credentials.
  return 'The service could not confirm the request. Reload to check your session before trying again.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly state = inject(AuthState);
  readonly checking = signal(false);
  readonly mutating = signal(false);

  constructor() {
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    const resume = () => {
      if (document.visibilityState === 'visible') void this.revalidate();
    };
    window?.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    inject(DestroyRef).onDestroy(() => {
      window?.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    });
  }

  async revalidate(): Promise<void> {
    if (!this.state.session() || this.checking() || this.mutating()) return;
    this.checking.set(true);
    try {
      await this.readSession();
      await this.bootstrapCsrf();
      if (this.router.url !== '/organizations' && !this.router.url.startsWith('/account/') && !workspaceAllows(this.state.session(), this.router.url))
        await this.router.navigateByUrl(workspacePath(this.state.session()));
    } catch (error) {
      this.state.clear(authErrorMessage(error));
      await this.router.navigateByUrl('/login');
    } finally { this.checking.set(false); }
  }

  organizations(): Promise<OrganizationOption[]> {
    return firstValueFrom(this.http.get<OrganizationOption[]>('/bff/organizations'));
  }

  async selectOrganization(organizationId: string): Promise<void> {
    if (this.mutating() || this.checking()) throw new Error('A session operation is pending');
    this.mutating.set(true);
    try {
      await this.bootstrapCsrf();
      this.state.contextUncertain.set(true);
      const session = await firstValueFrom(this.http.post<SessionResponse>('/bff/organization', { organizationId }));
      this.state.setCsrf(null);
      this.state.accept(session, () => { void this.router.navigateByUrl('/login'); });
      await this.bootstrapCsrf();
      await this.router.navigateByUrl(workspacePath(this.state.session()));
    } finally { this.mutating.set(false); }
  }

  async bootstrapCsrf(): Promise<void> {
    this.state.setCsrf(null);
    const response = await firstValueFrom(this.http.get<AntiforgeryResponse>('/bff/antiforgery'));
    if (response.headerName !== 'X-CSRF-TOKEN' || !response.requestToken) throw new Error('Invalid security response');
    this.state.setCsrf(response.requestToken);
  }

  async readSession(): Promise<void> {
    const session = await firstValueFrom(this.http.get<SessionResponse>('/bff/session'));
    this.state.accept(session, () => { void this.router.navigateByUrl('/login'); });
  }

  async restore(): Promise<void> {
    try {
      await this.readSession();
    } catch (error) {
      this.state.clear(error instanceof HttpErrorResponse && error.status === 401 ? '' : authErrorMessage(error));
    }
    // Bind CSRF to whichever identity survived restoration. A later mutation bootstraps again if needed.
    try { await this.bootstrapCsrf(); }
    catch { this.state.setCsrf(null); this.state.notice.set('The security connection is unavailable. Please try again later.'); }
  }

  async login(credentials: LoginRequest): Promise<void> {
    await this.bootstrapCsrf();
    await firstValueFrom(this.http.post<LoginResponse>('/bff/login', credentials));
    this.state.clear();
    await this.bootstrapCsrf(); // The anonymous request token is no longer valid after sign-in.
    await this.readSession();
  }

  async logout(): Promise<void> {
    if (this.mutating() || this.checking()) throw new Error('A session operation is pending');
    this.mutating.set(true);
    try {
      await this.bootstrapCsrf();
      await firstValueFrom(this.http.post<void>('/bff/logout', {}));
      this.state.clear();
      // The mutation has completed; never repeat it if refreshing the anonymous CSRF token fails.
      try { await this.bootstrapCsrf(); }
      catch { this.state.setCsrf(null); }
      await this.router.navigateByUrl('/login');
    } finally { this.mutating.set(false); }
  }
}
