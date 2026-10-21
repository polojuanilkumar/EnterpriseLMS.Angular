import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { AuditPage, AuditRow, Page } from '../organization-admin/organization-admin.models';
interface Organization { id: string; name: string; code: string; isActive: boolean; }
@Component({ selector: 'app-platform', imports: [FormsModule, RouterLink], templateUrl: './platform.component.html' })
export class PlatformComponent {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly organizations = signal<Page<Organization> | null>(null);
  readonly audit = signal<AuditPage | null>(null);
  readonly event = signal<(AuditRow & { scope: string }) | null>(null);
  readonly loading = signal(false); readonly pending = signal(false); readonly locked = signal(false);
  readonly error = signal(''); readonly notice = signal('');
  form = { code: '', name: '', initialAdminEmail: '' };
  page = 1; pageSize = 20; search = ''; fromUtc = ''; toUtc = ''; action = ''; outcome = ''; actorId = ''; resourceId = '';
  private epoch = 0; private sequence = 0; private session: SessionResponse | null = null;
  private filters: URLSearchParams | null = null;
  get mode(): string { return this.data()['mode'] as string; }
  get eventId(): string { return this.params().get('eventId') ?? ''; }
  get pagination(): { page: number; pageSize: number; total: number } | null { return this.organizations() ?? this.audit(); }
  constructor() {
    effect(() => {
      const session = this.auth.state.session(), blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      this.params(); this.data();
      untracked(() => {
        this.epoch++; this.session = null; this.organizations.set(null); this.audit.set(null); this.event.set(null); this.form = { code: '', name: '', initialAdminEmail: '' };
        this.page = 1; this.filters = null; this.search = ''; this.fromUtc = ''; this.toUtc = ''; this.actorId = ''; this.resourceId = ''; this.action = ''; this.outcome = '';
        this.loading.set(false); this.pending.set(false); this.locked.set(false); this.error.set(''); this.notice.set('');
        if (!blocked && session?.isSuperAdmin && Date.parse(session.expiresAt) > Date.now()) { this.session = session; void this.load(); }
      });
    });
    inject(DestroyRef).onDestroy(() => { this.epoch++; this.session = null; this.organizations.set(null); this.audit.set(null); this.event.set(null); this.form = { code: '', name: '', initialAdminEmail: '' }; });
  }
  private current(epoch: number): boolean { return epoch === this.epoch && this.session !== null && this.session === this.auth.state.session() && Date.parse(this.session.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain(); }
  async load(): Promise<void> {
    const epoch = this.epoch, sequence = ++this.sequence;
    if (!this.current(epoch)) return;
    this.loading.set(true); this.organizations.set(null); this.audit.set(null); this.event.set(null);
    try {
      if (!this.filters) {
        this.filters = new URLSearchParams({ pageSize: String(this.pageSize) });
        if (this.mode === 'organizations' && this.search) this.filters.set('search', this.search);
        if (this.mode === 'audit') {
          if (this.fromUtc) this.filters.set('fromUtc', this.fromUtc + 'Z'); if (this.toUtc) this.filters.set('toUtc', this.toUtc + 'Z');
          for (const [key, value] of Object.entries({ action: this.action, outcome: this.outcome, actorId: this.actorId, resourceId: this.resourceId })) if (value) this.filters.set(key, value);
        }
      }
      const query = new URLSearchParams(this.filters); query.set('page', String(this.page));
      if (this.mode === 'organizations') {
        const p = await firstValueFrom(this.http.get<{ data: Page<Organization> }>('/bff/platform/organizations?' + query));
        if (this.current(epoch) && sequence === this.sequence) this.organizations.set(p.data);
      } else if (this.eventId) {
        if (!/^[a-f0-9-]{36}$/i.test(this.eventId)) throw new Error('Invalid event');
        const row = await firstValueFrom(this.http.get<AuditRow & { scope: string }>('/bff/platform/audit/' + this.eventId));
        if (this.current(epoch) && sequence === this.sequence) this.event.set(row);
      } else {
        const p = await firstValueFrom(this.http.get<AuditPage>('/bff/platform/audit?' + query));
        if (this.current(epoch) && sequence === this.sequence) {
          this.audit.set(p); this.fromUtc = p.filter.fromUtc.replace(/(?:Z|\+00:00)$/, ''); this.toUtc = p.filter.toUtc.replace(/(?:Z|\+00:00)$/, '');
          this.filters.set('fromUtc', this.fromUtc + 'Z'); this.filters.set('toUtc', this.toUtc + 'Z');
        }
      }
    } catch (error) {
      if (this.current(epoch) && sequence === this.sequence) {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        this.error.set(status === 403 ? 'Platform access denied.' : status === 404 ? 'Audit event unavailable.' : status === 400 ? 'Check filter bounds, identifiers and the UTC window (maximum 31 days).' : status === 429 ? 'Too many requests. Wait before another action.' : 'Platform service unavailable. No action was retried.');
      }
    } finally { if (this.current(epoch) && sequence === this.sequence) this.loading.set(false); }
  }
  filter(form: NgForm): void { if (form.invalid || this.pending() || this.loading()) return; this.filters = null; this.page = 1; this.error.set(''); void this.load(); }
  move(delta: number): void { const p = this.pagination; if (this.pending() || this.loading() || !p || this.page + delta < 1 || (this.page + delta - 1) * p.pageSize >= p.total) return; this.page += delta; void this.load(); }
  async create(form: NgForm): Promise<void> {
    if (form.invalid || this.pending() || this.loading() || this.locked() || !this.current(this.epoch)) return;
    if (!window.confirm('Create this organization and atomically assign the exact-email account as its initial Admin? This does not grant you membership or select the organization.')) return;
    const epoch = this.epoch, body = { ...this.form, confirmed: true }; this.pending.set(true); this.error.set('');
    try {
      await this.auth.bootstrapCsrf(); if (!this.current(epoch)) return;
      await firstValueFrom(this.http.post('/bff/platform/organizations', body)); if (!this.current(epoch)) return;
      this.form = { code: '', name: '', initialAdminEmail: '' }; this.notice.set('Organization created with its initial Admin. Select it explicitly to enter its administration.'); await this.load();
    } catch (error) {
      if (!this.current(epoch)) return;
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      if ([400, 409, 429].includes(status)) this.error.set(status === 429 ? 'Too many requests. Wait before another action.' : 'Code is in use, values are invalid, or exact-email initial Admin assignment is unavailable. Entered values were retained.');
      else {
        this.locked.set(true); this.error.set('Creation outcome is uncertain. Search stored organizations by code before another request; creation was not retried.');
        this.search = body.code; this.filters = null; this.page = 1; await this.load();
      }
    } finally { if (this.current(epoch)) this.pending.set(false); }
  }
  async select(id: string): Promise<void> {
    if (this.pending() || this.loading()) return;
    this.pending.set(true);
    try { await this.auth.selectOrganization(id); }
    catch { this.error.set('Selection could not be confirmed. Verify your session before continuing.'); }
    finally { this.pending.set(false); }
  }
}
