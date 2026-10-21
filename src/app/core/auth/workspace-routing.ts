import { SessionResponse } from './auth.models';

export function adminAllowed(session: SessionResponse | null): boolean {
  return !!session?.selectedOrganization && (session.isSuperAdmin || session.selectedOrganization.role === 'Admin');
}

export function staffAllowed(session: SessionResponse | null): boolean {
  return !!session?.selectedOrganization && (session.isSuperAdmin || ['Instructor', 'Admin'].includes(session.selectedOrganization.role ?? ''));
}

// MVC homePath is informational and is never interpreted as an Angular destination.
export function workspacePath(session: SessionResponse | null): string {
  if (!session) return '/login';
  if (session.isSuperAdmin) return session.selectedOrganization ? '/workspace/super-admin' : '/workspace/platform';
  switch (session.selectedOrganization?.role) {
    case 'Student': return '/workspace/student';
    case 'Instructor': return '/workspace/instructor';
    case 'Admin': return '/workspace/admin';
    default: return '/organizations';
  }
}

export function workspaceAllows(session: SessionResponse | null, url: string): boolean {
  const path = url.split(/[?#]/)[0];
  const home = workspacePath(session);
  if (session?.isSuperAdmin && /^\/workspace\/platform\/(?:organizations|audit(?:\/[a-f0-9-]{36})?)$/i.test(path)) return true;
  if (adminAllowed(session) && /^\/workspace\/organization\/(?:members|invitations|audit(?:\/[a-f0-9-]{36})?|courses\/[a-f0-9-]{36}\/instructor)$/i.test(path)) return true;
  if (staffAllowed(session) && /^\/workspace\/staff\/reports(?:\/courses\/[a-f0-9-]{36}\/learners)?$/i.test(path)) return true;
  return path === home || (staffAllowed(session) && /^\/workspace\/staff\/courses\/[a-f0-9-]{36}\/sections\/[a-f0-9-]{36}\/lessons\/[a-f0-9-]{36}\/(?:quiz|assignments(?:\/[a-f0-9-]{36}(?:\/submissions\/[a-f0-9-]{36})?)?)$/i.test(path)) || (staffAllowed(session) && /^\/workspace\/staff\/courses(?:\/(?:new|[a-f0-9-]{36})(?:\/(?:edit|readiness|sections\/(?:new|[a-f0-9-]{36})(?:\/(?:edit|lessons\/(?:new|[a-f0-9-]{36})(?:\/(?:edit|items\/(?:new|[a-f0-9-]{36}\/edit)))?))?)))?$/i.test(path)) || (home === '/workspace/student' &&
    (['/workspace/student/catalog', '/workspace/student/my-courses', '/workspace/student/assignments/history', '/workspace/student/grades'].includes(path) ||
      /^\/workspace\/student\/grades\/courses\/[a-f0-9-]{36}$/i.test(path) ||
      /^\/workspace\/student\/courses\/[a-f0-9-]{36}(?:\/sections\/[a-f0-9-]{36}(?:\/lessons\/[a-f0-9-]{36}(?:\/quiz(?:\/attempts\/[a-f0-9-]{36})?|\/assignments(?:\/[a-f0-9-]{36}(?:\/submissions\/[a-f0-9-]{36})?)?)?)?)?$/i.test(path)));
}
