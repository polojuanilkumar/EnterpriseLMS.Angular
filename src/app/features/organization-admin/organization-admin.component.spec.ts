import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { adminAllowed, workspaceAllows } from '../../core/auth/workspace-routing';
import { OrganizationAdminComponent } from './organization-admin.component';
import { Invitation, LearnerReport, invitationState } from './organization-admin.models';

describe('Organization administration, reports and audit', () => {
  const courseId = '11111111-1111-1111-1111-111111111111', userId = '22222222-2222-2222-2222-222222222222', eventId = '33333333-3333-3333-3333-333333333333';
  const org = '/bff/organization', reports = '/bff/staff/reports/courses', pageQuery = '?page=1&pageSize=20';
  const member = { organizationId: 'org', userId, firstName: '<script>First</script>', lastName: 'Name', email: 'member@example.test', role: 2 };
  const members = () => ({ page: 1, pageSize: 20, total: 1, members: [{ ...member }] });
  const invitation = (): Invitation => ({ id: userId, organizationId: 'org', email: 'invite@example.test', role: 1, createdAt: '2026-10-01T00:00:00Z', expiresAt: new Date(Date.now() + 86400000).toISOString(), acceptedAt: null, revokedAt: null, deliveredAt: null });
  const invitations = () => ({ page: 1, pageSize: 20, total: 1, items: [invitation()] });
  const auditRow = () => ({ id: eventId, timestampUtc: '2026-10-10T00:00:00Z', actorUserId: userId, action: 'membership.role-changed', resourceType: 'membership', resourceId: userId, outcome: 'succeeded', correlationId: '12345678123456781234567812345678', metadata: { oldRole: 'Student', newRole: 'Instructor' } });
  const audit = () => ({ page: 1, pageSize: 20, total: 21, filter: { fromUtc: '2026-10-01T00:00:00+00:00', toUtc: '2026-10-15T00:00:00+00:00' }, actions: ['membership.role-changed'], outcomes: ['succeeded'], items: [auditRow()] });
  const counts = { quizStarted: 1, quizSubmitted: 3, quizExpired: 2, quizPassed: 1, quizFailed: 1, quizUnavailable: 1, submissions: 2, graded: 1, ungraded: 1 };
  const learner = (): LearnerReport => ({ ...counts, courseId, userId, firstName: '<img src=x>', lastName: 'Learner', enrollmentStatus: 2, enrolledAt: '2026-10-01T00:00:00Z', enrollmentCompletedAt: '2026-10-10T00:00:00Z', storedEnrollmentPercentage: 100, publishedLessons: 2, completedPublishedLessons: 1, currentPercentage: 50, currentContentComplete: false, recentAssignmentReview: { courseId, sectionId: userId, lessonId: eventId, assignmentId: userId, submissionId: eventId } });
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>, data: BehaviorSubject<{ mode: string }>, http: HttpTestingController;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ courseId, eventId })); data = new BehaviorSubject({ mode: 'members' });
    TestBed.configureTestingModule({ imports: [OrganizationAdminComponent], providers: [provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { paramMap: params, data, snapshot: { paramMap: params.value, data: data.value } } }] });
    TestBed.inject(AuthState).accept(selectedSession('Admin'), () => {}); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); http.verify(); });
  function setup(mode = 'members', body: object = members()) {
    data.next({ mode }); const fixture = TestBed.createComponent(OrganizationAdminComponent); fixture.detectChanges();
    const endpoint = mode === 'reports' ? reports : mode === 'learners' ? `${reports}/${courseId}/learners` : mode === 'instructor' ? `${org}/courses/${courseId}/instructor` : mode === 'auditDetail' ? `${org}/audit/${eventId}` : `${org}/${mode}`;
    http.expectOne(endpoint + (mode === 'auditDetail' ? '' : pageQuery)).flush(body); flushMicrotasks(); fixture.detectChanges(); flushMicrotasks(); return fixture;
  }
  function csrf() { http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); }
  function submit(fixture: ReturnType<typeof setup>, index = 1) { fixture.nativeElement.querySelectorAll('form')[index].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
  it('shows encoded bounded members and applies search/role filters without mutating', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('script')).toBeNull(); expect(fixture.nativeElement.textContent).toContain('<script>First');
    c.search = 'member@example.test'; c.role = 2; fixture.detectChanges(); flushMicrotasks(); submit(fixture, 0);
    const read = http.expectOne(org + '/members?page=1&pageSize=20&search=member%40example.test&role=2'); expect(read.request.method).toBe('GET'); read.flush(members()); flushMicrotasks(); expect(c.memberForm.email).toBe('');
  }));
  it('confirms exact-email assignment, sends no actor/organization IDs, blocks duplicate clicks and retains validation values', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; const confirm = spyOn(window, 'confirm').and.returnValue(false);
    c.memberForm = { email: 'exact@example.test', role: 1 }; c.changed(); fixture.detectChanges(); flushMicrotasks(); submit(fixture); http.expectNone('/bff/antiforgery');
    confirm.and.returnValue(true); submit(fixture); submit(fixture); csrf(); const write = http.expectOne(org + '/members'); expect(write.request.method).toBe('POST'); expect(write.request.body).toEqual({ email: 'exact@example.test', role: 1, confirmed: true }); expect(write.request.headers.get('X-CSRF-TOKEN')).toBe('csrf');
    write.flush({ code: 'validation_failed', message: 'Enter an exact email address, without a display name.' }, { status: 400, statusText: 'Bad Request' }); flushMicrotasks(); expect(c.memberForm.email).toBe('exact@example.test'); expect(c.pending()).toBeFalse(); expect(c.dirty).toBeTrue();
  }));
  it('updates only a selected member role and displays authoritative role safeguards', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; c.editMember(member); c.memberForm.role = 1; c.changed(); fixture.detectChanges(); flushMicrotasks(); spyOn(window, 'confirm').and.returnValue(true); submit(fixture); csrf();
    const write = http.expectOne(org + '/members/' + userId); expect(write.request.method).toBe('PUT'); expect(write.request.body).toEqual({ role: 1, confirmed: true });
    write.flush({ code: 'conflict', message: "Reassign all courses before changing this Instructor's role." }, { status: 409, statusText: 'Conflict' }); flushMicrotasks(); http.expectOne(org + '/members' + pageQuery).flush(members()); flushMicrotasks();
    expect(c.error()).toContain('Reassign all courses'); expect(c.memberForm.role).toBe(1); expect(c.selectedMember?.userId).toBe(userId);
  }));
  it('does not retry rate-limited membership changes and keeps safe values', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; c.memberForm = { email: 'exact@example.test', role: 1 }; fixture.detectChanges(); flushMicrotasks(); spyOn(window, 'confirm').and.returnValue(true); submit(fixture); csrf();
    http.expectOne(org + '/members').flush({ code: 'rate_limited' }, { status: 429, statusText: 'Too Many Requests' }); flushMicrotasks(); expect(c.error()).toContain('Too many requests'); expect(c.memberForm.email).toBe('exact@example.test'); http.expectNone(org + '/members' + pageQuery);
  }));
  it('recovers ambiguous membership writes through GET only and locks further writes', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; c.memberForm = { email: 'exact@example.test', role: 1 }; fixture.detectChanges(); flushMicrotasks(); spyOn(window, 'confirm').and.returnValue(true); submit(fixture); csrf();
    http.expectOne(org + '/members').error(new ProgressEvent('error')); flushMicrotasks(); const read = http.expectOne(org + '/members' + pageQuery); expect(read.request.method).toBe('GET'); read.flush(members()); flushMicrotasks(); expect(c.locked()).toBeTrue(); expect(c.memberForm.email).toBe('exact@example.test'); submit(fixture); http.expectNone('/bff/antiforgery');
  }));
  it('creates/reissues only with confirmation and reports delivery uncertainty without automatic reissue', fakeAsync(() => {
    const fixture = setup('invitations', invitations()), c = fixture.componentInstance; expect(fixture.nativeElement.textContent).toContain('Unconfirmed');
    c.inviteForm = { email: 'invite@example.test', role: 2, reissue: true }; fixture.detectChanges(); flushMicrotasks(); const confirm = spyOn(window, 'confirm').and.returnValue(false); submit(fixture); http.expectNone('/bff/antiforgery'); confirm.and.returnValue(true); submit(fixture); submit(fixture); csrf();
    const write = http.expectOne(org + '/invitations'); expect(write.request.body).toEqual({ email: 'invite@example.test', role: 2, reissue: true, confirmed: true }); expect(write.request.headers.get('X-CSRF-TOKEN')).toBe('csrf'); write.flush({}, { status: 502, statusText: 'Bad Gateway' }); flushMicrotasks(); http.expectOne(org + '/invitations' + pageQuery).flush(invitations()); flushMicrotasks(); expect(c.locked()).toBeTrue(); expect(c.inviteForm.email).toBe('invite@example.test'); expect(c.notice()).toContain('no mutation or delivery was replayed');
  }));
  it('confirms invitation revocation and labels terminal, expired and sender-accepted states', fakeAsync(() => {
    const page = invitations(); page.items[0].deliveredAt = '2026-10-01T00:01:00Z'; const fixture = setup('invitations', page), c = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Accepted by sender'); expect(fixture.nativeElement.textContent).toContain('does not confirm inbox receipt');
    const confirm = spyOn(window, 'confirm').and.returnValue(false); void c.revoke(page.items[0]); http.expectNone('/bff/antiforgery'); confirm.and.returnValue(true); void c.revoke(page.items[0]); csrf(); const write = http.expectOne(org + '/invitations/' + userId + '/revoke'); expect(write.request.body).toEqual({ confirmed: true }); write.flush(null); flushMicrotasks(); http.expectOne(org + '/invitations' + pageQuery).flush(page); flushMicrotasks();
    expect(invitationState({ ...invitation(), acceptedAt: '2026-10-01T00:00:00Z' })).toBe('Accepted'); expect(invitationState({ ...invitation(), revokedAt: '2026-10-01T00:00:00Z' })).toBe('Revoked'); expect(invitationState({ ...invitation(), expiresAt: '2020-01-01T00:00:00Z' })).toBe('Expired');
  }));
  it('keeps Instructor selection while paging and confirms the typed reassignment payload', fakeAsync(() => {
    const choices = { course: { id: courseId, title: 'Course', instructorId: eventId }, instructors: [member], choices: { page: 1, pageSize: 20, total: 30 } };
    const fixture = setup('instructor', choices), c = fixture.componentInstance; c.instructorId = userId; c.changed(); void c.paginate(1); http.expectOne(`${org}/courses/${courseId}/instructor?page=2&pageSize=20`).flush(choices); flushMicrotasks(); expect(c.instructorId).toBe(userId);
    fixture.detectChanges(); flushMicrotasks(); spyOn(window, 'confirm').and.returnValue(true); submit(fixture); csrf(); const write = http.expectOne(`${org}/courses/${courseId}/instructor`); expect(write.request.method).toBe('PUT'); expect(write.request.body).toEqual({ instructorId: userId, confirmed: true }); write.flush(null); flushMicrotasks(); http.expectOne(`${org}/courses/${courseId}/instructor?page=2&pageSize=20`).flush(choices); flushMicrotasks();
  }));
  it('shows stored report counts and denominators without computing an overall grade', fakeAsync(() => {
    const fixture = setup('reports', { courses: { page: 1, pageSize: 20, total: 1, items: [{ ...counts, courseId, title: '<script>Course</script>', published: false, enrollments: 3, active: 1, completed: 1, cancelled: 1, publishedLessons: 2, assignments: 2, progressDenominator: '6', completedPublishedLearnerLessons: 2, currentPercentage: 33.33 }] } });
    const element: HTMLElement = fixture.nativeElement; expect(element.querySelector('script')).toBeNull(); expect(element.textContent).toContain('2 / 6 learner-lessons (33.33%)'); expect(element.textContent).toContain('all stored enrollment states'); expect(element.textContent).toContain('No overall grade is calculated');
  }));
  it('separates historical completion from current progress and enables review links only after parent/owner validation', fakeAsync(() => {
    const row = learner(); const fixture = setup('learners', { report: { course: { title: 'Course' }, learners: { page: 1, pageSize: 20, total: 1, items: [row] } } }), c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('img')).toBeNull(); expect(fixture.nativeElement.textContent).toContain('Stored enrollment percentage: 100%'); expect(fixture.nativeElement.textContent).toContain('1 / 2 (50%)'); expect(fixture.nativeElement.querySelector('a[href*="/submissions/"]')).toBeNull();
    void c.checkReview(row); const request = http.expectOne(r => r.url.startsWith(`${reports}/${courseId}/learners/${userId}/assignment-review?`)); expect(request.request.method).toBe('GET'); request.flush(row.recentAssignmentReview); flushMicrotasks(); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('a[href*="/submissions/"]')).not.toBeNull();
  }));
  it('rejects changed review relationships and never fabricates a quiz-results link', fakeAsync(() => {
    const row = learner(); const fixture = setup('learners', { report: { course: { title: 'Course' }, learners: { page: 1, pageSize: 20, total: 1, items: [row] } } }), c = fixture.componentInstance;
    void c.checkReview(row); http.expectOne(r => r.url.includes('/assignment-review?')).flush({ ...row.recentAssignmentReview, sectionId: courseId }); flushMicrotasks(); fixture.detectChanges(); expect(c.error()).toContain('relationship changed'); expect(fixture.nativeElement.querySelector('a[href*="/submissions/"],a[href*="/attempts/"]')).toBeNull();
  }));
  it('pins the normalized audit UTC range while paging and renders safe metadata fields without edit/export controls', fakeAsync(() => {
    const fixture = setup('audit', audit()), c = fixture.componentInstance; expect(c.fromUtc).toBe('2026-10-01T00:00:00'); expect(c.toUtc).toBe('2026-10-15T00:00:00'); void c.paginate(1);
    const read = http.expectOne(org + '/audit?page=2&pageSize=20&fromUtc=2026-10-01T00%3A00%3A00Z&toUtc=2026-10-15T00%3A00%3A00Z'); expect(read.request.method).toBe('GET'); read.flush({ ...audit(), page: 2 }); flushMicrotasks(); expect(fixture.nativeElement.textContent).toContain('No edits, deletion or export');
  }));
  it('renders audit detail as encoded field values, including hostile text fixtures', fakeAsync(() => {
    const fixture = setup('auditDetail', { ...auditRow(), metadata: { newRole: '<script>bad</script>' } }); const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('script')).toBeNull(); expect(element.textContent).toContain('<script>bad'); expect(element.textContent).toContain('Validated metadata'); expect(element.querySelector('form')).toBeNull();
  }));
  it('rejects invalid audit UTC ranges and GUID filters before querying', fakeAsync(() => {
    const fixture = setup('audit', audit()), c = fixture.componentInstance; c.fromUtc = '2026-01-01T00:00:00'; c.toUtc = '2026-10-15T00:00:00'; fixture.detectChanges(); flushMicrotasks(); submit(fixture, 0); expect(c.error()).toContain('at most 31 days'); http.expectNone(r => r.url.startsWith(org + '/audit?'));
  }));
  it('clears organization state and ignores late mutation success after organization switching', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; c.memberForm = { email: 'old@example.test', role: 1 }; c.changed(); fixture.detectChanges(); flushMicrotasks(); spyOn(window, 'confirm').and.returnValue(true); submit(fixture); csrf(); const old = http.expectOne(org + '/members');
    TestBed.inject(AuthState).accept({ ...selectedSession('Admin'), selectedOrganization: { ...selectedSession('Admin').selectedOrganization!, id: 'new-org' } }, () => {}); fixture.detectChanges(); expect(c.members()).toBeNull(); expect(c.memberForm.email).toBe(''); old.flush(null); flushMicrotasks(); expect(c.notice()).toBe(''); http.expectOne(org + '/members' + pageQuery).flush(members()); flushMicrotasks();
  }));
  it('clears audit and ignores stale reads after logout or absolute expiry', fakeAsync(() => {
    TestBed.inject(AuthState).accept({ ...selectedSession('Admin'), expiresAt: new Date(Date.now() + 1000).toISOString() }, () => {});
    const fixture = setup('auditDetail', auditRow()), c = fixture.componentInstance; void c.load(); const old = http.expectOne(org + '/audit/' + eventId); tick(1000); fixture.detectChanges(); old.flush(auditRow()); flushMicrotasks(); expect(c.event()).toBeNull(); expect(c.actorId).toBe(''); expect(c.canLeave()).toBeTrue();
  }));
  it('does not mutate after CSRF bootstrap when session context changed', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance; c.memberForm = { email: 'exact@example.test', role: 1 }; fixture.detectChanges(); flushMicrotasks(); spyOn(window, 'confirm').and.returnValue(true); submit(fixture); const csrfRequest = http.expectOne('/bff/antiforgery'); TestBed.inject(AuthState).clear(); fixture.detectChanges(); csrfRequest.flush({ requestToken: 'old', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); http.expectNone(org + '/members'); expect(c.members()).toBeNull();
  }));
  it('denies member/audit data to Instructor/Student UI, requires selected platform scope and warns on unsaved values', fakeAsync(() => {
    TestBed.inject(AuthState).accept(selectedSession('Instructor'), () => {}); const fixture = TestBed.createComponent(OrganizationAdminComponent); fixture.detectChanges(); http.expectNone(org + '/members' + pageQuery); expect(adminAllowed(selectedSession())).toBeFalse(); expect(adminAllowed(selectedSession('Instructor'))).toBeFalse(); expect(adminAllowed({ ...selectedSession(null, true), selectedOrganization: null })).toBeFalse();
    expect(workspaceAllows(selectedSession('Instructor'), '/workspace/staff/reports')).toBeTrue(); expect(workspaceAllows(selectedSession('Instructor'), '/workspace/organization/audit')).toBeFalse();
    TestBed.inject(AuthState).accept(selectedSession('Admin'), () => {}); fixture.detectChanges(); http.expectOne(org + '/members' + pageQuery).flush(members()); flushMicrotasks(); fixture.componentInstance.changed(); spyOn(window, 'confirm').and.returnValue(false); expect(fixture.componentInstance.canLeave()).toBeFalse();
  }));
  it('pages with applied filters until Apply is pressed, retaining draft values', fakeAsync(() => {
    const fixture = setup('members', { ...members(), total: 21 }), c = fixture.componentInstance;
    c.search = 'draft'; c.role = 1; c.pageSize = 50; void c.paginate(1);
    http.expectOne(org + '/members?page=2&pageSize=20').flush({ ...members(), page: 2, total: 21 }); flushMicrotasks();
    expect(c.search).toBe('draft'); expect(c.pageSize).toBe(50); fixture.detectChanges(); flushMicrotasks(); submit(fixture, 0);
    http.expectOne(org + '/members?page=1&pageSize=50&search=draft&role=1').flush({ ...members(), pageSize: 50 }); flushMicrotasks(); expect(c.pageNumber).toBe(1);
  }));
});
