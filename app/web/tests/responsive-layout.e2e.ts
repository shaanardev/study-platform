import { expect } from '@playwright/test';

import { reviewPackSelectionPath } from '../src/lib/route-urls.js';
import { fixture } from './fixtures/index.js';
import type { PackSelection } from './fixtures/pack-catalog.js';
import { registerTestCases } from './fixtures/register-test-cases.js';

interface PackVersions {
  alternatePack: PackSelection;
  samplePack: PackSelection;
}

const responsiveRoutes: {
  label: string;
  path: (packs: PackVersions) => string;
}[] = [
  { label: 'exam pack library', path: () => '/' },
  { label: 'practice', path: () => '/practice' },
  { label: 'mock exams', path: () => '/mock' },
  { label: 'progress', path: () => '/progress' },
  { label: 'sample pack review', path: ({ samplePack }) => reviewPackSelectionPath(samplePack) },
  {
    label: 'alternate pack review',
    path: ({ alternatePack }) => reviewPackSelectionPath(alternatePack),
  },
];

fixture.describe('responsive layout', () => {
  registerTestCases(responsiveRoutes, ({ label, path }) => {
    fixture(label, async ({ alternatePack, page, samplePack }) => {
      await page.setViewportSize({ height: 800, width: 320 });
      const route = path({ alternatePack, samplePack });

      await page.goto(route);

      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );

      expect(fits, `${label} should fit the viewport`).toBe(true);
    });
  });
});
