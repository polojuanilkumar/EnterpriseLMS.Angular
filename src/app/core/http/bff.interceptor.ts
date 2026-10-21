import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthState } from '../auth/auth-state';

export function isBffUrl(url: string): boolean {
  // Only root-relative canonical paths. Reject absolute, protocol-relative, encoded and traversal paths.
  const path = url.split('?')[0];
  return path.startsWith('/bff/') && !/[\\%#]/.test(path)
    && !path.split('/').some(segment => segment === '.' || segment === '..');
}

export const bffInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isBffUrl(request.url)) return next(request);
  const state = inject(AuthState);
  const router = inject(Router);
  const requestSession = state.session();
  const token = state.csrfToken();
  if (token && !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(request.method)) {
    request = request.clone({ setHeaders: { 'X-CSRF-TOKEN': token } });
  }
  return next(request).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401 && state.session() === requestSession) {
      const wasSignedIn = state.session() !== null;
      state.clear(request.url === '/bff/login' ? '' : 'Your session has expired. Please sign in again.');
      // Initial restoration and login failures must not initiate competing startup navigations.
      if (wasSignedIn && router.url !== '/login') void router.navigateByUrl('/login');
    }
    return throwError(() => error);
  }));
};
