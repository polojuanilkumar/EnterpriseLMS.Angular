import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthState } from './auth-state';
import { selectedSession } from './session.testing';
import { workspacePath } from './workspace-routing';
import { bffInterceptor } from '../http/bff.interceptor';

describe('Organization sessions', () => {
  let auth: AuthService; let state: AuthState; let http: HttpTestingController; let navigate: jasmine.Spy;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withNoXsrfProtection(), withInterceptors([bffInterceptor])), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService); state = TestBed.inject(AuthState); http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    state.accept(selectedSession(), () => {});
  });
  afterEach(() => { state.clear(); http.verify(); });
  function csrf(value: string): void {
    http.expectOne('/bff/antiforgery').flush({ requestToken: value, headerName: 'X-CSRF-TOKEN' }); flushMicrotasks();
  }

  it('maps all verified roles explicitly without interpreting MVC homePath', () => {
    for (const [role, path] of [['Student', 'student'], ['Instructor', 'instructor'], ['Admin', 'admin']] as const) {
      expect(workspacePath(selectedSession(role))).toBe('/workspace/' + path);
    }
    expect(workspacePath(selectedSession(null, true))).toBe('/workspace/super-admin');
    expect(workspacePath({ ...selectedSession(null, true), selectedOrganization: null })).toBe('/workspace/platform');
    expect(workspacePath({ ...selectedSession(), selectedOrganization: null })).toBe('/organizations');
    expect(workspacePath(null)).toBe('/login');
  });

  it('discovers only through a relative BFF read', fakeAsync(() => {
    let organizations: unknown;
    void auth.organizations().then(value => organizations = value);
    const request = http.expectOne('/bff/organizations'); expect(request.request.method).toBe('GET');
    expect(request.request.headers.has('X-CSRF-TOKEN')).toBeFalse();
    request.flush([{ id: 'org', name: 'Organization', code: 'ORG' }]); flushMicrotasks();
    expect(organizations).toEqual([{ id: 'org', name: 'Organization', code: 'ORG' }]);
  }));

  it('selects once with only the ID, accepts verified metadata and refreshes CSRF after rotation without persistence', fakeAsync(() => {
    const storage = spyOn(Storage.prototype, 'setItem');
    void auth.selectOrganization('org'); expect(auth.mutating()).toBeTrue(); csrf('before');
    const request = http.expectOne('/bff/organization'); expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ organizationId: 'org' });
    expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('before');
    expect(request.request.headers.has('X-Organization-Id')).toBeFalse();
    request.flush(selectedSession('Instructor')); flushMicrotasks();
    expect(state.csrfToken()).toBeNull(); expect(state.session()?.selectedOrganization?.role).toBe('Instructor');
    csrf('after'); expect(auth.mutating()).toBeFalse(); expect(state.csrfToken()).toBe('after');
    expect(navigate).toHaveBeenCalledOnceWith('/workspace/instructor'); expect(storage).not.toHaveBeenCalled();
  }));

  it('does not replay ambiguous selection or lose the confirmed result when CSRF refresh fails', fakeAsync(() => {
    let error: unknown;
    void auth.selectOrganization('org').catch(value => error = value); csrf('before');
    http.expectOne('/bff/organization').flush(selectedSession('Admin')); flushMicrotasks();
    http.expectOne('/bff/antiforgery').error(new ProgressEvent('error')); flushMicrotasks();
    expect(error).toBeDefined(); expect(state.csrfToken()).toBeNull();
    expect(state.session()?.selectedOrganization?.role).toBe('Admin'); http.expectNone('/bff/organization');
    expect(navigate).not.toHaveBeenCalled(); expect(auth.mutating()).toBeFalse();
  }));

  it('marks an ambiguous selection as unconfirmed until a safe session read, without replaying it', fakeAsync(() => {
    let failure: unknown;
    void auth.selectOrganization('org').catch(error => failure = error); csrf('before');
    http.expectOne('/bff/organization').error(new ProgressEvent('error')); flushMicrotasks();
    expect(failure).toBeDefined(); expect(state.contextUncertain()).toBeTrue();
    expect(state.session()?.userId).toBe('user'); http.expectNone('/bff/organization');
    void auth.revalidate(); http.expectOne('/bff/session').flush(selectedSession('Instructor'));
    flushMicrotasks(); csrf('verified'); expect(state.contextUncertain()).toBeFalse();
    expect(navigate).toHaveBeenCalledOnceWith('/workspace/instructor'); http.expectNone('/bff/organization');
  }));

  it('preserves a confirmed account after a denied organization and never trusts the error body', fakeAsync(() => {
    let failure: unknown;
    void auth.selectOrganization('denied').catch(error => failure = error); csrf('before');
    http.expectOne('/bff/organization').flush({ message: 'private detail', role: 'SuperAdmin' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks(); expect(failure).toBeDefined(); expect(state.contextUncertain()).toBeTrue();
    expect(state.session()?.selectedOrganization?.role).toBe('Student'); expect(state.session()?.isSuperAdmin).toBeFalse();
    expect(navigate).not.toHaveBeenCalled(); http.expectNone('/bff/organization');
  }));

  it('rejects concurrent selection and logout mutations', fakeAsync(() => {
    let denied = 0;
    void auth.selectOrganization('org'); csrf('before');
    void auth.selectOrganization('other').catch(() => denied++);
    void auth.logout().catch(() => denied++); flushMicrotasks(); expect(denied).toBe(2);
    http.expectNone('/bff/logout'); http.expectNone('/bff/antiforgery');
    http.expectOne('/bff/organization').flush(selectedSession()); flushMicrotasks(); csrf('after');
  }));

  it('revalidates on browser focus, coalesces duplicate events and recovers revoked selection without sign-out', fakeAsync(() => {
    window.dispatchEvent(new Event('focus')); expect(auth.checking()).toBeTrue();
    window.dispatchEvent(new Event('focus'));
    const request = http.expectOne('/bff/session');
    request.flush({ ...selectedSession(), selectedOrganization: null, requiresOrganizationSelection: true, recoveryCode: 'organization_selection_cleared' });
    flushMicrotasks(); csrf('new-context');
    expect(auth.checking()).toBeFalse(); expect(state.session()?.userId).toBe('user');
    expect(state.session()?.selectedOrganization).toBeNull(); expect(navigate).toHaveBeenCalledOnceWith('/organizations');
    http.expectNone('/bff/logout');
  }));

  it('refreshes a changed cross-tab organization and does not replay any mutations', fakeAsync(() => {
    void auth.revalidate();
    http.expectOne('/bff/session').flush({ ...selectedSession('Admin'), selectedOrganization: { id: 'other', name: 'Other organization', code: 'OTHER', role: 'Admin' } });
    flushMicrotasks(); csrf('other-context');
    expect(state.session()?.selectedOrganization?.id).toBe('other'); expect(navigate).toHaveBeenCalledOnceWith('/workspace/admin');
    http.expectNone('/bff/organization'); http.expectNone('/bff/logout');
  }));
});
