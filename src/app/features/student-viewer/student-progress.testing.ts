import { StudentProgress } from './student-progress.models';
import { selection } from './student-viewer.testing';
export const courseSelection = { courseId: selection.courseId, sectionId: null, lessonId: null };
export function storedProgress(lesson = true): StudentProgress {
  return { organizationId: 'org', ...(lesson ? selection : courseSelection),
    current: { totalLessons: 2, completedLessons: 1, progressPercentage: 50, isCompleted: false },
    enrollment: { id: '55555555-5555-5555-5555-555555555555', status: 'Active', enrolledAt: '2026-10-01T10:00:00Z', completedAt: null },
    lesson: null };
}
export const startedLesson = { isCompleted: false, progressPercentage: 25, startedAt: '2026-10-01T10:00:00Z', lastAccessedAt: '2026-10-02T10:00:00Z', completedAt: null };
