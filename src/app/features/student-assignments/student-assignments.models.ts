import { ViewerSelection, guid, viewerRoot } from '../student-viewer/student-viewer.models';
export interface Assignment { id: string; lessonId: string; title: string; instructions: string; dueAtUtc: string | null; maximumMarks: number; isPublished: boolean; }
export interface Submission { id: string; assignmentId: string; text: string | null; hasAttachment: boolean; submittedAt: string; instructionsSnapshot: string; maximumMarksSnapshot: number; grade: { marks: number; feedback: string; gradedAt: string } | null; }
export interface AssignmentHistory { courseId: string; sectionId: string; lessonId: string; assignmentId: string; submissionId: string; title: string; submittedAt: string; graded: boolean; }
export interface AssignmentData { organizationId: string; courseId?: string; sectionId?: string; lessonId?: string; enrollmentStatus?: number; rows?: AssignmentHistory[]; assignments?: Assignment[]; assignment?: Assignment | null; submissions?: Submission[]; submission?: Submission | null; canSubmit?: boolean; }
export interface AssignmentLocation { selection: ViewerSelection | null; assignmentId: string | null; submissionId: string | null; }
export const pdfLimit = 25 * 1024 * 1024;
export function validGuid(id: string): boolean { return id.length === 36 && guid.test(id); }
export function assignmentUrl(location: AssignmentLocation): string | null {
  if (!location.selection) return location.assignmentId || location.submissionId ? null : '/bff/student/assignments/history';
  const root = viewerRoot(location.selection);
  if (!root || !location.selection.lessonId || (location.assignmentId !== null && !validGuid(location.assignmentId)) ||
    (location.submissionId !== null && (!location.assignmentId || !validGuid(location.submissionId)))) return null;
  return root + '/assignments' + (location.assignmentId ? '/' + location.assignmentId : '') + (location.submissionId ? '/submissions/' + location.submissionId : '');
}
export function submissionValidation(text: string, file: File | null): string {
  if (text.length > 100000) return 'Plain text must be 100000 characters or fewer.';
  if (!text.trim() && !file) return 'Provide plain text, one PDF, or both.';
  if (file && (file.size <= 0 || file.size > pdfLimit || !/\.pdf$/i.test(file.name) || file.type.toLowerCase() !== 'application/pdf')) return 'Choose one nonempty PDF up to 25 MiB with application/pdf type. The server validates the actual file.';
  if (file && (/[\x00-\x1f\x7f]/.test(file.name) || file.name.split(/[\\/]/).pop()!.length > 200)) return 'The PDF filename must be safe and at most 200 characters.';
  return '';
}
