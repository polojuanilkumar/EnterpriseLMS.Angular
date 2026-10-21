import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthState } from '../../core/auth/auth-state';
import { selectedSession } from '../../core/auth/session.testing';
import { OrganizationChooserComponent } from './organization-chooser.component';

describe('Organization chooser', () => {
  let state: AuthState; let organizations: jasmine.Spy; let select: jasmine.Spy; let logout: jasmine.Spy;
  beforeEach(() => {
    organizations = jasmine.createSpy().and.resolveTo([{ id: 'org', name: '<script>private-name</script>', code: 'CODE' }]);
    select = jasmine.createSpy(); logout = jasmine.createSpy().and.resolveTo();
    TestBed.configureTestingModule({ imports: [OrganizationChooserComponent], providers: [provideRouter([]),
      { provide: AuthService, useFactory: () => ({ state: TestBed.inject(AuthState), organizations, selectOrganization: select, logout, checking: signal(false), mutating: signal(false) }) }] });
    state = TestBed.inject(AuthState); state.accept(selectedSession(), () => {});
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });
  afterEach(() => state.clear());

  it('loads discovery without selecting automatically and renders name/code as text', async () => {
    const fixture = TestBed.createComponent(OrganizationChooserComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Checking available');
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('<script>private-name</script>');
    expect(fixture.nativeElement.textContent).toContain('CODE');
    expect(fixture.nativeElement.querySelector('script')).toBeNull(); expect(select).not.toHaveBeenCalled();
  });

  it('requires explicit action and blocks duplicate submissions until selection completes', async () => {
    let finish!: () => void; select.and.returnValue(new Promise<void>(resolve => finish = resolve));
    const fixture = TestBed.createComponent(OrganizationChooserComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const selection = fixture.componentInstance.select('org'); await fixture.componentInstance.select('org'); fixture.detectChanges();
    expect(select).toHaveBeenCalledOnceWith('org'); expect(fixture.nativeElement.querySelector('li button').disabled).toBeTrue();
    finish(); await selection;
  });

  it('shows empty, load-error and safe selection-error states', async () => {
    organizations.and.resolveTo([]);
    const fixture = TestBed.createComponent(OrganizationChooserComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No active organizations');
    organizations.and.rejectWith(new Error('secret detail')); await fixture.componentInstance.load(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('could not be loaded'); expect(fixture.nativeElement.textContent).not.toContain('secret detail');
    select.and.rejectWith(new Error('secret detail')); await fixture.componentInstance.select('org'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reload to check your session'); expect(fixture.nativeElement.textContent).not.toContain('secret detail');
  });

  it('discards the prior discovery list when the verified session changes and explains revocation recovery', async () => {
    const fixture = TestBed.createComponent(OrganizationChooserComponent); fixture.detectChanges(); await fixture.whenStable();
    organizations.and.resolveTo([]);
    state.accept({ ...selectedSession(), selectedOrganization: null, recoveryCode: 'organization_selection_cleared' }, () => {});
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.organizations()).toEqual([]); expect(organizations).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Your account remains signed in'); expect(logout).not.toHaveBeenCalled();
  });

  it('clears discovery on logout and rejects an in-flight response even before the next rendering pass', async () => {
    let finish!: (rows: { id: string; name: string; code: string }[]) => void;
    organizations.and.returnValue(new Promise(resolve => finish = resolve));
    const fixture = TestBed.createComponent(OrganizationChooserComponent); fixture.detectChanges();
    state.clear(); finish([{ id: 'old', name: 'Old organization', code: 'OLD' }]);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.organizations()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Old organization');
    await fixture.componentInstance.load(); expect(organizations).toHaveBeenCalledTimes(1);
  });

  it('clears prior names while context verification is pending and reloads only after verification', async () => {
    const fixture = TestBed.createComponent(OrganizationChooserComponent); fixture.detectChanges(); await fixture.whenStable();
    const auth = TestBed.inject(AuthService);
    (auth.checking as ReturnType<typeof signal<boolean>>).set(true); fixture.detectChanges();
    expect(fixture.componentInstance.organizations()).toEqual([]); expect(organizations).toHaveBeenCalledTimes(1);
    (auth.checking as ReturnType<typeof signal<boolean>>).set(false); fixture.detectChanges(); await fixture.whenStable();
    expect(organizations).toHaveBeenCalledTimes(2);
  });
});
