import { StudentQuiz } from './student-quiz.models';
import { selection } from '../student-viewer/student-viewer.testing';
export const quizId = '66666666-6666-6666-6666-666666666666';
export const attemptId = '77777777-7777-7777-7777-777777777777';
export const otherAttempt = '88888888-8888-8888-8888-888888888888';
export function quizPage(attempt = false): StudentQuiz {
  const row = { attemptId, attemptNumber: 1, status: 1, deadline: new Date(Date.now() + 60000).toISOString(), earnedMarks: null, possibleMarks: 6, isPassed: null };
  return { organizationId: 'org', ...selection, quiz: { id: quizId, lessonId: selection.lessonId, title: 'Quiz <script>', description: '<img src=x onerror=alert(1)>', passingPercentage: 70, timeLimitInMinutes: 1, maxAttempts: 2 }, active: true,
    attempts: attempt ? [row] : [], attempt: attempt ? row : null, result: null, review: null,
    questions: attempt ? [1, 2, 3].map(type => ({ id: `${type}9999999-9999-9999-9999-999999999999`, questionText: 'Question <img> ' + type, questionType: type, displayOrder: type, marks: 2,
      options: [1, 2].map(order => ({ id: `${type}${order}aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, optionText: 'Option <script> ' + order, displayOrder: order })) })) : [] };
}
