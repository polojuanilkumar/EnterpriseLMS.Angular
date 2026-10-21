import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { rejectedAccountPath } from '../../core/auth/account-entry';

interface Invitation { email: string; organization: string; role: number; existingAccount: boolean; }
@Component({ selector: 'app-account', imports: [FormsModule, RouterLink], templateUrl: './account.component.html' })
export class AccountComponent {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly preview = signal<Invitation | null>(null);
  readonly available = signal(false);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly locked = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  email = ''; password = ''; firstName = ''; lastName = ''; loginPassword = '';
  private epoch = 0;
  private completedMode = '';
  private completedMessage = '';
  get mode(): string { return this.data()['mode'] as string; }
  constructor() {
    // A raw token is accepted only by the server entry route, never by the SPA.
    const unsafeEntry = (this.route.snapshot.queryParamMap?.has('token') ?? false)
      || !!rejectedAccountPath?.endsWith('/account/' + this.mode);
    if (unsafeEntry) window.history.replaceState(null, '', window.location.pathname);
    effect(() => {
      this.data(); this.auth.state.session(); this.auth.checking(); this.auth.mutating();
      untracked(() => {
        this.epoch++; this.clear(); this.pending.set(false); this.locked.set(false); this.loading.set(false);
        this.error.set(''); this.message.set('');
        if (this.completedMode === this.mode) { this.locked.set(true); this.message.set(this.completedMessage); }
        else if (unsafeEntry) { this.locked.set(true); this.error.set('Open the original email link using its configured server entry address. This page cannot accept tokens.'); }
        else if (!this.auth.checking() && !this.auth.mutating()) void this.load();
      });
    });
    inject(DestroyRef).onDestroy(() => { this.epoch++; this.clear(); });
  }
  private clear(): void { this.preview.set(null); this.available.set(false); this.email = ''; this.password = ''; this.loginPassword = ''; this.firstName = ''; this.lastName = ''; }
  private current(epoch: number): boolean { return epoch === this.epoch && !this.auth.checking() && !this.auth.mutating(); }
  async load(): Promise<void> {
    const epoch = this.epoch;
    if (this.mode === 'forgot-password') return;
    this.loading.set(true); this.preview.set(null); this.available.set(false);
    try {
      if (this.mode === 'invitation') {
        const p = await firstValueFrom(this.http.get<Invitation>('/bff/account/invitation'));
        if (this.current(epoch)) this.preview.set(p);
      } else {
        await firstValueFrom(this.http.get('/bff/account/reset-password'));
        if (this.current(epoch)) this.available.set(true);
      }
    } catch (error) {
      if (this.current(epoch)) this.error.set(error instanceof HttpErrorResponse && error.status === 429 ? 'Too many requests. Wait before checking again.' : 'Link unavailable, expired, revoked or already used. Reopen the original email or request a new link. If an action was uncertain, check your organization list or try signing in before doing anything else.');
    } finally { if (this.current(epoch)) this.loading.set(false); }
  }
  async signIn(form: NgForm): Promise<void> {
    if (form.invalid || this.pending()) return;
    this.pending.set(true); this.error.set('');
    const password = this.loginPassword; this.loginPassword = '';
    try { await this.auth.login({ email: this.preview()?.email ?? '', password }); }
    catch { this.error.set('Sign-in was not accepted. Use the matching verified account.'); }
    finally { this.loginPassword = ''; this.pending.set(false); }
  }
  async submit(form: NgForm): Promise<void> {
    if (form.invalid || this.pending() || this.loading() || this.locked()) return;
    if (this.mode === 'invitation' && (!this.preview() || this.preview()!.existingAccount && !this.auth.state.session())) return;
    if (this.mode === 'reset-password' && !this.available()) return;
    if (this.mode === 'invitation' && !window.confirm('Accept this invitation and its organization membership? This is a final action.')) return;
    const epoch = this.epoch, mode = this.mode;
    const body = mode === 'forgot-password' ? { email: this.email } : mode === 'reset-password' ? { password: this.password } : { firstName: this.firstName, lastName: this.lastName, password: this.password, confirmed: true };
    this.pending.set(true); this.error.set(''); this.password = ''; this.loginPassword = '';
    try {
      await this.auth.bootstrapCsrf();
      if (!this.current(epoch)) return;
      await firstValueFrom(this.http.post('/bff/account/' + mode, body));
      if (!this.current(epoch)) return;
      this.locked.set(true); this.preview.set(null); this.available.set(false);
      this.message.set(mode === 'forgot-password' ? 'If the account is eligible, password recovery instructions will be sent.' : mode === 'invitation' ? 'Invitation accepted. Sign in and select your organization. Refresh your organization list if already signed in.' : 'Password reset. Sign in again with your new password.');
      if (mode === 'reset-password') {
        this.completedMode = mode; this.completedMessage = 'Password reset. Sign in again with your new password.';
        this.auth.state.clear();
        // Preserve the success message across the anonymous transition; rotate CSRF without replaying reset.
        try { await this.auth.bootstrapCsrf(); } catch { /* Sign-in bootstraps again. */ }
        this.locked.set(true); this.message.set('Password reset. Sign in again with your new password.');
      }
    } catch (error) {
      if (!this.current(epoch)) return;
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      this.locked.set(mode !== 'forgot-password' || ![400, 429].includes(status));
      this.error.set(status === 429 ? 'Too many requests. Wait before another action.' : status === 409 ? 'The account or membership conflicts with stored state. Ask an administrator to inspect the invitation.' : 'The action was denied or its outcome is uncertain. Do not replay it. Check stored state, try signing in, or request a new link.');
      if (mode !== 'forgot-password') await this.load(); // Read only; never replay acceptance/reset.
    } finally {
      this.password = ''; this.loginPassword = '';
      if (this.current(epoch)) this.pending.set(false);
    }
  }
}
