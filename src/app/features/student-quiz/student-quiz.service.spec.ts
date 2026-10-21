import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { selection } from '../student-viewer/student-viewer.testing';
import { viewerRoot } from '../student-viewer/student-viewer.models';
import { StudentQuizService } from './student-quiz.service';
import { StudentQuiz } from './student-quiz.models';
import { quizPage, attemptId } from './student-quiz.testing';

describe('Student quiz state and explicit requests', () => {
  let store: StudentQuizService; let http: HttpTestingController; let state: AuthState;
  const root = viewerRoot(selection)! + '/quiz'; const attemptPath = root + '/attempts/' + attemptId;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [StudentQuizService, provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting()] });
    store = TestBed.inject(StudentQuizService); http = TestBed.inject(HttpTestingController); state = TestBed.inject(AuthState); state.accept(selectedSession(), () => {});
  });
  afterEach(() => { state.clear(); http.verify(); });
  function read(page: StudentQuiz, path = root): void { const request = http.expectOne(path); expect(request.request.method).toBe('GET'); request.flush(page); flushMicrotasks(); }
  function start(page = quizPage()): void { store.bind(state.session(), false, selection, page.attempt ? attemptId : null); read(page, page.attempt ? attemptPath : root); }
  function csrf(): void { http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); }
  it('reads instructions and resumes the stored attempt without starting or restoring answers', fakeAsync(() => {
    start(); expect(store.canStart()).toBeTrue(); http.expectNone('/bff/antiforgery');
    const page = quizPage(true); start(page); expect(store.canStart()).toBeFalse(); expect(store.answers()).toEqual({});
    expect(store.page()?.attempt?.deadline).toBe(page.attempt!.deadline); expect(store.remaining()).toBe(60); http.expectNone(root + '/start');
    void store.load(); read(page, attemptPath); expect(store.page()?.attempt?.deadline).toBe(page.attempt!.deadline);
  }));
  it('starts explicitly once with CSRF and recovers history before returning the ID', fakeAsync(() => {
    start(); let id: string | null = null; void store.start().then(value => id = value); void store.start(); csrf();
    const request = http.expectOne(root + '/start'); expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({}); expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('csrf');
    expect(request.request.headers.has('Authorization')).toBeFalse(); expect(request.request.headers.has('X-Organization-Id')).toBeFalse(); request.flush({ attemptId }); flushMicrotasks();
    expect(id).toBeNull(); read({ ...quizPage(), attempts: quizPage(true).attempts }); expect(id as string | null).toBe(attemptId); expect(store.pending()).toBeFalse();
  }));
  it('handles all three option types and submits only IDs after confirmation', fakeAsync(() => {
    start(quizPage(true)); const questions = store.page()!.questions;
    for (const q of questions) { store.choose(q, q.options[0].id, true); store.choose(q, q.options[1].id, true); }
    expect(store.answers()[questions[0].id]).toEqual([questions[0].options[1].id]);
    expect(store.answers()[questions[1].id]).toEqual(questions[1].options.map(o => o.id));
    expect(store.answers()[questions[2].id]).toEqual([questions[2].options[1].id]);
    void store.submit(); http.expectNone('/bff/antiforgery'); store.askSubmit(); void store.submit(); void store.submit(); csrf();
    const request = http.expectOne(attemptPath + '/submit'); expect(request.request.body).toEqual({ confirmed: true, answers: questions.map(q => ({ questionId: q.id, selectedOptionIds: store.answers()[q.id] })) });
    expect(JSON.stringify(request.request.body)).not.toContain('Correct'); expect(JSON.stringify(request.request.body)).not.toContain('Marks'); request.flush(null); flushMicrotasks();
    const page = quizPage(true); page.attempt = { ...page.attempt!, status: 2 }; page.attempts = [page.attempt]; page.questions = []; page.result = { attemptId, earnedMarks: 2, possibleMarks: 6, passingPercentageSnapshot: 70, isPassed: false };
    read(page, attemptPath); expect(store.answers()).toEqual({}); expect(store.dirty()).toBeFalse(); expect(store.canSubmit()).toBeFalse(); expect(store.page()?.result?.earnedMarks).toBe(2);
  }));
  it('uses the stored deadline without automatic expiration/submission or deadline reset', fakeAsync(() => {
    const page = quizPage(true); start(page); store.now.set(Date.parse(page.attempt!.deadline) + 1000); expect(store.remaining()).toBe(0);
    expect(store.page()?.attempt?.status).toBe(1); http.expectNone('/bff/antiforgery');
    // A deliberate late submission still reaches the authoritative server, which can record expiration.
    store.askSubmit(); void store.submit(); csrf(); http.expectOne(attemptPath + '/submit').flush(null, { status: 409, statusText: 'Expired' }); flushMicrotasks();
    page.attempt = { ...page.attempt!, status: 3 }; page.attempts = [page.attempt]; page.questions = []; read(page, attemptPath);
    expect(store.notice()).toContain('expired'); expect(store.page()?.attempt?.status).toBe(3); expect(store.canSubmit()).toBeFalse();
  }));
  it('retains Completed history/results while blocking mutations and honors attempt limits', fakeAsync(() => {
    const page = quizPage(true); page.active = false; start(page); expect(store.canStart()).toBeFalse(); expect(store.canSubmit()).toBeFalse(); void store.start(); store.askSubmit(); void store.submit(); http.expectNone('/bff/antiforgery');
    const limited = quizPage(); limited.quiz!.maxAttempts = 1; limited.attempts = [{ ...page.attempt!, status: 3 }]; start(limited); expect(store.canStart()).toBeFalse();
  }));
  it('recovers ambiguous start via GET history and never replays or trusts an invalid start response', fakeAsync(() => {
    for (const invalid of [false, true]) {
      start(); void store.start(); csrf(); const request = http.expectOne(root + '/start');
      if (invalid) request.flush({ attemptId: '../private' }); else request.error(new ProgressEvent('error')); flushMicrotasks();
      read({ ...quizPage(), attempts: quizPage(true).attempts }); expect(store.recovery()).toBeTrue(); expect(store.notice()).toContain('unknown'); expect(store.pending()).toBeFalse();
      http.expectNone(root + '/start');
    }
  }));
  it('recovers ambiguous submit via stored status/results and discards unsent answers without replay', fakeAsync(() => {
    start(quizPage(true)); const q = store.page()!.questions[0]; store.choose(q, q.options[0].id, true); store.askSubmit(); void store.submit(); csrf(); http.expectOne(attemptPath + '/submit').error(new ProgressEvent('error')); flushMicrotasks();
    expect(store.answers()).toEqual({}); read(quizPage(true), attemptPath); expect(store.canSubmit()).toBeFalse(); expect(store.recovery()).toBeTrue();
    store.acknowledgeRecovery(); expect(store.canSubmit()).toBeTrue(); expect(store.answers()).toEqual({}); http.expectNone(attemptPath + '/submit');
  }));
  it('clears state on failed recovery and rejects stale GETs, mutations and CSRF work', fakeAsync(() => {
    start(); void store.start(); csrf(); const mutation = http.expectOne(root + '/start');
    state.accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'new-org' } }, () => {}); store.bind(state.session(), false, selection, null);
    read({ ...quizPage(), organizationId: 'new-org' }); mutation.flush({ attemptId }); flushMicrotasks(); expect(store.page()?.organizationId).toBe('new-org'); http.expectNone(root);
    void store.start(); const bootstrap = http.expectOne('/bff/antiforgery'); state.clear(); store.bind(null, false, selection, null); bootstrap.flush({ requestToken: 'old', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); http.expectNone(root + '/start');
    expect(store.page()).toBeNull(); expect(store.answers()).toEqual({});
  }));
  it('rejects foreign response parents and pre-submission result disclosure', fakeAsync(() => {
    for (const page of [{ ...quizPage(), organizationId: 'foreign' }, { ...quizPage(), lessonId: selection.courseId }, { ...quizPage(), result: { attemptId, earnedMarks: 6, possibleMarks: 6, passingPercentageSnapshot: 70, isPassed: true } }]) {
      start(page); expect(store.page()).toBeNull(); expect(store.error()).toContain('unknown');
    }
  }));
  it('clears on 401 and handles safe failures without displaying diagnostics', fakeAsync(() => {
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true); store.bind(state.session(), false, selection, null); http.expectOne(root).flush('PRIVATE', { status: 401, statusText: 'Unauthorized' }); flushMicrotasks(); expect(state.session()).toBeNull();
    state.accept(selectedSession(), () => {}); store.bind(state.session(), false, selection, null); http.expectOne(root).flush('PRIVATE', { status: 403, statusText: 'Forbidden' }); flushMicrotasks(); expect(store.page()).toBeNull(); expect(store.error()).not.toContain('PRIVATE');
    store.bind(null, false, selection, null);
  }));
  it('warns for unsent selections and pending actions only in the current verified context', fakeAsync(() => {
    start(quizPage(true)); const q = store.page()!.questions[0]; store.choose(q, q.options[0].id, true); expect(store.shouldWarn()).toBeTrue();
    TestBed.inject(AuthService).checking.set(true); expect(store.shouldWarn()).toBeFalse(); store.bind(state.session(), true, selection, attemptId); expect(store.answers()).toEqual({});
  }));
});
