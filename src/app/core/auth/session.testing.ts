import { SessionResponse } from './auth.models';
export function selectedSession(role: 'Student' | 'Instructor' | 'Admin' | null = 'Student', platform = false): SessionResponse {
  return { userId: 'user', expiresAt: new Date(Date.now() + 60000).toISOString(),
    selectedOrganization: { id: 'org', name: 'Verified organization', code: 'ORG', role },
    isSuperAdmin: platform, requiresOrganizationSelection: false, homePath: '/learn/mvc-only/courses' };
}
