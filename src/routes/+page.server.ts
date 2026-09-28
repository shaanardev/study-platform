import { getPackIndex, importPacksFromFolder } from '#lib/server/packs/importer.js';

export const load = () => ({ packs: getPackIndex() });

export const actions = {
  import: async () => {
    const result = await importPacksFromFolder();
    return { importResult: result };
  },
};
