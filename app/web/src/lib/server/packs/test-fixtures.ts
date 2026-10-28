import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateExamPack } from '@learning-platform/exam-pack';

import { saveImportedPack } from '#lib/server/packs/repository.js';

import samplePack from '../../../../../../packs/incoming/sample-learning-pack.json' with { type: 'json' };

export const mockSamplePackFolder = async (folder: string) => {
  const assets = path.join(folder, 'assets');
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(folder, 'sample-learning-pack.json'), JSON.stringify(samplePack));
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

/** Seed a fresh copy of the tracked sample pack into the current test database. */
export const seedSamplePack = async () => {
  const validation = validateExamPack(structuredClone(samplePack));

  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  await saveImportedPack(validation.pack);

  return validation.pack;
};
