import { provideHttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { LoginComponent } from './features/auth/login/login.component';
import { AuthState } from './core/auth/auth-state';
import { selectedSession } from './core/auth/session.testing';
import { By } from '@angular/platform-browser';
import { StudentQuizComponent } from './features/student-quiz/student-quiz.component';
import { quizPage, attemptId, otherAttempt } from './features/student-quiz/student-quiz.testing';
import { selection } from './features/student-viewer/student-viewer.testing';
import { viewerRoot } from './features/student-viewer/student-viewer.models';
import { workspaceAllows } from './core/auth/workspace-routing';
import { StudentAssignmentsComponent } from './features/student-assignments/student-assignments.component';
import { assignmentData, submittedData, assignmentId, submissionId } from './features/student-assignments/student-assignments.testing';
import { gradeData } from './features/student-grades/student-grades.testing';

describe('App routing', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(AuthState).clear());

  it('prefixes lazy workspace navigation with /app while keeping BFF requests root-relative', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: APP_BASE_HREF, useValue: '/app/' }] });
    TestBed.inject(AuthState).accept(selectedSession('Instructor'), () => {});
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/workspace/instructor'); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('a[href="/app/workspace/staff/courses"]')).not.toBeNull();
    await harness.navigateByUrl('/workspace/staff/courses');
    const read = TestBed.inject(HttpTestingController).expectOne('/bff/staff/courses');
    expect(read.request.method).toBe('GET'); read.flush({ courses: [] });
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/workspace/staff/courses');
    expect(harness.routeNativeElement?.querySelector('a[href="/app/workspace/staff/courses/new"]')).not.toBeNull();
    TestBed.inject(HttpTestingController).expectNone('/app/bff/staff/courses');
    TestBed.inject(HttpTestingController).verify();
  });

  it('loads scoped organization administration and reports lazily inside the shell', async () => {
    TestBed.inject(AuthState).accept(selectedSession('Admin'), () => {});
    const harness = await RouterTestingHarness.create();
    for (const [path, endpoint, body] of [
      ['/workspace/organization/members', '/bff/organization/members', { members: [], page: 1, pageSize: 20, total: 0 }],
      ['/workspace/organization/invitations', '/bff/organization/invitations', { items: [], page: 1, pageSize: 20, total: 0 }],
      ['/workspace/staff/reports', '/bff/staff/reports/courses', { courses: { items: [], page: 1, pageSize: 20, total: 0 } }],
      ['/workspace/organization/audit', '/bff/organization/audit', { items: [], page: 1, pageSize: 20, total: 0, filter: { fromUtc: '2026-10-01T00:00:00Z', toUtc: '2026-10-15T00:00:00Z' }, actions: [], outcomes: [] }],
    ] as const) {
      await harness.navigateByUrl(path); const read = TestBed.inject(HttpTestingController).expectOne(endpoint + '?page=1&pageSize=20'); expect(read.request.method).toBe('GET'); read.flush(body);
      await harness.fixture.whenStable(); harness.detectChanges(); expect(TestBed.inject(Router).url).toBe(path);
      expect(harness.routeNativeElement?.querySelector('header')).not.toBeNull();
      expect(harness.routeNativeElement?.querySelector('a[href="/workspace/organization/members"]')).not.toBeNull();
    }
    TestBed.inject(HttpTestingController).verify();
  });

  it('keeps Instructor and Student out of administration while permitting Instructor reports', async () => {
    const harness = await RouterTestingHarness.create();
    TestBed.inject(AuthState).accept(selectedSession('Instructor'), () => {}); await harness.navigateByUrl('/workspace/staff/reports');
    TestBed.inject(HttpTestingController).expectOne('/bff/staff/reports/courses?page=1&pageSize=20').flush({ courses: { items: [], page: 1, pageSize: 20, total: 0 } });
    await harness.fixture.whenStable(); harness.detectChanges(); expect(TestBed.inject(Router).url).toBe('/workspace/staff/reports');
    expect(harness.routeNativeElement?.querySelector('a[href="/workspace/organization/members"]')).toBeNull();
    for (const [session, home] of [[selectedSession('Instructor'), '/workspace/instructor'], [selectedSession(), '/workspace/student'], [{ ...selectedSession(null, true), selectedOrganization: null }, '/workspace/platform']] as const) {
      TestBed.inject(AuthState).accept(session, () => {}); await harness.navigateByUrl('/workspace/organization/audit'); await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe(home); TestBed.inject(HttpTestingController).expectNone(r => r.url.startsWith('/bff/organization'));
    }
  });

  it('loads staff assessment pages lazily under the existing lesson hierarchy without progress writes', async () => {
    TestBed.inject(AuthState).accept(selectedSession('Instructor'), () => {});
    const harness = await RouterTestingHarness.create();
    const c = '11111111-1111-1111-1111-111111111111', s = '22222222-2222-2222-2222-222222222222', l = '33333333-3333-3333-3333-333333333333';
    const root = `/workspace/staff/courses/${c}/sections/${s}/lessons/${l}`;
    for (const suffix of ['/quiz', '/assignments']) {
      await harness.navigateByUrl(root + suffix);
      const request = TestBed.inject(HttpTestingController).expectOne(root.replace('/workspace/', '/bff/') + suffix);
      expect(request.request.method).toBe('GET');
      request.flush(suffix === '/quiz' ? { quiz: null, questions: [], form: { title: '', passingPercentage: 50, timeLimitInMinutes: 15, maxAttempts: 1 } } : { assignments: [], assignment: null, submission: null });
      await harness.fixture.whenStable(); harness.detectChanges(); expect(TestBed.inject(Router).url).toBe(root + suffix);
      expect(harness.routeNativeElement?.querySelector('header')).not.toBeNull();
      expect(harness.routeNativeElement?.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
    }
    TestBed.inject(HttpTestingController).verify();
  });

  it('keeps lazy staff hierarchy and forms inside the authorized role shell', async () => {
    TestBed.inject(AuthState).accept(selectedSession('Instructor'), () => {});
    const harness = await RouterTestingHarness.create();
    const c = '11111111-1111-1111-1111-111111111111', s = '22222222-2222-2222-2222-222222222222', l = '33333333-3333-3333-3333-333333333333';
    for (const [suffix, body] of [
      ['', { courses: [] }], ['/' + c, { course: { id: c, title: 'Course' }, sections: [] }],
      ['/' + c + '/sections/' + s, { section: { id: s, title: 'Section' }, lessons: [] }],
      ['/' + c + '/sections/' + s + '/lessons/' + l, { lesson: { id: l, title: 'Lesson' }, content: { items: [], legacy: null } }],
    ] as const) {
      const path = '/workspace/staff/courses' + suffix;
      await harness.navigateByUrl(path); TestBed.inject(HttpTestingController).expectOne('/bff/staff/courses' + suffix).flush(body);
      await harness.fixture.whenStable(); harness.detectChanges(); expect(TestBed.inject(Router).url).toBe(path);
      expect(harness.routeNativeElement?.querySelector('header')).not.toBeNull();
      expect(harness.routeNativeElement?.querySelector('a[href="/workspace/staff/courses"]')).not.toBeNull();
    }
    TestBed.inject(HttpTestingController).verify();
  });

  it('denies staff routes to Students and unselected platform sessions before loading data', async () => {
    const harness = await RouterTestingHarness.create();
    for (const [session, home] of [[selectedSession(), '/workspace/student'], [{ ...selectedSession(null, true), selectedOrganization: null }, '/workspace/platform']] as const) {
      TestBed.inject(AuthState).accept(session, () => {}); await harness.navigateByUrl('/workspace/staff/courses');
      await harness.fixture.whenStable(); expect(TestBed.inject(Router).url).toBe(home);
      TestBed.inject(HttpTestingController).expectNone(request => request.url.startsWith('/bff/staff'));
    }
  });

  it('keeps lazy Student catalog and My Courses inside the shell without returning to overview', async () => {
    TestBed.inject(AuthState).accept(selectedSession(), () => {});
    const harness = await RouterTestingHarness.create();
    for (const [path, endpoint, title] of [
      ['/workspace/student/catalog', '/bff/student/courses', 'Published course catalog'],
      ['/workspace/student/my-courses', '/bff/student/my-courses', 'My Courses'],
    ]) {
      await harness.navigateByUrl(path);
      TestBed.inject(HttpTestingController).expectOne(endpoint).flush({ organizationId: 'org', courses: [] });
      await harness.fixture.whenStable(); harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe(path);
      expect(harness.routeNativeElement?.textContent).toContain(title);
      expect(harness.routeNativeElement?.querySelector('header')).not.toBeNull();
    }
    TestBed.inject(HttpTestingController).verify();
  });

  it('denies Student pages to other roles and selected SuperAdmins without loading course data', async () => {
    const harness = await RouterTestingHarness.create();
    for (const [session, destination] of [[selectedSession('Admin'), '/workspace/admin'],
      [selectedSession('Student', true), '/workspace/super-admin']] as const) {
      TestBed.inject(AuthState).accept(session, () => {});
      await harness.navigateByUrl('/workspace/student/catalog');
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe(destination);
      TestBed.inject(HttpTestingController).expectNone('/bff/student/courses');
    }
  });

  it('inherits nested course/section/lesson IDs through lazy routes inside the shell', async () => {
    TestBed.inject(AuthState).accept(selectedSession(), () => {});
    const harness = await RouterTestingHarness.create();
    const course = '11111111-1111-1111-1111-111111111111';
    const section = '22222222-2222-2222-2222-222222222222';
    const lesson = '33333333-3333-3333-3333-333333333333';
    for (const [suffix, body] of [
      ['', { course: { id: course, title: 'Nested course' }, sections: [] }],
      ['/sections/' + section, { course: { id: course }, section: { id: section, courseId: course, title: 'Nested section' }, lessons: [] }],
      ['/sections/' + section + '/lessons/' + lesson, { courseId: course, sectionId: section, lesson: { id: lesson, sectionId: section, title: 'Nested lesson' }, items: [] }],
    ] as const) {
      const path = '/workspace/student/courses/' + course + suffix;
      await harness.navigateByUrl(path);
      TestBed.inject(HttpTestingController).expectOne('/bff/student/courses/' + course + suffix).flush({ organizationId: 'org', ...body });
      await harness.fixture.whenStable(); harness.detectChanges();
      for (const request of TestBed.inject(HttpTestingController).match(r => r.url.endsWith('/progress'))) {
        expect(request.request.method).toBe('GET');
        request.flush({ organizationId: 'org', courseId: course, sectionId: suffix.includes('/lessons/') ? section : null,
          lessonId: suffix.includes('/lessons/') ? lesson : null, current: { totalLessons: 0, completedLessons: 0, progressPercentage: 0, isCompleted: false },
          enrollment: { id: '44444444-4444-4444-4444-444444444444', status: 'Active', enrolledAt: '2026-10-15T00:00:00Z', completedAt: null }, lesson: null });
      }
      await harness.fixture.whenStable(); harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe(path); expect(harness.routeNativeElement?.textContent).toContain('Nested');
      expect(harness.routeNativeElement?.querySelector('header')).not.toBeNull();
    }
    TestBed.inject(HttpTestingController).verify();
  });

  it('lazily guards organization discovery and workspace routes', async () => {
    expect(routes.find(route => route.path === 'organizations')?.loadComponent).toBeDefined();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/organizations', LoginComponent);
    expect(TestBed.inject(Router).url).toBe('/login');
    await harness.navigateByUrl('/workspace/admin', LoginComponent);
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('supports independent assignment history and grades without the published viewer, and guards unsent work', async () => {
    const state=TestBed.inject(AuthState);state.accept(selectedSession(),()=>{});const harness=await RouterTestingHarness.create();const http=TestBed.inject(HttpTestingController);const router=TestBed.inject(Router);
    const lesson='/workspace/student/courses/'+selection.courseId+'/sections/'+selection.sectionId+'/lessons/'+selection.lessonId;
    const api=viewerRoot(selection)!+'/assignments';
    await harness.navigateByUrl(lesson+'/assignments/'+assignmentId);http.expectOne(api+'/'+assignmentId).flush(assignmentData());await harness.fixture.whenStable();harness.detectChanges();
    const component=harness.fixture.debugElement.query(By.directive(StudentAssignmentsComponent)).componentInstance as StudentAssignmentsComponent;component.store.editText('Unsubmitted work');
    const confirm=spyOn(window,'confirm').and.returnValue(false);await harness.navigateByUrl('/workspace/student/grades');expect(router.url).toBe(lesson+'/assignments/'+assignmentId);http.expectNone('/bff/student/grades');
    confirm.and.returnValue(true);await harness.navigateByUrl('/workspace/student/assignments/history');http.expectOne('/bff/student/assignments/history').flush({organizationId:'org',rows:[{...selection,assignmentId,submissionId,title:'Historical work',submittedAt:'2026-10-15T00:00:00Z',graded:true}]});await harness.fixture.whenStable();harness.detectChanges();expect(harness.routeNativeElement?.textContent).toContain('Historical work');
    await harness.navigateByUrl(lesson+'/assignments/'+assignmentId+'/submissions/'+submissionId);const historical=submittedData();historical.enrollmentStatus=2;historical.assignment!.isPublished=false;http.expectOne(api+'/'+assignmentId+'/submissions/'+submissionId).flush(historical);await harness.fixture.whenStable();harness.detectChanges();expect(harness.routeNativeElement?.textContent).toContain('Graded: 0 / 10');
    await harness.navigateByUrl('/workspace/student/grades/courses/'+selection.courseId+'?quizPage=2&assignmentPage=3&pageSize=10');http.expectOne(r=>r.url==='/bff/student/grades/courses/'+selection.courseId).flush(gradeData());await harness.fixture.whenStable();harness.detectChanges();expect(workspaceAllows(state.session(),router.url)).toBeTrue();expect(harness.routeNativeElement?.textContent).toContain('Current published-content progress');
    http.expectNone(viewerRoot(selection)!);http.expectNone('/bff/antiforgery');http.verify();
  });

  it('lazily opens quiz history/resume and guards both leaving and switching attempts with unsent answers', async () => {
    const state = TestBed.inject(AuthState); state.accept(selectedSession(), () => {});
    const harness = await RouterTestingHarness.create(); const http = TestBed.inject(HttpTestingController);
    const quizPath = '/workspace/student/courses/' + selection.courseId + '/sections/' + selection.sectionId + '/lessons/' + selection.lessonId + '/quiz';
    const api = viewerRoot(selection)! + '/quiz';
    await harness.navigateByUrl(quizPath); http.expectOne(api).flush(quizPage()); await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Maximum attempts');
    await harness.navigateByUrl(quizPath + '/attempts/' + attemptId); http.expectOne(api + '/attempts/' + attemptId).flush(quizPage(true)); await harness.fixture.whenStable(); harness.detectChanges();
    expect(workspaceAllows(state.session(), TestBed.inject(Router).url)).toBeTrue();
    const component = harness.fixture.debugElement.query(By.directive(StudentQuizComponent)).componentInstance as StudentQuizComponent;
    const question = component.store.page()!.questions[0]; component.store.choose(question, question.options[0].id, true);
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    await harness.navigateByUrl('/workspace/student/catalog'); expect(TestBed.inject(Router).url).toBe(quizPath + '/attempts/' + attemptId); http.expectNone('/bff/student/courses');
    await harness.navigateByUrl(quizPath + '/attempts/' + otherAttempt); expect(TestBed.inject(Router).url).toBe(quizPath + '/attempts/' + attemptId); http.expectNone(api + '/attempts/' + otherAttempt);
    confirm.and.returnValue(true); await harness.navigateByUrl(quizPath + '/attempts/' + otherAttempt);
    const next = quizPage(true); next.attempt = { ...next.attempt!, attemptId: otherAttempt }; next.attempts = [next.attempt];
    http.expectOne(api + '/attempts/' + otherAttempt).flush(next); await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.store.answers()).toEqual({}); expect(confirm).toHaveBeenCalled(); http.verify();
  });

  it('redirects a selected Student from an Admin URL to the verified Angular workspace', async () => {
    TestBed.inject(AuthState).accept(selectedSession(), () => {});
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/workspace/admin');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/workspace/student');
    expect(harness.routeNativeElement?.textContent).toContain('Student workspace');
  });

  it('restores an unselected SuperAdmin to the platform workspace instead of MVC homePath', async () => {
    TestBed.inject(AuthState).accept({ ...selectedSession(null, true), selectedOrganization: null, homePath: '/platform' }, () => {});
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/session');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/workspace/platform');
    expect(harness.routeNativeElement?.textContent).toContain('Platform workspace');
  });

  it('redirects the root to the lazy-loaded login page', async () => {
    const loginRoute = routes.find(route => route.path === 'login');
    expect(loginRoute?.loadComponent).toBeDefined();
    expect(loginRoute?.component).toBeUndefined();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', LoginComponent);
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Sign in');
  });

  it('redirects anonymous session-page navigation to login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/session', LoginComponent);
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('supports navigating directly to /login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login', LoginComponent);
    expect(harness.routeNativeElement?.textContent).toContain('Enterprise LMS');
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
  });
});
