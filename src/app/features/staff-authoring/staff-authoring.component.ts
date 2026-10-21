import { Component, DestroyRef, ElementRef, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { adminAllowed, staffAllowed } from '../../core/auth/workspace-routing';
import { SessionResponse } from '../../core/auth/auth.models';
import { guid, youtubeEmbed } from '../student-viewer/student-viewer.models';
import { fileProblem, Form, Item, Page, Readiness } from './staff-authoring.models';

@Component({ selector: 'app-staff-authoring', imports: [FormsModule, RouterLink], templateUrl: './staff-authoring.component.html' })
export class StaffAuthoringComponent {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly page = signal<Page | null>(null);
  readonly readiness = signal<Readiness | null>(null);
  readonly recovered = signal<{ id: string; title: string; path: string }[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly locked = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  form: Form = { title: '' };
  file: File | null = null;
  dirty = false;
  choicePage = 1;
  search = '';
  private epoch = 0;
  private read = 0;
  private session: SessionResponse | null = null;
  private trusted = new Map<string, SafeResourceUrl>();
  get isAdmin(): boolean { return adminAllowed(this.auth.state.session()); }
  readonly root = '/workspace/staff/courses';
  readonly validationHints = [
    { key: 'title', message: 'Enter a title of at most 200 characters.' },
    { key: 'code', message: 'Enter a course code of at most 50 characters.' },
    { key: 'description', message: 'Enter a course description of at most 5000 characters.' },
    { key: 'displayOrder', message: 'Enter a valid display order within the displayed bounds.' },
    { key: 'durationInMinutes', message: 'Enter a duration between 0 and 2147483647 minutes.' },
    { key: 'instructorId', message: 'Choose a current Instructor from this organization.' },
    { key: 'text', message: 'Enter plain text for the Text item.' },
    { key: 'youTubeUrl', message: 'Enter a YouTube URL for the YouTube item.' },
    { key: 'thumbnailUrl', message: 'Keep the thumbnail URL within 500 characters.' },
  ];
  get mode(): string { return this.data()['mode'] as string; }
  get courseId(): string { return this.params().get('courseId') ?? ''; }
  get sectionId(): string { return this.params().get('sectionId') ?? ''; }
  get lessonId(): string { return this.params().get('lessonId') ?? ''; }
  get itemId(): string { return this.params().get('itemId') ?? ''; }
  get coursePath(): string { return this.root + '/' + this.courseId; }
  get sectionPath(): string { return this.coursePath + '/sections/' + this.sectionId; }
  get lessonPath(): string { return this.sectionPath + '/lessons/' + this.lessonId; }
  get base(): string { return '/bff/staff/courses' + (this.courseId ? '/' + this.courseId : ''); }
  get sectionBase(): string { return this.base + '/sections/' + this.sectionId; }
  get lessonBase(): string { return this.sectionBase + '/lessons/' + this.lessonId; }
  get isForm(): boolean { return this.mode.endsWith('Form'); }
  get parentPath(): string { return this.mode === 'courseForm' ? (this.courseId ? this.coursePath : this.root) : this.mode === 'sectionForm' ? this.coursePath : this.mode === 'lessonForm' ? this.sectionPath : this.lessonPath; }
  constructor() {
    effect(() => {
      const session = this.auth.state.session();
      const blocked = this.auth.checking() || this.auth.mutating() || this.auth.state.contextUncertain();
      this.params(); this.data();
      untracked(() => {
        this.epoch++; this.session = null; this.releaseMedia(); this.page.set(null); this.readiness.set(null); this.recovered.set([]);
        this.form = { title: '' }; this.dirty = false; this.file = null; this.pending.set(false); this.locked.set(false);
        this.error.set(''); this.notice.set(''); this.choicePage = 1; this.search = ''; this.loading.set(false);
        if (!blocked && staffAllowed(session) && session && Date.parse(session.expiresAt) > Date.now()) {
          this.session = session;
          if ([this.courseId, this.sectionId, this.lessonId, this.itemId].filter(Boolean).every(id => id.length === 36 && guid.test(id))) void this.load();
          else this.error.set('This authoring address is invalid.');
        }
      });
    });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (this.shouldWarn()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => { this.epoch++; this.session = null; this.releaseMedia(); this.form = { title: '' }; this.file = null; this.page.set(null); this.readiness.set(null); this.recovered.set([]); window.removeEventListener('beforeunload', beforeUnload); });
  }
  private current(epoch: number): boolean {
    return epoch === this.epoch && !!this.session && this.session === this.auth.state.session() && !this.auth.checking() && !this.auth.mutating() && !this.auth.state.contextUncertain() && Date.parse(this.session.expiresAt) > Date.now();
  }
  async load(retain = false): Promise<void> {
    const epoch = this.epoch, read = ++this.read;
    if (!this.current(epoch)) return;
    this.loading.set(true);
    // Detach old previews before a read. Recreating their DOM also reloads an edited
    // attachment whose item-scoped URL is unchanged, without keeping an old stream alive.
    if (!this.isForm) { this.releaseMedia(); this.page.set(null); this.readiness.set(null); }
    let url = this.base;
    switch (this.mode) {
      case 'courseForm': url += (this.courseId ? '/edit' : '/new') + '?Page=' + this.choicePage + '&PageSize=50&Search=' + encodeURIComponent(this.search); break;
      case 'sectionForm': url += '/sections/' + (this.sectionId ? this.sectionId + '/edit' : 'new'); break;
      case 'lessonForm': url = this.sectionBase + '/lessons/' + (this.lessonId ? this.lessonId + '/edit' : 'new'); break;
      case 'section': url = this.sectionBase; break;
      case 'lesson': case 'itemForm': url = this.lessonBase; break;
      case 'readiness': url += '/readiness'; break;
    }
    try {
      const result = await firstValueFrom(this.http.get<Page & Readiness>(url));
      if (!this.current(epoch) || read !== this.read) return;
      this.releaseMedia();
      if (this.mode === 'readiness') this.readiness.set(result);
      else {
        this.page.set(result);
        if (this.isForm && !retain) {
          if (this.mode === 'itemForm') {
            const item = result.content?.items.find(x => x.id === this.itemId);
            if (this.itemId && !item) { this.page.set(null); this.error.set('Content item not found.'); return; }
            this.form = item ? { title: item.title, type: item.type, displayOrder: item.displayOrder, isRequired: item.isRequired, text: item.text, youTubeUrl: youtubeEmbed(item.youTubeVideoId) ? 'https://youtu.be/' + item.youTubeVideoId : null, assetId: item.assetId }
              : { title: '', type: 1, displayOrder: result.content?.items.length ?? 0, isRequired: false, text: '', youTubeUrl: null, assetId: null };
          } else this.form = { ...result.form! };
          this.dirty = false;
        }
      }
    } catch (error) {
      if (this.current(epoch) && read === this.read) {
        this.error.set(this.message(error));
        if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
          this.releaseMedia(); this.page.set(null); this.readiness.set(null); this.recovered.set([]); this.form = { title: '' }; this.file = null; this.dirty = false; this.locked.set(true);
        }
      }
    } finally { if (this.current(epoch) && read === this.read) this.loading.set(false); }
  }
  async choices(delta: number): Promise<void> {
    if (this.pending() || this.loading()) return;
    this.choicePage = delta === 0 ? 1 : Math.max(1, this.choicePage + delta);
    await this.load(true);
  }
  changed(): void { this.dirty = true; }
  typeChanged(): void {
    this.form.text = null; this.form.youTubeUrl = null; this.form.assetId = null; this.clearFile(); this.changed();
  }
  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.error.set(''); this.file = null;
    if (!file) return;
    const problem = fileProblem(file, this.form.type ?? 1);
    if (problem) { this.error.set(problem); input.value = ''; return; }
    this.file = file; this.form.assetId = null; this.changed();
  }
  async upload(): Promise<void> {
    if (!this.file) return;
    const body = new FormData(); body.append('type', String(this.form.type)); body.append('file', this.file);
    await this.mutate('POST', this.lessonBase + '/uploads', body, result => {
      const asset = result as { id: string };
      if (asset?.id?.length === 36 && guid.test(asset.id)) { this.form.assetId = asset.id; this.notice.set('Upload stored. Save the content item to attach it. Stored uploads are retained if attachment fails.'); }
      else { this.locked.set(true); this.error.set('Upload outcome is uncertain. Do not repeat the upload automatically.'); }
      this.clearFile();
    });
  }
  async save(form: NgForm): Promise<void> {
    if (form.invalid || !this.page() || this.file) { form.control.markAllAsTouched(); if (this.file) this.error.set('Upload the selected file before saving the item.'); return; }
    let url = this.base, method = this.courseId ? 'PUT' : 'POST';
    if (this.mode === 'sectionForm') { url += '/sections' + (this.sectionId ? '/' + this.sectionId : ''); method = this.sectionId ? 'PUT' : 'POST'; }
    if (this.mode === 'lessonForm') { url = this.sectionBase + '/lessons' + (this.lessonId ? '/' + this.lessonId : ''); method = this.lessonId ? 'PUT' : 'POST'; }
    if (this.mode === 'itemForm') { url = this.lessonBase + '/items' + (this.itemId ? '/' + this.itemId : ''); method = this.itemId ? 'PUT' : 'POST'; }
    await this.mutate(method, url, this.form, () => { this.dirty = false; void this.router.navigateByUrl(this.parentPath); });
  }
  async publication(action: string): Promise<void> {
    if (this.pending() || this.locked() || !window.confirm(`Confirm ${action} of this ${this.mode === 'lesson' ? 'lesson' : 'course'}?`)) return;
    await this.mutate('POST', (this.mode === 'lesson' ? this.lessonBase : this.base) + '/publication', { action, confirmed: true }, () => { this.notice.set('Publication action saved.'); void this.load(); });
  }
  async remove(item: Item): Promise<void> {
    if (this.pending() || this.locked() || !window.confirm(`Delete content item “${item.title}”? Stored assets follow the existing retention policy.`)) return;
    await this.mutate('POST', this.lessonBase + '/items/' + item.id + '/delete', { confirmed: true }, () => { this.notice.set('Item deleted.'); void this.load(); });
  }
  async move(index: number, delta: number): Promise<void> {
    const items = [...(this.page()?.content?.items ?? [])];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    await this.mutate('PUT', this.lessonBase + '/items/reorder', { itemIds: items.map(x => x.id) }, () => { this.notice.set('Order saved.'); void this.load(); });
  }
  private async mutate(method: string, url: string, body: unknown, success: (result: unknown) => void): Promise<void> {
    const epoch = this.epoch;
    if (!this.current(epoch) || this.pending() || this.locked() || this.loading()) return;
    this.pending.set(true); this.error.set(''); this.notice.set('');
    let sent = false;
    try {
      await this.auth.bootstrapCsrf();
      if (!this.current(epoch)) return;
      sent = true;
      const result = await firstValueFrom(this.http.request(method, url, { body }));
      if (this.current(epoch)) success(result);
    } catch (error) {
      if (!this.current(epoch)) return;
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      this.error.set(this.message(error));
      if ([401, 403, 404].includes(status)) { this.releaseMedia(); this.page.set(null); this.readiness.set(null); this.recovered.set([]); this.form = { title: '' }; this.dirty = false; this.clearFile(); this.locked.set(true); }
      else if (sent && ![400, 409, 413, 429].includes(status)) {
        this.locked.set(true); this.clearFile();
        this.notice.set('The write may have succeeded. A read-only refresh checks stored state; it does not repeat the write. Compare stored values before leaving and reopening this form. Unattached uploads are retained.');
        await this.load(true);
        if (this.current(epoch) && this.page()) await this.recoverCreatedChildren(epoch);
      }
    } finally { if (this.current(epoch)) this.pending.set(false); }
  }
  private async recoverCreatedChildren(epoch: number): Promise<void> {
    const creation = this.mode === 'courseForm' && !this.courseId ? { url: '/bff/staff/courses', path: this.root, kind: 'courses' as const }
      : this.mode === 'sectionForm' && !this.sectionId ? { url: this.base, path: this.coursePath + '/sections', kind: 'sections' as const }
      : this.mode === 'lessonForm' && !this.lessonId ? { url: this.sectionBase, path: this.sectionPath + '/lessons', kind: 'lessons' as const } : null;
    if (!creation) return;
    try {
      const stored = await firstValueFrom(this.http.get<Page>(creation.url));
      if (this.current(epoch)) {
        this.recovered.set((stored[creation.kind] ?? []).map(row => ({ id: row.id, title: row.title, path: creation.path + '/' + row.id })));
        this.notice.set('Creation outcome is uncertain. The read-only parent list below shows current stored records. Inspect any matching record before reopening the editor; no write was repeated.');
      }
    } catch (error) {
      if (this.current(epoch)) {
        this.error.set(this.message(error));
        if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
          this.releaseMedia(); this.page.set(null); this.readiness.set(null); this.recovered.set([]); this.form = { title: '' }; this.dirty = false;
        }
      }
    }
  }
  private message(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    return ({ 400: 'Check the field limits, required values, valid YouTube URL, file type and security check. Your safe values are retained.',
      401: 'Your session expired. Sign in again.', 403: 'You no longer have access in this organization.', 404: 'The requested resource or parent relationship is unavailable.',
      409: 'The stored state conflicts with this change. Check duplicate codes, ordering and publication state. Reload stored state before retrying.',
      413: 'The file or request exceeds the permitted size.', 429: 'Too many requests. Wait before trying again.' } as Record<number, string>)[status] ?? 'The service could not confirm the operation.';
  }
  mediaUrl(item: Item): string | null {
    return this.page()?.content?.items.some(x => x.id === item.id) && [3, 4, 5].includes(item.type) && item.id.length === 36 && guid.test(item.id) ? this.lessonBase + '/items/' + item.id + '/media' : null;
  }
  youtube(id: string | null): SafeResourceUrl | null { const url = youtubeEmbed(id); return url ? this.resource(url) : null; }
  pdf(item: Item): SafeResourceUrl | null { const url = this.mediaUrl(item); return url ? this.resource(url) : null; }
  private resource(url: string): SafeResourceUrl {
    let trusted = this.trusted.get(url);
    if (!trusted) { trusted = this.sanitizer.bypassSecurityTrustResourceUrl(url); this.trusted.set(url, trusted); }
    return trusted;
  }
  async mediaError(item: Item): Promise<void> {
    const url = this.mediaUrl(item), epoch = this.epoch;
    if (!url || !this.current(epoch)) return;
    try { await firstValueFrom(this.http.head(url)); if (this.current(epoch)) this.error.set('The browser could not preview this format. Try the authorized download or another supported browser.'); }
    catch (error) { if (this.current(epoch)) { this.error.set(this.message(error)); this.releaseMedia(); this.page.set(null); } }
  }
  private clearFile(): void { this.file = null; this.element.nativeElement.querySelectorAll<HTMLInputElement>('input[type=file]').forEach(input => input.value = ''); }
  private releaseMedia(): void {
    this.element.nativeElement.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media => { media.pause(); media.removeAttribute('src'); media.load(); });
    this.element.nativeElement.querySelectorAll('iframe').forEach(frame => frame.removeAttribute('src'));
    this.clearFile(); this.trusted.clear();
  }
  shouldWarn(): boolean { return !!this.session && this.session === this.auth.state.session() && (this.dirty || this.pending()); }
  canLeave(): boolean { return !this.shouldWarn() || window.confirm('Leave this editor? Unsaved values and file selections will be lost; an in-flight write may still finish.'); }
}
