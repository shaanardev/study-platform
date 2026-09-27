import { importPacksFromFolder, getPackIndex } from '$lib/server/packs/importer';

export const load = () => ({ packs: getPackIndex() });

export const actions = {
  import: async () => {
    const result = await importPacksFromFolder();
    return { importResult: result };
  },
};
