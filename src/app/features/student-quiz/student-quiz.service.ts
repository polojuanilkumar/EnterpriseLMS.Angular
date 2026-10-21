import { DestroyRef, Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { ViewerSelection, guid, viewerRoot } from '../student-viewer/student-viewer.models';
import { QuizQuestion, StudentQuiz } from './student-quiz.models';

export function quizError(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  switch (status) {
    case 400: return 'The quiz request was rejected. Check the selections, confirmation and security check before trying again.';
    case 401: return 'Your session has expired. Sign in again.';
    case 403: return 'Your current organization or enrollment does not permit this quiz action.';
    case 404: return 'This quiz or attempt is unavailable or does not belong to this lesson and account.';
    case 409: return 'The server rejected the action. The attempt may be expired, already submitted, or the attempt limit reached. Check stored history and results.';
    default: return 'The outcome is unknown. Check stored history/status before deciding what to do next. No start or submission was automatically repeated.';
  }
}
const validId = (id: string) => id.length === 36 && guid.test(id);

@Injectable()
export class StudentQuizService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly page = signal<StudentQuiz | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly answers = signal<Record<string, string[]>>({});
  readonly dirty = signal(false);
  readonly confirming = signal(false);
  readonly recovery = signal(false);
  readonly now = signal(Date.now());
  readonly remaining = computed(() => Math.max(0, Math.ceil((Date.parse(this.page()?.attempt?.deadline ?? '') - this.now()) / 1000)) || 0);
  readonly liveAttempt = computed(() => this.page()?.attempts.find(a => a.status === 1 && Date.parse(a.deadline) >= this.now()) ?? null);
  readonly canStart = computed(() => {
    const page = this.page();
    return !!page?.quiz && page.active && !this.liveAttempt() && page.attempts.length < page.quiz.maxAttempts && !this.pending() && !this.loading() && !this.recovery();
  });
  readonly canSubmit = computed(() => this.page()?.active === true && this.page()?.attempt?.status === 1 && !this.pending() && !this.loading() && !this.recovery());
  private session: SessionResponse | null = null;
  private selection: ViewerSelection | null = null;
  private root: string | null = null;
  private attempt: string | null = null;
  private epoch = 0;
  private read = 0;
  constructor() {
    const timer = inject(NgZone).runOutsideAngular(() => setInterval(() => this.now.set(Date.now()), 1000));
    inject(DestroyRef).onDestroy(() => { clearInterval(timer); this.clear(); });
  }
  clear(): void {
    ++this.epoch; ++this.read; this.session = null; this.selection = null; this.root = null; this.attempt = null;
    this.page.set(null); this.loading.set(false); this.pending.set(false); this.error.set(''); this.notice.set('');
    this.discard(); this.recovery.set(false);
  }
  private discard(): void { this.answers.set({}); this.dirty.set(false); this.confirming.set(false); }
  bind(session: SessionResponse | null, blocked: boolean, selection: ViewerSelection, attempt: string | null): void {
    this.clear();
    if (blocked || !session?.selectedOrganization || session.selectedOrganization.role !== 'Student' || session.isSuperAdmin || Date.parse(session.expiresAt) <= Date.now()) return;
    const root = viewerRoot(selection);
    if (!root || !selection.lessonId || (attempt !== null && !validId(attempt))) { this.error.set('This quiz route is unavailable.'); return; }
    this.session = session; this.selection = selection; this.root = root + '/quiz'; this.attempt = attempt;
    void this.load();
  }
  private current(session: SessionResponse, epoch: number): boolean {
    return this.epoch === epoch && this.session === session && this.auth.state.session() === session && Date.parse(session.expiresAt) > Date.now() &&
      !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain();
  }
  shouldWarn(): boolean { return !!this.session && this.current(this.session, this.epoch) && (this.dirty() || this.pending()); }
  async load(): Promise<void> {
    const session = this.session; const epoch = this.epoch; const root = this.root; const selection = this.selection; const attempt = this.attempt;
    if (!session || !root || !selection || !this.current(session, epoch)) return;
    const read = ++this.read; this.page.set(null); this.loading.set(true); this.error.set(''); this.discard();
    try {
      const page = await firstValueFrom(this.http.get<StudentQuiz>(root + (attempt ? '/attempts/' + attempt : '')));
      if (!this.current(session, epoch) || read !== this.read) return;
      if (page.organizationId !== session.selectedOrganization!.id || page.courseId !== selection.courseId || page.sectionId !== selection.sectionId || page.lessonId !== selection.lessonId ||
        (page.quiz && page.quiz.lessonId !== selection.lessonId) || (attempt !== null && page.attempt?.attemptId !== attempt) ||
        (page.result && (page.attempt?.status !== 2 || page.result.attemptId !== attempt)) || (page.review && (page.attempt?.status !== 2 || page.review.attemptId !== attempt))) throw new Error('Unexpected context');
      this.page.set(page); this.now.set(Date.now());
    } catch (error) { if (this.current(session, epoch) && read === this.read) this.error.set(quizError(error)); }
    finally { if (this.current(session, epoch) && read === this.read) this.loading.set(false); }
  }
  choose(question: QuizQuestion, optionId: string, selected: boolean): void {
    if (!this.canSubmit() || !this.page()?.questions.includes(question) || !question.options.some(o => o.id === optionId)) return;
    const previous = this.answers()[question.id] ?? [];
    const next = question.questionType === 2 ? selected ? [...new Set([...previous, optionId])] : previous.filter(id => id !== optionId) : selected ? [optionId] : [];
    this.answers.update(answers => ({ ...answers, [question.id]: next })); this.dirty.set(true); this.confirming.set(false);
  }
  askSubmit(): void { if (this.canSubmit()) this.confirming.set(true); }
  acknowledgeRecovery(): void { if (!this.pending() && this.page()) { this.recovery.set(false); this.notice.set('Stored status checked. Previous selections were discarded; enter answers again before confirming.'); } }
  async start(): Promise<string | null> {
    if (!this.canStart()) return null;
    return this.mutate('start', {});
  }
  async submit(): Promise<void> {
    if (!this.canSubmit() || !this.confirming() || !this.attempt) return;
    const answers = (this.page()?.questions ?? []).map(q => ({ questionId: q.id, selectedOptionIds: [...(this.answers()[q.id] ?? [])] }));
    await this.mutate('attempts/' + this.attempt + '/submit', { confirmed: true, answers });
  }
  private async mutate(suffix: string, body: object): Promise<string | null> {
    const session = this.session; const epoch = this.epoch; const root = this.root;
    if (!session || !root || !this.current(session, epoch) || this.pending() || this.loading()) return null;
    this.pending.set(true); this.error.set(''); this.notice.set('');
    let next: string | null = null;
    try {
      await this.auth.bootstrapCsrf();
      if (!this.current(session, epoch)) return null;
      const response = await firstValueFrom(this.http.post<{ attemptId?: string } | null>(root + '/' + suffix, body));
      if (!this.current(session, epoch)) return null;
      if (suffix === 'start') {
        if (!response?.attemptId || !validId(response.attemptId)) throw new Error('Invalid start response');
        next = response.attemptId;
      }
      this.notice.set(suffix === 'start' ? 'Attempt started or resumed. Open its stored status.' : 'Submission accepted. Showing stored status/results.');
      this.recovery.set(false);
    } catch (error) {
      if (this.current(session, epoch)) { this.notice.set(quizError(error)); this.recovery.set(true); }
    } finally {
      if (this.current(session, epoch)) {
        this.discard();
        // GET history/status only. Never replay a start or submission after any failure.
        await this.load();
        if (this.current(session, epoch)) this.pending.set(false);
      }
    }
    return this.current(session, epoch) ? next : null;
  }
}
