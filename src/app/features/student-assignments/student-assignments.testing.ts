import { AssignmentData, AssignmentLocation } from './student-assignments.models';
import { selection } from '../student-viewer/student-viewer.testing';
export const assignmentId = '99999999-9999-9999-9999-999999999999';
export const submissionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const location: AssignmentLocation = { selection, assignmentId, submissionId: null };
export function assignmentData(): AssignmentData { const assignment = { id: assignmentId, lessonId: selection.lessonId, title: 'Assignment <script>', instructions: '<img> Instructions', dueAtUtc: '2026-10-20T12:30:00Z', maximumMarks: 10, isPublished: true }; return { organizationId: 'org', ...selection, enrollmentStatus: 1, assignments: [assignment], assignment, submissions: [], submission: null, canSubmit: true }; }
export function submittedData(): AssignmentData { const data = assignmentData(); const work = { id: submissionId, assignmentId, text: '<script>Own work', hasAttachment: true, submittedAt: '2026-10-15T10:00:00Z', instructionsSnapshot: '<img> Snapshot', maximumMarksSnapshot: 10, grade: { marks: 0, feedback: '<img> Feedback', gradedAt: '2026-10-16T10:00:00Z' } }; return { ...data, canSubmit: false, submissions: [work], submission: work }; }
