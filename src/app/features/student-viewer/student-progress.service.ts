import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { ViewerSelection, guid, viewerRoot } from './student-viewer.models';
import { StudentProgress } from './student-progress.models';

export function progressError(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  switch (status) {
    case 400: return 'Check the confirmation. If the security check expired, reload before trying again.';
    case 401: return 'Your session has expired. Sign in again.';
    case 403: return 'Access to this learning resource has been denied. Check your organization and enrollment.';
    case 404: return 'This learning resource or stored progress is unavailable. A lesson must be started before completing it.';
    case 409: return 'The stored state or prerequisites changed. Mutations require Active enrollment; course completion requires at least one published lesson and every published lesson completed. Review refreshed state before trying again.';
    default: return 'The change could not be confirmed. Stored state is being refreshed; no action was automatically repeated.';
  }
}

@Injectable()
export class StudentProgressService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly data = signal<StudentProgress | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly loadError = signal('');
  readonly actionError = signal('');
  readonly notice = signal('');
  readonly fatal = signal('');
  readonly confirmingLesson = signal(false);
  readonly confirming = signal(false);
  readonly active = computed(() => this.data()?.enrollment.status === 'Active');
  readonly canComplete = computed(() => {
    const data = this.data();
    return !!data && this.active() && data.current.totalLessons > 0 &&
      data.current.completedLessons === data.current.totalLessons && data.current.isCompleted;
  });
  private session: SessionResponse | null = null;
  private selection: ViewerSelection | null = null;
  private root: string | null = null;
  private epoch = 0;
  private read = 0;
  constructor() { inject(DestroyRef).onDestroy(() => this.clear()); }
  clear(): void {
    ++this.epoch; ++this.read; this.session = null; this.selection = null; this.root = null;
    this.data.set(null); this.confirmingLesson.set(false); this.loading.set(false); this.pending.set(false);
    this.loadError.set(''); this.actionError.set(''); this.notice.set(''); this.fatal.set(''); this.confirming.set(false);
  }
  bind(session: SessionResponse | null, blocked: boolean, selection: ViewerSelection): void {
    this.clear();
    if (blocked || !session?.selectedOrganization || session.isSuperAdmin || session.selectedOrganization.role !== 'Student' || Date.parse(session.expiresAt) <= Date.now()) return;
    this.session = session; this.selection = selection; this.root = viewerRoot(selection);
    if (this.root) void this.refresh();
  }
  private current(session: SessionResponse, epoch: number): boolean {
    return this.session === session && this.epoch === epoch && this.auth.state.session() === session &&
      Date.parse(session.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain();
  }
  private denied(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse) || ![401, 403, 404].includes(error.status)) return false;
    this.data.set(null); this.confirmingLesson.set(false); this.fatal.set(progressError(error)); return true;
  }
  async refresh(): Promise<void> {
    const session = this.session; const epoch = this.epoch; const root = this.root; const selection = this.selection;
    if (!session || !root || !selection || !this.current(session, epoch)) return;
    const read = ++this.read;
    this.data.set(null); this.confirmingLesson.set(false); this.loading.set(true); this.loadError.set(''); this.confirming.set(false);
    try {
      const data = await firstValueFrom(this.http.get<StudentProgress>(root + '/progress'));
      if (!this.current(session, epoch) || read !== this.read) return;
      if (data.organizationId !== session.selectedOrganization!.id || data.courseId !== selection.courseId ||
        data.sectionId !== selection.sectionId || data.lessonId !== selection.lessonId || !guid.test(data.enrollment.id) || data.enrollment.id.length !== 36 ||
        !['Active', 'Completed'].includes(data.enrollment.status)) throw new Error('Unexpected context');
      this.data.set(data);
    } catch (error) {
      if (this.current(session, epoch) && read === this.read) {
        this.denied(error); this.loadError.set('Stored progress could not be loaded. Reload progress before taking another action.');
      }
    } finally { if (this.current(session, epoch) && read === this.read) this.loading.set(false); }
  }
  askLessonCompletion(): void {
    const data = this.data();
    if (data?.lessonId && data.lesson && !data.lesson.isCompleted && this.active() && !this.loading() && !this.pending()) {
      this.confirmingLesson.set(true);
    }
  }
  async changeLesson(action: 'start' | 'complete'): Promise<void> {
    const data = this.data(); const root = this.root;
    if (!data || !root || !data.lessonId || !this.active()) return;
    if (action === 'start' ? data.lesson !== null : !data.lesson || data.lesson.isCompleted || !this.confirmingLesson()) return;
    await this.change('POST', root + '/progress/' + action, {});
  }
  askCompletion(): void {
    if (this.canComplete() && !this.loading() && !this.pending()) this.confirming.set(true);
  }
  async completeEnrollment(): Promise<void> {
    const data = this.data();
    if (!data || !this.selection || !this.confirming() || !this.canComplete()) return;
    const root = viewerRoot({ courseId: this.selection.courseId, sectionId: null, lessonId: null });
    await this.change('POST', root + '/enrollments/' + data.enrollment.id + '/complete', { confirmed: true });
  }
  private async change(method: string, path: string, body: object): Promise<void> {
    const session = this.session; const epoch = this.epoch;
    if (!session || !this.current(session, epoch) || this.pending() || this.loading() || !this.active()) return;
    this.pending.set(true); this.actionError.set(''); this.notice.set('');
    let denied = false;
    try {
      await this.auth.bootstrapCsrf();
      if (!this.current(session, epoch)) return;
      await firstValueFrom(this.http.request(method, path, { body }));
      if (this.current(session, epoch)) this.notice.set('Change saved.');
    } catch (error) {
      if (this.current(session, epoch)) { denied = this.denied(error); this.actionError.set(progressError(error)); }
    } finally {
      if (this.current(session, epoch)) {
        this.confirming.set(false); this.confirmingLesson.set(false);
        // Recover only with GET. Never replay a mutation, including after transport failure.
        if (!denied) await this.refresh();
        if (this.current(session, epoch)) this.pending.set(false);
      }
    }
  }
}
