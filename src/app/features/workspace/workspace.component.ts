import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthState } from '../../core/auth/auth-state';
import { staffAllowed } from '../../core/auth/workspace-routing';

@Component({
  selector: 'app-workspace', imports: [RouterLink],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="workspace-title">
      <p class="text-sm font-semibold uppercase tracking-wide text-blue-700">Enterprise LMS</p>
      <h1 id="workspace-title" class="mt-3 text-3xl font-bold">{{ title() }}</h1>
      @if (state.session()?.recoveryCode === 'organization_selection_cleared') {
        <p role="status" class="mt-4 text-amber-900">Your previous organization access is no longer available. Your platform account remains signed in.</p>
      }
      @if (state.session()?.selectedOrganization; as organization) {
        <p class="mt-4 text-slate-600">{{ organization.name }} <span class="font-mono">{{ organization.code }}</span></p>
      } @else {
        <p class="mt-4 text-slate-600">Your verified platform account is active. Choose an organization to enter its workspace. Selection does not create a membership.</p>
      }
      <p class="mt-5 leading-7 text-slate-600">{{ unavailable() }}</p>
      @if (isStaff()) { <a routerLink="/workspace/staff/courses" class="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white">Course authoring</a> }
      @if (!state.session()?.isSuperAdmin && state.session()?.selectedOrganization?.role === 'Student') {
        <div class="mt-6 flex flex-wrap gap-4">
          <a routerLink="/workspace/student/catalog" class="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Browse course catalog</a>
          <a routerLink="/workspace/student/my-courses" class="rounded-lg border border-blue-700 px-5 py-3 font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">My Courses</a>
        </div>
      }
      <a routerLink="/organizations" class="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">Choose organization</a>
    </section>
  `,
})
export class WorkspaceComponent {
  readonly state = inject(AuthState);
  readonly isStaff = computed(() => staffAllowed(this.state.session()));
  readonly title = computed(() => {
    const session = this.state.session();
    if (session?.isSuperAdmin) return session.selectedOrganization ? 'SuperAdmin workspace' : 'Platform workspace';
    return `${session?.selectedOrganization?.role ?? 'Account'} workspace`;
  });
  readonly unavailable = computed(() => {
    if (this.state.session()?.isSuperAdmin) return this.state.session()?.selectedOrganization ? 'Manage this selected organization, courses, reports and audit through the workspace navigation.' : 'Manage platform organizations and read platform/account audit through the workspace navigation. Explicitly select an organization to enter its administration screens.';
    switch (this.state.session()?.selectedOrganization?.role) {
      case 'Student': return 'Browse the catalog, manage enrollments, view lessons and assessments, and review your progress and grades.';
      case 'Instructor': return 'Manage assigned courses and assessments, review submissions, and read assigned-course learner reports.';
      case 'Admin': return 'Manage organization members, invitations, Instructor assignments, courses, reports and read-only audit history.';
      default: return 'Choose an organization to enter its workspace.';
    }
  });
}
