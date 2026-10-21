import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { StudentAssignmentsService } from './student-assignments.service';
import { AssignmentData, assignmentUrl, pdfLimit, submissionValidation } from './student-assignments.models';
import { assignmentData, submittedData, location } from './student-assignments.testing';
describe('Student final submission state', () => {
  let store: StudentAssignmentsService; let http: HttpTestingController; let state: AuthState; const root = assignmentUrl(location)!;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [StudentAssignmentsService, provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting()] }); store=TestBed.inject(StudentAssignmentsService); http=TestBed.inject(HttpTestingController); state=TestBed.inject(AuthState); state.accept(selectedSession(),()=>{}); });
  afterEach(() => { state.clear(); http.verify(); });
  function read(data: AssignmentData) { const request=http.expectOne(root); expect(request.request.method).toBe('GET'); request.flush(data); flushMicrotasks(); }
  function start(data=assignmentData()) { store.bind(state.session(),false,location); read(data); }
  function csrf() { http.expectOne('/bff/antiforgery').flush({requestToken:'csrf',headerName:'X-CSRF-TOKEN'}); flushMicrotasks(); }
  it('only posts confirmed FormData once with text, one optional PDF and CSRF', fakeAsync(() => {
    start(); const file=new File(['%PDF-test'],'work.pdf',{type:'application/pdf'}); store.editText('Final plain text'); store.selectFile([file]); void store.submit(); http.expectNone('/bff/antiforgery');
    store.askSubmit(); void store.submit(); void store.submit(); csrf(); const request=http.expectOne(root+'/submit'); const body=request.request.body as FormData;
    expect(request.request.method).toBe('POST'); expect(body.get('Text')).toBe('Final plain text'); expect(body.get('Confirmed')).toBe('true'); expect(body.get('File')).toEqual(file); expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('csrf'); expect(request.request.headers.has('Content-Type')).toBeFalse(); expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush(null); flushMicrotasks(); read(submittedData()); expect(store.file()).toBeNull(); expect(store.text()).toBe(''); expect(store.pending()).toBeFalse();
  }));
  it('validates text, PDF declaration/size/name and multiple files without uploading', fakeAsync(() => {
    start(); store.askSubmit(); expect(store.validation()).toContain('Provide');
    for(const file of [new File([], 'empty.pdf',{type:'application/pdf'}),new File(['x'],'bad.exe',{type:'application/pdf'}),new File(['x'],'bad.pdf',{type:'text/html'})]) expect(submissionValidation('',file)).toContain('25 MiB');
    const oversized=new File(['x'],'large.pdf',{type:'application/pdf'}); Object.defineProperty(oversized,'size',{value:pdfLimit+1}); expect(submissionValidation('',oversized)).toContain('25 MiB');
    expect(submissionValidation('x'.repeat(100001),null)).toContain('100000'); const pdf=new File(['%PDF'],'a.pdf',{type:'application/pdf'}); store.selectFile([pdf,pdf]); expect(store.validation()).toContain('Only one'); expect(store.file()).toBeNull(); http.expectNone('/bff/antiforgery');
  }));
  it('supports text-only and PDF-only final work', fakeAsync(() => {
    for(const fileOnly of [false,true]) { start(); if(fileOnly)store.selectFile([new File(['%PDF'],'a.pdf',{type:'application/pdf'})]);else store.editText('Text only'); store.askSubmit(); void store.submit(); csrf(); const request=http.expectOne(root+'/submit'); expect((request.request.body as FormData).has('File')).toBe(fileOnly); request.flush(null); flushMicrotasks(); read(submittedData()); }
  }));
  it('recovers ambiguous uploads through GET without replay and requires stored-state acknowledgement', fakeAsync(() => {
    start(); store.editText('Final'); store.askSubmit(); void store.submit(); csrf(); http.expectOne(root+'/submit').error(new ProgressEvent('error')); flushMicrotasks(); read(assignmentData());
    expect(store.notice()).toContain('No upload was automatically replayed'); expect(store.recovery()).toBeTrue(); expect(store.text()).toBe(''); store.editText('New'); store.askSubmit(); expect(store.confirming()).toBeFalse(); store.acknowledgeRecovery(); store.askSubmit(); expect(store.confirming()).toBeTrue(); http.expectNone(root+'/submit');
  }));
  it('handles duplicate/deadline conflicts and failed recovery without enabling another upload', fakeAsync(() => {
    start(); store.editText('Final'); store.askSubmit(); void store.submit(); csrf(); http.expectOne(root+'/submit').flush('PRIVATE',{status:409,statusText:'Conflict'}); flushMicrotasks(); expect(store.notice()).toContain('deadline');
    http.expectOne(root).flush('PRIVATE',{status:502,statusText:'Unavailable'}); flushMicrotasks(); expect(store.data()).toBeNull(); expect(store.pending()).toBeFalse(); expect(store.notice()).not.toContain('PRIVATE'); store.askSubmit(); void store.submit(); http.expectNone('/bff/antiforgery');
  }));
  it('retains Completed history but blocks mutations and rejects mismatched scope', fakeAsync(() => {
    start({...submittedData(),enrollmentStatus:2}); store.editText('No'); store.askSubmit(); void store.submit(); http.expectNone('/bff/antiforgery');
    start({...assignmentData(),organizationId:'foreign'}); expect(store.data()).toBeNull();
  }));
  it('clears sensitive state and rejects stale GET, mutation and CSRF responses across organizations', fakeAsync(() => {
    store.bind(state.session(),false,location); const old=http.expectOne(root); state.accept({...selectedSession(),selectedOrganization:{...selectedSession().selectedOrganization!,id:'new-org'}},()=>{}); store.bind(state.session(),false,location); read({...assignmentData(),organizationId:'new-org'}); old.flush(submittedData()); flushMicrotasks(); expect(store.data()?.organizationId).toBe('new-org');
    store.editText('Sensitive'); store.askSubmit(); void store.submit(); const bootstrap=http.expectOne('/bff/antiforgery'); state.clear(); store.bind(null,false,location); bootstrap.flush({requestToken:'old',headerName:'X-CSRF-TOKEN'}); flushMicrotasks(); expect(store.text()).toBe(''); expect(store.file()).toBeNull(); expect(store.data()).toBeNull(); http.expectNone(root+'/submit');
  }));
  it('discards stale upload completion after logout and handles 401 through existing auth', fakeAsync(() => {
    start(); store.editText('Final'); store.askSubmit(); void store.submit(); csrf(); const mutation=http.expectOne(root+'/submit'); state.clear(); store.bind(null,false,location); mutation.flush(null); flushMicrotasks(); http.expectNone(root);
    state.accept(selectedSession(),()=>{}); spyOn(TestBed.inject(Router),'navigateByUrl').and.resolveTo(true); store.bind(state.session(),false,location); http.expectOne(root).flush(null,{status:401,statusText:'Expired'}); flushMicrotasks(); expect(state.session()).toBeNull();
  }));
  it('does not read or mutate during uncertain session context', fakeAsync(() => { TestBed.inject(AuthService).checking.set(true); store.bind(state.session(),true,location); expect(store.data()).toBeNull(); http.expectNone(root); }));
});
