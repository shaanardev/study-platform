export type MockDomain = { id: string; title: string; weight: number };
export type CoverageGap = {
  id: string;
  title: string;
  required: number;
  available: number;
  missing: number;
};

export function allocateWeightedQuestions(
  domains: MockDomain[],
  questionCount: number,
): Record<string, number> {
  const exact = domains.map((domain, index) => ({
    id: domain.id,
    count: (questionCount * domain.weight) / 100,
    index,
  }));
  const allocation: Record<string, number> = Object.fromEntries(
    exact.map(({ id, count }) => [id, Math.floor(count)]),
  );
  let remaining = questionCount - Object.values(allocation).reduce((sum, count) => sum + count, 0);
  for (const domain of [...exact].sort(
    (a, b) => (b.count % 1) - (a.count % 1) || a.index - b.index,
  )) {
    if (remaining <= 0) break;
    allocation[domain.id] = (allocation[domain.id] ?? 0) + 1;
    remaining -= 1;
  }
  return allocation;
}

export function findCoverageGaps(
  domains: MockDomain[],
  availableByDomain: Record<string, number>,
  questionCount: number,
): CoverageGap[] {
  const required = allocateWeightedQuestions(domains, questionCount);
  return domains.flatMap((domain) => {
    const available = availableByDomain[domain.id] ?? 0;
    const quota = required[domain.id] ?? 0;
    return available < quota
      ? [
          {
            id: domain.id,
            title: domain.title,
            required: quota,
            available,
            missing: quota - available,
          },
        ]
      : [];
  });
}
