import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { AuthService } from '../../core/auth/auth.service';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { StudentProgressService } from './student-progress.service';
import { StudentProgress } from './student-progress.models';
import { selection } from './student-viewer.testing';
import { viewerRoot } from './student-viewer.models';
import { courseSelection, startedLesson, storedProgress } from './student-progress.testing';

describe('Student explicit progress actions', () => {
  let store: StudentProgressService; let state: AuthState; let http: HttpTestingController;
  const root = viewerRoot(selection)!; const course = viewerRoot(courseSelection)!;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [StudentProgressService, provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting()] });
    store = TestBed.inject(StudentProgressService); state = TestBed.inject(AuthState); http = TestBed.inject(HttpTestingController);
    state.accept(selectedSession(), () => {});
  });
  afterEach(() => { state.clear(); http.verify(); });
  function read(data: StudentProgress, path = root): void {
    const request = http.expectOne(path + '/progress'); expect(request.request.method).toBe('GET'); request.flush(data); flushMicrotasks();
  }
  function start(data = storedProgress(), path = root): void {
    store.bind(state.session(), false, data.lessonId ? selection : courseSelection); read(data, path);
  }
  function csrf(): void { http.expectOne('/bff/antiforgery').flush({ requestToken: 'memory-csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); }
  it('navigation reads stored state without CSRF, timestamps or progress writes', fakeAsync(() => {
    const data = { ...storedProgress(), lesson: startedLesson }; start(data); expect(store.data()?.lesson?.lastAccessedAt).toBe(startedLesson.lastAccessedAt);
    void store.refresh(); read(data); expect(store.data()?.lesson?.lastAccessedAt).toBe(startedLesson.lastAccessedAt);
    http.expectNone('/bff/antiforgery');
  }));
  it('starts only on explicit action with CSRF and prevents duplicate clicks', fakeAsync(() => {
    start(); void store.changeLesson('start'); void store.changeLesson('start'); expect(store.pending()).toBeTrue(); csrf();
    const request = http.expectOne(root + '/progress/start'); expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({});
    expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('memory-csrf'); expect(request.request.headers.has('Authorization')).toBeFalse(); expect(request.request.headers.has('X-Organization-Id')).toBeFalse();
    request.flush(null, { status: 204, statusText: 'No Content' }); flushMicrotasks(); read({ ...storedProgress(), lesson: startedLesson });
    expect(store.pending()).toBeFalse(); expect(store.data()?.lesson?.progressPercentage).toBe(25);
  }));
  it('requires lesson confirmation, sends empty POST with CSRF and prevents repeats', fakeAsync(() => {
    start({ ...storedProgress(), lesson: { ...startedLesson, progressPercentage: 37.5123 } });
    void store.changeLesson('complete'); http.expectNone('/bff/antiforgery');
    store.askLessonCompletion(); store.confirmingLesson.set(false);
    void store.changeLesson('complete'); http.expectNone('/bff/antiforgery');
    store.askLessonCompletion(); void store.changeLesson('complete'); void store.changeLesson('complete'); csrf();
    const complete = http.expectOne(root + '/progress/complete');
    expect(complete.request.method).toBe('POST'); expect(complete.request.body).toEqual({});
    expect(complete.request.headers.get('X-CSRF-TOKEN')).toBe('memory-csrf');
    complete.flush(null, { status: 204, statusText: 'No Content' }); flushMicrotasks();
    read({ ...storedProgress(), lesson: { ...startedLesson, isCompleted: true, progressPercentage: 37.5123 } });
    expect(store.data()?.lesson?.progressPercentage).toBe(37.5123);
    expect(store.data()?.enrollment.status).toBe('Active'); expect(store.confirmingLesson()).toBeFalse();
    store.askLessonCompletion(); void store.changeLesson('complete'); http.expectNone('/bff/antiforgery');
  }));
  it('disables Completed-enrollment mutations while retaining reads', fakeAsync(() => {
    const data = { ...storedProgress(), lesson: startedLesson };
    start({ ...data, enrollment: { ...data.enrollment, status: 'Completed', completedAt: '2026-10-03T10:00:00Z' } });
    for (const action of ['start', 'complete'] as const) void store.changeLesson(action);
    store.askLessonCompletion(); expect(store.confirmingLesson()).toBeFalse();
    store.askCompletion(); void store.completeEnrollment(); expect(store.confirming()).toBeFalse(); http.expectNone('/bff/antiforgery');
  }));
  it('recovers uncertain completion with GET and hides completion after a committed write', fakeAsync(() => {
    start({ ...storedProgress(), lesson: startedLesson }); store.askLessonCompletion();
    void store.changeLesson('complete'); csrf();
    http.expectOne(root + '/progress/complete').flush({ message: 'PRIVATE' }, { status: 502, statusText: 'Unavailable' }); flushMicrotasks();
    expect(store.actionError()).not.toContain('PRIVATE');
    read({ ...storedProgress(), lesson: { ...startedLesson, isCompleted: true, progressPercentage: 100 } });
    store.askLessonCompletion(); void store.changeLesson('complete'); http.expectNone('/bff/antiforgery');
  }));
  it('clears lesson confirmation on refresh and selection changes', fakeAsync(() => {
    const data = { ...storedProgress(), lesson: startedLesson }; start(data);
    store.askLessonCompletion(); expect(store.confirmingLesson()).toBeTrue();
    void store.refresh(); expect(store.confirmingLesson()).toBeFalse(); read(data);
    void store.changeLesson('complete'); http.expectNone('/bff/antiforgery');
    store.askLessonCompletion(); store.bind(state.session(), false, courseSelection);
    expect(store.confirmingLesson()).toBeFalse(); read(storedProgress(false), course);
    void store.changeLesson('complete'); http.expectNone('/bff/antiforgery');
  }));
  it('requires published lessons, all completed and explicit course confirmation', fakeAsync(() => {
    const data = storedProgress(false); start({ ...data, current: { totalLessons: 0, completedLessons: 0, progressPercentage: 0, isCompleted: false } }, course);
    store.askCompletion(); expect(store.confirming()).toBeFalse(); start(data, course); expect(store.canComplete()).toBeFalse();
    const eligible = { ...data, current: { totalLessons: 2, completedLessons: 2, progressPercentage: 100, isCompleted: true } }; start(eligible, course);
    void store.completeEnrollment(); http.expectNone('/bff/antiforgery'); store.askCompletion(); http.expectNone('/bff/antiforgery');
    void store.completeEnrollment(); void store.completeEnrollment(); csrf();
    const complete = http.expectOne(course + '/enrollments/' + data.enrollment.id + '/complete'); expect(complete.request.method).toBe('POST'); expect(complete.request.body).toEqual({ confirmed: true });
    complete.flush(null); flushMicrotasks(); read({ ...eligible, enrollment: { ...data.enrollment, status: 'Completed', completedAt: '2026-10-03T10:00:00Z' } }, course);
    expect(store.canComplete()).toBeFalse(); expect(store.confirming()).toBeFalse();
  }));
  it('recovers an ambiguous committed write using only GET without replay', fakeAsync(() => {
    start(); void store.changeLesson('start'); csrf(); http.expectOne(root + '/progress/start').error(new ProgressEvent('error')); flushMicrotasks();
    expect(store.actionError()).toContain('no action was automatically repeated'); read({ ...storedProgress(), lesson: startedLesson });
    expect(store.data()?.lesson).toEqual(startedLesson); expect(store.pending()).toBeFalse();
  }));
  it('refreshes after validation/conflicts and blocks further actions when recovery fails', fakeAsync(() => {
    for (const status of [400, 409]) {
      start(); void store.changeLesson('start'); csrf(); http.expectOne(root + '/progress/start').flush({ message: 'PRIVATE' }, { status, statusText: 'Rejected' }); flushMicrotasks();
      expect(store.actionError()).not.toContain('PRIVATE');
      http.expectOne(root + '/progress').flush('PRIVATE', { status: 502, statusText: 'Unavailable' }); flushMicrotasks();
      expect(store.data()).toBeNull(); expect(store.pending()).toBeFalse(); expect(store.loadError()).toContain('Reload');
      void store.changeLesson('start'); http.expectNone('/bff/antiforgery');
    }
  }));
  it('rejects stale reads and mutations after organization/session changes', fakeAsync(() => {
    store.bind(state.session(), false, selection); const old = http.expectOne(root + '/progress');
    state.accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'new-org' } }, () => {});
    store.bind(state.session(), false, selection); read({ ...storedProgress(), organizationId: 'new-org' }); old.flush(storedProgress()); flushMicrotasks();
    expect(store.data()?.organizationId).toBe('new-org');
    void store.changeLesson('start'); csrf(); const mutation = http.expectOne(root + '/progress/start');
    state.clear(); store.bind(null, false, selection); mutation.flush(null); flushMicrotasks(); expect(store.data()).toBeNull(); http.expectNone(root + '/progress');
  }));
  it('does not send a mutation when context changes during CSRF bootstrap', fakeAsync(() => {
    start(); void store.changeLesson('start'); const bootstrap = http.expectOne('/bff/antiforgery');
    TestBed.inject(AuthService).checking.set(true); store.bind(state.session(), true, selection);
    bootstrap.flush({ requestToken: 'old', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); http.expectNone(root + '/progress/start'); expect(store.pending()).toBeFalse();
  }));
  it('rejects mismatched organization/parent/enrollment responses and handles denial safely', fakeAsync(() => {
    for (const data of [{ ...storedProgress(), organizationId: 'foreign' }, { ...storedProgress(), lessonId: selection.courseId }, { ...storedProgress(), enrollment: { ...storedProgress().enrollment, id: '../evil' } }]) {
      start(data); expect(store.data()).toBeNull(); expect(store.loadError()).toContain('could not be loaded');
    }
    start(); void store.changeLesson('start'); csrf(); http.expectOne(root + '/progress/start').flush(null, { status: 403, statusText: 'Forbidden' }); flushMicrotasks();
    expect(store.data()).toBeNull(); expect(store.fatal()).toContain('denied');
  }));
  it('expires the session on a progress 401', fakeAsync(() => {
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    store.bind(state.session(), false, selection); http.expectOne(root + '/progress').flush(null, { status: 401, statusText: 'Unauthorized' }); flushMicrotasks();
    expect(state.session()).toBeNull(); store.bind(null, false, selection); expect(store.data()).toBeNull();
  }));
});
