#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BuildPlan, PackRecipe, QuestionDraft } from './types.ts';

function itemAt<T>(items: ArrayLike<T>, index: number): T {
  const value = items[index];
  if (value === undefined) throw new RangeError(`Missing item at index ${index}`);
  return value;
}

// MT19937 seeding, getrandbits, and randbelow match CPython's random.Random.
class PythonRandom {
  mt = new Uint32Array(624);
  index = 624;

  constructor(seed: number | string) {
    Object.assign(this, pythonSeed(seed));
  }

  next32(): number {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i++) {
        const y = (itemAt(this.mt, i) & 0x80000000) | (itemAt(this.mt, (i + 1) % 624) & 0x7fffffff);
        this.mt[i] = itemAt(this.mt, (i + 397) % 624) ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = itemAt(this.mt, this.index++);
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  getrandbits(bits: number): number {
    return this.next32() >>> (32 - bits);
  }

  randbelow(limit: number): number {
    const bits = Math.floor(Math.log2(limit)) + 1;
    let value: number;
    do {
      value = this.getrandbits(bits);
    } while (value >= limit);
    return value;
  }

  shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      [items[i], items[j]] = [itemAt(items, j), itemAt(items, i)];
    }
  }
}

function pythonSeed(seed: number | string): PythonRandom {
  if (typeof seed === 'number' && (!Number.isSafeInteger(seed) || seed < 0)) {
    throw new Error('Numeric seeds must be non-negative safe integers');
  }
  let key: number[];
  if (typeof seed === 'number') {
    key = [seed >>> 0];
  } else {
    const bytes = Buffer.from(seed);
    const combined = Buffer.concat([bytes, createHash('sha512').update(bytes).digest()]);
    let value = BigInt(`0x${combined.toString('hex')}`);
    key = [];
    while (value > 0n) {
      key.push(Number(value & 0xffffffffn));
      value >>= 32n;
    }
  }

  const rng = Object.create(PythonRandom.prototype) as PythonRandom;
  rng.mt = new Uint32Array(624);
  rng.index = 624;
  rng.mt[0] = 19650218;
  for (let i = 1; i < 624; i++) {
    const previous = itemAt(rng.mt, i - 1);
    rng.mt[i] = (Math.imul(1812433253, previous ^ (previous >>> 30)) + i) >>> 0;
  }
  let i = 1;
  let j = 0;
  for (let k = Math.max(624, key.length); k > 0; k--) {
    const current = itemAt(rng.mt, i);
    const previous = itemAt(rng.mt, i - 1);
    rng.mt[i] =
      ((current ^ Math.imul(previous ^ (previous >>> 30), 1664525)) + itemAt(key, j) + j) >>> 0;
    i++;
    j++;
    if (i >= 624) {
      rng.mt[0] = itemAt(rng.mt, 623);
      i = 1;
    }
    if (j >= key.length) j = 0;
  }
  for (let k = 623; k > 0; k--) {
    const current = itemAt(rng.mt, i);
    const previous = itemAt(rng.mt, i - 1);
    rng.mt[i] = ((current ^ Math.imul(previous ^ (previous >>> 30), 1566083941)) - i) >>> 0;
    i++;
    if (i >= 624) {
      rng.mt[0] = itemAt(rng.mt, 623);
      i = 1;
    }
  }
  rng.mt[0] = 0x80000000;
  return rng;
}

function safeRelativePath(path: string, label: string): string {
  if (!path || isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const normalized = normalize(path.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || normalized.startsWith('../')) {
    throw new Error(`${label} must not escape the output directory`);
  }
  return normalized === '.' ? '' : normalized;
}

function validatePlan(plan: BuildPlan): void {
  if (
    !plan.outputFile ||
    plan.outputFile === '.' ||
    plan.outputFile === '..' ||
    plan.outputFile !== plan.outputFile.split(/[\\/]/).at(-1)
  ) {
    throw new Error('outputFile must be a filename, not a path');
  }
  safeRelativePath(plan.assetsDirectory, 'assetsDirectory');
  if (plan.questions.length === 0) throw new Error('A pack must contain at least one question');
  const ids = new Set<string>();
  for (const question of plan.questions) {
    if (question.type !== 'single_choice' && question.type !== 'multiple_choice') {
      throw new Error(`Question ${question.id} has an unsupported type`);
    }
    if (ids.has(question.id)) throw new Error(`Duplicate question ID: ${question.id}`);
    ids.add(question.id);
    if (question.options.length < 2)
      throw new Error(`Question ${question.id} needs at least two options`);
    const optionIds = new Set(question.options.map((option) => option.id));
    const correctIds = new Set(question.correctOptionIds);
    const expectedCorrectCount = question.type === 'single_choice' ? 1 : correctIds.size;
    if (
      optionIds.size !== question.options.length ||
      correctIds.size !== question.correctOptionIds.length ||
      question.correctOptionIds.some((id) => !optionIds.has(id)) ||
      correctIds.size !== expectedCorrectCount ||
      (question.type === 'multiple_choice' && correctIds.size < 2) ||
      correctIds.size >= question.options.length
    ) {
      throw new Error(`Question ${question.id} has invalid options or correct answer IDs`);
    }
  }
}

function shuffleQuestions(plan: BuildPlan): Record<string, unknown>[] {
  const grouped = new Map<string, { question: QuestionDraft; position: number }[]>();
  for (const question of plan.questions) {
    const slotCount = question.options.length - question.correctOptionIds.length + 1;
    const groupKey = `${question.options.length}:${question.correctOptionIds.length}`;
    const group = grouped.get(groupKey) ?? [];
    group.push({ question, position: group.length % slotCount });
    grouped.set(groupKey, group);
  }

  const answerRandom = new PythonRandom(plan.answerSeed);
  for (const group of grouped.values()) {
    const first = itemAt(group, 0).question;
    const slotCount = first.options.length - first.correctOptionIds.length + 1;
    const positions = group.map((_, index) => index % slotCount);
    answerRandom.shuffle(positions);
    for (const [index, item] of group.entries()) item.position = itemAt(positions, index);
  }

  const result = plan.questions.map((question) => {
    const correct = question.correctOptionIds.map((id) => {
      const option = question.options.find((candidate) => candidate.id === id);
      if (!option) throw new Error(`Question ${question.id} is missing correct option ${id}`);
      return option;
    });
    const correctIds = new Set(question.correctOptionIds);
    const wrong = question.options.filter((option) => !correctIds.has(option.id));
    new PythonRandom(question.id).shuffle(wrong);
    const group = grouped.get(`${question.options.length}:${correct.length}`);
    const position = group?.find((item) => item.question === question)?.position;
    if (position === undefined) throw new Error(`No answer position assigned for ${question.id}`);
    const options = [...wrong];
    options.splice(position, 0, ...correct);
    const letters = options.map((option, index) => ({
      id: String.fromCharCode(97 + index),
      text: option.text,
    }));
    const assetsDirectory = safeRelativePath(plan.assetsDirectory, 'assetsDirectory')
      .split(sep)
      .join('/');
    const prefix = assetsDirectory ? `${assetsDirectory}/` : '';
    return {
      id: question.id,
      type: question.type,
      domainId: question.domainId,
      prompt: question.prompt,
      options: letters,
      answerIds: letters.slice(position, position + correct.length).map((option) => option.id),
      explanation: question.explanation,
      sources: question.sources.map((source) => ({
        ...source,
        path: `${prefix}${safeRelativePath(source.path, 'source path').split(sep).join('/')}`,
      })),
    };
  });
  new PythonRandom(plan.orderSeed).shuffle(result);
  return result;
}

async function writeBuild(plan: BuildPlan, output: string): Promise<void> {
  validatePlan(plan);
  const outputRoot = resolve(output);
  const assetsRoot = resolve(outputRoot, safeRelativePath(plan.assetsDirectory, 'assetsDirectory'));
  const pack = { ...plan.metadata, questions: shuffleQuestions(plan) };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, plan.outputFile), `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  for (const artifact of plan.artifacts) {
    const artifactPath = resolve(assetsRoot, safeRelativePath(artifact.path, 'artifact path'));
    if (!artifactPath.startsWith(`${assetsRoot}${sep}`)) {
      throw new Error(`Artifact path escapes assetsDirectory: ${artifact.path}`);
    }
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, artifact.contents);
  }
}

async function main(args: string[]): Promise<void> {
  if (args[0] === '--') args.shift();
  let recipeArgument: string | undefined;
  let materialsArgument: string | undefined;
  let output = resolve('packs/incoming');
  for (let i = 0; i < args.length; i++) {
    const argument = itemAt(args, i);
    const value = args[i + 1];
    if (argument === '--recipe' && value) {
      recipeArgument = value;
      i++;
    } else if (argument === '--materials' && value) {
      materialsArgument = value;
      i++;
    } else if (argument === '--output' && value) {
      output = resolve(value);
      i++;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!recipeArgument)
    throw new Error('Usage: build.ts --recipe <module> [--materials DIR] [--output DIR]');
  const recipePath = resolve(recipeArgument);
  const loaded = (await import(pathToFileURL(recipePath).href)) as { default?: PackRecipe };
  if (!loaded.default || typeof loaded.default.createPlan !== 'function') {
    throw new Error('Recipe module must default-export createPlan({ materials, output })');
  }
  const recipe = loaded.default;
  const materials = materialsArgument
    ? resolve(materialsArgument)
    : recipe.defaultMaterials
      ? resolve(dirname(recipePath), recipe.defaultMaterials)
      : undefined;
  if (!materials) throw new Error('Pass --materials or set defaultMaterials in the recipe module');
  const plan = await recipe.createPlan({ materials, output });
  await writeBuild(plan, output);
  console.log(`Built ${join(output, plan.outputFile)} (${plan.questions.length} questions)`);
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  await main(process.argv.slice(2));
}
