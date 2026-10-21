import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { StudentCoursesComponent } from './student-courses.component';
import { courseRow } from './student-courses.testing';

describe('Student course pages', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StudentCoursesComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { mode: 'mine' } } } }] });
    TestBed.inject(AuthState).accept(selectedSession(), () => {});
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); TestBed.inject(HttpTestingController).verify(); });
  it('renders all enrollment states, metadata and unavailable courses as text, with no dead viewer links', fakeAsync(() => {
    const fixture = TestBed.createComponent(StudentCoursesComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading stored courses');
    const unavailable = { ...courseRow('Active', 'missing'), course: null };
    TestBed.inject(HttpTestingController).expectOne('/bff/student/my-courses').flush({ organizationId: 'org', courses: [courseRow('Active', 'active'), courseRow('Completed', 'completed'), courseRow('Cancelled', 'cancelled'), unavailable] });
    flushMicrotasks(); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    for (const text of ['My Courses', 'Active', 'Completed', 'Cancelled', 'Course unavailable', 'Science', 'Beginner', '90 minutes', '<script>alert(1)</script>', '<img src=x']) expect(element.textContent).toContain(text);
    expect(element.querySelector('script, img')).toBeNull(); expect(element.querySelectorAll('li').length).toBe(4);
    expect(element.querySelectorAll('li a').length).toBe(2); expect(element.textContent).not.toContain('grade');
    expect(element.querySelectorAll('li a')[0].getAttribute('href')).toBe('/workspace/student/courses/active');
    expect(element.querySelectorAll('li a')[1].getAttribute('href')).toBe('/workspace/student/courses/completed');
    const cards = element.querySelectorAll('li'); expect(cards[1].querySelector('button')).toBeNull();
    cards[2].querySelector('button')!.click(); fixture.detectChanges(); expect(cards[2].querySelector('fieldset legend')?.textContent).toContain('Confirm re-enrollment');
    TestBed.inject(HttpTestingController).expectNone('/bff/antiforgery');
  }));
  it('shows an empty My Courses page and clears rendered data on session loss', fakeAsync(() => {
    const fixture = TestBed.createComponent(StudentCoursesComponent); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/bff/student/my-courses').flush({ organizationId: 'org', courses: [] }); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no enrollments');
    void fixture.componentInstance.store.refresh();
    TestBed.inject(HttpTestingController).expectOne('/bff/student/my-courses').flush({ organizationId: 'org', courses: [courseRow('Active')] }); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Science');
    TestBed.inject(AuthState).clear(); fixture.detectChanges(); expect(fixture.componentInstance.store.rows()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Science');
  }));
  it('shows safe loading errors and reload controls', fakeAsync(() => {
    const fixture = TestBed.createComponent(StudentCoursesComponent); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/bff/student/my-courses').flush('<script>private</script>', { status: 502, statusText: 'Unavailable' });
    flushMicrotasks(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Reload');
    expect(fixture.nativeElement.textContent).not.toContain('private'); expect(fixture.nativeElement.querySelector('button').textContent).toContain('Reload list');
  }));
  it('shows catalog-specific empty state without enrollment or content requests', fakeAsync(() => {
    TestBed.inject(ActivatedRoute).snapshot.data['mode'] = 'catalog';
    const fixture = TestBed.createComponent(StudentCoursesComponent); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/bff/student/courses').flush({ organizationId: 'org', courses: [] });
    flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Published course catalog');
    expect(fixture.nativeElement.textContent).toContain('No published courses');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/workspace/student/my-courses');
  }));
  it('clears course data at absolute session expiry', fakeAsync(() => {
    TestBed.inject(AuthState).accept({ ...selectedSession(), expiresAt: new Date(Date.now() + 1000).toISOString() }, () => {});
    const fixture = TestBed.createComponent(StudentCoursesComponent); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/bff/student/my-courses').flush({ organizationId: 'org', courses: [courseRow('Active')] });
    flushMicrotasks(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Science');
    tick(1000); fixture.detectChanges(); expect(fixture.componentInstance.store.rows()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Science');
  }));
});
