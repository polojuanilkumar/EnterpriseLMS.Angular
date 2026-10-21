export interface StudentProgress {
  organizationId: string; courseId: string; sectionId: string | null; lessonId: string | null;
  current: { totalLessons: number; completedLessons: number; progressPercentage: number; isCompleted: boolean };
  enrollment: { id: string; status: 'Active' | 'Completed'; enrolledAt: string; completedAt: string | null };
  lesson: { isCompleted: boolean; progressPercentage: number; startedAt: string; lastAccessedAt: string; completedAt: string | null } | null;
}
