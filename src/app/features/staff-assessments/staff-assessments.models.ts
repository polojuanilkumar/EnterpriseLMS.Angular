export interface QuizForm { title: string; description: string | null; passingPercentage: string; timeLimitInMinutes: number; maxAttempts: number; }
export interface Question { id: string; questionText: string; questionType: number; displayOrder: number; marks: string; }
export interface Option { id: string; optionText: string; displayOrder: number; isCorrect: boolean; }
export interface QuizPage { quiz: (QuizForm & { id: string; isPublished: boolean }) | null; questions: { question: Question; options: Option[] }[]; form: QuizForm; }
export interface Assignment { id: string; title: string; instructions: string; dueAtUtc: string | null; maximumMarks: string; isPublished: boolean; frozen: boolean; }
export interface Work { id: string; assignmentId: string; userId: string; text: string | null; hasAttachment: boolean; submittedAt: string; instructionsSnapshot: string; maximumMarksSnapshot: string; grade: { marks: string; feedback: string; gradedAt: string } | null; }
export interface AssignmentPage { assignments: Assignment[]; assignment: Assignment | null; submission: Work | null; }
export interface WorkPage { page: number; pageSize: number; total: number; items: Work[]; }
export interface AssignmentForm { title: string; instructions: string; maximumMarks: string; dueAtUtc: string | null; protectedFieldsChanged: boolean; dueAtChanged: boolean; }
export function decimalValid(value: string): boolean { return /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/.test(value); }
