/** LearningPath YAMLを安全に走査し、公開Catalog用定義へ変換する。 */
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  LearningPathDefinitionSchema,
  LearningPathStepSchema,
} from '../../src/core/content/schema';
import type { LearningPathDefinition } from '../../src/core/content/types';
import { readYamlFile } from './io';

const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'IDはlower-kebab-caseで指定してください');
const TextSchema = z.string().trim().min(1, '空でない文字列を指定してください');

const LearningPathSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    title: TextSchema,
    description: TextSchema,
    publicationStatus: z.enum(['draft', 'published']),
    steps: z.array(LearningPathStepSchema).min(1),
  })
  .strict()
  .superRefine((source, context) => {
    const courseIds = new Set<string>();
    for (const [index, step] of source.steps.entries()) {
      if (courseIds.has(step.courseId)) {
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'courseId'],
          message: `LearningPathのCourse Stepが重複しています: ${step.courseId}`,
        });
      }
      courseIds.add(step.courseId);
    }
  });

export type LearningPathSource = z.infer<typeof LearningPathSourceSchema>;

/** 存在しない任意Rootだけを空集合として扱い、他のFilesystem失敗は保持する。 */
async function learningPathRootExists(root: string): Promise<boolean> {
  try {
    const stats = await lstat(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('LearningPath RootはsymlinkでないDirectoryである必要があります。');
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** LearningPath Root直下のYAMLをfilename順でstrict検証し公開定義へ投影する。 */
export async function compileLearningPaths(
  learningPathRoot: string,
): Promise<readonly LearningPathDefinition[]> {
  const root = path.resolve(learningPathRoot);
  if (!(await learningPathRootExists(root))) return [];

  const entries = (await readdir(root, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const definitions: LearningPathDefinition[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`LearningPath Sourceにsymlinkは使用できません: ${entry.name}`);
    }
    if (!entry.isFile()) {
      throw new Error(`LearningPath Root直下には通常Fileだけを置けます: ${entry.name}`);
    }
    if (!entry.name.endsWith('.yaml')) {
      throw new Error(`LearningPath Root直下にはYAML Fileだけを置けます: ${entry.name}`);
    }

    const source = await readYamlFile(root, entry.name, LearningPathSourceSchema);
    const filenameId = entry.name.slice(0, -'.yaml'.length);
    if (source.id !== filenameId) {
      throw new Error(
        `LearningPath filenameとIDが一致しません: ${entry.name}/${source.id}`,
      );
    }
    definitions.push(
      LearningPathDefinitionSchema.parse({
        id: source.id,
        title: source.title,
        description: source.description,
        publicationStatus: source.publicationStatus,
        steps: source.steps,
      }),
    );
  }
  return definitions;
}
