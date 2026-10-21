export interface AntiforgeryResponse { requestToken: string; headerName: 'X-CSRF-TOKEN'; }
export interface LoginRequest { email: string; password: string; }
export interface LoginResponse { userId: string; expiresAt: string; requiresOrganizationSelection: true; }
export interface OrganizationOption { id: string; name: string; code: string; }
export interface SessionResponse {
  userId: string;
  expiresAt: string;
  selectedOrganization: { id: string; role: 'Student' | 'Instructor' | 'Admin' | null; name: string; code: string } | null;
  isSuperAdmin: boolean;
  requiresOrganizationSelection: boolean;
  homePath: string | null;
  recoveryCode?: 'organization_selection_cleared' | null;
}
export interface BffError { code: string; message: string; fieldErrors?: Record<string, string[]> | null; }
