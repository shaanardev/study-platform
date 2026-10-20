import type { JSONColumnType } from 'kysely';

import type { QuestionCorrection } from '#lib/server/feedback/service.js';
import type { ExamPack, PackQuestion } from '@learning-platform/exam-pack';

export interface ImportedPacksTable {
  exam_id: string;
  pack_id: string;
  pack_version: string;
  content: JSONColumnType<ExamPack>;
  approved_source_root: string | null;
  imported_at: string;
}

export interface SavedSourceAssetsTable {
  exam_id: string;
  pack_id: string;
  pack_version: string;
  question_id: string;
  source_path: string;
  label: string;
  excerpt: string;
}

export interface PracticeSessionsTable {
  id: string;
  exam_id: string;
  pack_id: string;
  pack_version: string;
  domain_ids: JSONColumnType<string[]>;
  question_ids: JSONColumnType<string[]>;
  question_snapshot: JSONColumnType<PackQuestion[]>;
  status: 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface PracticeAnswersTable {
  session_id: string;
  question_id: string;
  answer_ids: JSONColumnType<string[]>;
  correct: 0 | 1;
  answered_at: string;
}

export interface MockAttemptsTable {
  id: string;
  exam_id: string;
  pack_id: string;
  pack_version: string;
  question_ids: JSONColumnType<string[]>;
  question_snapshot: JSONColumnType<PackQuestion[]>;
  duration_minutes: number;
  deadline: number;
  status: 'in_progress' | 'submitted' | 'expired';
  created_at: string;
}

export interface MockAnswersTable {
  attempt_id: string;
  question_id: string;
  answer_ids: JSONColumnType<string[]>;
  answered_at: string;
}

export interface QuestionFeedbackTable {
  exam_id: string;
  pack_id: string;
  pack_version: string;
  question_id: string;
  flags: JSONColumnType<{ reason: string }[]>;
  correction: JSONColumnType<QuestionCorrection | null, string | null, string | null>;
  retired: 0 | 1;
  updated_at: string;
}

export interface AppDatabaseSchema {
  imported_packs: ImportedPacksTable;
  saved_source_assets: SavedSourceAssetsTable;
  practice_sessions: PracticeSessionsTable;
  practice_answers: PracticeAnswersTable;
  mock_attempts: MockAttemptsTable;
  mock_answers: MockAnswersTable;
  question_feedback: QuestionFeedbackTable;
}
