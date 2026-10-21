import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { StudentCoursesService } from './student-courses.service';
import { courseRow } from './student-courses.testing';
import { CoursePageMode, StudentCourseRow } from './student-courses.models';

describe('Student course state and BFF requests', () => {
  let store: StudentCoursesService; let state: AuthState; let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [StudentCoursesService, provideRouter([]),
      provideHttpClient(withNoXsrfProtection(), withInterceptors([bffInterceptor])), provideHttpClientTesting()] });
    store = TestBed.inject(StudentCoursesService); state = TestBed.inject(AuthState); http = TestBed.inject(HttpTestingController);
    state.accept(selectedSession(), () => {});
  });
  afterEach(() => { state.clear(); http.verify(); });
  function read(rows: StudentCourseRow[], mode: CoursePageMode = 'catalog'): void {
    const request = http.expectOne(mode === 'catalog' ? '/bff/student/courses' : '/bff/student/my-courses');
    expect(request.request.method).toBe('GET'); expect(request.request.headers.has('X-CSRF-TOKEN')).toBeFalse();
    request.flush({ organizationId: state.session()?.selectedOrganization?.id, courses: rows }); flushMicrotasks();
  }
  function start(rows: StudentCourseRow[], mode: CoursePageMode = 'catalog'): void {
    store.bind(state.session(), false, mode); read(rows, mode);
  }
  function csrf(): void { http.expectOne('/bff/antiforgery').flush({ requestToken: 'memory-only', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); }

  it('loads catalog and My Courses separately without protected content or progress requests', fakeAsync(() => {
    start([courseRow()]); expect(store.rows()[0].enrollment).toBeNull();
    start([courseRow('Completed')], 'mine'); expect(store.rows()[0].enrollment?.status).toBe('Completed');
    expect(store.pending()).toBeNull();
  }));
  it('enrolls once with CSRF and no supplied identity, then reads stored state without persistence', fakeAsync(() => {
    const storage = spyOn(Storage.prototype, 'setItem'); const row = courseRow(); start([row]);
    void store.act(row, 'enroll'); void store.act(row, 'enroll'); expect(store.pending()).toBe('course'); csrf();
    const request = http.expectOne('/bff/student/courses/course/enroll');
    expect(request.request.body).toEqual({ confirmedReenrollment: false });
    expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('memory-only');
    expect(request.request.headers.has('X-Organization-Id')).toBeFalse(); expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush(null, { status: 204, statusText: 'No Content' }); flushMicrotasks(); read([courseRow('Active')]);
    expect(store.pending()).toBeNull(); expect(store.notice()).toBe('Enrollment created.');
    expect(store.rows()[0].enrollment?.status).toBe('Active'); expect(storage).not.toHaveBeenCalled();
  }));
  it('requires explicit confirmation for cancellation and reactivation and never allows completed reenrollment', fakeAsync(() => {
    const cancelled = courseRow('Cancelled'); start([cancelled]);
    void store.act(cancelled, 'reenroll'); http.expectNone('/bff/antiforgery');
    store.ask(cancelled, 'reenroll'); expect(store.confirmation()?.row).toBe(cancelled); http.expectNone('/bff/antiforgery');
    void store.confirm(); void store.confirm(); csrf();
    const reenroll = http.expectOne('/bff/student/courses/course/enroll'); expect(reenroll.request.body).toEqual({ confirmedReenrollment: true });
    reenroll.flush(null); flushMicrotasks(); read([courseRow('Active')]);
    const active = store.rows()[0]; store.ask(active, 'cancel'); http.expectNone('/bff/antiforgery');
    void store.confirm(); csrf(); const cancel = http.expectOne('/bff/student/courses/course/enrollments/enrollment-course/cancel');
    expect(cancel.request.body).toEqual({ confirmed: true }); cancel.flush(null); flushMicrotasks(); read([courseRow('Cancelled')]);
    expect(store.notice()).toBe('Enrollment cancelled.'); expect(store.pending()).toBeNull(); expect(store.confirmation()).toBeNull();
    const completed = courseRow('Completed'); start([completed]); void store.act(completed, 'reenroll', true); void store.act(completed, 'cancel', true);
    http.expectNone('/bff/antiforgery');
  }));
  it('refreshes after conflicts and validation errors with sanitized messages and cleared pending state', fakeAsync(() => {
    for (const status of [400, 409, 404]) {
      const row = courseRow(); start([row]); void store.act(row, 'enroll'); csrf();
      http.expectOne('/bff/student/courses/course/enroll').flush({ message: '<script>private diagnostic</script>' }, { status, statusText: 'Rejected' });
      flushMicrotasks(); read([courseRow('Active')]);
      expect(store.pending()).toBeNull(); expect(store.actionError()).not.toContain('private'); expect(store.actionError()).not.toContain('script');
      expect(store.actionError()).toContain(status === 409 ? 'conflicts' : status === 404 ? 'unavailable' : 'confirmation');
      http.expectNone('/bff/student/courses/course/enroll');
    }
  }));
  it('reads back an ambiguous mutation once and never automatically replays it, even if recovery GET fails', fakeAsync(() => {
    const row = courseRow(); start([row]); void store.act(row, 'enroll'); csrf();
    http.expectOne('/bff/student/courses/course/enroll').error(new ProgressEvent('error')); flushMicrotasks();
    expect(store.actionError()).toContain('no action was automatically repeated');
    http.expectOne('/bff/student/courses').flush('private diagnostic', { status: 502, statusText: 'Unavailable' }); flushMicrotasks();
    expect(store.rows()).toEqual([]); expect(store.pending()).toBeNull(); expect(store.loadError()).toContain('Reload');
    http.expectNone('/bff/student/courses/course/enroll');
  }));
  it('discards stale GET responses after organization changes and clears all page state on logout', fakeAsync(() => {
    store.bind(state.session(), false, 'catalog'); const old = http.expectOne('/bff/student/courses');
    state.accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'new-org' } }, () => {});
    store.bind(state.session(), false, 'catalog'); read([courseRow(null, 'new-course')]);
    old.flush({ organizationId: 'org', courses: [courseRow(null, 'old-course')] }); flushMicrotasks();
    expect(store.rows().map(row => row.courseId)).toEqual(['new-course']);
    state.clear(); store.bind(null, false, 'catalog'); expect(store.rows()).toEqual([]); expect(store.pending()).toBeNull();
  }));
  it('does not send a mutation after its CSRF bootstrap returns in a different organization', fakeAsync(() => {
    const row = courseRow(); start([row]); void store.act(row, 'enroll');
    state.accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'other' } }, () => {});
    store.bind(state.session(), false, 'catalog'); read([]); csrf();
    http.expectNone('/bff/student/courses/course/enroll'); expect(store.pending()).toBeNull();
  }));
  it('ignores a prior organization mutation response and rejects a mismatched GET organization', fakeAsync(() => {
    const row = courseRow(); start([row]); void store.act(row, 'enroll'); csrf();
    const old = http.expectOne('/bff/student/courses/course/enroll');
    state.accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'other' } }, () => {});
    store.bind(state.session(), false, 'catalog'); read([courseRow('Completed', 'other-course')]);
    old.flush(null); flushMicrotasks(); expect(store.notice()).toBe(''); expect(store.rows()[0].courseId).toBe('other-course');
    void store.refresh(); http.expectOne('/bff/student/courses').flush({ organizationId: 'wrong', courses: [row] }); flushMicrotasks();
    expect(store.rows()).toEqual([]); expect(store.loadError()).toContain('Reload');
  }));
  it('does not load for anonymous, expired, nonstudent, platform or uncertain sessions', fakeAsync(() => {
    for (const session of [null, selectedSession('Admin'), selectedSession(null, true), { ...selectedSession(), expiresAt: new Date(0).toISOString() }]) {
      store.bind(session, false, 'catalog'); http.expectNone('/bff/student/courses'); expect(store.rows()).toEqual([]);
    }
    store.bind(state.session(), true, 'catalog'); http.expectNone('/bff/student/courses');
  }));
});
