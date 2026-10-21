import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionResponse } from '../../core/auth/auth.models';
import { ViewerPage, ViewerSelection, guid, viewerRoot } from './student-viewer.models';

export function viewerError(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  return status === 401 ? 'Your session has expired. Sign in again.' : status === 403 ? 'Access to this course has been denied. Check your organization and enrollment.' :
    status === 404 ? 'This learning resource is unavailable or unpublished.' : 'This learning resource could not be loaded. Try reloading.';
}

@Injectable()
export class StudentViewerService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly page = signal<ViewerPage | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly mediaErrors = signal<Record<string, string>>({});
  private generation = 0;
  private session: SessionResponse | null = null;
  private selection: ViewerSelection | null = null;
  private root: string | null = null;
  constructor() { inject(DestroyRef).onDestroy(() => this.clear()); }
  clear(): void {
    ++this.generation; this.page.set(null); this.loading.set(false); this.error.set(''); this.mediaErrors.set({});
    this.session = null; this.selection = null; this.root = null;
  }
  denyAccess(message: string): void {
    this.clear(); this.error.set(message);
  }
  bind(session: SessionResponse | null, blocked: boolean, selection: ViewerSelection): void {
    this.clear();
    if (blocked || !session?.selectedOrganization || session.selectedOrganization.role !== 'Student' || session.isSuperAdmin || Date.parse(session.expiresAt) <= Date.now()) return;
    this.session = session; this.selection = selection; this.root = viewerRoot(selection);
    if (!this.root) { this.error.set('This learning resource is unavailable.'); return; }
    void this.reload();
  }
  private current(generation: number, session: SessionResponse): boolean {
    return generation === this.generation && this.session === session && this.auth.state.session() === session &&
      Date.parse(session.expiresAt) > Date.now() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain();
  }
  async reload(): Promise<void> {
    const session = this.session; const root = this.root; const selection = this.selection;
    if (!session || !root || !selection) return;
    const generation = ++this.generation;
    this.page.set(null); this.mediaErrors.set({}); this.loading.set(true); this.error.set('');
    try {
      const page = await firstValueFrom(this.http.get<ViewerPage>(root));
      if (!this.current(generation, session)) return;
      if (page.organizationId !== session.selectedOrganization!.id ||
        (selection.lessonId ? page.courseId !== selection.courseId || page.sectionId !== selection.sectionId || page.lesson?.id !== selection.lessonId || page.lesson.sectionId !== selection.sectionId :
          page.course?.id !== selection.courseId || (selection.sectionId !== null && (page.section?.id !== selection.sectionId || page.section.courseId !== selection.courseId)))) throw new Error('Unexpected context');
      this.page.set(page);
    } catch (error) { if (this.current(generation, session)) { this.page.set(null); this.error.set(viewerError(error)); } }
    finally { if (this.current(generation, session)) this.loading.set(false); }
  }
  mediaUrl(itemId: string): string | null {
    return this.root && this.selection?.lessonId && itemId.length === 36 && guid.test(itemId) && this.page()?.items?.some(x => x.id === itemId && [3, 4, 5].includes(x.type))
      ? this.root + '/items/' + itemId + '/media' : null;
  }
  async mediaFailed(itemId: string): Promise<void> {
    const session = this.session; const generation = this.generation; const url = this.mediaUrl(itemId);
    if (!session || !url || !this.current(generation, session)) return;
    this.mediaErrors.update(errors => ({ ...errors, [itemId]: 'Checking media access…' }));
    // Native audio/video/iframe errors hide HTTP status. Probe HEAD without fetching the body.
    try {
      await firstValueFrom(this.http.head(url));
      if (this.current(generation, session)) this.mediaErrors.update(errors => ({ ...errors, [itemId]: 'Media could not be displayed. Your browser may not support its format. Reload or use the PDF download link.' }));
    } catch (error) {
      if (!this.current(generation, session)) return;
      if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
        ++this.generation; this.page.set(null); this.error.set(viewerError(error)); this.mediaErrors.set({});
      } else this.mediaErrors.update(errors => ({ ...errors, [itemId]: 'Media is temporarily unavailable. Reload to try again.' }));
    }
  }
}
