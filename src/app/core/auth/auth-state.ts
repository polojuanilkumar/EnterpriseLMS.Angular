import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SessionResponse } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthState {
  private readonly current = signal<SessionResponse | null>(null);
  readonly session = this.current.asReadonly();
  readonly notice = signal('');
  readonly contextUncertain = signal(false);
  private csrf: string | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.expiryTimer));
  }

  csrfToken(): string | null { return this.csrf; }
  setCsrf(token: string | null): void { this.csrf = token; }

  clear(message = ''): void {
    clearTimeout(this.expiryTimer);
    this.current.set(null);
    this.contextUncertain.set(false);
    this.csrf = null;
    this.notice.set(message);
  }

  accept(session: SessionResponse, onExpired: () => void): void {
    const remaining = Date.parse(session.expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      this.clear('Your session has expired. Please sign in again.');
      onExpired();
      return;
    }
    clearTimeout(this.expiryTimer);
    // Keep only the documented, non-secret session metadata in memory.
    this.contextUncertain.set(false);
    this.current.set({
      userId: session.userId, expiresAt: session.expiresAt,
      selectedOrganization: session.selectedOrganization ? {
        id: session.selectedOrganization.id, role: session.selectedOrganization.role,
        name: session.selectedOrganization.name, code: session.selectedOrganization.code,
      } : null,
      isSuperAdmin: session.isSuperAdmin, requiresOrganizationSelection: session.requiresOrganizationSelection,
      homePath: session.homePath, recoveryCode: session.recoveryCode,
    });
    this.notice.set('');
    this.expiryTimer = setTimeout(() => {
      this.clear('Your session has expired. Please sign in again.');
      onExpired();
    }, Math.min(remaining, 2_147_483_647));
  }
}
