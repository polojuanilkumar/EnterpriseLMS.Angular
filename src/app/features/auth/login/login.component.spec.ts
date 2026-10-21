import { provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { bffInterceptor } from '../../../core/http/bff.interceptor';
import { AuthState } from '../../../core/auth/auth-state';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LoginComponent], providers: [provideRouter([]), provideHttpClient(withNoXsrfProtection(), withInterceptors([bffInterceptor])), provideHttpClientTesting()] }).compileComponents();
    fixture = TestBed.createComponent(LoginComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => { TestBed.inject(AuthState).clear(); TestBed.inject(HttpTestingController).verify(); });

  function input(id: string, value: string): HTMLInputElement {
    const field = element.querySelector<HTMLInputElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return field;
  }

  function submit(): void {
    element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  it('provides labels, credential autocomplete and native keyboard controls', () => {
    expect(element.querySelector('label[for="email"]')?.textContent).toContain('Email address');
    expect(element.querySelector('label[for="password"]')?.textContent).toContain('Password');
    expect(element.querySelector('#email')?.getAttribute('autocomplete')).toBe('username');
    expect(element.querySelector('#password')?.getAttribute('autocomplete')).toBe('current-password');
    expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Sign in');
    expect(element.querySelector('[tabindex]')).toBeNull();
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/account/forgot-password');
  });

  it('does not show errors before interaction and requires both fields on submission', () => {
    expect(element.querySelector('[role="alert"]')).toBeNull();
    submit();
    expect(fixture.componentInstance.form.invalid).toBeTrue();
    expect(element.querySelector('#email-error')?.textContent).toContain('Enter your email address.');
    expect(element.querySelector('#password-error')?.textContent).toContain('Enter your password');
    expect(element.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('#password')?.getAttribute('aria-describedby')).toBe('password-error');
    expect(element.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('shows an inline error for a malformed email after blur and clears it when corrected', () => {
    const field = input('email', 'invalid');
    field.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(element.querySelector('#email-error')?.textContent).toContain('Enter a valid email address.');
    input('email', 'learner@example.com');
    fixture.detectChanges();
    expect(element.querySelector('#email-error')).toBeNull();
    expect(element.querySelector('#email')?.getAttribute('aria-invalid')).toBe('false');
  });

  it('toggles password visibility without changing its value or submitting', () => {
    const password = input('password', 'example-password');
    const toggle = element.querySelector<HTMLButtonElement>('button[type="button"]')!;
    const submitSpy = spyOn(fixture.componentInstance, 'submit').and.callThrough();
    expect(password.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(password.type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(password.type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    expect(password.value).toBe('example-password');
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('bootstraps login, prevents duplicate submissions, clears the password and navigates only after session validation', fakeAsync(() => {
    const http = TestBed.inject(HttpTestingController);
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const storage = spyOn(Storage.prototype, 'setItem');
    input('email', 'learner@example.com'); input('password', 'example-password');
    submit(); submit();
    expect(fixture.componentInstance.pending()).toBeTrue();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    expect(element.querySelector<HTMLInputElement>('#password')!.value).toBe('');
    http.expectOne('/bff/antiforgery').flush({ requestToken: 'anonymous', headerName: 'X-CSRF-TOKEN' });
    flushMicrotasks();
    const login = http.expectOne('/bff/login');
    expect(login.request.headers.get('X-CSRF-TOKEN')).toBe('anonymous');
    expect(login.request.body).toEqual({ email: 'learner@example.com', password: 'example-password' });
    login.flush({ userId: 'user', expiresAt: new Date(Date.now() + 60000).toISOString(), requiresOrganizationSelection: true });
    flushMicrotasks();
    http.expectOne('/bff/antiforgery').flush({ requestToken: 'signed-in', headerName: 'X-CSRF-TOKEN' });
    flushMicrotasks();
    http.expectOne('/bff/session').flush({ userId: 'user', expiresAt: new Date(Date.now() + 60000).toISOString(), selectedOrganization: null, isSuperAdmin: false, requiresOrganizationSelection: true, homePath: null });
    flushMicrotasks(); fixture.detectChanges();
    expect(navigate).toHaveBeenCalledOnceWith('/session');
    expect(fixture.componentInstance.pending()).toBeFalse();
    expect(fixture.componentInstance.form.controls.password.value).toBe('');
    expect(storage).not.toHaveBeenCalled();
    TestBed.inject(AuthState).clear();
  }));

  it('shows only safe validation errors, clears the password and does not retry a rejected login', fakeAsync(() => {
    const http = TestBed.inject(HttpTestingController);
    input('email', 'learner@example.com'); input('password', 'example-password'); submit();
    http.expectOne('/bff/antiforgery').flush({ requestToken: 'csrf', headerName: 'X-CSRF-TOKEN' }); flushMicrotasks();
    http.expectOne('/bff/login').flush({ code: 'validation_failed', message: 'private-upstream-detail', fieldErrors: { password: ['example-password'] } }, { status: 400, statusText: 'Bad Request' });
    flushMicrotasks(); fixture.detectChanges();
    expect(element.textContent).toContain('Check your email and password values.');
    expect(element.textContent).not.toContain('private-upstream-detail');
    expect(element.textContent).not.toContain('example-password');
    expect(fixture.componentInstance.form.controls.password.value).toBe('');
    expect(fixture.componentInstance.pending()).toBeFalse();
    http.expectNone('/bff/login');
  }));
});
