/** CIの初回cacheでも、実Compilerの長い検証を先に開始して末尾待ちを減らす。 */
import { BaseSequencer, type TestSpecification } from 'vitest/node';

const compilerTest =
  /\/tests\/unit\/runtime\/check(?:BoundaryLearning|ConditionalLearning|QuestionInterface|QuizProject|ReusableLearning)\.test\.ts$/u;

export default class CompilerFirstTestSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = await super.sort(files);
    const groups: {
      project: TestSpecification['project'];
      pool: TestSpecification['pool'];
      slots: number[];
      files: TestSpecification[];
    }[] = [];
    ordered.forEach((file, index) => {
      let group = groups.find(
        (entry) => entry.project === file.project && entry.pool === file.pool,
      );
      if (!group) {
        group = { project: file.project, pool: file.pool, slots: [], files: [] };
        groups.push(group);
      }
      group.slots.push(index);
      group.files.push(file);
    });

    const result = [...ordered];
    // 区分が混在しても配置枠を保ち、各区分の既定順を安定した二分割で保持する。
    for (const group of groups) {
      const prioritized = [
        ...group.files.filter((file) => compilerTest.test(file.moduleId)),
        ...group.files.filter((file) => !compilerTest.test(file.moduleId)),
      ];
      group.slots.forEach((slot, index) => {
        result[slot] = prioritized[index]!;
      });
    }
    return result;
  }
}
