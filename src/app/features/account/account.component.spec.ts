import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { NgForm } from '@angular/forms';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { AccountComponent } from './account.component';

describe('Private account onboarding and recovery', () => {
  let http: HttpTestingController, data: BehaviorSubject<{ mode: string }>;
  const valid = { invalid: false } as NgForm;
  const preview = { email: 'invited@example.test', organization: '<img src=x onerror=alert(1)>', role: 1, existingAccount: false };
  beforeEach(() => {
    data = new BehaviorSubject({ mode: 'forgot-password' });
    TestBed.configureTestingModule({ imports: [AccountComponent], providers: [provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { data, snapshot: { data: data.value, queryParamMap: convertToParamMap({}) } } }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); http.verify(); });
  function setup(mode = 'forgot-password', existingAccount = false) {
    data.next({ mode }); const fixture = TestBed.createComponent(AccountComponent); fixture.detectChanges();
    if (mode !== 'forgot-password') { http.expectOne('/bff/account/' + mode).flush(mode === 'invitation' ? { ...preview, existingAccount } : { available: true }); flushMicrotasks(); fixture.detectChanges(); }
    return fixture;
  }
  function csrf() { http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); }
  it('requests generic recovery explicitly with CSRF, no duplicate requests and no password', fakeAsync(() => {
    const f = setup(), c = f.componentInstance; c.email = 'unknown@example.test'; void c.submit(valid); void c.submit(valid); csrf();
    const r = http.expectOne('/bff/account/forgot-password'); expect(r.request.body).toEqual({ email: 'unknown@example.test' }); expect(r.request.headers.get('X-CSRF-TOKEN')).toBe('csrf'); r.flush({}); flushMicrotasks();
    expect(c.message()).toContain('If the account is eligible'); expect(c.locked()).toBeTrue();
  }));
  it('reads invitation without accepting, encodes organization text and requires confirmation', fakeAsync(() => {
    const f = setup('invitation'), c = f.componentInstance;
    expect(f.nativeElement.querySelector('img')).toBeNull(); expect(f.nativeElement.textContent).toContain('<img src=x');
    spyOn(window, 'confirm').and.returnValue(false); c.password = 'private'; void c.submit(valid); http.expectNone('/bff/antiforgery');
  }));
  it('sends final acceptance without tokens, clears passwords immediately and recovers ambiguous outcomes read only', fakeAsync(() => {
    const f = setup('invitation'), c = f.componentInstance; spyOn(window, 'confirm').and.returnValue(true);
    c.firstName = 'Safe'; c.lastName = 'Name'; c.password = 'private'; void c.submit(valid); expect(c.password).toBe(''); csrf();
    const r = http.expectOne('/bff/account/invitation'); expect(r.request.method).toBe('POST'); expect(r.request.body).toEqual({ firstName: 'Safe', lastName: 'Name', password: 'private', confirmed: true });
    r.flush({}, { status: 502, statusText: 'Uncertain' }); flushMicrotasks(); const recovery = http.expectOne('/bff/account/invitation'); expect(recovery.request.method).toBe('GET'); recovery.flush({}, { status: 400, statusText: 'Unavailable' }); flushMicrotasks();
    expect(c.locked()).toBeTrue(); expect(c.password).toBe(''); void c.submit(valid); http.expectNone('/bff/antiforgery');
  }));
  it('blocks existing-account acceptance until authenticated and never sends invitation tokens to the browser', fakeAsync(() => {
    const f = setup('invitation', true); void f.componentInstance.submit(valid); http.expectNone('/bff/antiforgery'); expect(f.nativeElement.textContent).toContain('matching verified account');
  }));
  it('reset GET never writes, and a denied reset clears password and reads status without replay', fakeAsync(() => {
    const f = setup('reset-password'), c = f.componentInstance; c.password = 'private'; void c.submit(valid); csrf();
    const r = http.expectOne('/bff/account/reset-password'); expect(r.request.body).toEqual({ password: 'private' }); r.flush({}, { status: 400, statusText: 'Expired' }); flushMicrotasks();
    http.expectOne('/bff/account/reset-password').flush({}, { status: 400, statusText: 'Unavailable' }); flushMicrotasks(); expect(c.password).toBe(''); expect(c.locked()).toBeTrue();
  }));
  it('rejects stale invitation responses and clears sensitive input on identity change', fakeAsync(() => {
    data.next({ mode: 'invitation' }); const f = TestBed.createComponent(AccountComponent); f.detectChanges(); const old = http.expectOne('/bff/account/invitation'); f.componentInstance.password = 'private';
    TestBed.inject(AuthState).accept(selectedSession('Student'), () => {}); f.detectChanges(); const fresh = http.expectOne('/bff/account/invitation');
    old.flush(preview); flushMicrotasks(); expect(f.componentInstance.preview()).toBeNull(); expect(f.componentInstance.password).toBe(''); fresh.flush({ ...preview, organization: 'Fresh' }); flushMicrotasks(); expect(f.componentInstance.preview()?.organization).toBe('Fresh');
  }));
  it('cleans an accidental token-bearing SPA URL and refuses to process it', fakeAsync(() => {
    Object.defineProperty(TestBed.inject(ActivatedRoute).snapshot, 'queryParamMap', { value: convertToParamMap({ token: 'private-token' }) });
    const clean = spyOn(window.history, 'replaceState'); const f = TestBed.createComponent(AccountComponent); f.detectChanges(); expect(clean).toHaveBeenCalled(); expect(JSON.stringify(clean.calls.mostRecent().args)).not.toContain('private-token'); expect(f.componentInstance.locked()).toBeTrue(); http.expectNone('/bff/account/invitation');
  }));
  it('successful reset clears authenticated display state and rotates anonymous CSRF without logging in or replaying', fakeAsync(() => {
    TestBed.inject(AuthState).accept(selectedSession('Student'), () => {});
    const f = setup('reset-password'), c = f.componentInstance; c.password = 'private'; void c.submit(valid); csrf();
    http.expectOne('/bff/account/reset-password').flush(null); flushMicrotasks();
    http.expectOne('/bff/antiforgery').flush({ requestToken: 'anonymous-csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); f.detectChanges();
    expect(TestBed.inject(AuthState).session()).toBeNull(); expect(c.locked()).toBeTrue(); expect(c.message()).toContain('Sign in again'); expect(c.password).toBe(''); http.expectNone('/bff/account/reset-password');
  }));
});
