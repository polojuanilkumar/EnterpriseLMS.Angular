import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { bffInterceptor } from '../../core/http/bff.interceptor';
import { StudentViewerService } from './student-viewer.service';
import { viewerRoot, youtubeEmbed } from './student-viewer.models';

import { selection, itemId, unitPage } from './student-viewer.testing';

describe('Student viewer state', () => {
  let store: StudentViewerService; let state: AuthState; let http: HttpTestingController;
  const root = viewerRoot(selection)!;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [StudentViewerService, provideRouter([]), provideHttpClient(withInterceptors([bffInterceptor])), provideHttpClientTesting()] });
    store = TestBed.inject(StudentViewerService); state = TestBed.inject(AuthState); http = TestBed.inject(HttpTestingController);
    state.accept(selectedSession(), () => {});
  });
  afterEach(() => { state.clear(); http.verify(); });
  function start(): void { store.bind(state.session(), false, selection); http.expectOne(root).flush(unitPage()); flushMicrotasks(); }
  it('uses fixed same-origin routes and never loads mutations or unrelated workflows', fakeAsync(() => {
    store.bind(state.session(), false, selection);
    const request = http.expectOne(root); expect(request.request.method).toBe('GET');
    expect(request.request.headers.has('Authorization')).toBeFalse(); expect(request.request.headers.has('X-Organization-Id')).toBeFalse();
    request.flush(unitPage()); flushMicrotasks();
    expect(store.mediaUrl(itemId)).toBe(root + '/items/' + itemId + '/media');
    expect(store.mediaUrl('../asset')).toBeNull(); expect(store.mediaUrl(selection.courseId)).toBeNull();
  }));
  it('rejects arbitrary paths and YouTube URLs instead of trusting legacy values', () => {
    for (const id of ['https://evil.test', 'dQw4w9WgXcQ?autoplay=1', 'dQw4w9WgXcQ\n', '<script>', '']) expect(youtubeEmbed(id)).toBeNull();
    expect(youtubeEmbed('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(viewerRoot({ ...selection, courseId: '../private' })).toBeNull();
  });
  it('rejects stale organization responses and clears prior content on logout, revalidation and navigation', fakeAsync(() => {
    store.bind(state.session(), false, selection); const old = http.expectOne(root);
    state.accept({ ...selectedSession(), selectedOrganization: { ...selectedSession().selectedOrganization!, id: 'new-org' } }, () => {});
    store.bind(state.session(), false, selection); http.expectOne(root).flush({ ...unitPage(), organizationId: 'new-org' }); flushMicrotasks();
    old.flush(unitPage()); flushMicrotasks(); expect(store.page()?.organizationId).toBe('new-org');
    store.bind(state.session(), true, selection); expect(store.page()).toBeNull(); expect(store.mediaUrl(itemId)).toBeNull();
    store.bind(null, false, selection); expect(store.page()).toBeNull();
  }));
  it('rejects mismatched response context and nested parents', fakeAsync(() => {
    for (const page of [{ ...unitPage(), organizationId: 'foreign' }, { ...unitPage(), sectionId: selection.courseId }]) {
      store.bind(state.session(), false, selection); http.expectOne(root).flush(page); flushMicrotasks();
      expect(store.page()).toBeNull(); expect(store.error()).toContain('could not be loaded');
    }
  }));
  it('distinguishes safe denial and unavailable messages without upstream diagnostics', fakeAsync(() => {
    for (const [status, message] of [[403, 'denied'], [404, 'unavailable'], [502, 'could not be loaded']] as const) {
      store.bind(state.session(), false, selection); http.expectOne(root).flush('private diagnostic', { status, statusText: 'Rejected' }); flushMicrotasks();
      expect(store.page()).toBeNull(); expect(store.error()).toContain(message); expect(store.error()).not.toContain('private');
    }
  }));
  it('checks native media failures with HEAD and removes content on revoked access', fakeAsync(() => {
    start(); void store.mediaFailed(itemId);
    const request = http.expectOne(root + '/items/' + itemId + '/media'); expect(request.request.method).toBe('HEAD');
    request.flush(null, { status: 403, statusText: 'Forbidden' }); flushMicrotasks();
    expect(store.page()).toBeNull(); expect(store.mediaUrl(itemId)).toBeNull(); expect(store.error()).toContain('denied');
  }));
  it('handles codec/network errors without claiming authorization failure and rejects stale HEAD results', fakeAsync(() => {
    start(); void store.mediaFailed(itemId); http.expectOne(root + '/items/' + itemId + '/media').flush(null); flushMicrotasks();
    expect(store.mediaErrors()[itemId]).toContain('format'); expect(store.page()).not.toBeNull();
    void store.mediaFailed(itemId); const old = http.expectOne(root + '/items/' + itemId + '/media');
    start(); old.flush(null, { status: 404, statusText: 'Unavailable' }); flushMicrotasks();
    expect(store.page()).not.toBeNull(); expect(store.error()).toBe('');
  }));
  it('expires sessions on a media 401 through the existing interceptor', fakeAsync(() => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    start(); void store.mediaFailed(itemId); http.expectOne(root + '/items/' + itemId + '/media').flush(null, { status: 401, statusText: 'Unauthorized' }); flushMicrotasks();
    expect(state.session()).toBeNull(); store.bind(null, false, selection); expect(store.page()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  }));
});
