import * as Schema from 'effect/Schema';

import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { listImportedPacks } from '#lib/server/packs/repository.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ packs: await listImportedPacks() });

export const actions: Actions = {
  import: async ({ request }) => {
    const formData = await request.formData();
    const approved = formData.get('approveLocalSourceRoot') === 'on';
    const rootValue = formData.get('approvedSourceRoot');
    const approvedSourceRoot =
      approved && Schema.is(Schema.String)(rootValue) ? rootValue.trim() : undefined;
    const result =
      approved && approvedSourceRoot !== undefined && approvedSourceRoot.length === 0
        ? {
            errors: ['Enter the local source root you approve before importing.'],
            imported: [],
            refreshed: [],
          }
        : await importPacksFromFolder(
            approvedSourceRoot !== undefined && approvedSourceRoot.length > 0
              ? { approvedSourceRoot }
              : {},
          );
    return { importResult: result };
  },
};
