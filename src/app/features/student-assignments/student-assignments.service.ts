import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { AssignmentData, AssignmentLocation, assignmentUrl, submissionValidation } from './student-assignments.models';
export function assignmentError(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  return status === 401 ? 'Your session has expired. Sign in again.' : status === 403 ? 'Access denied. Check your organization and enrollment; Cancelled enrollments cannot review work.' :
    status === 404 ? 'This assignment or submission is unavailable for this account and parent lesson.' : status === 409 ? 'Final submission conflicts with stored state or the server deadline. Check your stored submission; resubmission and late overrides are unavailable.' :
    status === 400 || status === 413 ? 'Submission was rejected. Check confirmation, text limits and the single PDF limit of 25 MiB. The server validates its contents.' :
    'The outcome could not be confirmed. Inspect stored submission state before deciding what to do next. No upload was automatically replayed.';
}
@Injectable()
export class StudentAssignmentsService {
  private readonly http = inject(HttpClient); private readonly auth = inject(AuthService);
  readonly data = signal<AssignmentData | null>(null); readonly loading = signal(false); readonly pending = signal(false);
  readonly error = signal(''); readonly notice = signal(''); readonly validation = signal('');
  readonly text = signal(''); readonly file = signal<File | null>(null); readonly confirming = signal(false); readonly recovery = signal(false);
  private session: SessionResponse | null = null; private location: AssignmentLocation | null = null; private root: string | null = null; private epoch = 0; private read = 0;
  constructor() { inject(DestroyRef).onDestroy(() => this.clear()); }
  clear(): void {
    ++this.epoch; ++this.read; this.session = null; this.location = null; this.root = null; this.data.set(null); this.loading.set(false); this.pending.set(false);
    this.error.set(''); this.notice.set(''); this.validation.set(''); this.recovery.set(false); this.discard();
  }
  private discard(): void { this.text.set(''); this.file.set(null); this.confirming.set(false); }
  bind(session: SessionResponse | null, blocked: boolean, location: AssignmentLocation): void {
    this.clear();
    if (blocked || !session?.selectedOrganization || session.selectedOrganization.role !== 'Student' || session.isSuperAdmin || Date.parse(session.expiresAt) <= Date.now()) return;
    this.session = session; this.location = location; this.root = assignmentUrl(location);
    if (!this.root) { this.error.set('This assignment route is unavailable.'); return; } void this.load();
  }
  private current(session: SessionResponse, epoch: number): boolean { return this.session === session && epoch === this.epoch && this.auth.state.session() === session && Date.parse(session.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain(); }
  shouldWarn(): boolean { return !!this.session && this.current(this.session, this.epoch) && (!!this.text() || !!this.file() || this.pending()); }
  async load(): Promise<void> {
    const session = this.session; const epoch = this.epoch; const root = this.root; const location = this.location;
    if (!session || !root || !location || !this.current(session, epoch)) return;
    const read = ++this.read; this.data.set(null); this.loading.set(true); this.error.set(''); this.discard();
    try {
      const data = await firstValueFrom(this.http.get<AssignmentData>(root));
      if (!this.current(session, epoch) || read !== this.read) return;
      if (data.organizationId !== session.selectedOrganization!.id || (location.selection && (data.courseId !== location.selection.courseId || data.sectionId !== location.selection.sectionId || data.lessonId !== location.selection.lessonId)) ||
        (location.assignmentId && (data.assignment?.id !== location.assignmentId || data.assignment.lessonId !== location.selection?.lessonId || data.submissions?.some(s => s.assignmentId !== location.assignmentId))) ||
        (location.submissionId && (data.submission?.id !== location.submissionId || data.submission.assignmentId !== location.assignmentId))) throw new Error('Unexpected context');
      this.data.set(data);
    } catch (error) { if (this.current(session, epoch) && read === this.read) this.error.set(error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status) ? assignmentError(error) : 'Stored assignments/submissions could not be loaded. Reload stored state before acting.'); }
    finally { if (this.current(session, epoch) && read === this.read) this.loading.set(false); }
  }
  selectFile(files: FileList | File[]): void {
    this.confirming.set(false); this.file.set(null); this.validation.set('');
    if (files.length > 1) { this.validation.set('Only one PDF is accepted.'); return; }
    const file = files[0] ?? null;
    const error = file ? submissionValidation(' ', file) : '';
    if (error) this.validation.set(error); else this.file.set(file);
  }
  editText(value: string): void { this.text.set(value); this.confirming.set(false); this.validation.set(''); }
  askSubmit(): void {
    if (!this.data()?.canSubmit || this.pending() || this.loading() || this.recovery()) return;
    const error = submissionValidation(this.text(), this.file()); this.validation.set(error); if (!error) this.confirming.set(true);
  }
  acknowledgeRecovery(): void { if (this.data() && !this.pending()) this.recovery.set(false); }
  async submit(): Promise<void> {
    const session = this.session; const epoch = this.epoch; const root = this.root;
    if (!session || !root || !this.current(session, epoch) || !this.data()?.canSubmit || !this.confirming() || this.recovery() || this.pending() || this.loading()) return;
    const error = submissionValidation(this.text(), this.file()); if (error) { this.validation.set(error); return; }
    const body = new FormData(); body.append('Text', this.text()); body.append('Confirmed', 'true'); const file = this.file(); if (file) body.append('File', file, file.name);
    this.pending.set(true); this.notice.set('');
    try {
      await this.auth.bootstrapCsrf(); if (!this.current(session, epoch)) return;
      await firstValueFrom(this.http.post(root + '/submit', body));
      if (this.current(session, epoch)) { this.notice.set('Final submission accepted. Check stored work below.'); this.recovery.set(false); }
    } catch (error) { if (this.current(session, epoch)) { this.notice.set(assignmentError(error)); this.recovery.set(true); } }
    finally { if (this.current(session, epoch)) { this.discard(); await this.load(); if (this.current(session, epoch)) this.pending.set(false); } }
  }
}
