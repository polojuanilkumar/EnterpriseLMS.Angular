import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { validGuid } from '../student-assignments/student-assignments.models';
import { GradeData } from './student-grades.models';
@Injectable()
export class StudentGradesService {
  private readonly http = inject(HttpClient); private readonly auth = inject(AuthService);
  readonly data = signal<GradeData | null>(null); readonly loading = signal(false); readonly error = signal('');
  private epoch = 0;
  constructor() { inject(DestroyRef).onDestroy(() => this.clear()); }
  clear(): void { ++this.epoch; this.data.set(null); this.loading.set(false); this.error.set(''); }
  bind(session: SessionResponse | null, blocked: boolean, courseId: string | null, filters: Record<string, string>): void {
    this.clear();
    if (blocked || !session?.selectedOrganization || session.selectedOrganization.role !== 'Student' || session.isSuperAdmin || Date.parse(session.expiresAt) <= Date.now()) return;
    if (courseId !== null && !validGuid(courseId)) { this.error.set('This gradebook course is unavailable.'); return; }
    void this.load(session, this.epoch, courseId, filters);
  }
  private current(s: SessionResponse, epoch: number): boolean { return epoch === this.epoch && this.auth.state.session() === s && Date.parse(s.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain(); }
  private async load(s: SessionResponse, epoch: number, course: string | null, filters: Record<string, string>): Promise<void> {
    this.loading.set(true);
    const allowed = course ? ['quizPage', 'assignmentPage', 'pageSize', 'quizStatus', 'assignmentStatus'] : ['page', 'pageSize', 'search', 'published', 'enrollmentStatus'];
    let params = new HttpParams(); for (const key of allowed) if (filters[key]) params = params.set(key, filters[key]);
    try {
      const data = await firstValueFrom(this.http.get<GradeData>('/bff/student/grades' + (course ? '/courses/' + course : ''), { params }));
      if (!this.current(s, epoch)) return;
      if (data.organizationId !== s.selectedOrganization!.id || (course && (data.course?.courseId !== course || data.quizzes?.items.some(x => x.courseId !== course) || data.assignments?.items.some(x => x.courseId !== course)))) throw new Error('Unexpected context');
      this.data.set(data);
    } catch (error) {
      if (this.current(s, epoch)) {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        this.error.set(status === 400 ? 'Invalid gradebook filters. Pages must be 1–10000, page size 1–50, and search at most 100 characters. Check assessment/enrollment states.' :
          status === 401 ? 'Your session has expired. Sign in again.' : status === 403 ? 'Access denied. My Grades requires your own Active or Completed enrollment in the selected organization.' :
          status === 404 ? 'This course gradebook is unavailable for this account.' : 'Stored grades could not be loaded. Reload before continuing.');
      }
    }
    finally { if (this.current(s, epoch)) this.loading.set(false); }
  }
}
