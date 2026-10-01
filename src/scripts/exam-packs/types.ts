export type PackMetadata = {
  schemaVersion: 1;
  exam: { id: string; title: string; version: string };
  pack: { id: string; title: string; version: string; synthetic: boolean };
  domains: { id: string; title: string; weight: number }[];
};

export type QuestionDraft = {
  id: string;
  type: 'single_choice' | 'multiple_choice';
  domainId: string;
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
  explanation: string;
  sources: { path: string; label: string }[];
};

export type BuildPlan = {
  metadata: PackMetadata;
  outputFile: string;
  assetsDirectory: string;
  answerSeed: number | string;
  orderSeed: number | string;
  questions: QuestionDraft[];
  artifacts: { path: string; contents: string | Uint8Array }[];
};

export type PackRecipe = {
  defaultMaterials?: string;
  createPlan(input: { materials: string; output: string }): Promise<BuildPlan>;
};
