import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { staffAllowed } from '../../core/auth/workspace-routing';
import { validGuid } from '../student-assignments/student-assignments.models';
import { Assignment, AssignmentForm, AssignmentPage, Option, Question, QuizForm, QuizPage, WorkPage, decimalValid } from './staff-assessments.models';

@Component({ selector: 'app-staff-assessments', imports: [FormsModule, RouterLink, DatePipe], templateUrl: './staff-assessments.component.html' })
export class StaffAssessmentsComponent {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly quiz = signal<QuizPage | null>(null);
  readonly assignments = signal<AssignmentPage | null>(null);
  readonly submissions = signal<WorkPage | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly locked = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  quizForm: QuizForm = this.emptyQuiz();
  questionForm = { questionText: '', questionType: 1, displayOrder: 1, marks: '1' };
  optionForm = { optionText: '', displayOrder: 1, isCorrect: false };
  assignmentForm: AssignmentForm = this.emptyAssignment();
  gradeForm = { marks: '', feedback: '' };
  dueInput = '';
  questionId: string | null = null;
  optionQuestionId: string | null = null;
  optionId: string | null = null;
  editingAssignment: string | null = null;
  dirty = false;
  pageNumber = 1;
  private epoch = 0;
  private sequence = 0;
  private session: SessionResponse | null = null;
  get mode(): string { return this.data()['mode'] as string; }
  get courseId(): string { return this.params().get('courseId') ?? ''; }
  get sectionId(): string { return this.params().get('sectionId') ?? ''; }
  get lessonId(): string { return this.params().get('lessonId') ?? ''; }
  get assignmentId(): string { return this.params().get('assignmentId') ?? ''; }
  get submissionId(): string { return this.params().get('submissionId') ?? ''; }
  get coursePath(): string { return '/workspace/staff/courses/' + this.courseId; }
  get sectionPath(): string { return this.coursePath + '/sections/' + this.sectionId; }
  get lessonPath(): string { return this.sectionPath + '/lessons/' + this.lessonId; }
  get root(): string { return '/bff/staff/courses/' + this.courseId + '/sections/' + this.sectionId + '/lessons/' + this.lessonId; }
  get assignmentRoot(): string { return this.root + '/assignments' + (this.assignmentId ? '/' + this.assignmentId : ''); }
  get quizRoot(): string { return this.root + '/quiz/' + (this.quiz()?.quiz?.id ?? ''); }
  get frozen(): boolean { return this.assignments()?.assignments.find(x => x.id === this.editingAssignment)?.frozen ?? false; }
  constructor() {
    effect(() => {
      const session = this.auth.state.session(); const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      this.params(); this.data();
      untracked(() => {
        this.epoch++; this.session = null; this.clear(); this.locked.set(false); this.pending.set(false); this.loading.set(false); this.error.set(''); this.notice.set(''); this.pageNumber = 1;
        if (!blocked && session && staffAllowed(session) && Date.parse(session.expiresAt) > Date.now()) {
          this.session = session;
          if ([this.courseId, this.sectionId, this.lessonId].every(validGuid) && [this.assignmentId, this.submissionId].filter(Boolean).every(validGuid)) void this.load();
          else this.error.set('Invalid assessment address.');
        }
      });
    });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (this.shouldWarn()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => { this.epoch++; this.session = null; this.clear(); window.removeEventListener('beforeunload', beforeUnload); });
  }
  private emptyQuiz(): QuizForm { return { title: '', description: '', passingPercentage: '50', timeLimitInMinutes: 15, maxAttempts: 1 }; }
  private emptyAssignment(): AssignmentForm { return { title: '', instructions: '', maximumMarks: '100', dueAtUtc: null, protectedFieldsChanged: false, dueAtChanged: false }; }
  private clear(): void {
    this.quiz.set(null); this.assignments.set(null); this.submissions.set(null); this.quizForm = this.emptyQuiz(); this.assignmentForm = this.emptyAssignment();
    this.questionForm = { questionText: '', questionType: 1, displayOrder: 1, marks: '1' }; this.optionForm = { optionText: '', displayOrder: 1, isCorrect: false };
    this.gradeForm = { marks: '', feedback: '' }; this.dueInput = ''; this.questionId = null; this.optionId = null; this.optionQuestionId = null; this.editingAssignment = null; this.dirty = false;
  }
  private current(epoch: number): boolean { return epoch === this.epoch && !!this.session && this.session === this.auth.state.session() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain() && Date.parse(this.session.expiresAt) > Date.now(); }
  async load(retain = false): Promise<void> {
    const epoch = this.epoch, sequence = ++this.sequence;
    if (!this.current(epoch)) return;
    this.loading.set(true);
    try {
      if (this.mode === 'quiz') {
        const result = await firstValueFrom(this.http.get<QuizPage>(this.root + '/quiz'));
        if (!this.current(epoch) || sequence !== this.sequence) return;
        this.quiz.set(result);
        if (!retain) { this.quizForm = { ...result.form }; this.questionId = null; this.optionId = null; this.optionQuestionId = null; this.questionForm = { questionText: '', questionType: 1, displayOrder: result.questions.length + 1, marks: '1' }; this.optionForm = { optionText: '', displayOrder: 1, isCorrect: false }; this.dirty = false; }
      } else {
        const url = this.assignmentRoot + (this.submissionId ? '/submissions/' + this.submissionId : '');
        const result = await firstValueFrom(this.http.get<AssignmentPage>(url));
        if (!this.current(epoch) || sequence !== this.sequence) return;
        this.assignments.set(result);
        if (!retain) { this.editingAssignment = null; this.assignmentForm = this.emptyAssignment(); this.gradeForm = { marks: '', feedback: '' }; this.dueInput = ''; this.dirty = false; }
        if (this.assignmentId && !this.submissionId) {
          const rows = await firstValueFrom(this.http.get<WorkPage>(this.assignmentRoot + '/submissions?page=' + this.pageNumber + '&pageSize=20'));
          if (this.current(epoch) && sequence === this.sequence) this.submissions.set(rows);
        }
      }
    } catch (error) {
      if (this.current(epoch) && sequence === this.sequence) {
        this.error.set(this.message(error));
        if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) { this.clear(); this.locked.set(true); }
      }
    } finally { if (this.current(epoch) && sequence === this.sequence) this.loading.set(false); }
  }
  changed(): void { this.dirty = true; }
  editQuestion(question?: Question): void {
    if (this.dirty && !window.confirm('Discard unsaved editor values?')) return;
    this.questionId = question?.id ?? null; this.questionForm = question ? { questionText: question.questionText, questionType: question.questionType, displayOrder: question.displayOrder, marks: question.marks } : { questionText: '', questionType: 1, displayOrder: (this.quiz()?.questions.length ?? 0) + 1, marks: '1' }; this.dirty = false;
  }
  editOption(questionId: string, option?: Option): void {
    if (this.dirty && !window.confirm('Discard unsaved editor values?')) return;
    this.optionQuestionId = questionId; this.optionId = option?.id ?? null; this.optionForm = option ? { optionText: option.optionText, isCorrect: option.isCorrect, displayOrder: option.displayOrder } : { optionText: '', isCorrect: false, displayOrder: (this.quiz()?.questions.find(x => x.question.id === questionId)?.options.length ?? 0) + 1 }; this.dirty = false;
  }
  editAssignment(assignment?: Assignment): void {
    if (this.dirty && !window.confirm('Discard unsaved editor values?')) return;
    this.editingAssignment = assignment?.id ?? null;
    this.assignmentForm = assignment ? { title: assignment.title, instructions: assignment.instructions, maximumMarks: String(assignment.maximumMarks), dueAtUtc: assignment.dueAtUtc, protectedFieldsChanged: false, dueAtChanged: false } : this.emptyAssignment();
    this.dueInput = assignment?.dueAtUtc?.replace(/(?:Z|\+00:00)$/, '') ?? ''; this.dirty = false;
  }
  protectedChanged(due = false): void { this.assignmentForm.protectedFieldsChanged = true; if (due) this.assignmentForm.dueAtChanged = true; this.changed(); }
  async saveQuiz(form: NgForm): Promise<void> { if (form.invalid) return; await this.change(this.quiz()?.quiz ? 'PUT' : 'POST', this.quiz()?.quiz ? this.quizRoot : this.root + '/quiz', this.quizForm); }
  async saveQuestion(form: NgForm): Promise<void> { if (form.invalid) return; await this.change(this.questionId ? 'PUT' : 'POST', this.quizRoot + '/questions' + (this.questionId ? '/' + this.questionId : ''), this.questionForm); }
  async saveOption(form: NgForm): Promise<void> { if (form.invalid || !this.optionQuestionId) return; await this.change(this.optionId ? 'PUT' : 'POST', this.quizRoot + '/questions/' + this.optionQuestionId + '/options' + (this.optionId ? '/' + this.optionId : ''), this.optionForm); }
  async saveAssignment(form: NgForm): Promise<void> {
    if (form.invalid || !decimalValid(this.assignmentForm.maximumMarks) || /^0(?:\.0+)?$/.test(this.assignmentForm.maximumMarks)) { this.error.set('Use positive maximum marks with at most two decimal places within the displayed bound.'); return; }
    const body = { ...this.assignmentForm, dueAtUtc: this.assignmentForm.dueAtChanged || !this.editingAssignment ? (this.dueInput ? this.dueInput + 'Z' : null) : this.assignmentForm.dueAtUtc };
    await this.change(this.editingAssignment ? 'PUT' : 'POST', this.root + '/assignments' + (this.editingAssignment ? '/' + this.editingAssignment : ''), body);
  }
  async grade(form: NgForm): Promise<void> {
    if (form.invalid || !decimalValid(this.gradeForm.marks) || this.assignments()?.submission?.grade) { this.error.set('Use marks from zero through the submitted maximum, with at most two decimal places.'); return; }
    if (this.pending() || this.locked() || !window.confirm('Save this final grade? It cannot be overwritten.')) return;
    await this.change('POST', this.assignmentRoot + '/submissions/' + this.submissionId + '/grade', { ...this.gradeForm, confirmed: true });
  }
  async publishQuiz(publish: boolean): Promise<void> { if (this.pending() || this.locked() || !window.confirm(publish ? 'Publish this quiz? The server will validate its configuration.' : 'Unpublish this quiz?')) return; await this.change('POST', this.quizRoot + '/publication', { action: publish ? 'publish' : 'unpublish', confirmed: true }); }
  async deleteQuiz(): Promise<void> { if (this.pending() || this.locked() || !window.confirm('Delete this quiz? Existing attempt restrictions remain authoritative.')) return; await this.change('POST', this.quizRoot + '/delete', { confirmed: true }); }
  async deletePart(questionId: string, optionId?: string): Promise<void> { if (this.pending() || this.locked() || !window.confirm(optionId ? 'Delete this option?' : 'Delete this question and its options?')) return; await this.change('POST', this.quizRoot + '/questions/' + questionId + (optionId ? '/options/' + optionId : '') + '/delete', { confirmed: true }); }
  async publishAssignment(assignment: Assignment): Promise<void> { if (this.pending() || this.locked() || !window.confirm(assignment.isPublished ? 'Unpublish this assignment? Staff retain historical review.' : 'Publish this assignment?')) return; await this.change('POST', this.root + '/assignments/' + assignment.id + '/publication', { isPublished: !assignment.isPublished, confirmed: true }); }
  async paginate(delta: number): Promise<void> { if (this.pending() || this.loading()) return; this.submissions.set(null); this.pageNumber = Math.max(1, this.pageNumber + delta); await this.load(true); }
  private async change(method: string, url: string, body: unknown): Promise<void> {
    const epoch = this.epoch;
    if (!this.current(epoch) || this.pending() || this.loading() || this.locked()) return;
    this.pending.set(true); this.error.set(''); this.notice.set(''); let sent = false;
    try {
      await this.auth.bootstrapCsrf(); if (!this.current(epoch)) return;
      sent = true; await firstValueFrom(this.http.request(method, url, { body }));
      if (this.current(epoch)) { this.dirty = false; this.notice.set('Saved. Stored state refreshed.'); await this.load(); }
    } catch (error) {
      if (!this.current(epoch)) return;
      this.error.set(this.message(error)); const status = error instanceof HttpErrorResponse ? error.status : 0;
      if ([401, 403, 404].includes(status)) { this.clear(); this.locked.set(true); }
      else if (sent && ![400, 409, 413, 429].includes(status)) {
        this.locked.set(true); this.notice.set('Outcome uncertain. Only read-only stored-state checks follow. Inspect the records below before leaving and reopening; no mutation was replayed.'); await this.load(true);
      } else if (status === 409) {
        // A concurrent grade/freeze may have won. Preserve entered values, but show authoritative stored state.
        await this.load(true);
      }
    } finally { if (this.current(epoch)) this.pending.set(false); }
  }
  private message(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (error instanceof HttpErrorResponse && [400, 409].includes(status) && ['conflict', 'validation_failed'].includes(error.error?.code) && typeof error.error?.message === 'string') return error.error.message.slice(0, 1000);
    return ({ 400: 'Check required fields, numeric bounds, ordering and the security check. Entered values are retained.', 401: 'Your session expired. Sign in again.', 403: 'You do not have access to this assessment in the selected organization.', 404: 'The assessment or its stored parent is unavailable.', 409: 'Stored state conflicts with this change. Check publication, existing attempts, frozen fields or an existing grade.', 413: 'The request is too large.', 429: 'Too many requests. Wait before trying again.' } as Record<number, string>)[status] ?? 'The service could not confirm the operation.';
  }
  shouldWarn(): boolean { return !!this.session && this.session === this.auth.state.session() && (this.dirty || this.pending()); }
  canLeave(): boolean { return !this.shouldWarn() || window.confirm('Leave and discard unsaved assessment values? An in-flight write may still finish.'); }
}
