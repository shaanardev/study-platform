export type PackSource = {
  path: string;
  label: string;
  kind?: string;
  section?: string;
  documentationUrls?: string[];
};
export type PackOption = { id: string; text: string };
export type PackQuestion = {
  id: string;
  type: 'single_choice' | 'multiple_choice';
  domainId: string;
  prompt: string;
  options: PackOption[];
  answerIds: string[];
  explanation: string;
  sources: PackSource[];
};
export type ExamPack = {
  schemaVersion: 1;
  exam: { id: string; title: string; version: string };
  pack: { id: string; title: string; version: string; synthetic: boolean };
  domains: { id: string; title: string; weight: number }[];
  passingThreshold?: number;
  questions: PackQuestion[];
};
