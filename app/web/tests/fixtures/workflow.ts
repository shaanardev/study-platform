import type { PackSelection } from '../../src/lib/route-urls.js';

export const learnerScenario = {
  citation: {
    excerpt: 'Saved excerpt for a citation path containing spaces, #, ? and &.',
    label: 'Special path study notes',
    path: 'course notes/Section #2?topic=SQL & C++.md',
  },
  inlineCode: {
    literalHtml: '<img src=x onerror=alert(1)>',
    token: 'schemaLocation',
  },
  mock: {
    firstCorrectAnswer: 'Validate data quality expectations',
    question: 'Which two practices can help make a data pipeline easier to operate?',
    secondCorrectAnswer: 'Track pipeline failures and execution status',
    wrongAnswer: 'Delete all run history after each task',
  },
  practice: {
    correctAnswer: 'A record of table changes and transaction state',
    question: 'What does a Delta Lake transaction log help a table provide?',
    wrongAnswer: 'An automatic backup to a public website',
  },
  primaryNavigationLinkCount: 5,
  reviewedQuestionId: 'delta-transaction-basics',
  samplePackSelection: {
    examId: 'sample-engineer-exam',
    packId: 'synthetic-foundations',
    packVersion: '1.0.0',
  } satisfies PackSelection,
};

export type LearnerScenario = typeof learnerScenario;
