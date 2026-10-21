export interface QuizAttempt { attemptId: string; attemptNumber: number; status: number; deadline: string; earnedMarks: number | null; possibleMarks: number; isPassed: boolean | null; }
export interface QuizQuestion { id: string; questionText: string; questionType: number; displayOrder: number; marks: number; options: { id: string; optionText: string; displayOrder: number }[]; }
export interface StudentQuiz {
  organizationId: string; courseId: string; sectionId: string; lessonId: string;
  quiz: { id: string; lessonId: string; title: string; description: string | null; passingPercentage: number; timeLimitInMinutes: number; maxAttempts: number } | null;
  active: boolean; attempts: QuizAttempt[]; attempt: QuizAttempt | null; questions: QuizQuestion[];
  result: { attemptId: string; earnedMarks: number | null; possibleMarks: number; passingPercentageSnapshot: number; isPassed: boolean | null } | null;
  review: { attemptId: string; answers: { questionId: string; questionText: string; selectedOptions: { optionId: string; optionText: string }[] }[] } | null;
}
