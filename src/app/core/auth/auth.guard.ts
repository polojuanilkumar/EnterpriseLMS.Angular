import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthState } from './auth-state';
import { adminAllowed, staffAllowed, workspacePath } from './workspace-routing';

// Navigation convenience only. Every BFF operation independently authenticates the cookie.
export const sessionGuard: CanActivateFn = () => {
  const session = inject(AuthState).session();
  return session && Date.parse(session.expiresAt) > Date.now() ? true : inject(Router).createUrlTree(['/login']);
};
export const loginGuard: CanActivateFn = () => {
  const session = inject(AuthState).session();
  return session && Date.parse(session.expiresAt) > Date.now() ? inject(Router).createUrlTree(['/session']) : true;
};

export const workspaceGuard: CanActivateFn = (_route, state) => {
  const destination = workspacePath(inject(AuthState).session());
  return state.url === destination ? true : inject(Router).parseUrl(destination);
};
export const entryGuard: CanActivateFn = () => inject(Router).parseUrl(workspacePath(inject(AuthState).session()));
export const studentGuard: CanActivateFn = () => {
  const destination = workspacePath(inject(AuthState).session());
  return destination === '/workspace/student' ? true : inject(Router).parseUrl(destination);
};
export const staffGuard: CanActivateFn = () => {
  const session = inject(AuthState).session();
  return staffAllowed(session) ? true : inject(Router).parseUrl(workspacePath(session));
};
export const adminGuard: CanActivateFn = () => {
  const session = inject(AuthState).session();
  return adminAllowed(session) ? true : inject(Router).parseUrl(workspacePath(session));
};
export const platformGuard: CanActivateFn = () => {
  const session = inject(AuthState).session();
  return session?.isSuperAdmin ? true : inject(Router).parseUrl(workspacePath(session));
};
