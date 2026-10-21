import { ApplicationInitStatus } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { appConfig } from '../../app.config';
import { bffInterceptor } from '../http/bff.interceptor';
import { AuthState } from './auth-state';
import { AuthService, authErrorMessage } from './auth.service';
import { SessionResponse } from './auth.models';

export function testSession(milliseconds = 60000): SessionResponse {
  return { userId: 'user', expiresAt: new Date(Date.now() + milliseconds).toISOString(),
    selectedOrganization: null, isSuperAdmin: false, requiresOrganizationSelection: true, homePath: null };
}

describe('BFF authentication', () => {
  let auth: AuthService;
  let state: AuthState;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      provideHttpClient(withNoXsrfProtection(), withInterceptors([bffInterceptor])), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService); state = TestBed.inject(AuthState); http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });
  afterEach(() => { state.clear(); http.verify(); });
  function csrf(value = 'csrf'): void {
    http.expectOne('/bff/antiforgery').flush({ requestToken: value, headerName: 'X-CSRF-TOKEN' }); flushMicrotasks();
  }

  it('restores a cookie session and bootstraps CSRF without persisting tokens or session metadata', fakeAsync(() => {
    const storage = spyOn(Storage.prototype, 'setItem');
    const originalUrl = location.href;
    void auth.restore(); http.expectOne('/bff/session').flush(testSession()); flushMicrotasks(); csrf();
    expect(state.session()?.userId).toBe('user'); expect(state.csrfToken()).toBe('csrf');
    expect(storage).not.toHaveBeenCalled(); expect(location.href).toBe(originalUrl); expect(navigate).not.toHaveBeenCalled();
    state.clear();
  }));

  it('treats startup 401 as anonymous without a navigation loop', fakeAsync(() => {
    void auth.restore(); http.expectOne('/bff/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks(); csrf();
    expect(state.session()).toBeNull(); expect(navigate).not.toHaveBeenCalled();
  }));

  it('keeps startup usable on unavailable upstream and sanitizes HTML errors', fakeAsync(() => {
    void auth.restore(); http.expectOne('/bff/session').flush('<html>private detail</html>', { status: 502, statusText: 'Bad Gateway' });
    flushMicrotasks(); csrf();
    expect(state.session()).toBeNull(); expect(state.notice()).not.toContain('private detail');
    expect(state.notice()).toContain('Reload');
  }));

  it('scopes CSRF to canonical root-relative unsafe BFF requests only', () => {
    state.setCsrf('memory-only');
    const client = TestBed.inject(HttpClient);
    for (const url of ['/bff/logout', '/bff/login?mode=normal', '/api/Auth/login', '/other',
      'https://localhost:7196/api/Auth/login', 'https://localhost:7207/bff/login', '//example.test/bff/login',
      '/bff/../api/login', '/bff/%2e%2e/api/login', '/bff/\\example.test', 'bff/login']) {
      client.post(url, {}).subscribe();
      const request = http.expectOne(url);
      expect(request.request.headers.has('X-CSRF-TOKEN')).withContext(url).toBe(['/bff/logout', '/bff/login?mode=normal'].includes(url));
      expect(request.request.headers.has('Authorization')).toBeFalse(); request.flush({});
    }
    client.get('/bff/session').subscribe();
    const safe = http.expectOne('/bff/session'); expect(safe.request.headers.has('X-CSRF-TOKEN')).toBeFalse(); safe.flush({});
  });

  it('bootstraps logout, clears state, refreshes anonymous CSRF and navigates to login', fakeAsync(() => {
    const storage = spyOn(Storage.prototype, 'setItem');
    state.accept(testSession(), () => {});
    void auth.logout(); csrf('signed-in');
    const request = http.expectOne('/bff/logout');
    expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('signed-in'); request.flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks(); expect(state.session()).toBeNull(); csrf('anonymous');
    expect(state.csrfToken()).toBe('anonymous'); expect(navigate).toHaveBeenCalledOnceWith('/login');
    expect(storage).not.toHaveBeenCalled();
  }));

  it('does not retry logout after an ambiguous transport failure', fakeAsync(() => {
    state.accept(testSession(), () => {}); let failure: unknown;
    void auth.logout().catch(error => failure = error); csrf();
    http.expectOne('/bff/logout').error(new ProgressEvent('error')); flushMicrotasks();
    expect(failure).toBeDefined(); expect(state.session()).not.toBeNull();
    http.expectNone('/bff/logout'); expect(navigate).not.toHaveBeenCalled(); state.clear();
  }));

  it('does not repeat completed logout when refreshing anonymous CSRF fails', fakeAsync(() => {
    void auth.logout(); csrf(); http.expectOne('/bff/logout').flush(null); flushMicrotasks();
    http.expectOne('/bff/antiforgery').error(new ProgressEvent('error')); flushMicrotasks();
    expect(state.session()).toBeNull(); expect(state.csrfToken()).toBeNull();
    expect(navigate).toHaveBeenCalledOnceWith('/login'); http.expectNone('/bff/logout');
  }));

  it('clears expired state on a BFF 401 without trusting response details', fakeAsync(() => {
    state.accept(testSession(), () => {}); state.setCsrf('old');
    TestBed.inject(HttpClient).get('/bff/session').subscribe({ error: () => {} });
    http.expectOne('/bff/session').flush({ message: 'private detail' }, { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks(); expect(state.session()).toBeNull(); expect(state.csrfToken()).toBeNull();
    expect(state.notice()).toContain('expired'); expect(navigate).toHaveBeenCalledOnceWith('/login');
  }));

  it('expires the UI at the server-provided absolute expiry', fakeAsync(() => {
    const expired = jasmine.createSpy('expired'); state.accept(testSession(1000), expired);
    tick(1000); expect(state.session()).toBeNull(); expect(expired).toHaveBeenCalledTimes(1);
  }));

  it('does not clear a newly verified context when an old in-flight request returns 401', fakeAsync(() => {
    state.accept(testSession(), () => {});
    TestBed.inject(HttpClient).get('/bff/student/courses').subscribe({ error: () => {} });
    const old = http.expectOne('/bff/student/courses');
    state.accept({ ...testSession(), selectedOrganization: { id: 'new-org', role: 'Admin', name: 'New', code: 'NEW' } }, () => {});
    const verified = state.session(); state.setCsrf('new-context-csrf');
    old.flush({}, { status: 401, statusText: 'Old session expired' }); flushMicrotasks();
    expect(state.session()).toBe(verified); expect(state.csrfToken()).toBe('new-context-csrf');
    expect(navigate).not.toHaveBeenCalled();
  }));

  it('does not let a late anonymous failure clear a later authenticated identity', fakeAsync(() => {
    TestBed.inject(HttpClient).post('/bff/login', {}).subscribe({ error: () => {} });
    const old = http.expectOne('/bff/login');
    state.accept(testSession(), () => {}); const verified = state.session();
    old.flush({}, { status: 401, statusText: 'Old login failed' }); flushMicrotasks();
    expect(state.session()).toBe(verified); expect(navigate).not.toHaveBeenCalled();
  }));

  it('maps CSRF, rate-limit and credential errors without rendering arbitrary server messages', () => {
    for (const status of [0, 400, 401, 403, 429, 500, 502]) {
      expect(authErrorMessage(new HttpErrorResponse({ status, error: { message: 'private detail' } }))).not.toContain('private detail');
    }
    expect(authErrorMessage(new HttpErrorResponse({ status: 400, error: { code: 'csrf_validation_failed' } }))).toContain('security check');
  });
});

describe('Application authentication initializer', () => {
  it('runs restoration from the actual app providers', fakeAsync(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const initializer = TestBed.inject(ApplicationInitStatus);
    http.expectOne('/bff/session').flush({}, { status: 401, statusText: 'Unauthorized' }); flushMicrotasks();
    http.expectOne('/bff/antiforgery').flush({ requestToken: 'anonymous', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks();
    expect(initializer.done).toBeTrue(); http.verify();
  }));
});
