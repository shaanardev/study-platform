import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const samplePack = fileURLToPath(
  new URL('../../../../packs/incoming/sample-databricks-associate.json', import.meta.url),
);

export async function createSamplePackFolder(folder: string) {
  const assets = join(folder, 'assets');
  await mkdir(assets, { recursive: true });
  await cp(samplePack, join(folder, 'sample-databricks-associate.json'));
  await writeFile(
    join(assets, 'synthetic-notes.md'),
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
    'utf8',
  );
}
