import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect as playwrightExpect, test as playwrightTest } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  createEmptyE2eDatabase,
  getE2eBaseUrl,
  seedAlternatePack,
  seedCitationPack,
  seedInlineCodePack,
  seedNewerSamplePack,
  seedReviewedQuestion,
  seedSamplePack,
} from './pack-catalog.js';
import type { E2eDatabase, PackSelection } from './pack-catalog.js';
import { learnerScenario } from './workflow.js';
import type { LearnerScenario } from './workflow.js';

interface E2eFixtures {
  alternatePack: PackSelection;
  citationPack: PackSelection;
  database: E2eDatabase;
  feedbackArtifactCleanup: undefined;
  inlineCodePack: PackSelection;
  learner: LearnerScenario;
  newerSamplePack: PackSelection;
  noJavaScriptPage: Page;
  practiceSetupPage: Page;
  reviewedQuestion: { questionId: string };
  samplePack: PackSelection;
}

export const fixture = playwrightTest.extend<E2eFixtures>({
  alternatePack: async ({ database, samplePack: _samplePack }, use) => {
    await use(seedAlternatePack(database));
  },
  baseURL: async ({ browserName: _browserName }, use) => {
    await use(getE2eBaseUrl());
  },
  citationPack: async ({ database }, use) => {
    await use(seedCitationPack(database));
  },
  database: async ({ page }, use) => {
    const database = await createEmptyE2eDatabase(page);

    try {
      await use(database);
    } finally {
      database.close();
    }
  },
  feedbackArtifactCleanup: [
    async ({ browserName: _browserName }, use) => {
      const directory = path.resolve(import.meta.dirname, '../../../../.ui-feedback');

      const listFiles = async () => {
        try {
          return await readdir(directory);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return [];
          }

          throw error;
        }
      };

      const existingFiles = new Set(await listFiles());

      try {
        await use(undefined);
      } finally {
        const remainingFiles = await listFiles();
        const createdFiles = remainingFiles.filter((file) => !existingFiles.has(file));

        await Promise.all(
          createdFiles.map(async (file) => {
            await rm(path.join(directory, file), { force: true });
          }),
        );
      }
    },
    { auto: true },
  ],
  inlineCodePack: async ({ database }, use) => {
    await use(seedInlineCodePack(database));
  },
  learner: async ({ browserName: _browserName }, use) => {
    await use(learnerScenario);
  },
  newerSamplePack: async ({ database, samplePack: _samplePack }, use) => {
    await use(seedNewerSamplePack(database));
  },
  noJavaScriptPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: getE2eBaseUrl(),
      javaScriptEnabled: false,
    });

    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
  practiceSetupPage: async ({ page, samplePack: _samplePack }, use) => {
    await page.goto('/practice');
    await playwrightExpect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
    await use(page);
  },
  reviewedQuestion: async ({ database, samplePack }, use) => {
    seedReviewedQuestion(database, samplePack);
    await use({ questionId: learnerScenario.reviewedQuestionId });
  },
  samplePack: async ({ database }, use) => {
    await use(seedSamplePack(database));
  },
});

export const articleForQuestion = (page: Page, heading: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name: heading }) });
