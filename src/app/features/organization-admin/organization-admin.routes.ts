import { CanDeactivateFn, Routes } from '@angular/router';
import type { OrganizationAdminComponent } from './organization-admin.component';
const leave: CanDeactivateFn<OrganizationAdminComponent> = component => component.canLeave();
export const organizationRoutes: Routes = [
  ['members', 'members'], ['invitations', 'invitations'], ['courses/:courseId/instructor', 'instructor'],
  ['audit/:eventId', 'auditDetail'], ['audit', 'audit'],
].map(([path, mode]) => ({ path, data: { mode }, canDeactivate: [leave], title: 'Organization administration | Enterprise LMS', loadComponent: () => import('./organization-admin.component').then(m => m.OrganizationAdminComponent) }));
export const reportRoutes: Routes = [['courses/:courseId/learners', 'learners'], ['', 'reports']].map(([path, mode]) => ({ path, data: { mode }, title: 'Course reports | Enterprise LMS', loadComponent: () => import('./organization-admin.component').then(m => m.OrganizationAdminComponent) }));
