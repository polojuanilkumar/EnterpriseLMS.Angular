import { CanDeactivateFn } from '@angular/router';
import type { StudentAssignmentsComponent } from './student-assignments.component';
export const assignmentLeaveGuard: CanDeactivateFn<StudentAssignmentsComponent> = component => component.canLeave();
