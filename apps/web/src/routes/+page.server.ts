import { getPackIndex, importPacksFromFolder } from '#lib/server/packs/importer.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ packs: getPackIndex() });

export const actions: Actions = {
  import: async ({ request }) => {
    const formData = await request.formData();
    const approved = formData.get('approveLocalSourceRoot') === 'on';
    const rootValue = formData.get('approvedSourceRoot');
    const approvedSourceRoot =
      approved && typeof rootValue === 'string' ? rootValue.trim() : undefined;
    const result =
      approved && !approvedSourceRoot
        ? {
            imported: [],
            refreshed: [],
            errors: ['Enter the local source root you approve before importing.'],
          }
        : await importPacksFromFolder(approvedSourceRoot ? { approvedSourceRoot } : {});
    return { importResult: result };
  },
};
