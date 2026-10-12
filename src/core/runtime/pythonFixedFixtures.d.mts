import type { PythonLessonProfile } from './pythonLessonProfiles.mjs';

export interface PythonFixedFixture {
  readonly id: string;
  readonly inputLines: readonly string[];
  readonly expectedOutput: string;
}

/** 固定入力・期待値だけを返し、解答Sourceは含めない。 */
export function pythonFixedFixtures(profile: PythonLessonProfile): readonly PythonFixedFixture[];
