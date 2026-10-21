export type EnrollmentStatus = 'Active' | 'Completed' | 'Cancelled';
export interface StudentCourse {
  id: string; title: string; description: string; categoryName: string | null;
  level: string; durationInMinutes: number; isAvailable: boolean;
}
export interface StudentEnrollment { id: string; status: EnrollmentStatus; enrolledAt: string; completedAt: string | null; }
export interface StudentCourseRow { courseId: string; course: StudentCourse | null; enrollment: StudentEnrollment | null; }
export interface StudentCoursesResponse { organizationId: string; courses: StudentCourseRow[]; }
export type CoursePageMode = 'catalog' | 'mine';
export type CourseAction = 'enroll' | 'reenroll' | 'cancel';
