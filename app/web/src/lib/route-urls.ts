export interface PackSelection {
  readonly examId: string;
  readonly packId: string;
  readonly packVersion: string;
}

export interface SourceCitationLocation extends PackSelection {
  readonly questionId: string;
  readonly path: string;
}

export interface ReviewSelectionFilters {
  search?: string;
  domainId?: string;
  flagged?: boolean;
  retired?: boolean;
}

export type ReviewAction = 'corrected' | 'flagged' | 'restored' | 'retired';

const reviewSearchParams = (
  selection: PackSelection,
  filters: ReviewSelectionFilters,
): URLSearchParams => {
  const params = new URLSearchParams({
    examId: selection.examId,
    packId: selection.packId,
    packVersion: selection.packVersion,
  });

  if (filters.search !== undefined && filters.search !== '') {
    params.set('q', filters.search);
  }

  if (filters.domainId !== undefined && filters.domainId !== '') {
    params.set('domain', filters.domainId);
  }

  if (filters.flagged === true) {
    params.set('flagged', '');
  }

  if (filters.retired === true) {
    params.set('retired', '');
  }

  return params;
};

export const practiceSourcePath = ({
  examId,
  packId,
  packVersion,
  path,
  questionId,
}: SourceCitationLocation): `/practice/source?${string}` => {
  const params = new URLSearchParams({ examId, packId, packVersion, path, questionId });

  return `/practice/source?${params.toString()}`;
};

export const reviewPackSelectionPath = (
  selection: PackSelection,
  filters: ReviewSelectionFilters = {},
): `/review?${string}` => `/review?${reviewSearchParams(selection, filters).toString()}`;

export const reviewActionPath = (
  selection: PackSelection,
  filters: ReviewSelectionFilters,
  action: ReviewAction,
  questionId: string,
): `/review?${string}` => {
  const params = reviewSearchParams(selection, filters);
  params.set('reviewAction', action);
  params.set('reviewQuestion', questionId);

  const routePath: `/review?${string}` = `/review?${params.toString()}#question-${encodeURIComponent(questionId)}`;

  return routePath;
};
