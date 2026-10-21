import { Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { DOCUMENT, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { StudentQuizService } from './student-quiz.service';

@Component({ selector: 'app-student-quiz', imports: [DatePipe, RouterLink], providers: [StudentQuizService], templateUrl: './student-quiz.component.html' })
export class StudentQuizComponent {
  readonly store = inject(StudentQuizService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly window = inject(DOCUMENT).defaultView;
  get lessonPath(): string[] { const p = this.params(); return ['/workspace/student/courses', p.get('courseId') ?? '', 'sections', p.get('sectionId') ?? '', 'lessons', p.get('lessonId') ?? '']; }
  get quizPath(): string[] { return [...this.lessonPath, 'quiz']; }
  constructor() {
    effect(() => {
      const session = this.auth.state.session(); const params = this.params();
      const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      untracked(() => this.store.bind(session, blocked, { courseId: params.get('courseId') ?? '', sectionId: params.get('sectionId'), lessonId: params.get('lessonId') }, params.get('attemptId')));
    });
    const unload = (event: BeforeUnloadEvent) => { if (this.store.shouldWarn()) { event.preventDefault(); event.returnValue = ''; } };
    this.window?.addEventListener('beforeunload', unload);
    inject(DestroyRef).onDestroy(() => this.window?.removeEventListener('beforeunload', unload));
  }
  canLeave(): boolean { return !this.store.shouldWarn() || !!this.window?.confirm('Unsubmitted answers are held only in memory and will be lost. An in-flight action may already have reached the server. Leave this quiz?'); }
  reload(): void { if (this.canLeave()) void this.store.load(); }
  async start(): Promise<void> { const id = await this.store.start(); if (id) await this.router.navigate([...this.quizPath, 'attempts', id]); }
}
