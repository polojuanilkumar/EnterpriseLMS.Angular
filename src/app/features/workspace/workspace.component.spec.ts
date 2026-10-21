import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { WorkspaceComponent } from './workspace.component';

describe('Workspace landing', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [WorkspaceComponent], providers: [provideRouter([])] }));
  afterEach(() => TestBed.inject(AuthState).clear());
  it('explains unavailable module screens for each role without fake metrics or dead module links', () => {
    const state = TestBed.inject(AuthState); const fixture = TestBed.createComponent(WorkspaceComponent);
    for (const role of ['Student', 'Instructor', 'Admin'] as const) {
      state.accept(selectedSession(role), () => {}); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('h1').textContent).toContain(role);
      expect(fixture.nativeElement.textContent).toContain(role === 'Student' ? 'progress and grades' : role === 'Instructor' ? 'assigned-course learner reports' : 'read-only audit history');
      expect(fixture.nativeElement.querySelectorAll('a').length).toBe(role === 'Student' ? 3 : 2);
      if (role !== 'Student') expect(fixture.nativeElement.querySelector('a[href="/workspace/staff/courses"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('a[href="/organizations"]')).not.toBeNull();
    }
  });
  it('gives an unselected SuperAdmin a platform landing without creating membership', () => {
    TestBed.inject(AuthState).accept({ ...selectedSession(null, true), selectedOrganization: null }, () => {});
    const fixture = TestBed.createComponent(WorkspaceComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Platform workspace');
    expect(fixture.nativeElement.textContent).toContain('does not create a membership');
    expect(fixture.nativeElement.textContent).toContain('Manage platform organizations');
  });
});
