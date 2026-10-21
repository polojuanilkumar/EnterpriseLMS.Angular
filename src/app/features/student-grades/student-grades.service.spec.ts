import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { selection } from '../student-viewer/student-viewer.testing';
import { StudentGradesService } from './student-grades.service';
import { gradeData } from './student-grades.testing';
describe('My Grades scoped reads',()=>{
  let store:StudentGradesService;let http:HttpTestingController;let state:AuthState;const root='/bff/student/grades/courses/'+selection.courseId;
  beforeEach(()=>{TestBed.configureTestingModule({providers:[StudentGradesService,provideRouter([]),provideHttpClient(),provideHttpClientTesting()]});store=TestBed.inject(StudentGradesService);http=TestBed.inject(HttpTestingController);state=TestBed.inject(AuthState);state.accept(selectedSession(),()=>{});});
  afterEach(()=>{state.clear();http.verify();});
  it('uses only bounded report filters and separate assessment pages, without authority headers',fakeAsync(()=>{store.bind(state.session(),false,selection.courseId,{quizPage:'2',assignmentPage:'3',pageSize:'1',quizStatus:'2',assignmentStatus:'1',organizationId:'evil'});const r=http.expectOne(q=>q.url===root);expect(r.request.method).toBe('GET');expect(r.request.params.get('quizPage')).toBe('2');expect(r.request.params.get('assignmentPage')).toBe('3');expect(r.request.params.has('organizationId')).toBeFalse();expect(r.request.headers.has('Authorization')).toBeFalse();r.flush(gradeData());flushMicrotasks();expect(store.data()?.course?.enrollmentStatus).toBe(2);}));
  it('reads paginated course filters and handles empty past-end pages',fakeAsync(()=>{store.bind(state.session(),false,null,{page:'5',pageSize:'1',search:'Course',published:'false',enrollmentStatus:'2'});const r=http.expectOne(q=>q.url==='/bff/student/grades');expect(r.request.params.get('search')).toBe('Course');r.flush({organizationId:'org',courses:{page:5,pageSize:1,total:1,items:[]}});flushMicrotasks();expect(store.data()?.courses?.items).toEqual([]);}));
  it('rejects foreign responses and clears prior grades while a new context is loading',fakeAsync(()=>{store.bind(state.session(),false,selection.courseId,{});const old=http.expectOne(root);state.accept({...selectedSession(),selectedOrganization:{...selectedSession().selectedOrganization!,id:'new-org'}},()=>{});store.bind(state.session(),false,selection.courseId,{});http.expectOne(root).flush({...gradeData(),organizationId:'new-org'});flushMicrotasks();old.flush(gradeData());flushMicrotasks();expect(store.data()?.organizationId).toBe('new-org');store.bind(null,false,selection.courseId,{});expect(store.data()).toBeNull();}));
  it('sanitizes invalid filters and denial without retaining old feedback',fakeAsync(()=>{for(const status of [400,403,404,502]){store.bind(state.session(),false,selection.courseId,{pageSize:'51'});http.expectOne(q=>q.url===root).flush('PRIVATE',{status,statusText:'Rejected'});flushMicrotasks();expect(store.data()).toBeNull();expect(store.error()).not.toContain('PRIVATE');}}));
});
