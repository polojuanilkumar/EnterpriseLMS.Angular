import { Component, effect, inject, input, output, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { StudentProgressService } from './student-progress.service';
import { ViewerSelection } from './student-viewer.models';

@Component({
  selector: 'app-student-progress', imports: [DatePipe], providers: [StudentProgressService],
  templateUrl: './student-progress.component.html',
})
export class StudentProgressComponent {
  readonly selection = input.required<ViewerSelection>();
  readonly accessDenied = output<string>();
  readonly store = inject(StudentProgressService);
  private readonly auth = inject(AuthService);
  constructor() {
    effect(() => {
      const session = this.auth.state.session(); const selection = this.selection();
      const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      untracked(() => this.store.bind(session, blocked, selection));
    });
    effect(() => { const error = this.store.fatal(); if (error) this.accessDenied.emit(error); });
  }
}
