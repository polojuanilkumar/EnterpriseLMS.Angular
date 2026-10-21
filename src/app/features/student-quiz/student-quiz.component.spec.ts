import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { selection } from '../student-viewer/student-viewer.testing';
import { viewerRoot } from '../student-viewer/student-viewer.models';
import { StudentQuizComponent } from './student-quiz.component';
import { StudentQuiz } from './student-quiz.models';
import { attemptId, quizPage } from './student-quiz.testing';

describe('Student quiz rendering and leave policy', () => {
  const root = viewerRoot(selection)! + '/quiz'; const path = root + '/attempts/' + attemptId;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap(selection));
    TestBed.configureTestingModule({ imports: [StudentQuizComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { paramMap: params.value } } }] });
    TestBed.inject(AuthState).accept(selectedSession(), () => {});
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); TestBed.inject(HttpTestingController).verify(); });
  function render(page: StudentQuiz) {
    params.next(convertToParamMap({ ...selection, ...(page.attempt ? { attemptId } : {}) }));
    const fixture = TestBed.createComponent(StudentQuizComponent); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(page.attempt ? path : root).flush(page); flushMicrotasks(); fixture.detectChanges(); return fixture;
  }
  it('renders safe text and native SingleChoice, MultipleChoice and TrueFalse options', fakeAsync(() => {
    const fixture = render(quizPage(true)); const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('script,img,iframe')).toBeNull(); expect(element.textContent).toContain('Quiz <script>'); expect(element.textContent).toContain('<img src=x');
    expect(element.querySelectorAll('input[type=radio]').length).toBe(4); expect(element.querySelectorAll('input[type=checkbox]').length).toBe(2);
    expect(element.textContent).toContain('TrueFalse'); expect(element.textContent).toContain('not unsent selections'); expect(element.textContent).not.toContain('Stored result');
    expect(element.querySelector('input')?.closest('label')).not.toBeNull(); expect(element.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull(); fixture.destroy();
  }));
  it('requires submission confirmation and never sends on countdown expiration', fakeAsync(() => {
    const page = quizPage(true); page.attempt!.deadline = new Date(Date.now() + 1000).toISOString();
    const fixture = render(page); const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLInputElement>('input')!.click(); fixture.detectChanges(); expect(fixture.componentInstance.store.dirty()).toBeTrue();
    const submit = Array.from(element.querySelectorAll('button')).find(button => button.textContent?.includes('Review and submit'))!; submit.click(); fixture.detectChanges();
    expect(element.textContent).toContain('Confirm submission'); TestBed.inject(HttpTestingController).expectNone('/bff/antiforgery');
    tick(2000); fixture.componentInstance.store.now.set(Date.now()); fixture.detectChanges(); expect(element.textContent).toContain('No answers are sent automatically'); TestBed.inject(HttpTestingController).expectNone('/bff/antiforgery');
    fixture.destroy();
  }));
  it('warns on routing, reload and beforeunload with unsent answers and permits logout context cleanup', fakeAsync(() => {
    const listeners = spyOn(window, 'addEventListener').and.callThrough();
    const fixture = render(quizPage(true)); const component = fixture.componentInstance; const q = component.store.page()!.questions[0]; component.store.choose(q, q.options[0].id, true);
    const confirm = spyOn(window, 'confirm').and.returnValue(false); expect(component.canLeave()).toBeFalse(); component.reload(); TestBed.inject(HttpTestingController).expectNone(path);
    const event = new Event('beforeunload', { cancelable: true });
    const handler = listeners.calls.all().find(call => call.args[0] === 'beforeunload')!.args[1] as EventListener;
    handler(event); expect(event.defaultPrevented).toBeTrue();
    confirm.and.returnValue(true); expect(component.canLeave()).toBeTrue();
    TestBed.inject(AuthState).clear(); fixture.detectChanges(); expect(component.store.answers()).toEqual({}); expect(component.canLeave()).toBeTrue(); expect(fixture.nativeElement.querySelector('input')).toBeNull(); fixture.destroy();
  }));
  it('resumes via GET and does not claim selections were restored', fakeAsync(() => {
    const fixture = render(quizPage(true)); const deadline = fixture.componentInstance.store.page()!.attempt!.deadline;
    fixture.componentInstance.reload(); const page = quizPage(true); page.attempt!.deadline = deadline;
    TestBed.inject(HttpTestingController).expectOne(path).flush(page); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.store.answers()).toEqual({}); expect(fixture.componentInstance.store.page()!.attempt!.deadline).toBe(deadline); TestBed.inject(HttpTestingController).expectNone(root + '/start'); fixture.destroy();
  }));
  it('displays stored result and selected snapshots safely for Completed learners', fakeAsync(() => {
    const page = quizPage(true); page.active = false; page.attempt = { ...page.attempt!, status: 2 }; page.attempts = [page.attempt]; page.questions = [];
    page.result = { attemptId, earnedMarks: 1.25, possibleMarks: 6, passingPercentageSnapshot: 70, isPassed: false };
    page.review = { attemptId, answers: [{ questionId: 'q', questionText: '<script>Snapshot', selectedOptions: [{ optionId: 'o', optionText: '<img>Selected' }] }] };
    const fixture = render(page); const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('1.25 / 6'); expect(element.textContent).toContain('Not passed'); expect(element.textContent).toContain('<script>Snapshot'); expect(element.textContent).toContain('<img>Selected'); expect(element.querySelector('script,img,input')).toBeNull();
    expect(element.textContent).toContain('start and submission are disabled'); expect(element.textContent).not.toContain('Start attempt ('); fixture.destroy();
  }));
  it('handles expired/unavailable states and rejects stale attempt responses after context change', fakeAsync(() => {
    const page = quizPage(true); page.attempt = { ...page.attempt!, status: 3 }; page.attempts = [page.attempt]; page.questions = [];
    const fixture = render(page); expect(fixture.nativeElement.textContent).toContain('This attempt is expired');
    fixture.componentInstance.reload(); const stale = TestBed.inject(HttpTestingController).expectOne(path);
    TestBed.inject(AuthState).accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'new-org' } }, () => {}); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(path).flush({ ...page, organizationId: 'new-org' }); flushMicrotasks(); fixture.detectChanges();
    stale.flush(quizPage(true)); flushMicrotasks(); fixture.detectChanges(); expect(fixture.componentInstance.store.page()?.organizationId).toBe('new-org'); expect(fixture.nativeElement.querySelector('input')).toBeNull(); fixture.destroy();
  }));
  it('navigates to the returned attempt only after an explicit successful start', fakeAsync(() => {
    const fixture = render(quizPage()); const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true); void fixture.componentInstance.start();
    TestBed.inject(HttpTestingController).expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks();
    TestBed.inject(HttpTestingController).expectOne(root + '/start').flush({ attemptId }); flushMicrotasks();
    TestBed.inject(HttpTestingController).expectOne(root).flush({ ...quizPage(), attempts: quizPage(true).attempts }); flushMicrotasks();
    expect(navigate).toHaveBeenCalledWith([...fixture.componentInstance.quizPath, 'attempts', attemptId]); fixture.destroy();
  }));
});
