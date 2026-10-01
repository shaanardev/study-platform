import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import type { BuildPlan, PackRecipe, QuestionDraft } from '../../types.ts';
import {
  AUTHORED,
  BASELINE,
  DOMAINS,
  EXCLUSION_REASONS,
  OBJECTIVES,
  REWRITES,
} from './curation.ts';
import { GUIDE_URL, OBJECTIVE_REFERENCES, REFERENCES } from './references.ts';

type Domain = (typeof DOMAINS)[number][0];
type EditorialRow = [
  prompt: string,
  correct: string,
  ...rest: [string, string, string, explanation: string],
];
type BaselineQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
};
type ReviewedRow = { number: number; [key: string]: unknown };
type AuthoredTuple = readonly [
  suffix: string,
  objective: string,
  reference: string,
  ...EditorialRow,
];

const DEFAULT_MATERIALS = '/mnt/c/Endava/EndevLocal/learning/databricks/data-eng-associate';
const PACK_FILENAME = 'databricks-dea-may-2026-v1.0.0.json';
const ASSETS_DIRECTORY = 'assets/databricks-dea-may-2026-v1.0.0';
const NOTES: Record<Domain, string> = {
  platform: 'academy-learning-plan/lakeflow-job-workloads/notes.md',
  ingestion: 'academy-learning-plan/lakeflow-connect-data-ingestion/notes.md',
  transformation: 'academy-learning-plan/declarative-spark-pipelines/notes.md',
  jobs: 'academy-learning-plan/lakeflow-job-workloads/notes.md',
  cicd: 'academy-learning-plan/declarative-automation-bundles/notes.md',
  monitoring: 'academy-learning-plan/performance-optimization/notes.md',
  governance: 'academy-learning-plan/data-privacy/notes.md',
};

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function itemAt<T>(items: readonly T[], index: number): T;
function itemAt(items: Uint32Array, index: number): number;
function itemAt<T>(items: ArrayLike<T>, index: number): T {
  const value = items[index];
  if (value === undefined) throw new RangeError(`Missing item at index ${index}`);
  return value;
}

function recordValue<T>(record: Record<number, T>, key: number): T {
  const value = record[key];
  if (value === undefined) throw new RangeError(`Missing value for key ${key}`);
  return value;
}

function modernize(text: string): string {
  for (const [before, after] of [
    ['Delta Live Tables (DLT)', 'Lakeflow Spark Declarative Pipelines'],
    ['Delta Live Tables', 'Lakeflow Spark Declarative Pipelines'],
    ['Databricks Workflows', 'Lakeflow Jobs'],
    ['Databricks Asset Bundles', 'Declarative Automation Bundles'],
    ['Databricks Asset Bundle', 'Declarative Automation Bundle'],
    ['Asset Bundles', 'Declarative Automation Bundles'],
    ['Asset Bundle', 'Declarative Automation Bundle'],
  ] as const) {
    text = text.replaceAll(before, after);
  }
  return text.replace(/\bDLT\b/g, 'Lakeflow Spark Declarative Pipelines');
}

function createQuestion(
  id: string,
  domain: Domain,
  row: EditorialRow,
  references: readonly string[],
  baselineId?: string,
): QuestionDraft {
  const [prompt, correct, ...rest] = row;
  const [distractors, explanation] = [rest.slice(0, 3), rest[3]] as [string[], string];
  const sources = references.map((key) => ({
    path: `references/${key}.md`,
    label: REFERENCES[key as keyof typeof REFERENCES][0],
  }));
  sources.push({ path: `materials/${NOTES[domain]}`, label: `Supplied academy notes: ${domain}` });
  if (baselineId) {
    sources.push({
      path: `baseline/${baselineId}.md`,
      label: `Archived baseline ${baselineId}; see reviewed pack answer`,
    });
  }
  return {
    id,
    type: 'single_choice',
    domainId: domain,
    prompt: modernize(prompt),
    options: [correct, ...distractors].map((text, index) => ({
      id: String.fromCharCode(97 + index),
      text: modernize(text),
    })),
    correctOptionIds: ['a'],
    explanation: modernize(explanation),
    sources,
  };
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
      }),
    )
  ).flat();
}

export const defaultMaterials = DEFAULT_MATERIALS;

export async function createPlan({
  materials,
  output,
}: {
  materials: string;
  output: string;
}): Promise<BuildPlan> {
  void output;
  const rawPath = join(materials, 'openexamprep/practise-exam-questions.json');
  const rawBytes = await readFile(rawPath);
  const raw = JSON.parse(rawBytes.toString('utf8')) as BaselineQuestion[];
  if (raw.length !== 194) {
    throw new Error(`Expected the supplied 194-item baseline, found ${raw.length}`);
  }
  const originalByNumber = new Map<number, BaselineQuestion>(
    raw.map((question) => [Number(question.id.split('-').at(-1)), question]),
  );
  if (
    originalByNumber.size !== 194 ||
    [...originalByNumber.keys()].some((number) => number < 1 || number > 194)
  ) {
    throw new Error('Baseline IDs must uniquely cover q-001 through q-194');
  }

  const artifacts: BuildPlan['artifacts'] = [];
  const inventory: { path: string; bytes: number; sha256: string }[] = [];
  const allowed = new Set(['.md', '.json', '.png', '.jpg', '.jpeg', '.vtt', '.txt']);
  for (const path of (await walk(materials)).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    if (!allowed.has(extname(path).toLowerCase())) continue;
    const rel = relative(materials, path);
    const content = await readFile(path);
    const artifactPath = `materials/${rel.split(sep).join('/')}`;
    artifacts.push({ path: artifactPath, contents: content });
    inventory.push({
      path: rel.split(sep).join('/'),
      bytes: content.length,
      sha256: hash(content),
    });
  }

  for (const [key, rawReference] of Object.entries(REFERENCES)) {
    const [title, urls, digest] = rawReference;
    const links = urls.map((url) => `- [${url.split('/').at(-1) || title}](${url})`).join('\n');
    artifacts.push({
      path: `references/${key}.md`,
      contents: `# ${title}\n\nPrimary documentation checked on 2026-10-01. This is a short study digest; consult the linked documentation for supported runtime and platform details.\n\n${digest}\n\n${links}\n`,
    });
  }

  const questions: QuestionDraft[] = [];
  const coverage: Record<string, string[]> = {};
  const reviewed: ReviewedRow[] = [];
  const retained = new Set<number>();
  const baselineByDomain = BASELINE as Record<string, Record<string, number[]>>;
  for (const [rawDomain] of DOMAINS) {
    const domain = rawDomain as Domain;
    const objectiveMap = baselineByDomain[domain];
    if (!objectiveMap) throw new Error(`Missing baseline assignments for ${domain}`);
    for (const [objective, numbers] of Object.entries(objectiveMap)) {
      for (const number of numbers) {
        if (retained.has(number))
          throw new Error(`Baseline question ${number} assigned more than once`);
        retained.add(number);
        const item = originalByNumber.get(number);
        if (!item) throw new Error(`Missing baseline question ${number}`);
        let row: EditorialRow;
        let status: string;
        if (Object.hasOwn(REWRITES, number)) {
          row = recordValue(REWRITES as Record<number, EditorialRow>, number);
          status = 'rewritten';
        } else {
          const answer = item.correctAnswer;
          row = [
            item.question,
            itemAt(item.options, answer),
            ...item.options.filter((_, index) => index !== answer),
            item.explanation,
          ] as EditorialRow;
          status = 'retained-with-terminology-normalization';
        }
        const questionId = `dea26-baseline-${String(number).padStart(3, '0')}`;
        questions.push(
          createQuestion(
            questionId,
            domain,
            row,
            (OBJECTIVE_REFERENCES as Record<string, string[]>)[objective] ?? [],
            item.id,
          ),
        );
        coverage[questionId] = [objective];
        reviewed.push({
          baselineId: item.id,
          number,
          status,
          packQuestionId: questionId,
          domainId: domain,
          objective,
          originalAnswer: item.options[item.correctAnswer],
          reviewedAnswer: row[1],
          reviewedExplanation: row.at(-1),
        });
        artifacts.push({
          path: `baseline/${item.id}.md`,
          contents: `# Archived baseline question ${number}\n\nThis is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.\n\n## Reviewed answer\n\n${row[1]}\n\n${modernize(row[5])}\n\n## Original input\n\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n`,
        });
      }
    }
    for (const authored of (AUTHORED as Partial<Record<Domain, AuthoredTuple[]>>)[domain] ?? []) {
      const [suffix, objective, ref, ...rawRow] = authored;
      const row = rawRow as EditorialRow;
      const questionId = `dea26-${domain}-${suffix}`;
      questions.push(createQuestion(questionId, domain, row, [ref]));
      coverage[questionId] = [objective];
    }
  }
  const excluded = new Set(
    Array.from({ length: 194 }, (_, index) => index + 1).filter((number) => !retained.has(number)),
  );
  if (
    [...excluded].some((number) => !Object.hasOwn(EXCLUSION_REASONS, number)) ||
    Object.keys(EXCLUSION_REASONS).some((number) => !excluded.has(Number(number)))
  ) {
    throw new Error('Every exclusion must be explained');
  }
  for (const number of [...excluded].sort((a, b) => a - b)) {
    const item = originalByNumber.get(number);
    if (!item) throw new Error(`Missing excluded baseline question ${number}`);
    reviewed.push({
      baselineId: item.id,
      number,
      status: 'excluded',
      reason: recordValue(EXCLUSION_REASONS as Record<number, string>, number),
    });
  }

  artifacts.push(
    {
      path: 'baseline-review.json',
      contents: json(reviewed.sort((a, b) => a.number - b.number)),
    },
    {
      path: 'objective-coverage.json',
      contents: json({ objectives: OBJECTIVES, questionObjectives: coverage }),
    },
    {
      path: 'provenance.json',
      contents: json({
        guideUrl: GUIDE_URL,
        examEffectiveDate: '2026-05-04',
        documentationCheckedOn: '2026-10-01',
        originalMaterialsPath: materials,
        baselinePath: relative(materials, rawPath).split(sep).join('/'),
        baselineSha256: hash(rawBytes),
        baselineCount: raw.length,
        baselineAdapted: retained.size,
        baselineRewritten: Object.keys(REWRITES).length,
        baselineExcluded: excluded.size,
        authoredCount: questions.length - retained.size,
        questionCount: questions.length,
        syntheticMeaning:
          'Independent practice material combining a reviewed third-party baseline and original authored scenarios; not an official exam question set.',
        passingThreshold:
          'Omitted because the supplied guide does not specify an official threshold.',
        videos: 'Excluded; text notes, screenshots, and existing text subtitles are archived.',
        materialInventory: inventory,
        sourcePrecedence: [
          'May 2026 exam guide for scope and weights',
          'Official vendor documentation for technical behavior',
          'Supplied academy notes and code cheatsheet',
          'Reviewed third-party baseline',
        ],
        sessionContext:
          'Reviewed the local Ordewell session and prior Codex import, practice, mock, and pack-extension sessions. The contract requires versioned packs, local source paths, explicit import, deferred mock feedback, and no inferred official pass mark.',
      }),
    },
  );

  return {
    metadata: {
      schemaVersion: 1,
      exam: {
        id: 'databricks-data-engineer-associate',
        title: 'Databricks Certified Data Engineer Associate',
        version: '2026-05-04',
      },
      pack: {
        id: 'databricks-dea-may-2026-reviewed',
        title: 'May 2026 reviewed baseline and original practice',
        version: '1.0.0',
        synthetic: true,
      },
      domains: DOMAINS.map(([id, title, weight]) => ({ id, title, weight })),
    },
    outputFile: PACK_FILENAME,
    assetsDirectory: ASSETS_DIRECTORY,
    answerSeed: 20260504,
    orderSeed: 20260505,
    questions,
    artifacts,
  };
}

const recipe: PackRecipe = { defaultMaterials, createPlan };
export default recipe;
