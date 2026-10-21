import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { AuthState } from '../core/auth/auth-state';
import { selectedSession } from '../core/auth/session.testing';
import { ApplicationShellComponent } from './application-shell.component';

describe('Application shell', () => {
  let state: AuthState; let logout: jasmine.Spy; const checking = signal(false); const mutating = signal(false);
  beforeEach(() => {
    checking.set(false); mutating.set(false); logout = jasmine.createSpy().and.resolveTo();
    TestBed.configureTestingModule({ imports: [ApplicationShellComponent], providers: [provideRouter([]),
      { provide: AuthService, useFactory: () => ({ state: TestBed.inject(AuthState), logout, checking, mutating }) }] });
    state = TestBed.inject(AuthState); state.accept(selectedSession(), () => {});
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });
  afterEach(() => state.clear());

  it('provides a desktop sidebar and keyboard-operable mobile navigation with focus return', async () => {
    const fixture = TestBed.createComponent(ApplicationShellComponent); fixture.detectChanges(); await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const menu = element.querySelector<HTMLButtonElement>('[aria-controls="mobile-navigation"]')!;
    expect(element.querySelector('aside')?.classList.contains('md:block')).toBeTrue();
    expect(menu.classList.contains('md:hidden')).toBeTrue(); expect(menu.getAttribute('aria-expanded')).toBe('false');
    menu.click(); fixture.detectChanges(); expect(menu.getAttribute('aria-expanded')).toBe('true');
    const navigation = element.querySelector<HTMLElement>('#mobile-navigation')!;
    const links = navigation.querySelectorAll<HTMLAnchorElement>('a'); expect(links.length).toBe(6);
    expect(links[1].getAttribute('href')).toBe('/workspace/student/catalog');
    expect(links[2].getAttribute('href')).toBe('/workspace/student/my-courses');
    expect(links[3].getAttribute('href')).toBe('/workspace/student/assignments/history');
    expect(links[4].getAttribute('href')).toBe('/workspace/student/grades');
    expect(links[5].getAttribute('href')).toBe('/organizations');
    navigation.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(element.querySelector('#mobile-navigation')).toBeNull(); expect(document.activeElement).toBe(menu);
  });

  it('hides stale organization details and routed content during revalidation, then uses current role', async () => {
    const fixture = TestBed.createComponent(ApplicationShellComponent); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Verified organization');
    checking.set(true); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Verified organization'); expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    state.accept({ ...selectedSession('Admin'), selectedOrganization: { id: 'new', name: '<img src=x onerror=alert(1)>', code: 'NEW', role: 'Admin' } }, () => {});
    checking.set(false); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('<img src=x'); expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Admin'); expect(fixture.componentInstance.menuOpen()).toBeFalse();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/workspace/admin');
  });

  it('routes selection recovery without logout and guards against duplicate sign-out', async () => {
    let finish!: () => void; logout.and.returnValue(new Promise<void>(resolve => finish = resolve));
    const fixture = TestBed.createComponent(ApplicationShellComponent); fixture.detectChanges(); await fixture.whenStable();
    state.accept({ ...selectedSession(), selectedOrganization: null, recoveryCode: 'organization_selection_cleared' }, () => {});
    fixture.detectChanges(); await fixture.whenStable();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/organizations'); expect(logout).not.toHaveBeenCalled();
    const operation = fixture.componentInstance.logout(); await fixture.componentInstance.logout(); expect(logout).toHaveBeenCalledTimes(1);
    finish(); await operation;
  });

  it('keeps safe logout errors visible and hides uncertain organization content', async () => {
    logout.and.rejectWith(new Error('private detail'));
    const fixture = TestBed.createComponent(ApplicationShellComponent); fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.logout(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reload to check your session');
    expect(fixture.nativeElement.textContent).not.toContain('private detail'); expect(state.session()).not.toBeNull();
    state.contextUncertain.set(true); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Verified organization');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Verify session');
  });
});
