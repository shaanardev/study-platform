import sampleLearningPack from '../../../../packs/incoming/sample-learning-pack.json' with { type: 'json' };

export const sampleLearningPackFixture = () => structuredClone(sampleLearningPack);
