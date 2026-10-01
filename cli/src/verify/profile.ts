// oxlint-disable-next-line effecttsgo/node-builtin-import
import { createHash } from 'node:crypto';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { readFile, writeFile } from 'node:fs/promises';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { PackForVerification } from './verify.js';

type Profile = {
  domains?: Record<string, { count: number; weight: number }>;
  objectives?: { path: string; byDomain: Record<string, string[]> };
  questionRules?: {
    type?: 'single_choice' | 'multiple_choice';
    optionCount?: number;
    explanationMinWords?: number;
    requiredSourcePathFragment?: string;
  };
  answerPositions?: Record<string, number>;
  baselineAudit?: {
    path: string;
    total: number;
    included: number;
    excluded: number;
    idPrefix?: string;
  };
  sourceIntegrity?: { provenancePath: string };
  reportPath?: string;
};

type BaselineEntry = {
  number: number;
  status: string;
  packQuestionId: string;
  reviewedAnswer: string;
  reason?: string;
};

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const countBy = (values: string[]): Map<string, number> =>
  values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
const sortedObject = (values: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...values].sort(([left], [right]) => left.localeCompare(right)));
const resolveWithin = (directory: string, path: string, label: string): string => {
  const actual = resolve(directory, path);
  const fromDirectory = relative(directory, actual);
  assert(
    fromDirectory !== '..' && !fromDirectory.startsWith(`..${sep}`) && !isAbsolute(fromDirectory),
    `${label} escapes pack folder (${path})`,
  );
  return actual;
};
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

function validateProfileShape(value: unknown): asserts value is Profile {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), 'Profile must be an object');
  const profile = value as Profile;
  const allowed = ['domains', 'objectives', 'questionRules', 'answerPositions', 'baselineAudit', 'sourceIntegrity', 'reportPath'];
  assert(Object.keys(value).every((key) => allowed.includes(key)), 'Profile contains an unknown field');
  if (profile.domains !== undefined) {
    assert(typeof profile.domains === 'object' && profile.domains !== null && !Array.isArray(profile.domains), 'Profile domains must be an object');
    for (const [id, domain] of Object.entries(profile.domains)) {
      assert(typeof domain === 'object' && domain !== null, `${id}: profile domain must be an object`);
      assert(Object.keys(domain).every((key) => key === 'count' || key === 'weight'), `${id}: profile domain contains an unknown field`);
      assert(Number.isInteger(domain.count) && domain.count >= 0, `${id}: expected count must be a non-negative integer`);
      assert(typeof domain.weight === 'number' && Number.isFinite(domain.weight) && domain.weight > 0 && domain.weight <= 100, `${id}: expected weight must be greater than 0 and at most 100`);
    }
  }
  if (profile.objectives !== undefined) {
    const objectives = profile.objectives;
    assert(typeof objectives === 'object' && objectives !== null && typeof objectives.path === 'string' && objectives.path.length > 0 && typeof objectives.byDomain === 'object' && objectives.byDomain !== null && !Array.isArray(objectives.byDomain), 'Profile objectives require path and byDomain');
    assert(Object.entries(objectives.byDomain).every(([, ids]) => Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.length > 0)), 'Profile objective IDs must be non-empty strings');
  }
  if (profile.questionRules !== undefined) {
    const rules = profile.questionRules;
    assert(typeof rules === 'object' && rules !== null && !Array.isArray(rules), 'Profile questionRules must be an object');
    assert(Object.keys(rules).every((key) => ['type', 'optionCount', 'explanationMinWords', 'requiredSourcePathFragment'].includes(key)), 'Profile questionRules contains an unknown field');
    if (rules.type !== undefined) assert(rules.type === 'single_choice' || rules.type === 'multiple_choice', 'Profile questionRules type is invalid');
    if (rules.optionCount !== undefined) assert(Number.isInteger(rules.optionCount) && rules.optionCount >= 2, 'Profile optionCount must be an integer of at least 2');
    if (rules.explanationMinWords !== undefined) assert(Number.isInteger(rules.explanationMinWords) && rules.explanationMinWords >= 0, 'Profile explanationMinWords must be a non-negative integer');
    if (rules.requiredSourcePathFragment !== undefined) assert(typeof rules.requiredSourcePathFragment === 'string' && rules.requiredSourcePathFragment.length > 0, 'Profile requiredSourcePathFragment must be non-empty text');
  }
  if (profile.answerPositions !== undefined) assert(typeof profile.answerPositions === 'object' && profile.answerPositions !== null && !Array.isArray(profile.answerPositions), 'Profile answerPositions must be an object');
  if (profile.answerPositions) assert(Object.values(profile.answerPositions).every((count) => Number.isInteger(count) && count >= 0), 'Profile answer position counts must be non-negative integers');
  if (profile.baselineAudit !== undefined) {
    const audit = profile.baselineAudit;
    assert(typeof audit === 'object' && audit !== null && typeof audit.path === 'string', 'Profile baselineAudit requires a path');
    for (const key of ['total', 'included', 'excluded'] as const) assert(Number.isInteger(audit[key]) && audit[key] >= 0, `Profile baselineAudit ${key} must be a non-negative integer`);
    assert(audit.total === audit.included + audit.excluded, 'Profile baselineAudit totals must add up');
  }
  if (profile.sourceIntegrity !== undefined) {
    const integrity = profile.sourceIntegrity;
    assert(typeof integrity === 'object' && integrity !== null && typeof integrity.provenancePath === 'string', 'Profile sourceIntegrity requires provenancePath');
  }
  if (profile.reportPath !== undefined) assert(typeof profile.reportPath === 'string' && profile.reportPath.length > 0, 'Profile reportPath must be non-empty text');
}

// oxlint-disable-next-line effecttsgo/async-function
export async function verifyProfile(
  packPath: string,
  pack: PackForVerification,
  profilePath: string,
): Promise<{ report: Record<string, unknown>; reportPath: string }> {
  const profileValue: unknown = JSON.parse(await readFile(profilePath, 'utf8'));
  validateProfileShape(profileValue);
  const profile = profileValue;
  const base = dirname(resolve(packPath));
  const report: Record<string, unknown> = { status: 'passed', packSha256: hash(await readFile(packPath)), questionCount: pack.questions.length };

  if (profile.domains) {
    const actualIds = new Set(pack.domains.map(({ id }) => id));
    assert(actualIds.size === Object.keys(profile.domains).length && Object.keys(profile.domains).every((id) => actualIds.has(id)), 'Profile domain set does not match pack');
    const questionCounts = countBy(pack.questions.map(({ domainId }) => domainId));
    const domains = Object.entries(profile.domains).map(([id, expected]) => {
      const domain = pack.domains.find((item) => item.id === id);
      assert(domain, `${id}: domain missing from pack`);
      const actualCount = questionCounts.get(id) ?? 0;
      assert(domain.weight === expected.weight, `${id}: expected weight ${expected.weight}, got ${domain.weight}`);
      assert(actualCount === expected.count, `${id}: expected ${expected.count} questions, got ${actualCount}`);
      return { id, title: domain.title, guidePercent: expected.weight, questionCount: actualCount, actualPercent: (actualCount * 100) / pack.questions.length, differencePercentagePoints: (actualCount * 100) / pack.questions.length - expected.weight };
    });
    report['exactDomainWeights'] = 'passed';
    report['domains'] = domains;
  }

  if (profile.objectives) {
    const coveragePath = resolveWithin(base, profile.objectives.path, 'Objective mapping');
    const coverage = JSON.parse(await readFile(coveragePath, 'utf8')) as { questionObjectives?: Record<string, string[]>; objectives?: Record<string, unknown> };
    const coverageQuestions = coverage.questionObjectives;
    assert(coverageQuestions && Object.keys(coverageQuestions).length === pack.questions.length && pack.questions.every(({ id }) => Object.hasOwn(coverageQuestions, id)), 'Objective mapping does not exactly match questions');
    const expectedObjectives = new Set(Object.values(profile.objectives.byDomain).flat());
    assert(coverage.objectives && Object.keys(coverage.objectives).length === expectedObjectives.size && Object.keys(coverage.objectives).every((id) => expectedObjectives.has(id)), 'Objective list does not match profile');
    const observed = new Set<string>();
    for (const question of pack.questions) {
      const mapped = coverageQuestions[question.id];
      const permitted = profile.objectives.byDomain[question.domainId];
      assert(Array.isArray(mapped) && mapped.length > 0 && new Set(mapped).size === mapped.length && mapped.every((id) => permitted?.includes(id)), `${question.id}: objective/domain mismatch`);
      mapped.forEach((id) => observed.add(id));
    }
    assert(observed.size === expectedObjectives.size && [...expectedObjectives].every((id) => observed.has(id)), 'At least one profile objective has no question');
    report['objectivesCovered'] = observed.size;
    report['objectiveCounts'] = sortedObject(countBy(pack.questions.flatMap(({ id }) => coverageQuestions[id] ?? [])));
  }

  if (profile.questionRules) {
    const rules = profile.questionRules;
    for (const question of pack.questions) {
      if (rules.type) assert(question.type === rules.type, `${question.id}: expected ${rules.type}`);
      if (rules.optionCount !== undefined) assert(question.options.length === rules.optionCount, `${question.id}: expected ${rules.optionCount} options`);
      if (rules.explanationMinWords !== undefined) assert(question.explanation.trim().split(/\s+/).filter(Boolean).length >= rules.explanationMinWords, `${question.id}: explanation too short`);
      if (rules.requiredSourcePathFragment) assert(question.sources.some(({ path }) => path.includes(rules.requiredSourcePathFragment as string)), `${question.id}: missing required source`);
      assert(new Set(question.options.map(({ text }) => text.toLowerCase().replace(/\s+/g, ' ').trim())).size === question.options.length, `${question.id}: duplicate option text`);
    }
    report['questionRules'] = 'passed';
  }

  if (profile.answerPositions) {
    const positions = countBy(pack.questions.map((question) => {
      assert(question.answerIds.length === 1, `${question.id}: answer position requires one correct answer`);
      const answer = question.answerIds[0];
      assert(answer, `${question.id}: missing correct answer`);
      const optionIndex = question.options.findIndex(({ id }) => id === answer);
      assert(optionIndex >= 0, `${question.id}: correct answer is not an option`);
      return String.fromCharCode(97 + optionIndex);
    }));
    for (const [position, expected] of Object.entries(profile.answerPositions)) assert((positions.get(position) ?? 0) === expected, `Answer position ${position}: expected ${expected}, got ${positions.get(position) ?? 0}`);
    assert(positions.size === Object.keys(profile.answerPositions).length, 'Unexpected correct answer position');
    report['answerPositions'] = sortedObject(positions);
  }

  if (profile.baselineAudit) {
    const audit = profile.baselineAudit;
    const review = JSON.parse(await readFile(resolveWithin(base, audit.path, 'Baseline audit'), 'utf8')) as BaselineEntry[];
    assert(Array.isArray(review) && review.length === audit.total && new Set(review.map(({ number }) => number)).size === review.length && review.every((item, index) => item.number === index + 1), 'Incomplete baseline audit');
    const included = review.filter(({ status }) => status !== 'excluded');
    const excluded = review.filter(({ status }) => status === 'excluded');
    assert(included.length === audit.included && excluded.length === audit.excluded, 'Baseline audit disposition totals do not match profile');
    const prefix = audit.idPrefix ?? '';
    const baselineIds = new Set(pack.questions.map(({ id }) => id).filter((id) => prefix.length === 0 || id.startsWith(prefix)));
    assert(new Set(included.map(({ packQuestionId }) => packQuestionId)).size === baselineIds.size && [...baselineIds].every((id) => included.some((item) => item.packQuestionId === id)), 'Baseline audit and pack differ');
    const byId = new Map(pack.questions.map((question) => [question.id, question]));
    for (const item of included) {
      const question = byId.get(item.packQuestionId);
      assert(question, `Missing baseline question ${item.packQuestionId}`);
      const answer = question.options.find(({ id }) => id === question.answerIds[0])?.text;
      assert(answer === modernize(item.reviewedAnswer), `${question.id}: reviewed key changed`);
    }
    assert(excluded.every(({ reason }) => Boolean(reason)), 'Baseline exclusion without rationale');
    report['baselineAuditCount'] = review.length;
    report['baselineAdapted'] = included.length;
    report['newlyAuthored'] = pack.questions.length - included.length;
  }

  if (profile.sourceIntegrity) {
    const provenancePath = resolveWithin(base, profile.sourceIntegrity.provenancePath, 'Source provenance');
    const provenance = JSON.parse(await readFile(provenancePath, 'utf8')) as { materialInventory?: Array<{ path: string; sha256: string }>; baselinePath?: string; baselineSha256?: string };
    assert(Array.isArray(provenance.materialInventory) && typeof provenance.baselinePath === 'string' && typeof provenance.baselineSha256 === 'string', 'Invalid source provenance data');
    const provenanceDirectory = dirname(provenancePath);
    const materialsDirectory = resolve(provenanceDirectory, 'materials');
    for (const item of provenance.materialInventory) {
      const materialPath = resolveWithin(materialsDirectory, item.path, 'Material snapshot');
      assert(hash(await readFile(materialPath)) === item.sha256, `Material snapshot changed: ${item.path}`);
    }
    const baselinePath = resolveWithin(materialsDirectory, provenance.baselinePath, 'Baseline archive');
    assert(hash(await readFile(baselinePath)) === provenance.baselineSha256, 'Baseline archive hash mismatch');
    report['sourceFilesResolved'] = new Set(pack.questions.flatMap(({ sources }) => sources.map(({ path }) => path))).size;
    report['materialFilesVerified'] = provenance.materialInventory.length + 1;
  }

  const reportPath = resolveWithin(base, profile.reportPath ?? 'assets/verification-report.json', 'Verification report');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}
