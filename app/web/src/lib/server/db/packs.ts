import { getAppDatabase } from '#lib/server/database/app-database.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import type { ExamPack } from '@learning-platform/exam-pack';

export interface PackIndexItem {
  examId: string;
  examTitle: string;
  examVersion: string;
  packId: string;
  packTitle: string;
  packVersion: string;
  synthetic: boolean;
  questionCount: number;
  domainCount: number;
  domains: { id: string; title: string; weight: number; questionCount: number }[];
  importedAt: string;
}

export interface ImportedSourceAsset {
  questionId: string;
  source: { path: string; label: string };
  excerpt: string;
}

const dbOrApp = (database?: AppDatabase): AppDatabase => database ?? getAppDatabase();

/** Save a pack and its bundled/local source snapshots in one transaction. */
export const saveImportedPack = async (
  database: AppDatabase | undefined,
  pack: ExamPack,
  sourceAssets: ImportedSourceAsset[] = [],
  approvedSourceRoot?: string,
): Promise<void> => {
  const db = dbOrApp(database);
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('imported_packs')
      .values({
        approved_source_root: approvedSourceRoot ?? null,
        content: JSON.stringify(pack),
        exam_id: pack.exam.id,
        imported_at: new Date().toISOString(),
        pack_id: pack.pack.id,
        pack_version: pack.pack.version,
      })
      .execute();

    if (sourceAssets.length > 0) {
      await trx
        .insertInto('saved_source_assets')
        .values(
          sourceAssets.map(({ questionId, source, excerpt }) => ({
            exam_id: pack.exam.id,
            excerpt,
            label: source.label,
            pack_id: pack.pack.id,
            pack_version: pack.pack.version,
            question_id: questionId,
            source_path: source.path,
          })),
        )
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    }
  });
};

/** Refresh only approved file citation snapshots when the stored pack is identical. */
export const refreshApprovedLocalSources = async (
  database: AppDatabase | undefined,
  pack: ExamPack,
  sourceAssets: ImportedSourceAsset[],
  approvedSourceRoot: string,
): Promise<boolean> => {
  const localSourceAssets = sourceAssets.filter(({ source }) => source.path.startsWith('file:'));
  if (localSourceAssets.length === 0) {
    return false;
  }

  return await dbOrApp(database)
    .transaction()
    .execute(async (trx) => {
      const existing = await trx
        .selectFrom('imported_packs')
        .select('content as content')
        .where('exam_id', '=', pack.exam.id)
        .where('pack_id', '=', pack.pack.id)
        .where('pack_version', '=', pack.pack.version)
        .executeTakeFirst();
      if (!existing || JSON.stringify(existing.content) !== JSON.stringify(pack)) {
        return false;
      }

      await trx
        .updateTable('imported_packs')
        .set({ approved_source_root: approvedSourceRoot })
        .where('exam_id', '=', pack.exam.id)
        .where('pack_id', '=', pack.pack.id)
        .where('pack_version', '=', pack.pack.version)
        .execute();
      await trx
        .deleteFrom('saved_source_assets')
        .where('exam_id', '=', pack.exam.id)
        .where('pack_id', '=', pack.pack.id)
        .where('pack_version', '=', pack.pack.version)
        .where('source_path', 'like', 'file:%')
        .execute();

      if (localSourceAssets.length > 0) {
        await trx
          .insertInto('saved_source_assets')
          .values(
            localSourceAssets.map(({ questionId, source, excerpt }) => ({
              exam_id: pack.exam.id,
              excerpt,
              label: source.label,
              pack_id: pack.pack.id,
              pack_version: pack.pack.version,
              question_id: questionId,
              source_path: source.path,
            })),
          )
          .execute();
      }
      return true;
    });
};

/** Read the explicitly approved local source root for an imported pack. */
export const getApprovedSourceRoot = async (
  database: AppDatabase | undefined,
  examId: string,
  packId: string,
  packVersion: string,
): Promise<string | undefined> => {
  const row = await dbOrApp(database)
    .selectFrom('imported_packs')
    .select('approved_source_root')
    .where('exam_id', '=', examId)
    .where('pack_id', '=', packId)
    .where('pack_version', '=', packVersion)
    .executeTakeFirst();
  return row?.approved_source_root ?? undefined;
};

/** List imported packs with display metadata and counts derived from ExamPack JSON. */
export const listImportedPacks = async (database?: AppDatabase): Promise<PackIndexItem[]> => {
  const rows = await dbOrApp(database)
    .selectFrom('imported_packs')
    .select(['content as content', 'imported_at'])
    .orderBy('imported_at', 'desc')
    .execute();

  return rows
    .map(({ content, imported_at }) => ({
      importedAt: imported_at,
      pack: content,
    }))
    .toSorted(
      (a, b) =>
        a.pack.exam.title.localeCompare(b.pack.exam.title) ||
        a.pack.pack.title.localeCompare(b.pack.pack.title) ||
        b.pack.pack.version.localeCompare(a.pack.pack.version),
    )
    .map(({ pack, importedAt }) => ({
      domainCount: pack.domains.length,
      domains: pack.domains.map((domain) => ({
        ...domain,
        questionCount: pack.questions.filter((question) => question.domainId === domain.id).length,
      })),
      examId: pack.exam.id,
      examTitle: pack.exam.title,
      examVersion: pack.exam.version,
      importedAt,
      packId: pack.pack.id,
      packTitle: pack.pack.title,
      packVersion: pack.pack.version,
      questionCount: pack.questions.length,
      synthetic: pack.pack.synthetic,
    }));
};

/** Read one imported pack; the optional database is last to preserve its old argument order. */
export const getImportedPack = async (
  examId: string,
  packId: string,
  packVersion: string,
  database?: AppDatabase,
): Promise<ExamPack | undefined> => {
  const row = await dbOrApp(database)
    .selectFrom('imported_packs')
    .select('content as content')
    .where('exam_id', '=', examId)
    .where('pack_id', '=', packId)
    .where('pack_version', '=', packVersion)
    .executeTakeFirst();
  return row?.content;
};

/** Read a saved citation excerpt. */
export const getImportedSourceAsset = async (
  database: AppDatabase | undefined,
  examId: string,
  packId: string,
  packVersion: string,
  questionId: string,
  sourcePath: string,
): Promise<{ label: string; excerpt: string } | undefined> => {
  const row = await dbOrApp(database)
    .selectFrom('saved_source_assets')
    .select(['label', 'excerpt'])
    .where('exam_id', '=', examId)
    .where('pack_id', '=', packId)
    .where('pack_version', '=', packVersion)
    .where('question_id', '=', questionId)
    .where('source_path', '=', sourcePath)
    .executeTakeFirst();
  return row;
};
