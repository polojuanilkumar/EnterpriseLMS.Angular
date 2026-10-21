export interface Member { organizationId: string; userId: string; firstName: string; lastName: string; email: string; role: number; }
export interface MembersPage { members: Member[]; page: number; pageSize: number; total: number; }
export interface Invitation { id: string; organizationId: string; email: string; role: number; createdAt: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; deliveredAt: string | null; }
export interface Page<T> { page: number; pageSize: number; total: number; items: T[]; }
export interface Choices { course: { id: string; title: string; instructorId: string }; instructors: Member[]; choices: Page<Member>; }
export interface Counts { quizStarted: number; quizSubmitted: number; quizExpired: number; quizPassed: number; quizFailed: number; quizUnavailable: number; submissions: number; graded: number; ungraded: number; }
export interface CourseReport extends Counts { courseId: string; title: string; published: boolean; enrollments: number; active: number; completed: number; cancelled: number; publishedLessons: number; assignments: number; progressDenominator: string; completedPublishedLearnerLessons: number; currentPercentage: number; }
export interface ReviewLink { courseId: string; sectionId: string; lessonId: string; assignmentId: string; submissionId: string; }
export interface LearnerReport extends Counts { courseId: string; userId: string; firstName: string; lastName: string; enrollmentStatus: number; enrolledAt: string; enrollmentCompletedAt: string | null; storedEnrollmentPercentage: number; publishedLessons: number; completedPublishedLessons: number; currentPercentage: number; currentContentComplete: boolean; recentAssignmentReview: ReviewLink | null; }
export interface AuditRow { id: string; timestampUtc: string; actorUserId: string | null; action: string; resourceType: string; resourceId: string; outcome: string; correlationId: string; metadata: Record<string, string>; }
export interface AuditFilter { fromUtc: string; toUtc: string; action: string | null; outcome: string | null; actorId: string | null; resourceId: string | null; }
export interface AuditPage extends Page<AuditRow> { filter: AuditFilter; actions: string[]; outcomes: string[]; }
export function roleText(role: number): string { return ({ 1: 'Student', 2: 'Instructor', 3: 'Admin' } as Record<number, string>)[role] ?? 'Unavailable'; }
export function invitationState(row: Invitation, now = Date.now()): string { return row.acceptedAt ? 'Accepted' : row.revokedAt ? 'Revoked' : Date.parse(row.expiresAt) <= now ? 'Expired' : 'Pending'; }
