import type { ReviewData } from './review.remote';

type ReviewQuestion = Pick<
  NonNullable<ReviewData['pack']>['questions'][number],
  'id' | 'prompt' | 'domainId'
>;

type ReviewFeedback = Pick<ReviewData['feedback'][number], 'questionId' | 'flags' | 'retired'>;

export interface ReviewFilters {
  search: string;
  domainId: string;
  flagged: boolean;
  retired: boolean;
}

export const filterReviewQuestions = <Question extends ReviewQuestion>(
  questions: Question[],
  feedback: ReviewFeedback[],
  filters: ReviewFilters,
): Question[] => {
  const search = filters.search.trim().toLowerCase();
  const feedbackByQuestion = new Map(feedback.map((item) => [item.questionId, item]));

  return questions.filter((question) => {
    const matchesSearch =
      search === '' ||
      question.id.toLowerCase().includes(search) ||
      question.prompt.toLowerCase().includes(search);

    if (!matchesSearch) {
      return false;
    }

    if (filters.domainId && question.domainId !== filters.domainId) {
      return false;
    }

    const questionFeedback = feedbackByQuestion.get(question.id);

    if (filters.flagged && (!questionFeedback || questionFeedback.flags.length === 0)) {
      return false;
    }

    if (filters.retired && questionFeedback?.retired !== true) {
      return false;
    }

    return true;
  });
};
