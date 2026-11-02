import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack, PackSource } from '@learning-platform/exam-pack';

import { refreshApprovedLocalSources, saveImportedPack } from '#lib/server/packs/repository.js';
import type { ImportedSourceAsset } from '#lib/server/packs/repository.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

export interface ImportResult {
  imported: string[];
  refreshed: string[];
  unchanged: string[];
  errors: string[];
}

export interface ImportOptions {
  folder?: string;
  approvedSourceRoot?: string;
  refreshOnly?: boolean;
  signal?: AbortSignal;
}

const defaultFolder = workspacePath('packs/incoming');

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

type SourceResolution =
  | { kind: 'resolved'; source: ResolvedSource }
  | { kind: 'error'; error: string };

type FileImportResult =
  | { kind: 'error'; error: string }
  | { kind: 'imported'; packKey: string }
  | { kind: 'refreshed'; packKey: string }
  | { kind: 'unchanged'; packKey: string };

interface PreparedPackImport {
  entryName: string;
  pack: ExamPack;
  packKey: string;
  sourceAssets: ImportedSourceAsset[];
}

type PackPreparationResult =
  | { kind: 'prepared'; prepared: PreparedPackImport }
  | { kind: 'error'; error: string };

const importPreparationBatchSize = 8;

type CitationCandidate = { kind: 'candidate'; path: string } | { kind: 'error'; message: string };

const resolveCitationCandidate = (
  source: PackSource,
  filePath: string,
  approvedSourceRoot: string | undefined,
): CitationCandidate => {
  if (!source.path.startsWith('file:')) {
    const candidate = path.resolve(path.dirname(filePath), source.path);

    return isWithin(path.dirname(filePath), candidate)
      ? { kind: 'candidate', path: candidate }
      : { kind: 'error', message: `source path "${source.path}" escapes the pack folder` };
  }

  if (approvedSourceRoot === undefined) {
    return {
      kind: 'error',
      message: `absolute local citation "${source.path}" requires an explicitly approved local source root`,
    };
  }

  const url = URL.parse(source.path);

  if (url === null) {
    return {
      kind: 'error',
      message: `absolute local citation "${source.path}" is not a valid local file URL`,
    };
  }

  let candidate: string;

  try {
    candidate = fileURLToPath(url);
  } catch {
    return {
      kind: 'error',
      message: `absolute local citation "${source.path}" is not a valid local file URL`,
    };
  }

  return isWithin(approvedSourceRoot, path.resolve(candidate))
    ? { kind: 'candidate', path: candidate }
    : {
        kind: 'error',
        message: `absolute local citation "${source.path}" is outside the approved local source root`,
      };
};

const resolveCitation = async (
  source: PackSource,
  questionId: string,
  filePath: string,
  packDirectory: string,
  approvedSourceRoot: string | undefined,
  signal?: AbortSignal,
): Promise<SourceResolution> => {
  const resolution = resolveCitationCandidate(source, filePath, approvedSourceRoot);

  if (resolution.kind === 'error') {
    return { error: resolution.message, kind: 'error' };
  }

  try {
    const actualPath = await realpath(resolution.path);
    signal?.throwIfAborted();
    const allowedRoot = source.path.startsWith('file:') ? approvedSourceRoot : packDirectory;
    const actualPathInfo = await stat(actualPath);
    signal?.throwIfAborted();

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
        kind: 'error',
      };
    }

    return {
      kind: 'resolved',
      source: { filePath: actualPath, questionId, source },
    };
  } catch {
    signal?.throwIfAborted();

    return {
      error: `source path "${source.path}" does not resolve to a local file`,
      kind: 'error',
    };
  }
};

const resolveRequestedSources = async (
  requests: { questionId: string; source: PackSource }[],
  filePath: string,
  packDirectory: string,
  approvedSourceRoot: string | undefined,
  signal?: AbortSignal,
): Promise<{ kind: 'sources'; sources: ResolvedSource[] } | { kind: 'error'; error: string }> => {
  signal?.throwIfAborted();

  const resolutions = await Promise.all(
    requests.map(
      async ({ questionId, source }) =>
        await resolveCitation(
          source,
          questionId,
          filePath,
          packDirectory,
          approvedSourceRoot,
          signal,
        ),
    ),
  );

  const firstError = resolutions.find((resolution) => resolution.kind === 'error');

  if (firstError !== undefined) {
    return firstError;
  }

  const sources = resolutions.flatMap((resolution) =>
    resolution.kind === 'resolved' ? [resolution.source] : [],
  );

  return { kind: 'sources', sources };
};

const resolvePackSources = async (
  pack: ExamPack,
  filePath: string,
  approvedSourceRoot: string | undefined,
  signal?: AbortSignal,
): Promise<{ kind: 'sources'; sources: ResolvedSource[] } | { kind: 'error'; error: string }> => {
  const packDirectory = await realpath(path.dirname(filePath));
  signal?.throwIfAborted();

  const requestedSources = pack.questions.flatMap((question) =>
    question.sources.map((source) => ({ questionId: question.id, source })),
  );

  return await resolveRequestedSources(
    requestedSources,
    filePath,
    packDirectory,
    approvedSourceRoot,
    signal,
  );
};

const preparePackFile = async (
  entryName: string,
  filePath: string,
  approvedSourceRoot: string | undefined,
  signal?: AbortSignal,
): Promise<PackPreparationResult> => {
  let input: unknown;

  try {
    // SAFETY: JSON.parse returns untrusted input; validateExamPack narrows it below.
    input = JSON.parse(await readFile(filePath, { encoding: 'utf-8', signal })) as unknown;
  } catch (error) {
    signal?.throwIfAborted();
    const reason = error instanceof Error ? error.message : 'unknown error';

    return { error: `${entryName}: could not read valid JSON (${reason}).`, kind: 'error' };
  }

  signal?.throwIfAborted();
  const validation = validateExamPack(input);

  if (!validation.valid) {
    return { error: `${entryName}: ${validation.errors.join(' ')}`, kind: 'error' };
  }

  const resolution = await resolvePackSources(
    validation.pack,
    filePath,
    approvedSourceRoot,
    signal,
  );

  signal?.throwIfAborted();

  if (resolution.kind === 'error') {
    return { error: `${entryName}: ${resolution.error}.`, kind: 'error' };
  }

  let sourceAssets: ImportedSourceAsset[];

  try {
    sourceAssets = await Promise.all(
      resolution.sources.map(async ({ questionId, source, filePath: sourcePath }) => ({
        excerpt: await readFile(sourcePath, { encoding: 'utf-8', signal }),
        questionId,
        source,
      })),
    );
  } catch (error) {
    signal?.throwIfAborted();
    const reason = error instanceof Error ? error.message : 'unknown file error';

    return { error: `${entryName}: could not read source files (${reason}).`, kind: 'error' };
  }

  const packKey = `${validation.pack.exam.id}/${validation.pack.pack.id}@${validation.pack.pack.version}`;

  return {
    kind: 'prepared',
    prepared: { entryName, pack: validation.pack, packKey, sourceAssets },
  };
};

const storePreparedPack = async (
  prepared: PreparedPackImport,
  approvedSourceRoot: string | undefined,
  refreshOnly: boolean,
  signal?: AbortSignal,
): Promise<FileImportResult> => {
  signal?.throwIfAborted();
  const { entryName, pack, packKey, sourceAssets } = prepared;

  if (refreshOnly) {
    if (approvedSourceRoot === undefined) {
      return {
        error: 'Choose and approve a local source folder to refresh citations.',
        kind: 'error',
      };
    }

    try {
      const refreshed = await refreshApprovedLocalSources(pack, sourceAssets, approvedSourceRoot);

      return refreshed ? { kind: 'refreshed', packKey } : { kind: 'unchanged', packKey };
    } catch (error) {
      signal?.throwIfAborted();
      const reason = error instanceof Error ? error.message : 'unknown database error';

      return {
        error: `${entryName}: could not refresh approved local citations (${reason}).`,
        kind: 'error',
      };
    }
  }

  try {
    await saveImportedPack(pack, sourceAssets, approvedSourceRoot);

    return { kind: 'imported', packKey };
  } catch (error) {
    signal?.throwIfAborted();
    const message = error instanceof Error ? error.message : 'unknown database error';

    if (!message.includes('UNIQUE constraint failed')) {
      return { error: `${entryName}: could not store this pack (${message}).`, kind: 'error' };
    }

    try {
      const refreshed =
        approvedSourceRoot !== undefined &&
        (await refreshApprovedLocalSources(pack, sourceAssets, approvedSourceRoot));

      return refreshed ? { kind: 'refreshed', packKey } : { kind: 'unchanged', packKey };
    } catch (refreshError) {
      signal?.throwIfAborted();

      const reason =
        refreshError instanceof Error ? refreshError.message : 'unknown database error';

      return {
        error: `${entryName}: could not refresh approved local citations (${reason}).`,
        kind: 'error',
      };
    }
  }
};

const getApprovedSourceRoot = async (
  value: string | undefined,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const sourceRoot = await realpath(path.resolve(value));
  signal?.throwIfAborted();
  const sourceRootInfo = await stat(sourceRoot);
  signal?.throwIfAborted();

  if (!sourceRootInfo.isDirectory()) {
    throw new Error('not a directory');
  }

  return sourceRoot;
};

const getPackFiles = async (folder: string, signal?: AbortSignal): Promise<Dirent[]> => {
  const entries = await readdir(folder, { withFileTypes: true });
  signal?.throwIfAborted();

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .toSorted((a, b) => a.name.localeCompare(b.name));
};

const importPackFilesInBatches = async (
  files: Dirent[],
  folder: string,
  approvedSourceRoot: string | undefined,
  refreshOnly: boolean,
  result: ImportResult,
  signal?: AbortSignal,
): Promise<void> => {
  for (let offset = 0; offset < files.length; offset += importPreparationBatchSize) {
    signal?.throwIfAborted();
    const batch = files.slice(offset, offset + importPreparationBatchSize);

    // Keep only one bounded batch of source files in memory at a time.
    // oxlint-disable-next-line no-await-in-loop
    const preparations = await Promise.all(
      batch.map(
        async (entry) =>
          await preparePackFile(
            entry.name,
            path.join(folder, entry.name),
            approvedSourceRoot,
            signal,
          ),
      ),
    );

    // Keep SQLite writes serial so duplicate pack versions refresh in filename order.
    // Cancellation is observed between pack writes; an active database transaction finishes.
    signal?.throwIfAborted();

    // oxlint-disable-next-line no-await-in-loop
    const importResults = await preparations.reduce<Promise<FileImportResult[]>>(
      async (pending, preparation) => {
        const results = await pending;
        signal?.throwIfAborted();

        const importResult: FileImportResult =
          preparation.kind === 'error'
            ? { error: preparation.error, kind: 'error' }
            : await storePreparedPack(
                preparation.prepared,
                approvedSourceRoot,
                refreshOnly,
                signal,
              );

        results.push(importResult);

        return results;
      },
      Promise.resolve([]),
    );

    importResults.forEach((importResult) => {
      if (importResult.kind === 'error') {
        result.errors.push(importResult.error);
      } else if (importResult.kind === 'imported') {
        result.imported.push(importResult.packKey);
      } else if (importResult.kind === 'refreshed') {
        result.refreshed.push(importResult.packKey);
      }

      if (importResult.kind === 'unchanged') {
        result.unchanged.push(importResult.packKey);
      }
    });
  }
};

export const importPacksFromFolder = async (options: ImportOptions = {}): Promise<ImportResult> => {
  options.signal?.throwIfAborted();
  const folder = path.resolve(options.folder ?? defaultFolder);
  const imported: string[] = [];
  const refreshed: string[] = [];
  const unchanged: string[] = [];
  const errors: string[] = [];
  let approvedSourceRoot: string | undefined;

  try {
    approvedSourceRoot = await getApprovedSourceRoot(options.approvedSourceRoot, options.signal);
  } catch {
    options.signal?.throwIfAborted();

    return {
      errors: [
        `Approved local source root is not a readable directory: ${options.approvedSourceRoot}`,
      ],
      imported,
      refreshed,
      unchanged,
    };
  }

  let files: Dirent[];

  try {
    files = await getPackFiles(folder, options.signal);
  } catch {
    options.signal?.throwIfAborted();

    return {
      errors: [`Import folder does not exist or cannot be read: ${folder}`],
      imported,
      refreshed,
      unchanged,
    };
  }

  if (files.length === 0) {
    errors.push(`No .json exam packs found in ${folder}.`);
  }

  await importPackFilesInBatches(
    files,
    folder,
    approvedSourceRoot,
    options.refreshOnly ?? false,
    { errors, imported, refreshed, unchanged },
    options.signal,
  );

  return { errors, imported, refreshed, unchanged };
};
