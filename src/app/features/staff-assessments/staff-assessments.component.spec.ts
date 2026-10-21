import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { StaffAssessmentsComponent } from './staff-assessments.component';
import { AssignmentPage, QuizPage, decimalValid } from './staff-assessments.models';
import { workspaceAllows } from '../../core/auth/workspace-routing';

describe('Staff assessment authoring and grading', () => {
  const courseId = '11111111-1111-1111-1111-111111111111', sectionId = '22222222-2222-2222-2222-222222222222', lessonId = '33333333-3333-3333-3333-333333333333', quizId = '44444444-4444-4444-4444-444444444444', questionId = '55555555-5555-5555-5555-555555555555', optionId = '66666666-6666-6666-6666-666666666666', assignmentId = '77777777-7777-7777-7777-777777777777', submissionId = '88888888-8888-8888-8888-888888888888';
  const root = `/bff/staff/courses/${courseId}/sections/${sectionId}/lessons/${lessonId}`;
  const settings = { title: 'Quiz', description: '<script>description</script>', passingPercentage: '50', timeLimitInMinutes: 15, maxAttempts: 2 };
  const quizData = (): QuizPage => ({ quiz: { ...settings, id: quizId, isPublished: false }, form: { ...settings }, questions: [{ question: { id: questionId, questionText: '<img src=x>', questionType: 1, displayOrder: 1, marks: '2' }, options: [{ id: optionId, optionText: '<script>Option</script>', isCorrect: true, displayOrder: 1 }] }] });
  const assignmentData = (): AssignmentPage => ({ assignments: [{ id: assignmentId, title: 'Assignment', instructions: 'Exact\r\nInstructions', dueAtUtc: '2026-12-01T10:20:30.1234567Z', maximumMarks: '9999999999999999.99', isPublished: false, frozen: false }], assignment: null, submission: null });
  const workData = (): AssignmentPage => ({ ...assignmentData(), assignment: assignmentData().assignments[0], submission: { id: submissionId, assignmentId, userId: 'Learner', text: '<script>work</script>', hasAttachment: true, submittedAt: '2026-10-01T00:00:00Z', instructionsSnapshot: '<img src=x>', maximumMarksSnapshot: '10.00', grade: null } });
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let data: BehaviorSubject<{ mode: string }>;
  let http: HttpTestingController;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ courseId, sectionId, lessonId })); data = new BehaviorSubject({ mode: 'quiz' });
    TestBed.configureTestingModule({ imports: [StaffAssessmentsComponent], providers: [provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { paramMap: params, data, snapshot: { paramMap: params.value, data: data.value } } }] });
    TestBed.inject(AuthState).accept(selectedSession('Instructor'), () => {}); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); http.verify(); });
  function setup(mode = 'quiz', response: QuizPage | AssignmentPage = quizData()) {
    data.next({ mode }); if (mode === 'submission') params.next(convertToParamMap({ courseId, sectionId, lessonId, assignmentId, submissionId }));
    const fixture = TestBed.createComponent(StaffAssessmentsComponent); fixture.detectChanges();
    http.expectOne(mode === 'quiz' ? root + '/quiz' : root + '/assignments' + (mode === 'submission' ? `/${assignmentId}/submissions/${submissionId}` : '')).flush(response);
    flushMicrotasks(); fixture.detectChanges(); flushMicrotasks(); return fixture;
  }
  function csrf() { http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); }
  function submit(fixture: ReturnType<typeof setup>, index = 0) { fixture.nativeElement.querySelectorAll('form')[index].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
  it('renders staff answer options safely and saves settings explicitly with CSRF and duplicate prevention', fakeAsync(() => {
    const fixture = setup(); const c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('script,img')).toBeNull(); expect(fixture.nativeElement.textContent).toContain('<script>Option');
    c.quizForm.title = 'Edited'; c.changed(); submit(fixture); submit(fixture); csrf(); const write = http.expectOne(root + '/quiz/' + quizId);
    expect(write.request.method).toBe('PUT'); expect(write.request.headers.get('X-CSRF-TOKEN')).toBe('csrf'); expect(write.request.body).toEqual(c.quizForm);
    write.flush({ code: 'validation_failed', message: 'Check numeric bounds.' }, { status: 400, statusText: 'Bad Request' }); flushMicrotasks();
    expect(c.quizForm.title).toBe('Edited'); expect(c.dirty).toBeTrue(); expect(c.pending()).toBeFalse(); expect(c.error()).toBe('Check numeric bounds.');
  }));
  it('sends each existing question type and correct option payloads without writing on reads', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance;
    for (const type of [1, 2, 3]) {
      c.questionForm = { questionText: 'Question', questionType: type, displayOrder: 2, marks: '1.5' }; fixture.detectChanges(); flushMicrotasks(); submit(fixture, 1); csrf();
      const write = http.expectOne(root + '/quiz/' + quizId + '/questions'); expect(write.request.body.questionType).toBe(type); expect(write.request.body.marks).toBe('1.5'); write.flush(null); flushMicrotasks(); http.expectOne(root + '/quiz').flush(quizData()); flushMicrotasks(); fixture.detectChanges(); flushMicrotasks();
    }
    c.editOption(questionId, quizData().questions[0].options[0]); fixture.detectChanges(); flushMicrotasks(); submit(fixture, 2); csrf();
    const option = http.expectOne(root + `/quiz/${quizId}/questions/${questionId}/options/${optionId}`); expect(option.request.method).toBe('PUT'); expect(option.request.body).toEqual({ optionText: '<script>Option</script>', displayOrder: 1, isCorrect: true }); option.flush(null); flushMicrotasks(); http.expectOne(root + '/quiz').flush(quizData()); flushMicrotasks();
  }));
  it('confirms publication and deletion and displays server publication errors as text', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; const confirm = spyOn(window, 'confirm').and.returnValue(false);
    void c.publishQuiz(true); void c.deleteQuiz(); void c.deletePart(questionId, optionId); http.expectNone('/bff/antiforgery');
    confirm.and.returnValue(true); void c.publishQuiz(true); csrf(); const write = http.expectOne(root + '/quiz/' + quizId + '/publication'); expect(write.request.body).toEqual({ action: 'publish', confirmed: true });
    write.flush({ code: 'conflict', message: 'Question 1 must have exactly one correct option.' }, { status: 409, statusText: 'Conflict' }); flushMicrotasks(); http.expectOne(root + '/quiz').flush(quizData()); flushMicrotasks(); expect(c.error()).toContain('exactly one correct');
    void c.deletePart(questionId, optionId); csrf(); const deletion = http.expectOne(root + `/quiz/${quizId}/questions/${questionId}/options/${optionId}/delete`); expect(deletion.request.body).toEqual({ confirmed: true }); deletion.flush(null); flushMicrotasks(); http.expectOne(root + '/quiz').flush(quizData()); flushMicrotasks();
  }));
  it('disables published quiz editors and explains attempt locks without querying learner history', fakeAsync(() => {
    const page = quizData(); page.quiz!.isPublished = true; const fixture = setup('quiz', page);
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBeTrue(); expect(fixture.nativeElement.textContent).toContain('After any attempt exists'); http.expectNone(request => request.url.includes('/attempts'));
  }));
  it('keeps exact stored deadlines/maximum strings for title-only assignment edits', fakeAsync(() => {
    const fixture = setup('assignments', assignmentData()), c = fixture.componentInstance; c.editAssignment(assignmentData().assignments[0]); fixture.detectChanges(); flushMicrotasks();
    c.assignmentForm.title = 'Title only'; submit(fixture); csrf(); const write = http.expectOne(root + '/assignments/' + assignmentId);
    expect(write.request.method).toBe('PUT'); expect(write.request.body.dueAtUtc).toBe('2026-12-01T10:20:30.1234567Z'); expect(write.request.body.maximumMarks).toBe('9999999999999999.99'); expect(write.request.body.protectedFieldsChanged).toBeFalse(); expect(write.request.body.dueAtChanged).toBeFalse();
    write.flush({}, { status: 400, statusText: 'Bad Request' }); flushMicrotasks(); expect(c.assignmentForm.title).toBe('Title only'); expect(c.assignmentForm.instructions).toBe('Exact\r\nInstructions');
    expect(fixture.nativeElement.textContent).toContain('device timezone'); expect(fixture.nativeElement.textContent).toContain('UTC wall-clock');
  }));
  it('sends deliberate UTC deadline edits and creation payloads without local conversion', fakeAsync(() => {
    const fixture = setup('assignments', assignmentData()), c = fixture.componentInstance;
    c.assignmentForm = { title: 'Draft', instructions: 'Instructions', maximumMarks: '10.25', dueAtUtc: null, dueAtChanged: true, protectedFieldsChanged: true }; c.dueInput = '2026-12-01T10:20:30'; fixture.detectChanges(); flushMicrotasks(); submit(fixture); csrf();
    const write = http.expectOne(root + '/assignments'); expect(write.request.method).toBe('POST'); expect(write.request.body.dueAtUtc).toBe('2026-12-01T10:20:30Z'); expect(write.request.body.maximumMarks).toBe('10.25'); write.flush(null); flushMicrotasks(); http.expectOne(root + '/assignments').flush(assignmentData()); flushMicrotasks();
  }));
  it('disables frozen protected fields while allowing title edits and confirmed publication', fakeAsync(() => {
    const page = assignmentData(); page.assignments[0].frozen = true; const fixture = setup('assignments', page), c = fixture.componentInstance; c.editAssignment(page.assignments[0]); fixture.detectChanges(); flushMicrotasks();
    expect(fixture.nativeElement.querySelector('[name=instructions]').disabled).toBeTrue(); expect(fixture.nativeElement.querySelector('[name=dueAtUtc]').disabled).toBeTrue(); expect(fixture.nativeElement.querySelector('[name=title]').disabled).toBeFalse();
    spyOn(window, 'confirm').and.returnValue(true); void c.publishAssignment(page.assignments[0]); csrf(); const write = http.expectOne(root + '/assignments/' + assignmentId + '/publication'); expect(write.request.body).toEqual({ isPublished: true, confirmed: true }); write.flush(null); flushMicrotasks(); http.expectOne(root + '/assignments').flush(page); flushMicrotasks();
  }));
  it('requires confirmation and preserves decimal graded zero, showing final feedback with no override form', fakeAsync(() => {
    const fixture = setup('submission', workData()), c = fixture.componentInstance; const confirm = spyOn(window, 'confirm').and.returnValue(false);
    c.gradeForm = { marks: '0.00', feedback: '<script>feedback</script>' }; fixture.detectChanges(); flushMicrotasks(); submit(fixture); http.expectNone('/bff/antiforgery'); confirm.and.returnValue(true); submit(fixture); submit(fixture); csrf();
    const url = root + `/assignments/${assignmentId}/submissions/${submissionId}`; const write = http.expectOne(url + '/grade'); expect(write.request.body).toEqual({ marks: '0.00', feedback: '<script>feedback</script>', confirmed: true });
    write.flush(null); flushMicrotasks(); const graded = workData(); graded.submission!.grade = { marks: '0.00', feedback: '<script>feedback</script>', gradedAt: '2026-10-01T00:00:00Z' }; http.expectOne(url).flush(graded); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Existing final grade: 0.00 / 10.00'); expect(fixture.nativeElement.querySelector('script,img,form')).toBeNull(); expect(fixture.nativeElement.querySelector('a[href$="/attachment"]')).not.toBeNull();
  }));
  it('reads stored final grade after concurrent conflict and never replays an uncertain grade', fakeAsync(() => {
    const fixture = setup('submission', workData()), c = fixture.componentInstance; spyOn(window, 'confirm').and.returnValue(true); c.gradeForm = { marks: '1', feedback: 'Entered' }; fixture.detectChanges(); flushMicrotasks(); submit(fixture); csrf();
    const url = root + `/assignments/${assignmentId}/submissions/${submissionId}`; http.expectOne(url + '/grade').error(new ProgressEvent('error')); flushMicrotasks(); const graded = workData(); graded.submission!.grade = { marks: '0', feedback: 'Stored', gradedAt: '2026-10-01T00:00:00Z' }; http.expectOne(url).flush(graded); flushMicrotasks(); fixture.detectChanges();
    expect(c.locked()).toBeTrue(); expect(c.gradeForm.feedback).toBe('Entered'); expect(fixture.nativeElement.textContent).toContain('Stored'); expect(fixture.nativeElement.querySelector('form')).toBeNull();
  }));
  it('recovers uncertain quiz creation by GET and locks writes without dropping entered settings', fakeAsync(() => {
    const empty = quizData(); empty.quiz = null; empty.questions = []; const fixture = setup('quiz', empty), c = fixture.componentInstance; submit(fixture); csrf();
    http.expectOne(root + '/quiz').error(new ProgressEvent('error')); flushMicrotasks(); const read = http.expectOne(root + '/quiz'); expect(read.request.method).toBe('GET'); read.flush(quizData()); flushMicrotasks();
    expect(c.locked()).toBeTrue(); expect(c.quizForm.title).toBe('Quiz'); submit(fixture); http.expectNone('/bff/antiforgery');
  }));
  it('clears sensitive assessment state on organization changes and rejects late reads/writes', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; void c.load(); const stale = http.expectOne(root + '/quiz'); c.questionForm.questionText = 'Old secret'; c.changed();
    TestBed.inject(AuthState).accept({ ...selectedSession('Instructor'), selectedOrganization: { ...selectedSession('Instructor').selectedOrganization!, id: 'new-org' } }, () => {}); fixture.detectChanges(); expect(c.questionForm.questionText).toBe(''); stale.flush(quizData()); flushMicrotasks(); expect(c.quiz()).toBeNull();
    const current = http.expectOne(root + '/quiz'); TestBed.inject(AuthState).clear(); fixture.detectChanges(); current.flush(quizData()); flushMicrotasks(); expect(c.quiz()).toBeNull(); expect(c.canLeave()).toBeTrue();
  }));
  it('checks context again after CSRF and clears at absolute expiry', fakeAsync(() => {
    TestBed.inject(AuthState).accept({ ...selectedSession('Instructor'), expiresAt: new Date(Date.now() + 1000).toISOString() }, () => {});
    const fixture = setup(), c = fixture.componentInstance; submit(fixture); const token = http.expectOne('/bff/antiforgery'); tick(1000); fixture.detectChanges(); token.flush({ requestToken: 'old', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); http.expectNone(root + '/quiz/' + quizId); expect(c.quiz()).toBeNull(); expect(c.pending()).toBeFalse();
  }));
  it('paginates staff submissions through bounded reads and distinguishes ungraded from graded zero', fakeAsync(() => {
    data.next({ mode: 'assignment' }); params.next(convertToParamMap({ courseId, sectionId, lessonId, assignmentId }));
    const fixture = TestBed.createComponent(StaffAssessmentsComponent); fixture.detectChanges(); const url = root + '/assignments/' + assignmentId;
    http.expectOne(url).flush({ ...assignmentData(), assignment: assignmentData().assignments[0] }); flushMicrotasks(); http.expectOne(url + '/submissions?page=1&pageSize=20').flush({ page: 1, pageSize: 20, total: 21, items: [workData().submission] }); flushMicrotasks(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Ungraded');
    void fixture.componentInstance.paginate(1); http.expectOne(url).flush(assignmentData()); flushMicrotasks(); const graded = workData().submission!; graded.grade = { marks: '0', feedback: '', gradedAt: '2026-10-01T00:00:00Z' }; http.expectOne(url + '/submissions?page=2&pageSize=20').flush({ page: 2, pageSize: 20, total: 21, items: [graded] }); flushMicrotasks(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Graded: 0 / 10.00');
  }));
  it('validates decimal syntax, warns on leaving and permits only staff assessment routes', fakeAsync(() => {
    const fixture = setup(); fixture.componentInstance.changed(); spyOn(window, 'confirm').and.returnValue(false); expect(fixture.componentInstance.canLeave()).toBeFalse();
    expect(decimalValid('0.00')).toBeTrue(); expect(decimalValid('9999999999999999.99')).toBeTrue(); expect(decimalValid('-1')).toBeFalse(); expect(decimalValid('1.001')).toBeFalse();
    const path = `/workspace/staff/courses/${courseId}/sections/${sectionId}/lessons/${lessonId}/assignments/${assignmentId}/submissions/${submissionId}`;
    expect(workspaceAllows(selectedSession('Admin'), path)).toBeTrue(); expect(workspaceAllows(selectedSession(), path)).toBeFalse();
  }));
  it('accepts the server UTC offset spelling without changing deadline precision', fakeAsync(() => {
    const fixture = setup('assignments', assignmentData()), c = fixture.componentInstance;
    c.editAssignment({ ...assignmentData().assignments[0], dueAtUtc: '2026-12-01T10:20:30.1234567+00:00' });
    expect(c.dueInput).toBe('2026-12-01T10:20:30.1234567'); expect(c.assignmentForm.dueAtChanged).toBeFalse(); expect(c.assignmentForm.dueAtUtc).toBe('2026-12-01T10:20:30.1234567+00:00');
  }));
  it('refreshes a concurrent final-grade conflict without replacing entered values or offering an override', fakeAsync(() => {
    const fixture = setup('submission', workData()), c = fixture.componentInstance; spyOn(window, 'confirm').and.returnValue(true);
    c.gradeForm = { marks: '5', feedback: 'Entered feedback' }; fixture.detectChanges(); flushMicrotasks(); submit(fixture); csrf();
    const url = root + `/assignments/${assignmentId}/submissions/${submissionId}`;
    http.expectOne(url + '/grade').flush({ code: 'conflict', message: 'This submission has already been graded. The original grade is retained.' }, { status: 409, statusText: 'Conflict' }); flushMicrotasks();
    const stored = workData(); stored.submission!.grade = { marks: '0', feedback: 'Other grader', gradedAt: '2026-10-01T00:00:00Z' }; http.expectOne(url).flush(stored); flushMicrotasks(); fixture.detectChanges();
    expect(c.gradeForm.feedback).toBe('Entered feedback'); expect(fixture.nativeElement.textContent).toContain('Other grader'); expect(fixture.nativeElement.querySelector('form')).toBeNull();
  }));
});
