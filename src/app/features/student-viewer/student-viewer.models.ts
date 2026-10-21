export interface ViewerSection { id: string; courseId: string; title: string; displayOrder: number; }
export interface ViewerLesson { id: string; sectionId: string; title: string; description: string | null; displayOrder: number; }
export interface ViewerItem { id: string; type: number; title: string; displayOrder: number; isRequired: boolean; text: string | null; youTubeVideoId: string | null; }
export interface ViewerPage {
  organizationId: string;
  course?: { id: string; title: string; description: string };
  sections?: ViewerSection[];
  section?: ViewerSection;
  lessons?: ViewerLesson[];
  courseId?: string; sectionId?: string; lesson?: ViewerLesson;
  items?: ViewerItem[];
  legacy?: { content: string | null; youTubeVideoId: string | null } | null;
}
export interface ViewerSelection { courseId: string; sectionId: string | null; lessonId: string | null; }
export const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function viewerRoot(selection: ViewerSelection): string | null {
  const valid = (id: string) => id.length === 36 && guid.test(id);
  if (!valid(selection.courseId) || (selection.sectionId !== null && !valid(selection.sectionId)) ||
    (selection.lessonId !== null && (!selection.sectionId || !valid(selection.lessonId)))) return null;
  return '/bff/student/courses/' + selection.courseId + (selection.sectionId ? '/sections/' + selection.sectionId : '') +
    (selection.lessonId ? '/lessons/' + selection.lessonId : '');
}
export function youtubeEmbed(id: string | null | undefined): string | null {
  return id && id.length === 11 && /^[A-Za-z0-9_-]{11}$/.test(id) ? 'https://www.youtube-nocookie.com/embed/' + id : null;
}
