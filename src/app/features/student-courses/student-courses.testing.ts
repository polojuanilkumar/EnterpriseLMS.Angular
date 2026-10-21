import { StudentCourseRow } from './student-courses.models';
export function courseRow(status: 'Active' | 'Completed' | 'Cancelled' | null = null, id = 'course'): StudentCourseRow {
  return { courseId: id, course: { id, title: 'Course <script>alert(1)</script>', description: '<img src=x onerror=alert(1)>', categoryName: 'Science', level: 'Beginner', durationInMinutes: 90, isAvailable: true },
    enrollment: status ? { id: 'enrollment-' + id, status, enrolledAt: '2026-10-15T00:00:00Z', completedAt: null } : null };
}
