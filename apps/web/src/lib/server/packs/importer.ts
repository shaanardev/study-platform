import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  listImportedPacks,
  refreshApprovedLocalSources,
  saveImportedPack,
} from '#lib/server/db/packs.js';
import type { ImportedSourceAsset } from '#lib/server/db/packs.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import { workspacePath } from '#lib/server/workspace-paths.js';
import type { ExamPack, PackSource } from '#lib/types/exam-pack.js';

export interface ImportResult {
  imported: string[];
  refreshed: string[];
  errors: string[];
}
export interface ImportOptions {
  folder?: string;
  databasePath?: string;
  approvedSourceRoot?: string;
}

const defaultFolder = workspacePath('packs/incoming');
const defaultDatabase = workspacePath('.local/exam-packs.sqlite');

const isWithin = (parent: string, candidate: string): boolean => {
  const pathFromParent = path.relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith(`..${path.sep}`) &&
      pathFromParent !== '..' &&
      !path.isAbsolute(pathFromParent))
  );
};

interface ResolvedSource {
  filePath: string;
  questionId: string;
  source: PackSource;
}
type SourceResolution = ResolvedSource | { error: string };
interface FileImportResult {
  error?: string;
  imported?: string;
  refreshed?: string;
}

const resolveCitation = async (
  source: PackSource,
  questionId: string,
  filePath: string,
  packDirectory: string,
  approvedSourceRoot: string | undefined,
): Promise<SourceResolution> => {
  let candidate: string;
  if (source.path.startsWith('file:')) {
    if (approvedSourceRoot === undefined) {
      return {
        error: `absolute local citation "${source.path}" requires an explicitly approved local source root`,
      };
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
      return { error: `absolute local citation "${source.path}" is not a valid local file URL` };
    }
    if (!isWithin(approvedSourceRoot, path.resolve(candidate))) {
      return {
        error: `absolute local citation "${source.path}" is outside the approved local source root`,
      };
    }
  } else {
    candidate = path.resolve(path.dirname(filePath), source.path);
    if (!isWithin(path.dirname(filePath), candidate)) {
      return { error: `source path "${source.path}" escapes the pack folder` };
    }
  }

  try {
    const actualPath = await realpath(candidate);
    const allowedRoot = source.path.startsWith('file:') ? approvedSourceRoot : packDirectory;
    const actualPathInfo = await stat(actualPath);
    if (
      allowedRoot === undefined ||
      !isWithin(allowedRoot, actualPath) ||
      !actualPathInfo.isFile()
    ) {
      const reason = source.path.startsWith('file:')
        ? 'resolves outside the approved local source root or is not a file'
        : 'is not a file within the pack folder';
      return {
        error: `${source.path.startsWith('file:') ? 'absolute local citation' : 'source path'} "${source.path}" ${reason}`,
      };
    }
    return { filePath: actualPath, questionId, source };
  } catch {
    return { error: `source path "${source.path}" does not resolve to a local file` };
  }
};

const resolveRequestedSources = async (
  requests: { questionId: string; source: PackSource }[],
  index: number,
  filePath: string,
  packDirectory: string,
  approvedSourceRoot: string | undefined,
  resolved: ResolvedSource[],
): Promise<{ error: string } | { sources: ResolvedSource[] }> => {
  const request = requests[index];
  if (request === undefined) {
    return { sources: resolved };
  }
  const result = await resolveCitation(
    request.source,
    request.questionId,
    filePath,
    packDirectory,
    approvedSourceRoot,
  );
  if ('error' in result) {
    return result;
  }
  resolved.push(result);
  return await resolveRequestedSources(
    requests,
    index + 1,
    filePath,
    packDirectory,
    approvedSourceRoot,
    resolved,
  );
};

const resolvePackSources = async (
  pack: ExamPack,
  filePath: string,
  approvedSourceRoot: string | undefined,
): Promise<{ error: string } | { sources: ResolvedSource[] }> => {
  const packDirectory = await realpath(path.dirname(filePath));
  const requestedSources = pack.questions.flatMap((question) =>
    question.sources.map((source) => ({ questionId: question.id, source })),
  );
  return await resolveRequestedSources(
    requestedSources,
    0,
    filePath,
    packDirectory,
    approvedSourceRoot,
    [],
  );
};

const importPackFile = async (
  entryName: string,
  filePath: string,
  databasePath: string,
  approvedSourceRoot: string | undefined,
): Promise<FileImportResult> => {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(filePath, 'utf-8')) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return { error: `${entryName}: could not read valid JSON (${reason}).` };
  }
  const validation = validateExamPack(input);
  if (!validation.valid) {
    return { error: `${entryName}: ${validation.errors.join(' ')}` };
  }
  const resolution = await resolvePackSources(validation.pack, filePath, approvedSourceRoot);
  if ('error' in resolution) {
    return { error: `${entryName}: ${resolution.error}.` };
  }
  let sourceAssets: ImportedSourceAsset[];
  try {
    sourceAssets = await Promise.all(
      resolution.sources.map(async ({ questionId, source, filePath: sourcePath }) => ({
        excerpt: await readFile(sourcePath, 'utf-8'),
        questionId,
        source,
      })),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown file error';
    return { error: `${entryName}: could not read source files (${reason}).` };
  }
  const packKey = `${validation.pack.exam.id}/${validation.pack.pack.id}@${validation.pack.pack.version}`;
  try {
    saveImportedPack(databasePath, validation.pack, sourceAssets, approvedSourceRoot);
    return { imported: packKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown database error';
    if (!message.includes('UNIQUE constraint failed')) {
      return { error: `${entryName}: could not store this pack (${message}).` };
    }
    try {
      const refreshed =
        approvedSourceRoot !== undefined &&
        refreshApprovedLocalSources(
          databasePath,
          validation.pack,
          sourceAssets,
          approvedSourceRoot,
        );
      return refreshed
        ? { refreshed: packKey }
        : { error: `${entryName}: this exam, pack, and pack version are already imported.` };
    } catch (refreshError) {
      const reason =
        refreshError instanceof Error ? refreshError.message : 'unknown database error';
      return { error: `${entryName}: could not refresh approved local citations (${reason}).` };
    }
  }
};

const getApprovedSourceRoot = async (value: string | undefined): Promise<string | undefined> => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const sourceRoot = await realpath(path.resolve(value));
  const sourceRootInfo = await stat(sourceRoot);
  if (!sourceRootInfo.isDirectory()) {
    throw new Error('not a directory');
  }
  return sourceRoot;
};

const getPackFiles = async (folder: string): Promise<Dirent[]> => {
  const entries = await readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .toSorted((a, b) => a.name.localeCompare(b.name));
};

const importPackFilesSequentially = async (
  files: Dirent[],
  index: number,
  folder: string,
  databasePath: string,
  approvedSourceRoot: string | undefined,
  result: ImportResult,
): Promise<void> => {
  const entry = files[index];
  if (entry === undefined) {
    return;
  }
  const importedPack = await importPackFile(
    entry.name,
    path.join(folder, entry.name),
    databasePath,
    approvedSourceRoot,
  );
  if (importedPack.error !== undefined) {
    result.errors.push(importedPack.error);
  }
  if (importedPack.imported !== undefined) {
    result.imported.push(importedPack.imported);
  }
  if (importedPack.refreshed !== undefined) {
    result.refreshed.push(importedPack.refreshed);
  }
  await importPackFilesSequentially(
    files,
    index + 1,
    folder,
    databasePath,
    approvedSourceRoot,
    result,
  );
};

export const importPacksFromFolder = async (options: ImportOptions = {}): Promise<ImportResult> => {
  const folder = path.resolve(options.folder ?? defaultFolder);
  const databasePath = path.resolve(options.databasePath ?? defaultDatabase);
  const imported: string[] = [];
  const refreshed: string[] = [];
  const errors: string[] = [];
  let approvedSourceRoot: string | undefined;
  try {
    approvedSourceRoot = await getApprovedSourceRoot(options.approvedSourceRoot);
  } catch {
    return {
      errors: [
        `Approved local source root is not a readable directory: ${options.approvedSourceRoot}`,
      ],
      imported,
      refreshed,
    };
  }
  let files: Dirent[];
  try {
    files = await getPackFiles(folder);
  } catch {
    return {
      errors: [`Import folder does not exist or cannot be read: ${folder}`],
      imported,
      refreshed,
    };
  }
  if (files.length === 0) {
    errors.push(`No .json exam packs found in ${folder}.`);
  }
  await importPackFilesSequentially(files, 0, folder, databasePath, approvedSourceRoot, {
    errors,
    imported,
    refreshed,
  });
  return { errors, imported, refreshed };
};

export const getPackIndex = (databasePath = defaultDatabase) => listImportedPacks(databasePath);
