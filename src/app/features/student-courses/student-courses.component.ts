import { Component, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StudentCoursesService } from './student-courses.service';
import { CoursePageMode } from './student-courses.models';

@Component({
  selector: 'app-student-courses', imports: [RouterLink], providers: [StudentCoursesService],
  templateUrl: './student-courses.component.html',
})
export class StudentCoursesComponent {
  readonly store = inject(StudentCoursesService);
  private readonly auth = inject(AuthService);
  readonly mode: CoursePageMode = inject(ActivatedRoute).snapshot.data['mode'] === 'mine' ? 'mine' : 'catalog';
  constructor() {
    effect(() => {
      const session = this.auth.state.session();
      const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      untracked(() => this.store.bind(session, blocked, this.mode));
    });
  }
}
