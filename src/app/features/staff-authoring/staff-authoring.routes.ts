import { CanDeactivateFn, Routes } from '@angular/router';
import type { StaffAuthoringComponent } from './staff-authoring.component';
import type { StaffAssessmentsComponent } from '../staff-assessments/staff-assessments.component';
const assessmentLeave: CanDeactivateFn<StaffAssessmentsComponent> = component => component.canLeave();
const leave: CanDeactivateFn<StaffAuthoringComponent> = component => component.canLeave();
const assessmentRoutes: Routes = [
  [':courseId/sections/:sectionId/lessons/:lessonId/quiz', 'quiz'],
  [':courseId/sections/:sectionId/lessons/:lessonId/assignments/:assignmentId/submissions/:submissionId', 'submission'],
  [':courseId/sections/:sectionId/lessons/:lessonId/assignments/:assignmentId', 'assignment'],
  [':courseId/sections/:sectionId/lessons/:lessonId/assignments', 'assignments'],
].map(([path, mode]) => ({ path, data: { mode }, canDeactivate: [assessmentLeave], title: 'Staff assessments | Enterprise LMS', loadComponent: () => import('../staff-assessments/staff-assessments.component').then(m => m.StaffAssessmentsComponent) }));
export const staffRoutes: Routes = [...assessmentRoutes, ...[
  ['', 'list'], ['new', 'courseForm'], [':courseId/edit', 'courseForm'], [':courseId/readiness', 'readiness'],
  [':courseId/sections/new', 'sectionForm'], [':courseId/sections/:sectionId/edit', 'sectionForm'],
  [':courseId/sections/:sectionId/lessons/new', 'lessonForm'], [':courseId/sections/:sectionId/lessons/:lessonId/edit', 'lessonForm'],
  [':courseId/sections/:sectionId/lessons/:lessonId/items/new', 'itemForm'],
  [':courseId/sections/:sectionId/lessons/:lessonId/items/:itemId/edit', 'itemForm'],
  [':courseId/sections/:sectionId/lessons/:lessonId', 'lesson'], [':courseId/sections/:sectionId', 'section'], [':courseId', 'course'],
].map(([path, mode]) => ({ path, data: { mode }, canDeactivate: [leave], title: 'Course authoring | Enterprise LMS',
  loadComponent: () => import('./staff-authoring.component').then(m => m.StaffAuthoringComponent) }))];
