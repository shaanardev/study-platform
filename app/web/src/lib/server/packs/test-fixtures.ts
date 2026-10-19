import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { workspacePath } from '#lib/server/workspace-paths.js';

const samplePack = workspacePath('packs/incoming/sample-learning-pack.json');

export const mockSamplePackFolder = async (folder: string) => {
  const assets = path.join(folder, 'assets');
  await mkdir(assets, { recursive: true });
  await cp(samplePack, path.join(folder, 'sample-learning-pack.json'));
  await writeFile(
    path.join(assets, 'synthetic-notes.md'),
    [
      '# Synthetic sample study notes',
      '',
      'This document and its questions are fictional teaching examples. They are not copied from an exam.',
      '',
      '## 1. Delta Lake foundations',
      '',
      'A table transaction log records changes and transaction state. This supports consistent reads and table history.',
      '',
      '## 2. Pipeline foundations',
      '',
      'Data quality expectations and visible execution status help operators observe and diagnose pipelines.',
      '',
    ].join('\n'),
    'utf-8',
  );
};
