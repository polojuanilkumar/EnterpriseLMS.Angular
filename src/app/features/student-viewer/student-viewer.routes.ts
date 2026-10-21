import { Routes } from '@angular/router';
import { quizLeaveGuard } from '../student-quiz/student-quiz.guard';
import { assignmentLeaveGuard } from '../student-assignments/student-assignments.guard';

const page = () => import('./student-viewer.component').then(m => m.StudentViewerComponent);
export const viewerRoutes: Routes = [{ path: ':courseId', children: [
  { path: '', pathMatch: 'full', loadComponent: page, title: 'Course | Enterprise LMS' },
  { path: 'sections/:sectionId', children: [
    { path: '', pathMatch: 'full', loadComponent: page, title: 'Section | Enterprise LMS' },
    ...['lessons/:lessonId/assignments', 'lessons/:lessonId/assignments/:assignmentId', 'lessons/:lessonId/assignments/:assignmentId/submissions/:submissionId'].map(path => ({
      path, canDeactivate: [assignmentLeaveGuard], runGuardsAndResolvers: 'always' as const, title: 'Lesson assignments | Enterprise LMS', loadComponent: () => import('../student-assignments/student-assignments.component').then(m => m.StudentAssignmentsComponent),
    })),
    { path: 'lessons/:lessonId/quiz', children: [
      { path: '', pathMatch: 'full', canDeactivate: [quizLeaveGuard], loadComponent: () => import('../student-quiz/student-quiz.component').then(m => m.StudentQuizComponent), title: 'Lesson quiz | Enterprise LMS' },
      { path: 'attempts/:attemptId', canDeactivate: [quizLeaveGuard], runGuardsAndResolvers: 'always', loadComponent: () => import('../student-quiz/student-quiz.component').then(m => m.StudentQuizComponent), title: 'Quiz attempt | Enterprise LMS' },
    ] },
    { path: 'lessons/:lessonId', loadComponent: page, title: 'Lesson | Enterprise LMS' },
  ] },
] }];
