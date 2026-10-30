import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack } from '@learning-platform/exam-pack';
import type { Page } from '@playwright/test';
import Database from 'better-sqlite3';

import inlineCodePack from '../../../../packs/incoming/databricks-dea-may-2026-v1.2.2.json' with { type: 'json' };
import type { PackSelection as RoutePackSelection } from '../../src/lib/route-urls.js';
import { sampleLearningPackFixture } from '../../src/lib/test-fixtures.js';
import { learnerScenario } from './workflow.js';

export interface PackSelection extends RoutePackSelection {
  choice: string;
}

export interface AbsoluteCitationPackFixture extends PackSelection {
  content: ExamPack;
  questionId: string;
  title: string;
}

export type E2eDatabase = InstanceType<typeof Database>;

const requireDatabasePath = (): string => {
  const databasePath = process.env['DB_PATH'];

  if (databasePath === undefined || databasePath === '') {
    throw new Error('The Playwright global setup did not provide DB_PATH.');
  }

  return databasePath;
};

export const getE2eBaseUrl = (): string => {
  const baseUrl = process.env['E2E_BASE_URL'];

  if (baseUrl === undefined || baseUrl === '') {
    throw new Error('The Playwright global setup did not provide E2E_BASE_URL.');
  }

  return baseUrl;
};

export const createEmptyE2eDatabase = async (page: Page): Promise<E2eDatabase> => {
  // Visiting the app lets it create and migrate the database before fixture setup writes to it.
  await page.goto('/');

  const database = new Database(requireDatabasePath());
  database.pragma('foreign_keys = ON');
  database.prepare('DELETE FROM imported_packs').run();

  return database;
};

const parsePack = (serializedPack: string): ExamPack => {
  const validation = validateExamPack(JSON.parse(serializedPack));

  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  return validation.pack;
};

const selectionForExamPack = (examPack: ExamPack): PackSelection => ({
  choice: `${examPack.exam.id}|${examPack.pack.id}|${examPack.pack.version}`,
  examId: examPack.exam.id,
  packId: examPack.pack.id,
  packVersion: examPack.pack.version,
});

const insertPack = (
  database: E2eDatabase,
  examPack: ExamPack,
  approvedSourceRoot: string | null = null,
): PackSelection => {
  database
    .prepare(
      'INSERT INTO imported_packs (exam_id, pack_id, pack_version, content, approved_source_root, imported_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      examPack.exam.id,
      examPack.pack.id,
      examPack.pack.version,
      JSON.stringify(examPack),
      approvedSourceRoot,
      new Date().toISOString(),
    );

  return selectionForExamPack(examPack);
};

export const seedSamplePack = (database: E2eDatabase): PackSelection =>
  insertPack(database, parsePack(JSON.stringify(sampleLearningPackFixture())));

export const seedAlternatePack = (database: E2eDatabase): PackSelection => {
  const original = parsePack(JSON.stringify(sampleLearningPackFixture()));
  const [deltaDomain, pipelineDomain] = original.domains;
  const [transactionQuestion, pipelineQuestion] = original.questions;

  if (
    deltaDomain === undefined ||
    pipelineDomain === undefined ||
    transactionQuestion === undefined ||
    pipelineQuestion === undefined
  ) {
    throw new Error('The sample pack fixture needs two domains and two questions.');
  }

  const pack = parsePack(
    JSON.stringify({
      ...original,
      domains: original.domains.map((domain) => {
        if (domain.id === deltaDomain.id) {
          return { ...domain, id: 'transactions', title: 'Transaction foundations' };
        }

        if (domain.id === pipelineDomain.id) {
          return { ...domain, id: 'operations', title: 'Operations foundations' };
        }

        return domain;
      }),
      pack: {
        ...original.pack,
        id: 'synthetic-alternate',
        title: 'Z Alternative foundations sample',
        version: '2.0.0',
      },
      questions: original.questions.map((question) => {
        if (question.id === transactionQuestion.id) {
          return {
            ...question,
            domainId: 'transactions',
            explanation: `Set \`${learnerScenario.inlineCode.token}\` and display \`${learnerScenario.inlineCode.literalHtml}\` as literal text.`,
          };
        }

        if (question.id === pipelineQuestion.id) {
          return { ...question, domainId: 'operations' };
        }

        return question;
      }),
    }),
  );

  return insertPack(database, pack);
};

export const seedNewerSamplePack = (database: E2eDatabase): PackSelection => {
  const original = parsePack(JSON.stringify(sampleLearningPackFixture()));

  const pack = parsePack(
    JSON.stringify({ ...original, pack: { ...original.pack, version: '2.0.0' } }),
  );

  return insertPack(database, pack);
};

export const seedCitationPack = (database: E2eDatabase): PackSelection => {
  const original = parsePack(JSON.stringify(sampleLearningPackFixture()));
  const [question] = original.questions;
  const [source] = question?.sources ?? [];

  if (!question || !source) {
    throw new Error('The sample pack fixture needs a question with a source citation.');
  }

  const sourcePath = pathToFileURL(path.resolve('/approved', learnerScenario.citation.path)).href;

  const pack = parsePack(
    JSON.stringify({
      ...original,
      pack: { ...original.pack, id: 'synthetic-citations' },
      questions: original.questions.map((candidate) =>
        candidate.id === question.id
          ? {
              ...candidate,
              sources: candidate.sources.map((citation) =>
                citation === source
                  ? {
                      ...citation,
                      label: learnerScenario.citation.label,
                      path: sourcePath,
                    }
                  : citation,
              ),
            }
          : candidate,
      ),
    }),
  );

  const selection = insertPack(database, pack, '/approved');

  database
    .prepare(
      'INSERT INTO saved_source_assets (exam_id, pack_id, pack_version, question_id, source_path, label, excerpt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      selection.examId,
      selection.packId,
      selection.packVersion,
      question.id,
      sourcePath,
      learnerScenario.citation.label,
      learnerScenario.citation.excerpt,
    );

  return selection;
};

export const createAbsoluteCitationPackFixture = (
  sourcePath: string,
): AbsoluteCitationPackFixture => {
  const original = parsePack(JSON.stringify(sampleLearningPackFixture()));
  const [question] = original.questions;
  const [citation] = question?.sources ?? [];

  if (!question || !citation) {
    throw new Error('The sample pack fixture needs a question with a source citation.');
  }

  const packId = 'ui-absolute-citation-sample';
  const packVersion = '1.0.0';
  const title = 'Absolute citation UI sample';

  const content = parsePack(
    JSON.stringify({
      ...original,
      pack: { ...original.pack, id: packId, title, version: packVersion },
      questions: original.questions.map((candidate) =>
        candidate.id === question.id
          ? {
              ...candidate,
              sources: candidate.sources.map((source) =>
                source === citation ? { ...source, path: sourcePath } : source,
              ),
            }
          : candidate,
      ),
    }),
  );

  return {
    ...selectionForExamPack(content),
    content,
    questionId: question.id,
    title,
  };
};

export const seedInlineCodePack = (database: E2eDatabase): PackSelection =>
  insertPack(database, parsePack(JSON.stringify(inlineCodePack)));

export const seedReviewedQuestion = (database: E2eDatabase, samplePack: PackSelection): void => {
  database
    .prepare(
      'INSERT INTO question_feedback (exam_id, pack_id, pack_version, question_id, flags, correction, retired, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      samplePack.examId,
      samplePack.packId,
      samplePack.packVersion,
      learnerScenario.reviewedQuestionId,
      JSON.stringify([{ reason: 'Check the wording' }]),
      null,
      1,
      new Date().toISOString(),
    );
};
