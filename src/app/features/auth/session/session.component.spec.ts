import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { AuthState } from '../../../core/auth/auth-state';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionComponent } from './session.component';

describe('SessionComponent', () => {
  let state: AuthState;
  let logout: jasmine.Spy;
  beforeEach(() => {
    logout = jasmine.createSpy('logout');
    TestBed.configureTestingModule({ imports: [SessionComponent], providers: [provideRouter([]),
      { provide: AuthService, useFactory: () => ({ state: TestBed.inject(AuthState), logout }) }] });
    state = TestBed.inject(AuthState);
    state.accept({ userId: 'user', expiresAt: new Date(Date.now() + 60000).toISOString(), selectedOrganization: null,
      isSuperAdmin: false, requiresOrganizationSelection: true, homePath: null }, () => {});
  });
  afterEach(() => state.clear());

  it('explains the next step and prevents duplicate logout clicks', async () => {
    let finish!: () => void;
    logout.and.returnValue(new Promise<void>(resolve => finish = resolve));
    const fixture = TestBed.createComponent(SessionComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Organization selection is the next step');
    const pending = fixture.componentInstance.logout();
    await fixture.componentInstance.logout(); fixture.detectChanges();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('button').disabled).toBeTrue();
    finish(); await pending; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').disabled).toBeFalse();
  });

  it('shows safe logout failure text without clearing a possibly valid account session', async () => {
    logout.and.rejectWith(new HttpErrorResponse({ status: 502, error: '<html>private detail</html>' }));
    const fixture = TestBed.createComponent(SessionComponent); fixture.detectChanges();
    await fixture.componentInstance.logout(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('private detail');
    expect(fixture.nativeElement.textContent).toContain('Reload to check your session');
    expect(state.session()).not.toBeNull();
  });

  it('returns to login when account state expires', async () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(SessionComponent); fixture.detectChanges();
    state.clear('expired'); fixture.detectChanges(); await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
