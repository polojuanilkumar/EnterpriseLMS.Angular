import { CanDeactivateFn } from '@angular/router';
import type { StudentQuizComponent } from './student-quiz.component';

export const quizLeaveGuard: CanDeactivateFn<StudentQuizComponent> = component => component.canLeave();
