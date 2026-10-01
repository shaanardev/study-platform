/** Exact DEA guide, objective, baseline, and provenance checks for this recipe. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import type { PackForVerification } from '../../verify.ts';

const expected: Record<string, readonly [weight: number, count: number]> = {
  platform: [6, 12],
  ingestion: [21, 42],
  transformation: [22, 44],
  jobs: [16, 32],
  cicd: [10, 20],
  monitoring: [10, 20],
  governance: [15, 30],
};
const objectiveIds: Record<string, string[]> = {
  platform: ['P1', 'P2'],
  ingestion: Array.from({ length: 7 }, (_, index) => `I${index + 1}`),
  transformation: Array.from({ length: 7 }, (_, index) => `T${index + 1}`),
  jobs: Array.from({ length: 4 }, (_, index) => `J${index + 1}`),
  cicd: Array.from({ length: 4 }, (_, index) => `C${index + 1}`),
  monitoring: Array.from({ length: 5 }, (_, index) => `M${index + 1}`),
  governance: Array.from({ length: 4 }, (_, index) => `G${index + 1}`),
};
type Coverage = {
  questionObjectives: Record<string, string[]>;
  objectives: Record<string, unknown>;
};
type BaselineReview = {
  number: number;
  status: string;
  packQuestionId: string;
  reviewedAnswer: string;
  reason?: string;
};
type Provenance = {
  materialInventory: Array<{ path: string; sha256: string }>;
  baselinePath: string;
  baselineSha256: string;
};

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const countBy = (values: string[]): Map<string, number> =>
  values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
const sortedObject = (values: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...values].sort(([left], [right]) => left.localeCompare(right)));
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;
const modernize = (text: string): string => {
  const replacements: Array<[string, string]> = [
    ['Delta Live Tables (DLT)', 'Lakeflow Spark Declarative Pipelines'],
    ['Delta Live Tables', 'Lakeflow Spark Declarative Pipelines'],
    ['Databricks Workflows', 'Lakeflow Jobs'],
    ['Databricks Asset Bundles', 'Declarative Automation Bundles'],
    ['Databricks Asset Bundle', 'Declarative Automation Bundle'],
    ['Asset Bundles', 'Declarative Automation Bundles'],
    ['Asset Bundle', 'Declarative Automation Bundle'],
  ];
  for (const [before, after] of replacements) text = text.replaceAll(before, after);
  return text.replace(/\bDLT\b/g, 'Lakeflow Spark Declarative Pipelines');
};

export async function verify(packPath: string, pack: PackForVerification): Promise<void> {
  const total = pack.questions.length;
  const byDomain = countBy(pack.questions.map(({ domainId }) => domainId));
  const metadata = new Map(pack.domains.map((domain) => [domain.id, domain]));
  assert(total === 200, 'This guide edition requires 200 questions');
  assert(pack.exam.version === '2026-05-04', 'Incorrect exam effective version');
  assert(pack.pack.synthetic, 'Independent practice must be labelled synthetic');
  assert(!Object.hasOwn(pack, 'passingThreshold'), 'Do not invent an official pass threshold');
  assert(
    metadata.size === Object.keys(expected).length &&
      Object.keys(expected).every((id) => metadata.has(id)),
    'Wrong DEA domain set',
  );
  const reportDomains = Object.entries(expected).map(([id, [weight, count]]) => {
    const domain = metadata.get(id);
    assert(domain, `${id}: missing domain metadata`);
    const actual = byDomain.get(id) ?? 0;
    assert(domain.weight === weight, `${id}: metadata disagrees with guide`);
    assert(
      actual === count && actual * 100 === weight * total,
      `${id}: incorrect guide proportion`,
    );
    return {
      id,
      title: domain.title,
      guidePercent: weight,
      questionCount: actual,
      actualPercent: (actual * 100) / total,
      differencePercentagePoints: (actual * 100) / total - weight,
    };
  });

  const assets = resolve(dirname(packPath), 'assets', basename(packPath, extname(packPath)));
  const coverage = await readJson<Coverage>(resolve(assets, 'objective-coverage.json'));
  const review = await readJson<BaselineReview[]>(resolve(assets, 'baseline-review.json'));
  const provenance = await readJson<Provenance>(resolve(assets, 'provenance.json'));
  const questionIds = pack.questions.map(({ id }) => id);
  assert(
    Object.keys(coverage.questionObjectives).length === questionIds.length &&
      questionIds.every((id) => Object.hasOwn(coverage.questionObjectives, id)),
    'Objective mapping does not exactly match questions',
  );
  const allObjectives = new Set(Object.values(objectiveIds).flat());
  assert(
    Object.keys(coverage.objectives).length === allObjectives.size &&
      Object.keys(coverage.objectives).every((id) => allObjectives.has(id)),
    'Objective list disagrees with the DEA guide checklist',
  );
  const observed = new Set<string>();
  const answerPositions = new Map<string, number>();
  const sourcePaths = new Set<string>();
  for (const question of pack.questions) {
    assert(
      question.type === 'single_choice' && question.answerIds.length === 1,
      `${question.id}: answer cardinality`,
    );
    assert(question.options.length === 4, `${question.id}: expected four choices`);
    assert(
      new Set(question.options.map(({ text }) => text.toLowerCase().replace(/\s+/g, ' ').trim()))
        .size === 4,
      `${question.id}: duplicate option text`,
    );
    const answerId = question.answerIds.at(0);
    assert(answerId, `${question.id}: missing answer ID`);
    answerPositions.set(answerId, (answerPositions.get(answerId) ?? 0) + 1);
    assert(
      question.explanation.trim().split(/\s+/).filter(Boolean).length >= 15,
      `${question.id}: explanation too short`,
    );
    const objectives = coverage.questionObjectives[question.id];
    assert(
      Array.isArray(objectives) &&
        objectives.length > 0 &&
        objectives.every((id) => objectiveIds[question.domainId]?.includes(id)),
      `${question.id}: objective/domain mismatch`,
    );
    for (const objective of objectives) observed.add(objective);
    assert(
      question.sources.some(({ path }) => path.includes('/references/')),
      `${question.id}: no primary documentation reference`,
    );
    for (const source of question.sources) sourcePaths.add(source.path);
  }
  assert(
    observed.size === allObjectives.size && [...allObjectives].every((id) => observed.has(id)),
    'At least one exam objective has no question',
  );
  assert(
    ['a', 'b', 'c', 'd'].every((position) => answerPositions.get(position) === 50) &&
      answerPositions.size === 4,
    'Correct answer positions must be balanced',
  );
  assert(
    review.length === 194 &&
      new Set(review.map(({ number }) => number)).size === review.length &&
      review.every((item, index) => item.number === index + 1),
    'Incomplete baseline audit',
  );
  const included = review.filter(({ status }) => status !== 'excluded');
  assert(
    included.length === 128 && review.length - included.length === 66,
    'Incorrect baseline audit totals',
  );
  const baselineIds = new Set(questionIds.filter((id) => id.startsWith('dea26-baseline-')));
  assert(
    new Set(included.map(({ packQuestionId }) => packQuestionId)).size === baselineIds.size &&
      [...baselineIds].every((id) => included.some((item) => item.packQuestionId === id)),
    'Baseline audit and pack differ',
  );
  const questionById = new Map(pack.questions.map((question) => [question.id, question]));
  for (const item of included) {
    const question = questionById.get(item.packQuestionId);
    assert(question, `Missing baseline question ${item.packQuestionId}`);
    const correct = question.options.find(({ id }) => id === question.answerIds[0])?.text;
    assert(
      correct && correct === modernize(item.reviewedAnswer),
      `${question.id}: reviewed key changed`,
    );
  }
  for (const item of review)
    assert(item.status !== 'excluded' || Boolean(item.reason), 'Exclusion without rationale');
  for (const item of provenance.materialInventory) {
    assert(
      hash(await readFile(resolve(assets, 'materials', item.path))) === item.sha256,
      `Material snapshot changed: ${item.path}`,
    );
  }
  assert(
    hash(await readFile(resolve(assets, 'materials', provenance.baselinePath))) ===
      provenance.baselineSha256,
    'Baseline archive hash mismatch',
  );

  const objectiveCounts = sortedObject(
    countBy(
      [...observed].flatMap((objective) =>
        pack.questions.flatMap((question) =>
          (coverage.questionObjectives[question.id] ?? []).filter((value) => value === objective),
        ),
      ),
    ),
  );
  const report = {
    status: 'passed',
    packSha256: hash(await readFile(packPath)),
    questionCount: total,
    exactDomainWeights: 'passed',
    domains: reportDomains,
    objectivesCovered: observed.size,
    objectiveCounts,
    sourceFilesResolved: sourcePaths.size,
    baselineAuditCount: review.length,
    baselineAdapted: included.length,
    newlyAuthored: total - included.length,
    answerPositions: sortedObject(answerPositions),
  };
  await writeFile(
    resolve(assets, 'verification-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`DEA profile passed: ${total} questions; ${observed.size} objectives covered.`);
  for (const row of reportDomains) {
    console.log(
      `${row.id.padEnd(16)} ${String(row.questionCount).padStart(3)}/${total} = ${row.actualPercent.toFixed(1).padStart(5)}% (guide ${row.guidePercent}%; difference ${row.differencePercentagePoints})`,
    );
  }
}
