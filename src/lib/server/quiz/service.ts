import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import { getImportedPack, getImportedSourceAsset, openPackDatabase } from '../db/packs';
import { getEffectivePack } from '../feedback/service';
import type { PackQuestion } from '../packs/validate';

export type QuizAnswer = {
  questionId: string;
  answerIds: string[];
  correct: boolean;
  answerIdsCorrect: string[];
  explanation: string;
  sources: { path: string; label: string }[];
  answeredAt: string;
};

export type PracticeQuestion = Omit<PackQuestion, 'answerIds'>;

export type PracticeSession = {
  id: string;
  examId: string;
  packId: string;
  packVersion: string;
  domainIds: string[];
  questionIds: string[];
  status: 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
  answers: QuizAnswer[];
  questions: PracticeQuestion[];
};

export type StartPracticeOptions = {
  databasePath?: string;
  examId: string;
  packId: string;
  packVersion: string;
  domainIds?: string[];
  questionCount: number;
  questionIds?: string[];
  random?: () => number;
};

function dbPath(path?: string) {
  return resolve(path ?? '.local/exam-packs.sqlite');
}

function readSession(databasePath: string, id: string): PracticeSession | undefined {
  const database = openPackDatabase(databasePath);
  try {
    const row = database
      .prepare(`
      SELECT id, exam_id AS examId, pack_id AS packId, pack_version AS packVersion,
        domain_ids_json AS domainIds, question_ids_json AS questionIds, status,
        created_at AS createdAt, updated_at AS updatedAt, question_snapshot_json AS questionSnapshot
      FROM practice_sessions WHERE id = ?
    `)
      .get(id);
    if (!row) return undefined;
    const pack = getImportedPack(
      String(row.examId),
      String(row.packId),
      String(row.packVersion),
      databasePath,
    );
    if (!pack) return undefined;
    const sessionQuestions = row['questionSnapshot']
      ? (JSON.parse(String(row['questionSnapshot'])) as PackQuestion[])
      : pack.questions;
    const answers = database
      .prepare(`
      SELECT question_id AS questionId, answer_ids_json AS answerIds, correct,
        answered_at AS answeredAt
      FROM practice_answers WHERE session_id = ? ORDER BY answered_at, rowid
    `)
      .all(id)
      .map((answer) => {
        const questionId = String(answer.questionId);
        const question = sessionQuestions.find((item) => item.id === questionId);
        return {
          questionId,
          answerIds: JSON.parse(String(answer.answerIds)) as string[],
          correct: Boolean(answer.correct),
          answeredAt: String(answer.answeredAt),
          answerIdsCorrect: question?.answerIds ?? [],
          explanation: question?.explanation ?? '',
          sources: question?.sources ?? [],
        };
      });
    const session: Omit<PracticeSession, 'questions'> = {
      id: String(row.id),
      examId: String(row.examId),
      packId: String(row.packId),
      packVersion: String(row.packVersion),
      domainIds: JSON.parse(String(row.domainIds)) as string[],
      questionIds: JSON.parse(String(row.questionIds)) as string[],
      status: String(row.status) as PracticeSession['status'],
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      answers,
    };
    return {
      ...session,
      questions: session.questionIds.flatMap((questionId) => {
        const question = sessionQuestions.find((item) => item.id === questionId);
        if (!question) return [];
        const safeQuestion: PracticeQuestion = {
          id: question.id,
          type: question.type,
          domainId: question.domainId,
          prompt: question.prompt,
          options: question.options,
          explanation: question.explanation,
          sources: question.sources,
        };
        return [safeQuestion];
      }),
    };
  } finally {
    database.close();
  }
}

export function createPracticeSession(options: StartPracticeOptions): PracticeSession {
  const databasePath = dbPath(options.databasePath);
  const importedPack = getImportedPack(
    options.examId,
    options.packId,
    options.packVersion,
    databasePath,
  );
  if (!importedPack) error(404, 'That imported exam pack version is not available.');
  const pack = getEffectivePack(databasePath, importedPack);
  const domainIds = [...new Set(options.domainIds ?? [])];
  if (domainIds.some((id) => !pack.domains.some((domain) => domain.id === id))) {
    error(400, 'Choose domains from this exam pack.');
  }
  if (
    !Number.isInteger(options.questionCount) ||
    options.questionCount < 1 ||
    options.questionCount > 100
  ) {
    error(400, 'Question count must be between 1 and 100.');
  }
  const selectedQuestionIds = options.questionIds ? [...new Set(options.questionIds)] : undefined;
  if (selectedQuestionIds?.some((id) => !pack.questions.some((question) => question.id === id))) {
    error(400, 'Choose questions from this exam pack version.');
  }
  const candidates = pack.questions.filter((question) =>
    selectedQuestionIds
      ? selectedQuestionIds.includes(question.id)
      : domainIds.length === 0 || domainIds.includes(question.domainId),
  );
  if (
    options.questionCount > candidates.length ||
    (selectedQuestionIds && options.questionCount !== selectedQuestionIds.length)
  ) {
    error(400, 'There are not that many questions in the selected domains.');
  }

  const database = openPackDatabase(databasePath);
  try {
    const history = database
      .prepare(`
      SELECT a.question_id AS questionId, MAX(CASE WHEN a.correct = 0 THEN 1 ELSE 0 END) AS missed,
        COUNT(a.question_id) AS seen
      FROM practice_answers a JOIN practice_sessions s ON s.id = a.session_id
      WHERE s.exam_id = ? AND s.pack_id = ? AND s.pack_version = ?
      GROUP BY a.question_id
    `)
      .all(options.examId, options.packId, options.packVersion);
    const states = new Map(
      history.map((row) => [
        String(row.questionId),
        { missed: Boolean(row.missed), seen: Number(row.seen) > 0 },
      ]),
    );
    const random = options.random ?? Math.random;
    const shuffle = (items: PackQuestion[]) => {
      const shuffled = [...items];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        const current = shuffled[index];
        const alternative = shuffled[other];
        if (!current || !alternative) continue;
        shuffled[index] = alternative;
        shuffled[other] = current;
      }
      return shuffled;
    };
    const unseen = shuffle(candidates.filter((question) => !states.get(question.id)?.seen));
    const missed = shuffle(candidates.filter((question) => states.get(question.id)?.missed));
    const otherSeen = shuffle(
      candidates.filter(
        (question) => states.get(question.id)?.seen && !states.get(question.id)?.missed,
      ),
    );
    const questionIds = [...unseen, ...missed, ...otherSeen]
      .slice(0, options.questionCount)
      .map((question) => question.id);
    const id = randomUUID();
    database
      .prepare(`
      INSERT INTO practice_sessions (id, exam_id, pack_id, pack_version, domain_ids_json,
        question_ids_json, status, question_snapshot_json) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?)
    `)
      .run(
        id,
        options.examId,
        options.packId,
        options.packVersion,
        JSON.stringify(domainIds),
        JSON.stringify(questionIds),
        JSON.stringify(pack.questions),
      );
    const created = readSession(databasePath, id);
    if (!created) throw new Error('Could not load the new practice session.');
    return created;
  } finally {
    database.close();
  }
}

export function getPracticeSession(databasePath: string, id: string): PracticeSession | undefined {
  return readSession(dbPath(databasePath), id);
}

export function getResumablePracticeSession(databasePath: string): PracticeSession | undefined {
  const database = openPackDatabase(dbPath(databasePath));
  try {
    const row = database
      .prepare(
        `SELECT id FROM practice_sessions WHERE status = 'in_progress' ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
      )
      .get();
    return row ? readSession(dbPath(databasePath), String(row.id)) : undefined;
  } finally {
    database.close();
  }
}

export function answerQuestion(
  databasePath: string,
  sessionId: string,
  questionId: string,
  answerIds: string[],
): QuizAnswer {
  const session = getPracticeSession(databasePath, sessionId);
  if (!session || session.status !== 'in_progress')
    error(404, 'This practice session is no longer in progress.');
  const question = session.questions.find((item) => item.id === questionId);
  if (!question || session.answers.some((answer) => answer.questionId === questionId))
    error(400, 'That question cannot be answered in this session.');
  const database = openPackDatabase(dbPath(databasePath));
  let questionSnapshot: PackQuestion[] = [];
  try {
    const row = database
      .prepare('SELECT question_snapshot_json AS snapshot FROM practice_sessions WHERE id = ?')
      .get(sessionId);
    questionSnapshot = row?.['snapshot']
      ? (JSON.parse(String(row['snapshot'])) as PackQuestion[])
      : [];
  } finally {
    database.close();
  }
  const correctQuestion =
    questionSnapshot.find((item) => item.id === questionId) ??
    getImportedPack(
      session.examId,
      session.packId,
      session.packVersion,
      dbPath(databasePath),
    )?.questions.find((item) => item.id === questionId);
  if (!correctQuestion) error(404, 'Question not found in the imported pack version.');
  const submitted = [...new Set(answerIds)];
  if (
    submitted.some((id) => !question.options.some((option) => option.id === id)) ||
    submitted.length === 0
  )
    error(400, 'Select a valid answer before continuing.');
  const correct =
    submitted.length === correctQuestion.answerIds.length &&
    correctQuestion.answerIds.every((id) => submitted.includes(id));
  const answerDatabase = openPackDatabase(dbPath(databasePath));
  try {
    answerDatabase.exec('BEGIN');
    answerDatabase
      .prepare(
        `INSERT INTO practice_answers (session_id, question_id, answer_ids_json, correct) VALUES (?, ?, ?, ?) `,
      )
      .run(sessionId, questionId, JSON.stringify(submitted), Number(correct));
    const answerCount = Number(
      answerDatabase
        .prepare('SELECT COUNT(*) AS count FROM practice_answers WHERE session_id = ?')
        .get(sessionId)?.count ?? 0,
    );
    answerDatabase
      .prepare(
        `UPDATE practice_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(answerCount >= session.questionIds.length ? 'completed' : 'in_progress', sessionId);
    answerDatabase.exec('COMMIT');
  } catch (cause) {
    try {
      answerDatabase.exec('ROLLBACK');
    } catch {
      /* preserve the original error */
    }
    throw cause;
  } finally {
    answerDatabase.close();
  }
  return {
    questionId,
    answerIds: submitted,
    correct,
    answerIdsCorrect: correctQuestion.answerIds,
    explanation: correctQuestion.explanation,
    sources: correctQuestion.sources,
    answeredAt: new Date().toISOString(),
  };
}

export async function readQuestionSource(
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
  questionId: string,
  sourcePath: string,
) {
  const pack = getImportedPack(examId, packId, packVersion, dbPath(databasePath));
  const source = pack?.questions
    .find((question) => question.id === questionId)
    ?.sources.find((item) => item.path === sourcePath);
  if (!source) error(404, 'Source excerpt not found.');
  const asset = getImportedSourceAsset(
    dbPath(databasePath),
    examId,
    packId,
    packVersion,
    questionId,
    sourcePath,
  );
  if (!asset) error(404, 'Saved source excerpt is unavailable.');
  return { label: asset.label, text: asset.excerpt };
}
