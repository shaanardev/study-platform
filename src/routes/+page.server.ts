import { getPackIndex, importPacksFromFolder } from '#lib/server/packs/importer.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ packs: getPackIndex() });

export const actions: Actions = {
  import: async () => {
    const result = await importPacksFromFolder();
    return { importResult: result };
  },
};
