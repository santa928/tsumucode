import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const files = [
  'src/features/home/HomePage.tsx',
  'src/features/course/CourseMapPage.tsx',
  'src/features/learning/pages/SlidePage.tsx',
  'src/features/learning/pages/ExercisePage.tsx',
  'src/features/learning/pages/CompletionPage.tsx',
  'src/design-system/components/StackedCard.tsx',
  'src/design-system/components/ActionLink.tsx',
  'src/design-system/components/StatusBadge.tsx',
  'src/design-system/components/PieceProgress.tsx',
  'src/design-system/components/WorkshopNotice.tsx',
] as const;

describe('World-A design token discipline', () => {
  it.each(files)('%sに直接Hex Colorを置かない', async (file) => {
    const source = await readFile(file, 'utf8');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  });
});
