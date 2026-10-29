import { form, query } from '$app/server';
import { invalid } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { listImportedPacks } from '#lib/server/packs/repository.js';

const CitationRefreshSchema = Schema.Struct({
  approveLocalSourceRoot: Schema.optional(Schema.Boolean),
  approvedSourceRoot: Schema.String,
});

export const getImportedPacks = query(listImportedPacks);

export const importPacks = form(Schema.toStandardSchemaV1(Schema.Struct({})), async () => {
  const result = await importPacksFromFolder();

  return {
    importResult: {
      ...result,
      errors: result.errors.map(
        () => 'Pack import failed. Check the incoming pack files and try again.',
      ),
    },
  };
});

export const importPacksWithApprovedCitations = form(
  Schema.toStandardSchemaV1(CitationRefreshSchema),
  async ({ approveLocalSourceRoot, approvedSourceRoot }, issue) => {
    const sourceRoot = approveLocalSourceRoot === true ? approvedSourceRoot.trim() : '';

    if (sourceRoot.length === 0) {
      invalid(
        issue.approvedSourceRoot(
          'Enter and approve a local source folder before importing these packs.',
        ),
      );
    }

    const result = await importPacksFromFolder({ approvedSourceRoot: sourceRoot });

    return {
      approvedImportResult: {
        ...result,
        errors: result.errors.map(
          () =>
            'Approved pack import failed. Check the selected folder and incoming pack files, then try again.',
        ),
      },
    };
  },
);

export const refreshPackCitations = form(
  Schema.toStandardSchemaV1(CitationRefreshSchema),
  async ({ approveLocalSourceRoot, approvedSourceRoot }, issue) => {
    const sourceRoot = approveLocalSourceRoot === true ? approvedSourceRoot.trim() : '';

    if (sourceRoot.length === 0) {
      invalid(
        issue.approvedSourceRoot(
          'Enter and approve a local source folder before refreshing citations.',
        ),
      );
    }

    const result = await importPacksFromFolder({
      approvedSourceRoot: sourceRoot,
      refreshOnly: true,
    });

    return {
      refreshResult: {
        ...result,
        errors: result.errors.map(
          () =>
            'Citation refresh failed. Check the approved folder and pack files, then try again.',
        ),
      },
    };
  },
);
