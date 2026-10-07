import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ImportedSourceAsset,
  listImportedPacks,
  refreshApprovedLocalSources,
  saveImportedPack,
} from '#lib/server/db/packs.js';
import { validateExamPack } from '#lib/server/packs/validate.js';

export type ImportResult = { imported: string[]; refreshed: string[]; errors: string[] };
export type ImportOptions = {
  folder?: string;
  databasePath?: string;
  approvedSourceRoot?: string;
};

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
  const refreshed: string[] = [];
  const errors: string[] = [];
  let approvedSourceRoot: string | undefined;
  if (options.approvedSourceRoot?.trim()) {
    try {
      approvedSourceRoot = await realpath(resolve(options.approvedSourceRoot));
      if (!(await stat(approvedSourceRoot)).isDirectory()) {
        throw new Error('not a directory');
      }
    } catch {
      return {
        imported,
        refreshed,
        errors: [
          `Approved local source root is not a readable directory: ${options.approvedSourceRoot}`,
        ],
      };
    }
  }
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return {
      imported,
      refreshed,
      errors: [`Import folder does not exist or cannot be read: ${folder}`],
    };
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (files.length === 0) errors.push(`No .json exam packs found in ${folder}.`);

  for (const entry of files) {
    const filePath = join(folder, entry.name);
    let input: unknown;
    try {
      input = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      errors.push(`${entry.name}: could not read valid JSON (${reason}).`);
      continue;
    }
    const validation = validateExamPack(input);
    if (!validation.valid) {
      errors.push(`${entry.name}: ${validation.errors.join(' ')}`);
      continue;
    }

    const packDirectory = await realpath(dirname(filePath));
    let sourceError: string | undefined;
    const sourceFiles: {
      questionId: string;
      source: { path: string; label: string };
      filePath: string;
    }[] = [];
    for (const question of validation.pack.questions) {
      for (const source of question.sources) {
        let candidate: string;
        if (source.path.startsWith('file:')) {
          if (!approvedSourceRoot) {
            sourceError = `absolute local citation "${source.path}" requires an explicitly approved local source root`;
            break;
          }
          try {
            const url = new URL(source.path);
            if (
              url.protocol !== 'file:' ||
              url.hostname !== '' ||
              !url.pathname.startsWith('/') ||
              url.search ||
              url.hash
            ) {
              throw new Error('unsupported file URL');
            }
            candidate = fileURLToPath(url);
          } catch {
            sourceError = `absolute local citation "${source.path}" is not a valid local file URL`;
            break;
          }
          if (!isWithin(approvedSourceRoot, resolve(candidate))) {
            sourceError = `absolute local citation "${source.path}" is outside the approved local source root`;
            break;
          }
        } else {
          candidate = resolve(dirname(filePath), source.path);
          if (!isWithin(dirname(filePath), candidate)) {
            sourceError = `source path "${source.path}" escapes the pack folder`;
            break;
          }
        }
        try {
          const actualPath = await realpath(candidate);
          const allowedRoot = source.path.startsWith('file:') ? approvedSourceRoot : packDirectory;
          if (
            !allowedRoot ||
            !isWithin(allowedRoot, actualPath) ||
            !(await stat(actualPath)).isFile()
          ) {
            sourceError = source.path.startsWith('file:')
              ? `absolute local citation "${source.path}" resolves outside the approved local source root or is not a file`
              : `source path "${source.path}" is not a file within the pack folder`;
            break;
          }
          sourceFiles.push({ questionId: question.id, source, filePath: actualPath });
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

    let sourceAssets: ImportedSourceAsset[];
    try {
      sourceAssets = await Promise.all(
        sourceFiles.map(async ({ questionId, source, filePath: sourcePath }) => ({
          questionId,
          source,
          excerpt: await readFile(sourcePath, 'utf8'),
        })),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown file error';
      errors.push(`${entry.name}: could not read source files (${reason}).`);
      continue;
    }

    try {
      saveImportedPack(databasePath, validation.pack, sourceAssets, approvedSourceRoot);
      imported.push(
        `${validation.pack.exam.id}/${validation.pack.pack.id}@${validation.pack.pack.version}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown database error';
      if (message.includes('UNIQUE constraint failed')) {
        try {
          const reauthorized = approvedSourceRoot
            ? refreshApprovedLocalSources(
                databasePath,
                validation.pack,
                sourceAssets,
                approvedSourceRoot,
              )
            : false;
          if (reauthorized) {
            refreshed.push(
              `${validation.pack.exam.id}/${validation.pack.pack.id}@${validation.pack.pack.version}`,
            );
          } else {
            errors.push(`${entry.name}: this exam, pack, and pack version are already imported.`);
          }
        } catch (refreshError) {
          const reason =
            refreshError instanceof Error ? refreshError.message : 'unknown database error';
          errors.push(`${entry.name}: could not refresh approved local citations (${reason}).`);
        }
      } else {
        errors.push(`${entry.name}: could not store this pack (${message}).`);
      }
    }
  }
  return { imported, refreshed, errors };
}

export function getPackIndex(databasePath = defaultDatabase) {
  return listImportedPacks(databasePath);
}
