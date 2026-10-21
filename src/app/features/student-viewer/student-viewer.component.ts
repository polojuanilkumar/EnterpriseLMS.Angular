import { Component, DestroyRef, ElementRef, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../../core/auth/auth.service';
import { StudentViewerService } from './student-viewer.service';
import { youtubeEmbed } from './student-viewer.models';
import { StudentProgressComponent } from './student-progress.component';

@Component({
  selector: 'app-student-viewer', imports: [RouterLink, StudentProgressComponent], providers: [StudentViewerService],
  templateUrl: './student-viewer.component.html',
})
export class StudentViewerComponent {
  readonly store = inject(StudentViewerService);
  private readonly auth = inject(AuthService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  get courseId(): string { return this.params().get('courseId') ?? ''; }
  get sectionId(): string | null { return this.params().get('sectionId'); }
  get lessonId(): string | null { return this.params().get('lessonId'); }
  get coursePath(): string[] { return ['/workspace/student/courses', this.courseId]; }
  get sectionPath(): string[] { return [...this.coursePath, 'sections', this.sectionId ?? '']; }
  private readonly trusted = new Map<string, SafeResourceUrl>();
  constructor() {
    effect(() => {
      const session = this.auth.state.session();
      const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      const params = this.params();
      untracked(() => {
        this.releaseMedia();
        this.store.bind(session, blocked, { courseId: params.get('courseId') ?? '', sectionId: params.get('sectionId'), lessonId: params.get('lessonId') });
      });
    });
    effect(() => { if (!this.store.page()) untracked(() => this.releaseMedia()); });
    inject(DestroyRef).onDestroy(() => this.releaseMedia());
  }
  private releaseMedia(): void {
    this.element.nativeElement.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media => {
      media.pause(); media.removeAttribute('src'); media.querySelectorAll('source').forEach(source => source.removeAttribute('src')); media.load();
    });
    this.element.nativeElement.querySelectorAll('iframe').forEach(frame => frame.removeAttribute('src'));
    this.trusted.clear();
  }
  youtube(id: string | null | undefined): SafeResourceUrl | null {
    const url = youtubeEmbed(id);
    return url ? this.resource(url) : null;
  }
  pdf(itemId: string): SafeResourceUrl | null {
    const url = this.store.mediaUrl(itemId);
    return url ? this.resource(url) : null;
  }
  // The only ResourceUrl trust boundary: URLs originate from validated IDs and fixed origins/paths.
  // No HTML trust bypass, legacy URL, arbitrary host, path, or query can enter here.
  private resource(url: string): SafeResourceUrl {
    let value = this.trusted.get(url);
    if (!value) { value = this.sanitizer.bypassSecurityTrustResourceUrl(url); this.trusted.set(url, value); }
    return value;
  }
}
