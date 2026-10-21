import { ViewerPage } from './student-viewer.models';
export const selection = { courseId: '11111111-1111-1111-1111-111111111111', sectionId: '22222222-2222-2222-2222-222222222222', lessonId: '33333333-3333-3333-3333-333333333333' };
export const itemId = '44444444-4444-4444-4444-444444444444';
export function unitPage(): ViewerPage {
  return { organizationId: 'org', ...selection, lesson: { id: selection.lessonId, sectionId: selection.sectionId, title: 'Lesson', description: '', displayOrder: 1 },
    items: [{ id: itemId, type: 4, title: 'Video', displayOrder: 1, isRequired: false, text: null, youTubeVideoId: null }], legacy: null };
}
