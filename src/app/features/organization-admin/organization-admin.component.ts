import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { KeyValuePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { adminAllowed, staffAllowed } from '../../core/auth/workspace-routing';
import { validGuid } from '../student-assignments/student-assignments.models';
import { AuditPage, AuditRow, Choices, CourseReport, Invitation, LearnerReport, Member, MembersPage, Page, ReviewLink, invitationState, roleText } from './organization-admin.models';

@Component({ selector: 'app-organization-admin', imports: [FormsModule, RouterLink, KeyValuePipe], templateUrl: './organization-admin.component.html' })
export class OrganizationAdminComponent {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly members = signal<MembersPage | null>(null);
  readonly invitations = signal<Page<Invitation> | null>(null);
  readonly choices = signal<Choices | null>(null);
  readonly courses = signal<Page<CourseReport> | null>(null);
  readonly learners = signal<Page<LearnerReport> | null>(null);
  readonly reportTitle = signal('');
  readonly audit = signal<AuditPage | null>(null);
  readonly event = signal<AuditRow | null>(null);
  readonly reviewPaths = signal<Record<string, string>>({});
  readonly checkingReview = signal('');
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly locked = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly roles = [1, 2, 3];
  readonly roleText = roleText;
  readonly invitationState = invitationState;
  pageNumber = 1; pageSize = 20; search = ''; role: number | null = null;
  published = ''; enrollmentStatus: number | null = null;
  fromUtc = ''; toUtc = ''; action = ''; outcome = ''; actorId = ''; resourceId = '';
  memberForm = { email: '', role: 1 }; selectedMember: Member | null = null;
  inviteForm = { email: '', role: 1, reissue: false };
  instructorId = ''; dirty = false;
  private session: SessionResponse | null = null;
  private epoch = 0; private sequence = 0;
  private applied: URLSearchParams | null = null;
  get mode(): string { return this.data()['mode'] as string; }
  get courseId(): string { return this.params().get('courseId') ?? ''; }
  get eventId(): string { return this.params().get('eventId') ?? ''; }
  get isReport(): boolean { return this.mode === 'reports' || this.mode === 'learners'; }
  get isAdmin(): boolean { return adminAllowed(this.auth.state.session()); }
  get currentPage(): { page: number; pageSize: number; total: number } | null {
    return this.members() ?? this.invitations() ?? this.choices()?.choices ?? this.courses() ?? this.learners() ?? this.audit();
  }
  constructor() {
    effect(() => {
      const session = this.auth.state.session(), blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      this.params(); this.data();
      untracked(() => {
        this.epoch++; this.session = null; this.clear(); this.resetFilters(); this.loading.set(false); this.pending.set(false); this.locked.set(false); this.error.set(''); this.notice.set('');
        if (!blocked && session && Date.parse(session.expiresAt) > Date.now() && (this.isReport ? staffAllowed(session) : adminAllowed(session))) {
          this.session = session;
          if ([this.courseId, this.eventId].filter(Boolean).every(validGuid)) void this.load(); else this.error.set('Invalid organization page address.');
        }
      });
    });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (this.shouldWarn()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => { this.epoch++; this.session = null; this.clear(); this.resetFilters(); window.removeEventListener('beforeunload', beforeUnload); });
  }
  private clear(): void {
    this.applied = null;
    this.members.set(null); this.invitations.set(null); this.choices.set(null); this.courses.set(null); this.learners.set(null); this.reportTitle.set(''); this.audit.set(null); this.event.set(null); this.reviewPaths.set({}); this.checkingReview.set('');
    this.memberForm = { email: '', role: 1 }; this.selectedMember = null; this.inviteForm = { email: '', role: 1, reissue: false }; this.instructorId = ''; this.dirty = false;
  }
  private resetFilters(): void { this.pageNumber = 1; this.pageSize = 20; this.search = ''; this.role = null; this.published = ''; this.enrollmentStatus = null; this.fromUtc = ''; this.toUtc = ''; this.action = ''; this.outcome = ''; this.actorId = ''; this.resourceId = ''; }
  private current(epoch: number): boolean { return epoch === this.epoch && !!this.session && this.session === this.auth.state.session() && Date.parse(this.session.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain(); }
  private query(): string {
    if (this.applied) { const saved = new URLSearchParams(this.applied); saved.set('page', String(this.pageNumber)); return '?' + saved.toString(); }
    const params = new URLSearchParams({ page: String(this.pageNumber), pageSize: String(this.pageSize) });
    if (['members', 'instructor', 'reports', 'learners'].includes(this.mode) && this.search) params.set('search', this.search);
    if (this.mode === 'members' && this.role !== null) params.set('role', String(this.role));
    if (this.isReport) { if (this.published) params.set('published', this.published); if (this.enrollmentStatus !== null) params.set('enrollmentStatus', String(this.enrollmentStatus)); }
    if (this.mode === 'audit') {
      if (this.fromUtc) params.set('fromUtc', this.fromUtc + 'Z'); if (this.toUtc) params.set('toUtc', this.toUtc + 'Z');
      if (this.action) params.set('action', this.action); if (this.outcome) params.set('outcome', this.outcome); if (this.actorId) params.set('actorId', this.actorId); if (this.resourceId) params.set('resourceId', this.resourceId);
    }
    this.applied = new URLSearchParams(params);
    return '?' + params.toString();
  }
  async load(): Promise<void> {
    const epoch = this.epoch, sequence = ++this.sequence;
    if (!this.current(epoch)) return;
    this.loading.set(true); this.reviewPaths.set({});
    try {
      const query = this.query();
      switch (this.mode) {
        case 'members': { const p = await firstValueFrom(this.http.get<MembersPage>('/bff/organization/members' + query)); if (this.current(epoch) && sequence === this.sequence) this.members.set(p); break; }
        case 'invitations': { const p = await firstValueFrom(this.http.get<Page<Invitation>>('/bff/organization/invitations' + query)); if (this.current(epoch) && sequence === this.sequence) this.invitations.set(p); break; }
        case 'instructor': { const p = await firstValueFrom(this.http.get<Choices>(`/bff/organization/courses/${this.courseId}/instructor` + query)); if (this.current(epoch) && sequence === this.sequence) this.choices.set(p); break; }
        case 'reports': { const p = await firstValueFrom(this.http.get<{ courses: Page<CourseReport> }>('/bff/staff/reports/courses' + query)); if (this.current(epoch) && sequence === this.sequence) this.courses.set(p.courses); break; }
        case 'learners': { const p = await firstValueFrom(this.http.get<{ report: { course: { title: string }; learners: Page<LearnerReport> } }>(`/bff/staff/reports/courses/${this.courseId}/learners` + query)); if (this.current(epoch) && sequence === this.sequence) { this.learners.set(p.report.learners); this.reportTitle.set(p.report.course.title); } break; }
        case 'audit': {
          const p = await firstValueFrom(this.http.get<AuditPage>('/bff/organization/audit' + query));
          if (this.current(epoch) && sequence === this.sequence) {
            this.audit.set(p);
            // Keep the server-normalized inclusive/exclusive UTC window fixed while paging.
            this.fromUtc = p.filter.fromUtc.replace(/(?:Z|\+00:00)$/, ''); this.toUtc = p.filter.toUtc.replace(/(?:Z|\+00:00)$/, '');
            this.applied?.set('fromUtc', this.fromUtc + 'Z'); this.applied?.set('toUtc', this.toUtc + 'Z');
          }
          break;
        }
        case 'auditDetail': { const p = await firstValueFrom(this.http.get<AuditRow>('/bff/organization/audit/' + this.eventId)); if (this.current(epoch) && sequence === this.sequence) this.event.set(p); break; }
      }
    } catch (error) {
      if (this.current(epoch) && sequence === this.sequence) { this.error.set(this.message(error)); if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) { this.clear(); this.locked.set(true); } }
    } finally { if (this.current(epoch) && sequence === this.sequence) this.loading.set(false); }
  }
  async applyFilters(form: NgForm): Promise<void> {
    if (form.invalid || this.pending() || this.loading()) return;
    if (this.mode === 'audit' && ((this.actorId && !validGuid(this.actorId)) || (this.resourceId && !validGuid(this.resourceId)) || (this.fromUtc && this.toUtc && (Date.parse(this.toUtc + 'Z') <= Date.parse(this.fromUtc + 'Z') || Date.parse(this.toUtc + 'Z') - Date.parse(this.fromUtc + 'Z') > 31 * 86400000)))) { this.error.set('Use valid GUID filters and a UTC range greater than zero and at most 31 days.'); return; }
    this.error.set(''); this.pageNumber = 1; this.applied = null; await this.load();
  }
  async paginate(delta: number): Promise<void> { if (this.pending() || this.loading()) return; this.pageNumber = Math.max(1, (this.currentPage?.page ?? this.pageNumber) + delta); this.error.set(''); await this.load(); }
  changed(): void { this.dirty = true; }
  editMember(member: Member | null): void { if (this.dirty && !window.confirm('Discard unsaved membership values?')) return; this.selectedMember = member; this.memberForm = { email: member?.email ?? '', role: member?.role ?? 1 }; this.dirty = false; }
  async saveMember(form: NgForm): Promise<void> {
    if (form.invalid || this.pending() || this.locked()) return;
    const selected = this.selectedMember;
    if (!window.confirm(selected ? `Change ${selected.email} to ${roleText(this.memberForm.role)}? The server revalidates all role safeguards.` : `Assign existing account ${this.memberForm.email} as ${roleText(this.memberForm.role)} in this organization?`)) return;
    await this.change(selected ? 'PUT' : 'POST', '/bff/organization/members' + (selected ? '/' + selected.userId : ''), { ...(selected ? {} : { email: this.memberForm.email }), role: this.memberForm.role, confirmed: true });
  }
  async invite(form: NgForm): Promise<void> {
    if (form.invalid || this.pending() || this.locked() || !window.confirm(this.inviteForm.reissue ? 'Reissue this invitation? This rotates the secret and invalidates the earlier pending link.' : 'Create and deliver this invitation for the selected organization?')) return;
    await this.change('POST', '/bff/organization/invitations', { ...this.inviteForm, confirmed: true });
  }
  async revoke(invitation: Invitation): Promise<void> { if (this.pending() || this.locked() || !window.confirm(`Revoke the invitation for ${invitation.email}?`)) return; await this.change('POST', '/bff/organization/invitations/' + invitation.id + '/revoke', { confirmed: true }); }
  async assignInstructor(form: NgForm): Promise<void> {
    if (form.invalid || !validGuid(this.instructorId) || this.pending() || this.locked() || !window.confirm('Reassign this course to the selected stored Instructor membership?')) return;
    await this.change('PUT', `/bff/organization/courses/${this.courseId}/instructor`, { instructorId: this.instructorId, confirmed: true });
  }
  private async change(method: string, url: string, body: unknown): Promise<void> {
    const epoch = this.epoch;
    if (!this.current(epoch) || this.pending() || this.loading() || this.locked()) return;
    this.pending.set(true); this.error.set(''); this.notice.set(''); let sent = false;
    try {
      await this.auth.bootstrapCsrf(); if (!this.current(epoch)) return;
      sent = true; await firstValueFrom(this.http.request(method, url, { body }));
      if (this.current(epoch)) { this.dirty = false; this.notice.set(this.mode === 'invitations' ? 'Stored invitation state refreshed. Delivery acceptance is not proof of inbox receipt.' : 'Change saved. Stored state refreshed.'); await this.load(); }
    } catch (error) {
      if (!this.current(epoch)) return;
      this.error.set(this.message(error)); const status = error instanceof HttpErrorResponse ? error.status : 0;
      if ([401, 403, 404].includes(status)) { this.clear(); this.locked.set(true); }
      else if (sent && ![400, 409, 413, 429].includes(status)) { this.locked.set(true); this.notice.set('Outcome uncertain. Only a read-only stored-state check follows. Inspect the member/invitation/course record before leaving and reopening; no mutation or delivery was replayed.'); await this.load(); }
      else if (status === 409) await this.load();
    } finally { if (this.current(epoch)) this.pending.set(false); }
  }
  async checkReview(learner: LearnerReport): Promise<void> {
    const epoch = this.epoch, sequence = this.sequence, link = learner.recentAssignmentReview;
    if (!link || !this.current(epoch) || this.checkingReview() || this.loading()) return;
    this.checkingReview.set(learner.userId); this.error.set('');
    try {
      const query = new URLSearchParams({ sectionId: link.sectionId, lessonId: link.lessonId, assignmentId: link.assignmentId, submissionId: link.submissionId });
      const result = await firstValueFrom(this.http.get<ReviewLink>(`/bff/staff/reports/courses/${this.courseId}/learners/${learner.userId}/assignment-review?` + query));
      if (!this.current(epoch) || sequence !== this.sequence) return;
      if ([result.courseId, result.sectionId, result.lessonId, result.assignmentId, result.submissionId].every(validGuid) && result.courseId === this.courseId && Object.keys(link).every(key => result[key as keyof ReviewLink] === link[key as keyof ReviewLink])) {
        this.reviewPaths.update(paths => ({ ...paths, [learner.userId]: `/workspace/staff/courses/${result.courseId}/sections/${result.sectionId}/lessons/${result.lessonId}/assignments/${result.assignmentId}/submissions/${result.submissionId}` }));
      } else this.error.set('The stored assessment relationship changed. Refresh the report.');
    } catch (error) { if (this.current(epoch) && sequence === this.sequence) { this.error.set(this.message(error)); if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) this.clear(); } }
    finally { if (this.current(epoch)) this.checkingReview.set(''); }
  }
  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse && [400, 409].includes(error.status) && ['conflict', 'validation_failed'].includes(error.error?.code) && typeof error.error?.message === 'string') return error.error.message.slice(0, 1000);
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    return ({ 400: 'Check the exact email, role, confirmation and filter bounds. Entered values are retained.', 401: 'Your session expired. Sign in again.', 403: 'Access denied in this organization.', 404: 'The record or stored parent relationship is unavailable.', 409: 'Account unavailable or this action conflicts with stored state. Review role safeguards and current invitations.', 429: 'Too many requests. Wait before making another explicit request.' } as Record<number, string>)[status] ?? (this.mode === 'invitations' ? 'The service could not confirm this operation. Invitation delivery may be unconfirmed; inspect stored state before any explicit reissue.' : 'The service could not confirm this operation. Refresh stored state before another explicit action.');
  }
  shouldWarn(): boolean { return !!this.session && this.session === this.auth.state.session() && (this.dirty || this.pending()); }
  canLeave(): boolean { return !this.shouldWarn() || window.confirm('Leave and discard unsaved organization values? An in-flight change may still finish.'); }
}
