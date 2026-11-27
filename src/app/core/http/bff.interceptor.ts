import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthState } from '../auth/auth-state';
import { backendBffUrl, isBffUrl } from './bff-url';

export const bffInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isBffUrl(request.url)) return next(request);
  const state = inject(AuthState);
  const router = inject(Router);
  const requestSession = state.session();
  const token = state.csrfToken();
  const url = request.url.startsWith('/bff/')
    ? backendBffUrl(request.url.slice('/bff'.length))
    : request.url;
  request = request.clone({ url, withCredentials: true });
  if (token && !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(request.method))
    request = request.clone({ setHeaders: { 'X-CSRF-TOKEN': token } });
  return next(request).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401 && state.session() === requestSession) {
      const wasSignedIn = state.session() !== null;
      state.clear(new URL(request.url).pathname === '/bff/login' ? '' : 'Your session has expired. Please sign in again.');
      // Initial restoration and login failures must not initiate competing startup navigations.
      if (wasSignedIn && router.url !== '/login') void router.navigateByUrl('/login');
    }
    return throwError(() => error);
  }));
};
