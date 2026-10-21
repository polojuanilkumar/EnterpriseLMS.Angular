import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { NgForm } from '@angular/forms';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { workspaceAllows } from '../../core/auth/workspace-routing';
import { PlatformComponent } from './platform.component';

describe('Platform organizations and separate account audit', () => {
  let http: HttpTestingController, data: BehaviorSubject<{ mode: string }>;
  const valid = { invalid: false } as NgForm;
  const page = { data: { page: 1, pageSize: 20, total: 1, items: [{ id: '11111111-1111-1111-1111-111111111111', name: '<script>Organization</script>', code: 'ORG', isActive: true }] } };
  beforeEach(() => {
    data = new BehaviorSubject({ mode: 'organizations' }); const params = convertToParamMap({});
    TestBed.configureTestingModule({ imports: [PlatformComponent], providers: [provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { data, paramMap: new BehaviorSubject(params), snapshot: { data: data.value, paramMap: params } } }] });
    TestBed.inject(AuthState).accept({ ...selectedSession('Admin'), selectedOrganization: null, isSuperAdmin: true }, () => {}); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); http.verify(); });
  function setup() { const f = TestBed.createComponent(PlatformComponent); f.detectChanges(); http.expectOne('/bff/platform/organizations?pageSize=20&page=1').flush(page); flushMicrotasks(); f.detectChanges(); return f; }
  it('allows unselected verified SuperAdmin navigation and safely displays organizations without mutations', fakeAsync(() => {
    const f = setup(); expect(workspaceAllows(TestBed.inject(AuthState).session(), '/workspace/platform/organizations')).toBeTrue(); expect(f.nativeElement.querySelector('script')).toBeNull(); expect(f.nativeElement.textContent).toContain('<script>Organization');
    expect(workspaceAllows(selectedSession('Admin'), '/workspace/platform/organizations')).toBeFalse();
  }));
  it('confirms creation and retains safe entered values after validation conflicts', fakeAsync(() => {
    const f = setup(), c = f.componentInstance; c.form = { code: 'ORG', name: 'Organization', initialAdminEmail: 'exact@example.test' }; const confirm = spyOn(window, 'confirm').and.returnValue(false);
    void c.create(valid); http.expectNone('/bff/antiforgery'); confirm.and.returnValue(true); void c.create(valid); void c.create(valid);
    http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks();
    const r = http.expectOne('/bff/platform/organizations'); expect(r.request.headers.get('X-CSRF-TOKEN')).toBe('csrf'); expect(r.request.body).toEqual({ ...c.form, confirmed: true }); r.flush({}, { status: 409, statusText: 'Conflict' }); flushMicrotasks(); expect(c.form.initialAdminEmail).toBe('exact@example.test'); expect(c.pending()).toBeFalse();
  }));
  it('locks ambiguous creation and recovers by bounded code search without replay', fakeAsync(() => {
    const f = setup(), c = f.componentInstance; spyOn(window, 'confirm').and.returnValue(true); c.form = { code: 'CHECK', name: 'Organization', initialAdminEmail: 'exact@example.test' }; void c.create(valid);
    http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); http.expectOne('/bff/platform/organizations').flush({}, { status: 502, statusText: 'Uncertain' }); flushMicrotasks();
    const recovery = http.expectOne('/bff/platform/organizations?pageSize=20&search=CHECK&page=1'); expect(recovery.request.method).toBe('GET'); recovery.flush(page); flushMicrotasks(); expect(c.locked()).toBeTrue(); void c.create(valid); http.expectNone('/bff/antiforgery');
  }));
  it('discards stale organization reads after logout', fakeAsync(() => {
    const f = TestBed.createComponent(PlatformComponent); f.detectChanges(); const r = http.expectOne('/bff/platform/organizations?pageSize=20&page=1'); TestBed.inject(AuthState).clear(); f.detectChanges(); r.flush(page); flushMicrotasks(); expect(f.componentInstance.organizations()).toBeNull(); expect(f.componentInstance.form.initialAdminEmail).toBe('');
  }));
  it('uses platform audit only and retains the normalized UTC window while paging', fakeAsync(() => {
    data.next({ mode: 'audit' }); const f = TestBed.createComponent(PlatformComponent); f.detectChanges(); const r = http.expectOne('/bff/platform/audit?pageSize=20&page=1');
    r.flush({ page: 1, pageSize: 20, total: 21, items: [], actions: ['account.password-reset'], outcomes: ['succeeded'], filter: { fromUtc: '2026-10-01T00:00:00Z', toUtc: '2026-10-08T00:00:00Z' } }); flushMicrotasks(); f.componentInstance.move(1);
    const next = http.expectOne('/bff/platform/audit?pageSize=20&fromUtc=2026-10-01T00%3A00%3A00Z&toUtc=2026-10-08T00%3A00%3A00Z&page=2'); expect(next.request.method).toBe('GET'); next.flush({ page: 2, pageSize: 20, total: 21, items: [], filter: { fromUtc: '2026-10-01T00:00:00Z', toUtc: '2026-10-08T00:00:00Z' } }); flushMicrotasks(); http.expectNone('/bff/organization/audit');
  }));
});
