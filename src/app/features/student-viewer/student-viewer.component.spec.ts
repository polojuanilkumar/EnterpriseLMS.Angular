import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { StudentViewerComponent } from './student-viewer.component';
import { viewerRoot } from './student-viewer.models';
import { selection, itemId, unitPage } from './student-viewer.testing';
import { Component, input } from '@angular/core';
import { ViewerSelection } from './student-viewer.models';
import { StudentProgressComponent } from './student-progress.component';

// These tests isolate content/media. Real progress integration is covered by its own suite.
@Component({ selector: 'app-student-progress', template: '' })
class ProgressStub { readonly selection = input.required<ViewerSelection>(); }

describe('Student lesson rendering and media cleanup', () => {
  const root = viewerRoot(selection)!;
  beforeEach(() => {
    const params = new BehaviorSubject(convertToParamMap(selection));
    TestBed.configureTestingModule({ imports: [StudentViewerComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { paramMap: params.value } } }] });
    TestBed.overrideComponent(StudentViewerComponent, { remove: { imports: [StudentProgressComponent] }, add: { imports: [ProgressStub] } });
    TestBed.inject(AuthState).accept(selectedSession(), () => {});
  });
  afterEach(() => { TestBed.inject(AuthState).clear(); TestBed.inject(HttpTestingController).verify(); });
  it('renders five content types safely with isolated PDF and fixed YouTube URL', fakeAsync(() => {
    const fixture = TestBed.createComponent(StudentViewerComponent); fixture.detectChanges();
    const page = unitPage();
    page.items = [1, 2, 3, 4, 5].map(type => ({ id: type === 4 ? itemId : `${type}4444444-4444-4444-4444-444444444444`, type, title: 'Title <script>', displayOrder: type, isRequired: true, text: '<img src=x onerror=alert(1)>', youTubeVideoId: 'dQw4w9WgXcQ' }));
    TestBed.inject(HttpTestingController).expectOne(root).flush(page); flushMicrotasks(); fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('img,script')).toBeNull(); expect(element.textContent).toContain('<img src=x');
    const youtube = element.querySelector<HTMLIFrameElement>('.youtube')!;
    expect(youtube.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    const pdf = element.querySelector<HTMLIFrameElement>('.pdf')!; expect(pdf.getAttribute('sandbox')).toBe('');
    expect(pdf.getAttribute('src')).toBe(root + '/items/54444444-4444-4444-4444-444444444444/media');
    expect(element.querySelector('a[href$="?download=true"]')).not.toBeNull();
    for (const media of Array.from(element.querySelectorAll('audio,video'))) {
      expect(media.getAttribute('preload')).toBe('none'); expect(media.hasAttribute('controls')).toBeTrue();
      expect(media.getAttribute('src')).toContain('/bff/student/courses/');
    }
    expect(element.querySelector('nav[aria-label="Breadcrumb"]')?.querySelectorAll('a').length).toBe(3);
    expect(element.textContent).toContain('does not mark this lesson complete');
    fixture.destroy();
  }));
  it('removes sources and pauses playback on organization change and ignores old responses', fakeAsync(() => {
    const fixture = TestBed.createComponent(StudentViewerComponent); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(root).flush(unitPage()); flushMicrotasks(); fixture.detectChanges();
    const video: HTMLVideoElement = fixture.nativeElement.querySelector('video'); const pause = spyOn(video, 'pause'); const load = spyOn(video, 'load');
    TestBed.inject(AuthState).accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'new-org' } }, () => {});
    fixture.detectChanges();
    expect(pause).toHaveBeenCalled(); expect(load).toHaveBeenCalled(); expect(video.hasAttribute('src')).toBeFalse();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    const old = TestBed.inject(HttpTestingController).expectOne(root);
    TestBed.inject(AuthState).clear(); fixture.detectChanges();
    old.flush({ ...unitPage(), organizationId: 'new-org' }); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.store.page()).toBeNull(); expect(fixture.nativeElement.querySelector('video')).toBeNull();
  }));
  it('discards legacy fallback when items exist and never loads unsafe YouTube values', fakeAsync(() => {
    const fixture = TestBed.createComponent(StudentViewerComponent); fixture.detectChanges();
    const page = unitPage(); page.items = [{ ...page.items![0], type: 2, youTubeVideoId: 'https://evil.test' }];
    page.legacy = { content: 'Legacy must stay hidden', youTubeVideoId: 'dQw4w9WgXcQ' };
    TestBed.inject(HttpTestingController).expectOne(root).flush(page); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull(); expect(fixture.nativeElement.textContent).not.toContain('Legacy must');
    expect(fixture.nativeElement.textContent).toContain('video reference is unavailable');
  }));
  it('renders legacy plain text when no items exist and clears at absolute expiry', fakeAsync(() => {
    TestBed.inject(AuthState).accept({ ...selectedSession(), expiresAt: new Date(Date.now() + 1000).toISOString() }, () => {});
    const fixture = TestBed.createComponent(StudentViewerComponent); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(root).flush({ ...unitPage(), items: [], legacy: { content: '<script>legacy</script>', youTubeVideoId: null } });
    flushMicrotasks(); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('script')).toBeNull(); expect(fixture.nativeElement.textContent).toContain('<script>legacy');
    tick(1000); fixture.detectChanges(); expect(fixture.nativeElement.textContent).not.toContain('<script>legacy');
  }));
});
