import { Component, DestroyRef, ElementRef, effect, inject, untracked, viewChild } from '@angular/core';
import { DOCUMENT, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { StudentAssignmentsService } from './student-assignments.service';
import { AssignmentHistory, assignmentUrl } from './student-assignments.models';
@Component({ selector: 'app-student-assignments', imports: [DatePipe, FormsModule, RouterLink], providers: [StudentAssignmentsService], templateUrl: './student-assignments.component.html' })
export class StudentAssignmentsComponent {
  readonly store = inject(StudentAssignmentsService); private readonly auth = inject(AuthService); private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap }); private readonly window = inject(DOCUMENT).defaultView;
  readonly history = this.route.snapshot.data['mode'] === 'history'; readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private lastFileInput: HTMLInputElement | null = null;
  get location() { const p = this.params(); return { selection: this.history ? null : { courseId: p.get('courseId') ?? '', sectionId: p.get('sectionId'), lessonId: p.get('lessonId') }, assignmentId: p.get('assignmentId'), submissionId: p.get('submissionId') }; }
  get lessonPath(): string[] { const s = this.location.selection; return ['/workspace/student/courses', s?.courseId ?? '', 'sections', s?.sectionId ?? '', 'lessons', s?.lessonId ?? '']; }
  get rootPath(): string[] { return [...this.lessonPath, 'assignments']; }
  historyPath(row: AssignmentHistory): string[] { return ['/workspace/student/courses', row.courseId, 'sections', row.sectionId, 'lessons', row.lessonId, 'assignments', row.assignmentId, 'submissions', row.submissionId]; }
  attachment(id: string): string { const l = this.location; return assignmentUrl({ ...l, submissionId: id }) + '/attachment'; }
  constructor() {
    effect(() => { const session = this.auth.state.session(); this.params(); const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain(); untracked(() => this.store.bind(session, blocked, this.location)); });
    effect(() => { const file = this.store.file(); const input = this.fileInput()?.nativeElement ?? null; if (this.lastFileInput && (!input || !file)) this.lastFileInput.value = ''; this.lastFileInput = input; if (!file && input) input.value = ''; });
    const unload = (e: BeforeUnloadEvent) => { if (this.store.shouldWarn()) { e.preventDefault(); e.returnValue = ''; } }; this.window?.addEventListener('beforeunload', unload);
    inject(DestroyRef).onDestroy(() => { if (this.lastFileInput) this.lastFileInput.value = ''; this.window?.removeEventListener('beforeunload', unload); });
  }
  canLeave(): boolean { return !this.store.shouldWarn() || !!this.window?.confirm('Unsubmitted text and files are held only in memory and will be discarded. A pending upload may have reached the server. Leave?'); }
  reload(): void { if (this.canLeave()) void this.store.load(); }
  selectFile(input: HTMLInputElement): void { if (input.files) this.store.selectFile(input.files); if (!this.store.file()) input.value = ''; }
}
