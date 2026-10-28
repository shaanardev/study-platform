import { form, query } from '$app/server';
import { invalid } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { listImportedPacks } from '#lib/server/packs/repository.js';

const ImportPacksSchema = Schema.Struct({
  approveLocalSourceRoot: Schema.optional(Schema.Boolean),
  approvedSourceRoot: Schema.String,
});

export const getImportedPacks = query(listImportedPacks);

export const importPacks = form(
  Schema.toStandardSchemaV1(ImportPacksSchema),
  async ({ approveLocalSourceRoot, approvedSourceRoot }, issue) => {
    const approved = approveLocalSourceRoot === true;
    const sourceRoot = approved ? approvedSourceRoot.trim() : undefined;

    if (approved && sourceRoot?.length === 0) {
      invalid(
        issue.approvedSourceRoot('Enter the local source root you approve before importing.'),
      );
    }

    const result = await importPacksFromFolder(
      sourceRoot === undefined ? {} : { approvedSourceRoot: sourceRoot },
    );

    return {
      importResult: {
        ...result,
        errors: result.errors.map(() => 'Pack import failed. Check the local files and try again.'),
      },
    };
  },
);
