import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { StudentProgressComponent } from './student-progress.component';
import { StudentProgress } from './student-progress.models';
import { courseSelection, startedLesson, storedProgress } from './student-progress.testing';
import { selection } from './student-viewer.testing';
import { viewerRoot } from './student-viewer.models';

describe('Student progress panel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StudentProgressComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(AuthState).accept(selectedSession(), () => {});
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); TestBed.inject(HttpTestingController).verify(); });
  function render(data: StudentProgress) {
    const fixture = TestBed.createComponent(StudentProgressComponent);
    fixture.componentRef.setInput('selection', data.lessonId ? selection : courseSelection); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(viewerRoot(data.lessonId ? selection : courseSelection)! + '/progress').flush(data);
    flushMicrotasks(); fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); return fixture;
  }
  it('shows explicit start, stored timestamps and completion controls without navigation writes', fakeAsync(() => {
    const fixture = render(storedProgress()); const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('has not been started'); expect(element.textContent).toContain('Start lesson');
    expect(element.textContent).toContain('do not record progress or change LastAccessedAt');
    expect(element.querySelector('input')).toBeNull(); TestBed.inject(HttpTestingController).expectNone('/bff/antiforgery'); fixture.destroy();
    const started = render({ ...storedProgress(), lesson: startedLesson });
    expect(started.nativeElement.querySelector('input')).toBeNull(); expect(started.nativeElement.textContent).not.toContain('Save progress');
    expect(started.nativeElement.textContent).toContain('In progress'); expect(started.nativeElement.textContent).toContain('Stored progress: 25%');
    expect(started.nativeElement.textContent).toContain('Last accessed at'); expect(started.nativeElement.textContent).toContain('Mark lesson complete');
    TestBed.inject(HttpTestingController).expectNone('/bff/antiforgery');
  }));
  it('cancels lesson confirmation without any mutation and preserves legacy completed data', fakeAsync(() => {
    const fixture = render({ ...storedProgress(), lesson: { ...startedLesson, progressPercentage: 37.5123 } });
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('button')!.click(); fixture.detectChanges();
    expect(element.textContent).toContain('Confirm lesson completion');
    Array.from(element.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Cancel')!.click(); fixture.detectChanges();
    expect(fixture.componentInstance.store.confirmingLesson()).toBeFalse();
    TestBed.inject(HttpTestingController).expectNone(request => request.method !== 'GET');
    fixture.destroy();
    const completed = render({ ...storedProgress(), lesson: { ...startedLesson, isCompleted: true, progressPercentage: 37.5123, completedAt: '2026-10-03T10:00:00Z' } });
    expect(completed.nativeElement.textContent).toContain('Lesson state: Completed. Stored progress: 37.5123%');
    const dates = Array.from(completed.nativeElement.querySelectorAll('dd')) as HTMLElement[];
    expect(dates[2].textContent).toContain('2026'); expect(dates[2].textContent).not.toContain('Not recorded');
    expect(completed.nativeElement.querySelector('button,input')).toBeNull();
    expect(completed.componentInstance.store.data()?.lesson?.lastAccessedAt).toBe(startedLesson.lastAccessedAt);
  }));
  it('separates current incomplete progress from historical Completed enrollment', fakeAsync(() => {
    const data = storedProgress(false); data.enrollment = { ...data.enrollment, status: 'Completed', completedAt: '2026-10-03T10:00:00Z' };
    const fixture = render(data); const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('1 / 2 published lessons completed (50%)'); expect(element.textContent).toContain('Current completion state: Incomplete');
    expect(element.textContent).toContain('Status: Completed'); expect(element.textContent).toContain('Historical completion is retained');
    expect(element.textContent).not.toContain('Enrollment completed at: Not recorded'); expect(element.querySelector('button,input')).toBeNull();
  }));
  it('explains zero published lessons and unfinished prerequisites without offering an enabled completion', fakeAsync(() => {
    const zero = render({ ...storedProgress(false), current: { totalLessons: 0, completedLessons: 0, progressPercentage: 0, isCompleted: false } });
    expect(zero.nativeElement.textContent).toContain('at least one published lesson'); expect(zero.nativeElement.querySelector('button').disabled).toBeTrue(); zero.destroy();
    const incomplete = render(storedProgress(false)); expect(incomplete.nativeElement.textContent).toContain('Complete every currently published lesson');
    expect(incomplete.nativeElement.querySelector('button').disabled).toBeTrue();
  }));
  it('requires explicit confirmation and disables duplicate completion clicks', fakeAsync(() => {
    const data = { ...storedProgress(false), current: { totalLessons: 2, completedLessons: 2, progressPercentage: 100, isCompleted: true } };
    const fixture = render(data); const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('button')!.click(); fixture.detectChanges();
    expect(element.textContent).toContain('Confirm course completion'); TestBed.inject(HttpTestingController).expectNone('/bff/antiforgery');
    const confirm = Array.from(element.querySelectorAll('button')).find(button => button.textContent?.includes('Confirm completion'))!;
    confirm.click(); confirm.click(); fixture.detectChanges();
    const csrf = TestBed.inject(HttpTestingController).expectOne('/bff/antiforgery'); csrf.flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks();
    const request = TestBed.inject(HttpTestingController).expectOne(viewerRoot(courseSelection)! + '/enrollments/' + data.enrollment.id + '/complete'); expect(request.request.body).toEqual({ confirmed: true });
    expect(element.querySelector('fieldset')?.disabled).toBeTrue(); request.flush(null); flushMicrotasks();
    TestBed.inject(HttpTestingController).expectOne(viewerRoot(courseSelection)! + '/progress').flush({ ...data, enrollment: { ...data.enrollment, status: 'Completed', completedAt: '2026-10-03T10:00:00Z' } });
    flushMicrotasks(); fixture.detectChanges(); expect(element.textContent).toContain('Status: Completed'); expect(element.querySelector('button')).toBeNull();
  }));
  it('clears progress on expiry and rejects a stale GET after organization change', fakeAsync(() => {
    TestBed.inject(AuthState).accept({ ...selectedSession(), expiresAt: new Date(Date.now() + 1000).toISOString() }, () => {});
    const fixture = render({ ...storedProgress(), lesson: startedLesson }); tick(1000); fixture.detectChanges();
    expect(fixture.componentInstance.store.data()).toBeNull(); expect(fixture.nativeElement.textContent).not.toContain('Stored progress: 25%');
    TestBed.inject(AuthState).accept(selectedSession(), () => {}); fixture.detectChanges();
    const old = TestBed.inject(HttpTestingController).expectOne(viewerRoot(selection)! + '/progress');
    TestBed.inject(AuthState).accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'new-org' } }, () => {}); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(viewerRoot(selection)! + '/progress').flush({ ...storedProgress(), organizationId: 'new-org' }); flushMicrotasks(); fixture.detectChanges();
    old.flush({ ...storedProgress(), lesson: startedLesson }); flushMicrotasks(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).not.toContain('Stored progress: 25%');
  }));
  it('emits authoritative denial to remove parent content and media', fakeAsync(() => {
    const fixture = TestBed.createComponent(StudentProgressComponent); fixture.componentRef.setInput('selection', selection);
    const errors: string[] = []; fixture.componentInstance.accessDenied.subscribe(error => errors.push(error)); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(viewerRoot(selection)! + '/progress').flush(null, { status: 403, statusText: 'Forbidden' }); flushMicrotasks(); fixture.detectChanges();
    expect(errors[0]).toContain('denied'); expect(fixture.componentInstance.store.data()).toBeNull();
  }));
});
