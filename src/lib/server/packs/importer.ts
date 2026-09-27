import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { listImportedPacks, saveImportedPack } from '../db/packs';
import { validateExamPack } from './validate';

export type ImportResult = { imported: string[]; errors: string[] };
export type ImportOptions = { folder?: string; databasePath?: string };

const defaultFolder = resolve('packs/incoming');
const defaultDatabase = resolve('.local/exam-packs.sqlite');

function isWithin(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith(`..${sep}`) &&
      pathFromParent !== '..' &&
      !isAbsolute(pathFromParent))
  );
}

export async function importPacksFromFolder(options: ImportOptions = {}): Promise<ImportResult> {
  const folder = resolve(options.folder ?? defaultFolder);
  const databasePath = resolve(options.databasePath ?? defaultDatabase);
  const imported: string[] = [];
  const errors: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return { imported, errors: [`Import folder does not exist or cannot be read: ${folder}`] };
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (files.length === 0) errors.push(`No .json exam packs found in ${folder}.`);

  for (const entry of files) {
    const filePath = join(folder, entry.name);
    let input: unknown;
    try {
      input = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      errors.push(
        `${entry.name}: could not read valid JSON (${reason}).`,
      );
      continue;
    }
    const validation = validateExamPack(input);
    if (!validation.valid) {
      errors.push(`${entry.name}: ${validation.errors.join(' ')}`);
      continue;
    }

    const packDirectory = await realpath(dirname(filePath));
    let sourceError: string | undefined;
    for (const question of validation.pack.questions) {
      for (const source of question.sources) {
        const candidate = resolve(dirname(filePath), source.path);
        if (!isWithin(dirname(filePath), candidate)) {
          sourceError = `source path "${source.path}" escapes the pack folder`;
          break;
        }
        try {
          const actualPath = await realpath(candidate);
          if (!isWithin(packDirectory, actualPath) || !(await stat(actualPath)).isFile()) {
            sourceError = `source path "${source.path}" is not a file within the pack folder`;
            break;
          }
        } catch {
          sourceError = `source path "${source.path}" does not resolve to a local file`;
          break;
        }
      }
      if (sourceError) break;
    }
    if (sourceError) {
      errors.push(`${entry.name}: ${sourceError}.`);
      continue;
    }

    try {
      saveImportedPack(databasePath, validation.pack);
      imported.push(
        `${validation.pack.exam.id}/${validation.pack.pack.id}@${validation.pack.pack.version}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown database error';
      if (message.includes('UNIQUE constraint failed')) {
        errors.push(`${entry.name}: this exam, pack, and pack version are already imported.`);
      } else {
        errors.push(`${entry.name}: could not store this pack (${message}).`);
      }
    }
  }
  return { imported, errors };
}

export function getPackIndex(databasePath = defaultDatabase) {
  return listImportedPacks(databasePath);
}
