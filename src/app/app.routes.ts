import { Routes } from '@angular/router';
import { adminGuard, entryGuard, loginGuard, platformGuard, sessionGuard, staffGuard, studentGuard, workspaceGuard } from './core/auth/auth.guard';
import { assignmentLeaveGuard } from './features/student-assignments/student-assignments.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  ...['forgot-password', 'reset-password', 'invitation'].map(mode => ({
    path: 'account/' + mode, data: { mode }, title: 'Account | Enterprise LMS',
    loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent),
  })),
  {
    path: 'login',
    title: 'Sign in | Enterprise LMS',
    canActivate: [loginGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'session', title: 'Session | Enterprise LMS', canActivate: [sessionGuard, entryGuard],
    loadComponent: () => import('./features/auth/session/session.component').then(m => m.SessionComponent),
  },
  {
    path: 'organizations', title: 'Choose organization | Enterprise LMS', canActivate: [sessionGuard],
    loadComponent: () => import('./features/organizations/organization-chooser.component').then(m => m.OrganizationChooserComponent),
  },
  {
    path: 'workspace', canActivate: [sessionGuard],
    loadComponent: () => import('./layout/application-shell.component').then(m => m.ApplicationShellComponent),
    children: [
      ...['organizations', 'audit', 'audit/:eventId'].map(mode => ({
        path: 'platform/' + mode, data: { mode: mode.startsWith('audit') ? 'audit' : 'organizations' }, canActivate: [platformGuard],
        loadComponent: () => import('./features/platform/platform.component').then(m => m.PlatformComponent),
      })),
      { path: 'organization', canActivate: [adminGuard], loadChildren: () => import('./features/organization-admin/organization-admin.routes').then(m => m.organizationRoutes) },
      { path: 'staff/reports', canActivate: [staffGuard], loadChildren: () => import('./features/organization-admin/organization-admin.routes').then(m => m.reportRoutes) },
      { path: 'staff/courses', canActivate: [staffGuard], loadChildren: () => import('./features/staff-authoring/staff-authoring.routes').then(m => m.staffRoutes) },
      { path: 'student/assignments/history', data: { mode: 'history' }, canActivate: [studentGuard], canDeactivate: [assignmentLeaveGuard], title: 'Submission history | Enterprise LMS', loadComponent: () => import('./features/student-assignments/student-assignments.component').then(m => m.StudentAssignmentsComponent) },
      { path: 'student/grades', canActivate: [studentGuard], title: 'My Grades | Enterprise LMS', loadComponent: () => import('./features/student-grades/student-grades.component').then(m => m.StudentGradesComponent) },
      { path: 'student/grades/courses/:courseId', canActivate: [studentGuard], title: 'Course grades | Enterprise LMS', loadComponent: () => import('./features/student-grades/student-grades.component').then(m => m.StudentGradesComponent) },
      {
        path: 'student/courses', canActivate: [studentGuard],
        loadChildren: () => import('./features/student-viewer/student-viewer.routes').then(m => m.viewerRoutes),
      },
      ...[{ path: 'student/catalog', mode: 'catalog', title: 'Course catalog' },
        { path: 'student/my-courses', mode: 'mine', title: 'My Courses' }].map(page => ({
        path: page.path, data: { mode: page.mode }, title: page.title + ' | Enterprise LMS', canActivate: [studentGuard],
        loadComponent: () => import('./features/student-courses/student-courses.component').then(m => m.StudentCoursesComponent),
      })),
      ...['student', 'instructor', 'admin', 'super-admin', 'platform'].map(path => ({
        path, canActivate: [workspaceGuard], title: 'Workspace | Enterprise LMS',
        loadComponent: () => import('./features/workspace/workspace.component').then(m => m.WorkspaceComponent),
      })),
      { path: '', pathMatch: 'full', canActivate: [entryGuard], children: [] },
    ],
  },
  { path: '**', redirectTo: 'session' },
];
