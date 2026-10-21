import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { StaffAuthoringComponent } from './staff-authoring.component';
import { fileProblem, Page } from './staff-authoring.models';
import { staffAllowed, workspaceAllows } from '../../core/auth/workspace-routing';

describe('Staff authoring', () => {
  const courseId = '11111111-1111-1111-1111-111111111111', sectionId = '22222222-2222-2222-2222-222222222222', lessonId = '33333333-3333-3333-3333-333333333333', itemId = '44444444-4444-4444-4444-444444444444';
  const base = '/bff/staff/courses/' + courseId, section = base + '/sections/' + sectionId, unit = section + '/lessons/' + lessonId;
  const data = new BehaviorSubject({ mode: 'courseForm' });
  const params = new BehaviorSubject(convertToParamMap({ courseId, sectionId, lessonId }));
  let http: HttpTestingController;
  const editor = { form: { title: 'Stored', code: 'CODE', description: 'Description', level: 2, durationInMinutes: 4, categoryId: null, instructorId: null }, categories: [], instructors: [], isAdmin: false };
  const lessonPage = (): Page => ({ lesson: { id: lessonId, title: 'Lesson', displayOrder: 1, description: null, isPublished: false }, content: { items: [1, 2, 3, 4, 5].map(type => ({ id: type === 1 ? itemId : `${type}4444444-4444-4444-4444-444444444444`, title: '<script>title</script>', type, displayOrder: type, isRequired: false, text: '<img src=x onerror=alert(1)>', youTubeVideoId: 'dQw4w9WgXcQ', assetId: itemId })), legacy: null } });
  beforeEach(() => {
    data.next({ mode: 'courseForm' }); params.next(convertToParamMap({ courseId, sectionId, lessonId }));
    TestBed.configureTestingModule({ imports: [StaffAuthoringComponent], providers: [provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { data, paramMap: params, snapshot: { data: data.value, paramMap: params.value } } }] });
    TestBed.inject(AuthState).accept(selectedSession('Instructor'), () => {}); http = TestBed.inject(HttpTestingController);
    spyOn(HTMLMediaElement.prototype, 'pause'); spyOn(HTMLMediaElement.prototype, 'load');
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); http.verify(); });
  function setup(mode = 'courseForm') {
    data.next({ mode });
    const fixture = TestBed.createComponent(StaffAuthoringComponent); fixture.detectChanges();
    http.expectOne(mode === 'courseForm' ? base + '/edit?Page=1&PageSize=50&Search=' : mode === 'lessonForm' ? unit + '/edit' : unit).flush(mode === 'courseForm' || mode === 'lessonForm' ? editor : lessonPage());
    flushMicrotasks(); fixture.detectChanges(); flushMicrotasks();
    return fixture;
  }
  function csrf() { http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); }
  it('uses explicit typed form payloads with CSRF, blocks duplicate submits and retains validation values', fakeAsync(() => {
    const fixture = setup(); const component = fixture.componentInstance;
    component.form.title = '<script>Entered</script>'; component.changed();
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); csrf();
    const request = http.expectOne(base); expect(request.request.method).toBe('PUT'); expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('csrf');
    expect(request.request.body).toEqual(component.form); request.flush({ message: 'private diagnostic' }, { status: 400, statusText: 'Bad Request' }); flushMicrotasks(); fixture.detectChanges();
    expect(component.form.title).toBe('<script>Entered</script>'); expect(component.pending()).toBeFalse(); expect(component.locked()).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('private diagnostic'); expect(fixture.nativeElement.querySelector('script')).toBeNull();
  }));
  it('roundtrips legacy fields independently and makes no progress or publication writes on navigation', fakeAsync(() => {
    const fixture = setup('lessonForm'); const component = fixture.componentInstance;
    component.form = { title: 'Lesson', description: 'Body', displayOrder: 2, lessonType: 2, durationInMinutes: 4, content: '<script>Legacy</script>', videoUrl: 'https://legacy.test' }; fixture.detectChanges(); flushMicrotasks();
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); csrf();
    const request = http.expectOne(unit); expect(request.request.body.content).toContain('Legacy'); expect(request.request.body.videoUrl).toBe('https://legacy.test');
    request.flush(null); flushMicrotasks(); expect(navigate).toHaveBeenCalledWith(component.sectionPath); expect(component.dirty).toBeFalse();
  }));
  it('confirms publication and deletion, reorders the complete item set and refreshes reads', fakeAsync(() => {
    const fixture = setup('lesson'); const c = fixture.componentInstance; const confirmation = spyOn(window, 'confirm').and.returnValue(false);
    void c.publication('publish'); void c.remove(c.page()!.content!.items[0]); http.expectNone('/bff/antiforgery');
    confirmation.and.returnValue(true); void c.publication('publish'); void c.publication('publish'); csrf();
    const publication = http.expectOne(unit + '/publication'); expect(publication.request.body).toEqual({ action: 'publish', confirmed: true }); publication.flush(null); flushMicrotasks();
    http.expectOne(unit).flush(lessonPage()); flushMicrotasks();
    void c.move(0, 1); csrf(); const order = http.expectOne(unit + '/items/reorder'); expect(order.request.method).toBe('PUT');
    expect(order.request.body.itemIds).toEqual([lessonPage().content!.items[1].id, itemId, ...lessonPage().content!.items.slice(2).map(x => x.id)]); order.flush(null); flushMicrotasks(); http.expectOne(unit).flush(lessonPage()); flushMicrotasks();
    void c.remove(c.page()!.content!.items[0]); csrf(); const deletion = http.expectOne(unit + '/items/' + itemId + '/delete'); expect(deletion.request.body).toEqual({ confirmed: true }); deletion.flush(null); flushMicrotasks(); http.expectOne(unit).flush(lessonPage()); flushMicrotasks();
  }));
  it('recovers uncertain writes through GET only and locks replay while preserving safe values', fakeAsync(() => {
    const fixture = setup(); const c = fixture.componentInstance; c.form.title = 'Entered'; c.changed();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); csrf();
    http.expectOne(base).error(new ProgressEvent('error')); flushMicrotasks();
    http.expectOne(base + '/edit?Page=1&PageSize=50&Search=').flush(editor); flushMicrotasks(); fixture.detectChanges();
    expect(c.locked()).toBeTrue(); expect(c.form.title).toBe('Entered'); expect(fixture.nativeElement.textContent).toContain('Stored state after recovery');
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); http.expectNone('/bff/antiforgery');
  }));
  it('uploads multipart separately, retains returned attachment after attach conflict and never auto-reuploads', fakeAsync(() => {
    const fixture = setup('itemForm'), c = fixture.componentInstance; c.form = { title: 'PDF', type: 5, displayOrder: 0, isRequired: false }; fixture.detectChanges(); flushMicrotasks();
    c.file = new File(['%PDF-1.7'], 'test.pdf', { type: 'application/pdf' }); void c.upload(); csrf();
    const upload = http.expectOne(unit + '/uploads'); expect(upload.request.body instanceof FormData).toBeTrue(); expect(upload.request.body.get('type')).toBe('5'); expect(upload.request.headers.get('X-CSRF-TOKEN')).toBe('csrf');
    upload.flush({ id: itemId }); flushMicrotasks(); expect(c.form.assetId).toBe(itemId); expect(c.file).toBeNull();
    fixture.detectChanges(); flushMicrotasks(); fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); csrf();
    const attach = http.expectOne(unit + '/items'); expect(attach.request.body.assetId).toBe(itemId); attach.flush({}, { status: 409, statusText: 'Conflict' }); flushMicrotasks(); expect(c.form.assetId).toBe(itemId); expect(c.locked()).toBeFalse();
  }));
  it('validates file size/type and clears unrelated fields when changing content type', fakeAsync(() => {
    const fixture = setup('itemForm'), c = fixture.componentInstance;
    expect(fileProblem(new File(['test'], 'bad.pdf', { type: 'text/html' }), 5)).toContain('matching');
    expect(fileProblem(new File([], 'test.pdf', { type: 'application/pdf' }), 5)).toContain('nonempty');
    expect(fileProblem({ name: 'test.mp4', type: 'video/mp4', size: 201 * 1024 * 1024 } as File, 4)).toContain('200 MiB');
    expect(fileProblem(new File(['test'], 'test.mp3', { type: 'audio/mpeg' }), 3)).toBe('');
    c.form = { title: 'Item', type: 1, text: 'Old', youTubeUrl: 'Old', assetId: itemId }; c.typeChanged(); expect(c.form.text).toBeNull(); expect(c.form.youTubeUrl).toBeNull(); expect(c.form.assetId).toBeNull();
  }));
  it('renders all five types safely and clears media, form and in-flight state on context changes', fakeAsync(() => {
    const fixture = setup('lesson'), c = fixture.componentInstance; const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('script,img')).toBeNull(); expect(element.textContent).toContain('<img src=x');
    expect(element.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'); expect(element.querySelector('iframe[sandbox=""]')).not.toBeNull();
    const media = element.querySelector('video')!; expect(media.hasAttribute('controls')).toBeTrue(); expect(media.getAttribute('preload')).toBe('metadata');
    expect(c.youtube('https://evil.test')).toBeNull(); expect(c.youtube('dQw4w9WgXcQ\n')).toBeNull();
    void c.load(); const stale = http.expectOne(unit); c.form.text = 'Sensitive'; c.dirty = true;
    TestBed.inject(AuthState).clear(); fixture.detectChanges(); expect(media.hasAttribute('src')).toBeFalse(); expect(c.form.text).toBeUndefined(); expect(c.canLeave()).toBeTrue();
    stale.flush(lessonPage()); flushMicrotasks(); expect(c.page()).toBeNull(); expect(element.querySelector('video')).toBeNull();
  }));
  it('checks authorization after media-element errors using HEAD and clears revoked previews', fakeAsync(() => {
    const fixture = setup('lesson'), c = fixture.componentInstance; const item = c.page()!.content!.items[4]; void c.mediaError(item);
    const head = http.expectOne(unit + '/items/' + item.id + '/media'); expect(head.request.method).toBe('HEAD'); head.flush({}, { status: 403, statusText: 'Forbidden' }); flushMicrotasks(); fixture.detectChanges();
    expect(c.page()).toBeNull(); expect(c.error()).toContain('no longer have access'); expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  }));
  it('does not send a mutation after CSRF bootstrap if the selected organization changed', fakeAsync(() => {
    const fixture = setup('lesson'), c = fixture.componentInstance; spyOn(window, 'confirm').and.returnValue(true); void c.publication('publish');
    const token = http.expectOne('/bff/antiforgery'); TestBed.inject(AuthState).clear(); fixture.detectChanges(); token.flush({ requestToken: 'old', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks(); http.expectNone(unit + '/publication'); expect(c.pending()).toBeFalse();
  }));
  it('warns before discarding unsaved values and requires a selected organization for platform authoring', fakeAsync(() => {
    const fixture = setup(); fixture.componentInstance.changed(); const confirm = spyOn(window, 'confirm').and.returnValue(false); expect(fixture.componentInstance.canLeave()).toBeFalse(); expect(confirm).toHaveBeenCalled();
    expect(staffAllowed(selectedSession())).toBeFalse(); expect(staffAllowed(selectedSession('Admin'))).toBeTrue();
    expect(staffAllowed({ ...selectedSession('Admin'), isSuperAdmin: true, selectedOrganization: null })).toBeFalse();
    expect(workspaceAllows(selectedSession('Instructor'), '/workspace/staff/courses/' + courseId + '/sections/' + sectionId + '/lessons/' + lessonId + '/items/new')).toBeTrue();
    expect(workspaceAllows(selectedSession(), '/workspace/staff/courses')).toBeFalse();
  }));
  it('clears tenant state and ignores a late successful write after organization switching', fakeAsync(() => {
    const fixture = setup(), c = fixture.componentInstance;
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    c.form.title = 'Old tenant'; c.changed(); fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); csrf();
    const mutation = http.expectOne(base);
    TestBed.inject(AuthState).accept({ ...selectedSession('Instructor'), selectedOrganization: { ...selectedSession('Instructor').selectedOrganization!, id: 'other-org' } }, () => {}); fixture.detectChanges();
    expect(c.form.title).toBe(''); expect(c.pending()).toBeFalse();
    mutation.flush(null); flushMicrotasks(); expect(navigate).not.toHaveBeenCalled();
    http.expectOne(base + '/edit?Page=1&PageSize=50&Search=').flush(editor); flushMicrotasks(); expect(c.form.title).toBe('Stored');
  }));
  it('retains course fields and selected Instructor while paging bounded choices', fakeAsync(() => {
    data.next({ mode: 'courseForm' }); params.next(convertToParamMap({})); TestBed.inject(AuthState).accept(selectedSession('Admin'), () => {});
    const fixture = TestBed.createComponent(StaffAuthoringComponent); fixture.detectChanges();
    http.expectOne('/bff/staff/courses/new?Page=1&PageSize=50&Search=').flush({ ...editor, isAdmin: true, choices: { page: 1, pageSize: 50, total: 80 } }); flushMicrotasks(); fixture.detectChanges(); flushMicrotasks();
    const c = fixture.componentInstance; c.form.title = 'Entered'; c.form.instructorId = itemId; c.changed(); void c.choices(1);
    http.expectOne('/bff/staff/courses/new?Page=2&PageSize=50&Search=').flush({ ...editor, isAdmin: true, choices: { page: 2, pageSize: 50, total: 80 } }); flushMicrotasks(); fixture.detectChanges();
    expect(c.form.title).toBe('Entered'); expect(c.form.instructorId).toBe(itemId); expect(c.dirty).toBeTrue();
  }));
  it('renders readiness as a read-only inventory without adding blockers or quiz configuration claims', fakeAsync(() => {
    data.next({ mode: 'readiness' }); const fixture = TestBed.createComponent(StaffAuthoringComponent); fixture.detectChanges();
    http.expectOne(base + '/readiness').flush({ course: { id: courseId, title: '<script>Course</script>', status: 'Draft' }, sections: [{ section: { id: sectionId, title: 'Section', displayOrder: 1 }, lessons: [{ unit: { lesson: { id: lessonId, title: 'Lesson', isPublished: false, displayOrder: 1 }, content: { items: [], legacy: { content: 'Legacy' } } }, quiz: null }] }] });
    flushMicrotasks(); fixture.detectChanges(); const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('script')).toBeNull(); expect(element.textContent).toContain('Legacy content exists'); expect(element.textContent).toContain('no publication blockers'); expect(element.textContent).toContain('does not audit quiz configuration'); expect(element.textContent).toContain('Quiz: None');
  }));
  it('checks the stored parent collection after uncertain creation instead of treating a blank new form as proof', fakeAsync(() => {
    params.next(convertToParamMap({})); const fixture = TestBed.createComponent(StaffAuthoringComponent); fixture.detectChanges();
    const url = '/bff/staff/courses/new?Page=1&PageSize=50&Search=';
    http.expectOne(url).flush(editor); flushMicrotasks(); fixture.detectChanges(); flushMicrotasks();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); csrf();
    const write = http.expectOne('/bff/staff/courses'); expect(write.request.method).toBe('POST'); write.error(new ProgressEvent('error')); flushMicrotasks();
    http.expectOne(url).flush(editor); flushMicrotasks();
    const recovery = http.expectOne('/bff/staff/courses'); expect(recovery.request.method).toBe('GET'); recovery.flush({ courses: [{ id: courseId, title: 'Possibly created course' }] }); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.locked()).toBeTrue(); expect(fixture.nativeElement.textContent).toContain('Possibly created course'); expect(fixture.componentInstance.recovered()[0].path).toBe('/workspace/staff/courses/' + courseId);
    TestBed.inject(AuthState).clear(); fixture.detectChanges(); expect(fixture.componentInstance.recovered()).toEqual([]);
  }));
});
