import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { CourseAction, CoursePageMode, StudentCourseRow, StudentCoursesResponse } from './student-courses.models';

export function courseError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 400: return error.error?.code === 'csrf_validation_failed'
        ? 'Your security check expired. Review the stored state before trying again.' : 'Check the action and its required confirmation.';
      case 401: return 'Your session has expired. Sign in again.';
      case 403: return 'Your current account or organization cannot access these courses.';
      case 404: return 'This course or enrollment is unavailable. Review the refreshed list.';
      case 409: return 'The enrollment state has changed or conflicts with this action. Review the refreshed list.';
      case 429: return 'Too many requests. Wait before trying again.';
    }
  }
  return 'The outcome could not be confirmed. Stored state is being refreshed; no action was automatically repeated.';
}

// Scoped to a routed page: data never survives navigation, logout or context changes.
@Injectable()
export class StudentCoursesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly rows = signal<StudentCourseRow[]>([]);
  readonly loading = signal(false);
  readonly pending = signal<string | null>(null);
  readonly loadError = signal('');
  readonly actionError = signal('');
  readonly notice = signal('');
  readonly confirmation = signal<{ row: StudentCourseRow; action: 'cancel' | 'reenroll' } | null>(null);
  private context: SessionResponse | null = null;
  private epoch = 0;
  private read = 0;
  private mode: CoursePageMode = 'catalog';

  constructor() { inject(DestroyRef).onDestroy(() => this.reset()); }
  private reset(): void {
    ++this.epoch; ++this.read; this.context = null;
    this.rows.set([]); this.loading.set(false); this.pending.set(null);
    this.confirmation.set(null); this.loadError.set(''); this.actionError.set(''); this.notice.set('');
  }
  bind(session: SessionResponse | null, blocked: boolean, mode: CoursePageMode): void {
    this.reset(); this.mode = mode;
    if (blocked || !session?.selectedOrganization || session.selectedOrganization.role !== 'Student' || session.isSuperAdmin || Date.parse(session.expiresAt) <= Date.now()) return;
    this.context = session;
    void this.refresh();
  }
  private current(context: SessionResponse, epoch: number): boolean {
    return this.context === context && this.epoch === epoch && this.auth.state.session() === context &&
      Date.parse(context.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain();
  }
  async refresh(): Promise<void> {
    const context = this.context; const epoch = this.epoch; const read = ++this.read;
    if (!context || !this.current(context, epoch)) return;
    this.loading.set(true); this.loadError.set(''); this.rows.set([]);
    try {
      const response = await firstValueFrom(this.http.get<StudentCoursesResponse>(this.mode === 'catalog' ? '/bff/student/courses' : '/bff/student/my-courses'));
      if (!this.current(context, epoch) || read !== this.read) return;
      if (response.organizationId !== context.selectedOrganization!.id) throw new Error('Unexpected context');
      this.rows.set(response.courses);
    } catch (error) {
      if (this.current(context, epoch) && read === this.read) this.loadError.set(error instanceof HttpErrorResponse && [401, 403].includes(error.status)
        ? courseError(error) : 'Stored courses could not be loaded. Reload the list before taking another action.');
    } finally { if (this.current(context, epoch) && read === this.read) this.loading.set(false); }
  }
  ask(row: StudentCourseRow, action: 'cancel' | 'reenroll'): void {
    if (this.pending() || this.loading()) return;
    this.confirmation.set({ row, action }); this.actionError.set(''); this.notice.set('');
  }
  async confirm(): Promise<void> {
    const confirmation = this.confirmation();
    if (confirmation) await this.act(confirmation.row, confirmation.action, true);
  }
  async act(row: StudentCourseRow, action: CourseAction, confirmed = false): Promise<void> {
    const context = this.context; const epoch = this.epoch;
    if (!context || !this.current(context, epoch) || this.pending() || this.loading() || !this.rows().includes(row)) return;
    if (action !== 'enroll' && !confirmed) return;
    if (action === 'cancel' ? row.enrollment?.status !== 'Active' : !row.course?.isAvailable ||
      (action === 'reenroll' ? row.enrollment?.status !== 'Cancelled' : !!row.enrollment)) return;
    this.pending.set(row.courseId); this.actionError.set(''); this.notice.set('');
    try {
      await this.auth.bootstrapCsrf();
      if (!this.current(context, epoch)) return;
      const root = '/bff/student/courses/' + encodeURIComponent(row.courseId);
      const path = action === 'cancel' ? root + '/enrollments/' + encodeURIComponent(row.enrollment!.id) + '/cancel' : root + '/enroll';
      await firstValueFrom(this.http.post<void>(path, action === 'cancel' ? { confirmed: true } : { confirmedReenrollment: action === 'reenroll' }));
      if (this.current(context, epoch)) this.notice.set(action === 'cancel' ? 'Enrollment cancelled.' : action === 'reenroll' ? 'Enrollment reactivated.' : 'Enrollment created.');
    } catch (error) {
      if (this.current(context, epoch)) this.actionError.set(courseError(error));
    } finally {
      if (this.current(context, epoch)) {
        this.confirmation.set(null);
        // Refresh after success, conflict or ambiguous failure. Never replay a mutation.
        await this.refresh();
        if (this.current(context, epoch)) this.pending.set(null);
      }
    }
  }
}
