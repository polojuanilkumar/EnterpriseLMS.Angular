export interface Course { id: string; title: string; description: string; status: string; }
export interface Section { id: string; title: string; displayOrder: number; }
export interface Lesson extends Section { description: string | null; isPublished: boolean; }
export interface Item extends Section { type: number; isRequired: boolean; text: string | null; youTubeVideoId: string | null; assetId: string | null; }
export interface Unit { organizationId: string; courseId: string; sectionId: string; lesson: Lesson;
  content: { items: Item[]; legacy: { content: string | null; videoUrl: string | null; youTubeVideoId?: string | null } | null }; }
export interface Form {
  title: string; code?: string; description?: string | null; categoryId?: string | null; instructorId?: string | null;
  level?: number; durationInMinutes?: number; thumbnailUrl?: string | null; displayOrder?: number;
  lessonType?: number; content?: string | null; videoUrl?: string | null; type?: number; isRequired?: boolean;
  text?: string | null; youTubeUrl?: string | null; assetId?: string | null;
}
export interface Page {
  organizationId?: string; courses?: Course[]; course?: Course; sections?: Section[]; section?: Section; lessons?: Lesson[];
  lesson?: Lesson; courseId?: string; sectionId?: string; content?: Unit['content']; form?: Form;
  categories?: { id: string; name: string; isActive: boolean }[];
  instructors?: { userId: string; firstName: string; lastName: string; email: string }[];
  isAdmin?: boolean; choices?: { page: number; pageSize: number; total: number } | null;
}
export interface Readiness { course: Course; sections: { section: Section; lessons: { unit: Unit; quiz: { title: string; isPublished: boolean } | null }[] }[]; }
export function fileProblem(file: File, type: number): string {
  const spec = type === 3 ? ['mp3', 'audio/mpeg', 25] : type === 4 ? ['mp4', 'video/mp4', 200] : ['pdf', 'application/pdf', 25];
  if (![3, 4, 5].includes(type) || !file.name.toLowerCase().endsWith('.' + spec[0]) || (file.type && file.type !== spec[1])) return 'Choose a matching MP3, MP4 or PDF file.';
  return file.size <= 0 || file.size > Number(spec[2]) * 1024 * 1024 ? `The file must be nonempty and at most ${spec[2]} MiB.` : '';
}
