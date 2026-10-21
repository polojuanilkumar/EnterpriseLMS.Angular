import { Component, effect, inject, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { StudentGradesService } from './student-grades.service';
import { AssignmentGrade, QuizGrade, assignmentState, quizState } from './student-grades.models';
@Component({ selector: 'app-student-grades', imports: [DatePipe, FormsModule, RouterLink], providers: [StudentGradesService], templateUrl: './student-grades.component.html' })
export class StudentGradesComponent {
  readonly store = inject(StudentGradesService); private readonly auth = inject(AuthService); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap }); private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  filters: Record<string, string> = {}; readonly quizState = quizState; readonly assignmentState = assignmentState;
  get courseId(): string | null { return this.params().get('courseId'); }
  constructor() { effect(() => { const session = this.auth.state.session(); const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain(); this.params(); const query = this.query(); const filters = Object.fromEntries(query.keys.map(key => [key, query.get(key) ?? ''])); untracked(() => { this.filters = { pageSize: '20', ...filters }; this.store.bind(session, blocked, this.courseId, filters); }); }); }
  apply(): void { const keys = this.courseId ? ['pageSize', 'quizStatus', 'assignmentStatus'] : ['pageSize', 'search', 'published', 'enrollmentStatus']; const queryParams: Record<string, string> = {}; for (const key of keys) if (this.filters[key]) queryParams[key] = this.filters[key]; void this.router.navigate([], { relativeTo: this.route, queryParams }); }
  reload(): void { this.store.bind(this.auth.state.session(), this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain(), this.courseId, Object.fromEntries(this.query().keys.map(key => [key, this.query().get(key) ?? '']))); }
  quizLink(row: QuizGrade): string[] { return ['/workspace/student/courses', row.courseId, 'sections', row.sectionId, 'lessons', row.lessonId, 'quiz', ...(row.attemptId ? ['attempts', row.attemptId] : [])]; }
  assignmentLink(row: AssignmentGrade): string[] { return ['/workspace/student/courses', row.courseId, 'sections', row.sectionId, 'lessons', row.lessonId, 'assignments', row.assignmentId, ...(row.submissionId ? ['submissions', row.submissionId] : [])]; }
  hasNext(page: { page: number; pageSize: number; total: number }): boolean { return page.page < 10000 && page.page * page.pageSize < page.total; }
  pageQuery(key: string, page: number): Record<string, string | number> { return { ...Object.fromEntries(this.query().keys.map(name => [name, this.query().get(name) ?? ''])), [key]: page }; }
}
