// @vitest-environment node
/** 最小Courseの成功Compile、公開投影、checkOnly、byte決定性を検証する。 */
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseManifestSchema } from '../../src/core/content/schema';
import { compileContent } from './compile';
import { compileCourse, loadAuthoringCourse, stringifyCanonicalJson } from './compileCourse';
import { readSplitCourseArtifacts } from './readSplitCourseArtifacts';

const temporaryRoots: string[] = [];

describe('stringifyCanonicalJson', () => {
  it('公開JSONをkey順を固定した1行へ最小化する', () => {
    expect(stringifyCanonicalJson({ z: 1, a: { y: 2, b: true } })).toBe(
      '{"a":{"b":true,"y":2},"z":1}\n',
    );
  });
});

/** Testごとに隔離した一時Rootを作成する。 */
async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-course-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

/** 親Directoryを作りながらUTF-8 Fixtureを書き込む。 */
async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const target = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

/** Task 4の全公開契約を通る最小Authoring Course treeを作成する。 */
async function writeMinimalCourse(sourceRoot: string): Promise<string> {
  const courseRoot = path.join(sourceRoot, 'html-css');
  const lessonRoot = 'chapters/ch00/lessons/lesson-first';
  const exerciseRoot = `${lessonRoot}/exercises/exercise-first`;
  const files: Readonly<Record<string, string>> = {
    'course.yaml': `schemaVersion: 1
id: html-css
title: HTML CSS
description: 最初の教材
audience: 初心者
estimatedMinutes: 15
revision: "1"
runnerId: html-css
validatorId: html-css
glossarySource: glossary.yaml
conceptsSource: concepts.yaml
supportedDevices:
  exercise: desktop
  study: [desktop, tablet, mobile]
prerequisites: []
publicationStatus: published
expectedTotals:
  chapters: 1
  lessons: 1
  conceptSlides: 1
  standardExercises: 1
  guidedProjectLessons: 0
  capstoneLessons: 0
  estimatedMinutes: 15
provenanceManifestPath: provenance.yaml
progressMigrations: []
phases:
  - id: first
    title: 最初
    description: 最初のPhase
    chapterSources: [chapters/ch00/chapter.yaml]
`,
    'provenance.yaml': `schemaVersion: 1
defaults:
  method: original-authored
  createdAt: "2026-07-13"
  creator: TsumuCode
  sourceUrl: none
  license: project-original
  modified: false
items:
  - id: public-course
    visibility: public
    path: course.yaml
  - id: public-concepts
    visibility: public
    path: concepts.yaml
  - id: public-html-role-art
    visibility: public
    path: ${lessonRoot}/slides/assets/html-role.svg
    method: image-generation
    promptPath: ${lessonRoot}/slides/prompts/html-role.txt
  - id: authoring-solution
    visibility: authoring
    path: ${exerciseRoot}/solution/index.html
  - id: authoring-fixture
    visibility: authoring
    path: ${exerciseRoot}/fixtures/solution.html
`,
    'glossary.yaml': `schemaVersion: 1
entries:
  - id: html
    term: HTML
    definition: ページの構造を表す言語
    firstSlideId: slide-html-role
    relatedIds: []
`,
    'concepts.yaml': `schemaVersion: 1
concepts:
  - id: html-element
    introducedBySlideId: slide-html-role
    prerequisiteConceptIds: []
    minimumProjectLevel: transform
`,
    'chapters/ch00/chapter.yaml': `id: ch00
sequence: 0
title: 最初のChapter
goal: HTMLを理解する
estimatedMinutes: 15
kind: standard
lessonSources: [lessons/lesson-first/lesson.yaml]
`,
    [`${lessonRoot}/lesson.yaml`]: `id: lesson-first
kind: standard
title: 最初のLesson
goal: h1を使う
estimatedMinutes: 15
prerequisiteLessonIds: []
slideSources: [slides/html-role.md]
exerciseSources: [exercises/exercise-first/exercise.yaml]
reflection: h1を積みました
glossaryRefs: [html]
completion:
  kind: standard
  finalSlideId: slide-html-role
  requiredExerciseIds: [exercise-first]
`,
    [`${lessonRoot}/slides/html-role.md`]: `---
id: slide-html-role
title: HTMLの役割
kind: concept
concept: HTML
assets:
  - id: html-role-art
    source: assets/html-role.svg
    mediaType: image
    alt: HTMLの構造図
    provenanceId: public-html-role-art
---
## HTMLの役割
HTMLは構造を表します。

:::practice
prompt: h1を探す
expectedAction: 見出しを確認する
estimatedMinutes: 2
:::
`,
    [`${lessonRoot}/slides/assets/html-role.svg`]:
      '<svg viewBox="0 0 640 360" aria-label="HTMLの構造図"></svg>\n',
    [`${lessonRoot}/slides/prompts/html-role.txt`]: 'HTMLの構造を積み木で表現する\n',
    [`${exerciseRoot}/exercise.yaml`]: `id: exercise-first
kind: standard
workspaceId: workspace-first
countsTowardStandardExerciseTotal: true
title: h1を追加する
instructionsSource: instructions.md
files:
  - path: index.html
    language: html
    source: starter/index.html
    editable: true
solutionFiles:
  - path: index.html
    language: html
    source: solution/index.html
    editable: false
validationRules:
  - id: rule-h1
    label: h1がある
    required: true
    group: all
    viewportMode: all
    viewportIds: [desktop]
    target: { kind: selector, selector: h1 }
    assertion: { kind: exists }
    feedback:
      target: h1
      expected: 1つある
      nextAction: h1を追加する
    hintId: hint-h1-1
    relatedSlideId: slide-html-role
hints:
  - { id: hint-h1-1, level: 1, title: ヒント1, text: Tagを確認する }
  - { id: hint-h1-2, level: 2, title: ヒント2, text: 場所を確認する }
  - { id: hint-h1-3, level: 3, title: ヒント3, text: 形を確認する }
relatedSlideIds: [slide-html-role]
previewViewports:
  - { id: desktop, width: 1280, height: 720 }
assets: []
fixtures:
  - id: solution
    expectedStatus: pass
    files:
      - path: index.html
        language: html
        source: fixtures/solution.html
        editable: false
    expectedFeedbackRuleIds: []
`,
    [`${exerciseRoot}/instructions.md`]: `## 今回の課題
h1見出しを追加します。
`,
    [`${exerciseRoot}/starter/index.html`]: '<main></main>\n',
    [`${exerciseRoot}/solution/index.html`]: '<main><h1>こんにちは</h1></main>\n',
    [`${exerciseRoot}/fixtures/solution.html`]: '<main><h1>こんにちは</h1></main>\n',
  };
  await Promise.all(
    Object.entries(files).map(([relativePath, content]) =>
      writeFixtureFile(courseRoot, relativePath, content),
    ),
  );
  return courseRoot;
}

/** 最小CourseをJavaScript DOM Interaction Scenarioの公開投影Fixtureへ拡張する。 */
async function addInteractionScenarioFixture(courseRoot: string): Promise<void> {
  const exerciseRoot = 'chapters/ch00/lessons/lesson-first/exercises/exercise-first';
  const coursePath = path.join(courseRoot, 'course.yaml');
  const course = await readFile(coursePath, 'utf8');
  await writeFile(
    coursePath,
    course
      .replace('id: html-css', 'id: javascript')
      .replace('runnerId: html-css', 'runnerId: javascript')
      .replace('validatorId: html-css', 'validatorId: javascript'),
    'utf8',
  );

  const provenancePath = path.join(courseRoot, 'provenance.yaml');
  const provenance = await readFile(provenancePath, 'utf8');
  await writeFile(
    provenancePath,
    `${provenance.trimEnd()}
  - id: authoring-script-solution
    visibility: authoring
    path: ${exerciseRoot}/solution/script.js
  - id: authoring-script-fixture
    visibility: authoring
    path: ${exerciseRoot}/fixtures/script.js
`,
    'utf8',
  );

  const exercisePath = path.join(courseRoot, exerciseRoot, 'exercise.yaml');
  const exercise = await readFile(exercisePath, 'utf8');
  const withRuntime = exercise.replace(
    'instructionsSource: instructions.md',
    `instructionsSource: instructions.md
runtime:
  kind: javascript
  entryFile: script.js
  sourceType: script
  capabilityProfile: dom
  primaryOutput: preview
interactionScenarios:
  - id: answer-correctly
    label: 正解を選んで結果を確認する
    actions:
      - { id: choose, kind: click, selector: '#answer' }
    checkpoints:
      - id: result-updated
        afterActionId: choose
        expectations:
          - { id: result-text, kind: selector-text, selector: '#result', equals: 正解 }`,
  );
  const withStarterScript = withRuntime.replace(
    '    source: starter/index.html\n    editable: true\nsolutionFiles:',
    `    source: starter/index.html
    editable: true
  - path: script.js
    language: javascript
    source: starter/script.js
    editable: true
solutionFiles:`,
  );
  const withSolutionScript = withStarterScript.replace(
    '    source: solution/index.html\n    editable: false\nvalidationRules:',
    `    source: solution/index.html
    editable: false
  - path: script.js
    language: javascript
    source: solution/script.js
    editable: false
validationRules:`,
  );
  const withJavaScriptRule = withSolutionScript.replace(
    'hints:\n',
    `  - id: rule-script
    label: JavaScriptが結果を更新する
    required: true
    group: all
    viewportMode: all
    viewportIds: [desktop]
    target: { kind: javascript-source, file: script.js }
    assertion:
      kind: query-selector-text-content-assignment
      selector: '#result'
      expected: 正解
    feedback:
      target: script.js
      expected: 結果を正解へ更新する
      nextAction: 代入する文字列を確認する
    hintId: hint-h1-1
    relatedSlideId: slide-html-role
hints:
`,
  );
  const withFixtureScript = withJavaScriptRule.replace(
    '        source: fixtures/solution.html\n        editable: false\n    expectedFeedbackRuleIds:',
    `        source: fixtures/solution.html
        editable: false
      - path: script.js
        language: javascript
        source: fixtures/script.js
        editable: false
    expectedFeedbackRuleIds:`,
  );
  await writeFile(exercisePath, withFixtureScript, 'utf8');

  await Promise.all([
    writeFixtureFile(
      courseRoot,
      `${exerciseRoot}/starter/script.js`,
      "document.querySelector('#result').textContent = '未回答';\n",
    ),
    writeFixtureFile(
      courseRoot,
      `${exerciseRoot}/solution/script.js`,
      "document.querySelector('#result').textContent = '正解';\n",
    ),
    writeFixtureFile(
      courseRoot,
      `${exerciseRoot}/fixtures/script.js`,
      "document.querySelector('#result').textContent = '正解';\n",
    ),
  ]);
}

/** Directory treeをrelative path順のbyte表現へ読み込む。 */
async function readArtifactTree(
  root: string,
  directory = '',
): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  const absoluteDirectory = path.join(root, directory);
  const entries = (await readdir(absoluteDirectory, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  for (const entry of entries) {
    const relativePath = directory === '' ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      for (const [childPath, content] of await readArtifactTree(root, relativePath)) {
        result.set(childPath, content);
      }
    } else {
      result.set(relativePath, (await readFile(path.join(root, relativePath))).toString('base64'));
    }
  }
  return result;
}

describe('minimal Course compilation', () => {
  it('Interaction ScenarioをAuthoringと公開Runtimeの両方へ投影する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    await addInteractionScenarioFixture(courseRoot);

    const compiled = await loadAuthoringCourse(courseRoot);

    expect(compiled.exercises[0]?.interactionScenarios).toEqual([
      {
        id: 'answer-correctly',
        label: '正解を選んで結果を確認する',
        actions: [{ id: 'choose', kind: 'click', selector: '#answer' }],
        checkpoints: [
          {
            id: 'result-updated',
            afterActionId: 'choose',
            expectations: [
              { id: 'result-text', kind: 'selector-text', selector: '#result', equals: '正解' },
            ],
          },
        ],
      },
    ]);
    expect(
      compiled.runtime.phases[0]?.chapters[0]?.lessons[0]?.exercises[0]?.interactionScenarios,
    ).toEqual(compiled.exercises[0]?.interactionScenarios);
  });

  it('Authoring dataを読みつつ公開Artifactから除外する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'public/generated/content');
    const courseRoot = await writeMinimalCourse(sourceRoot);

    const summary = await compileContent({ sourceRoot, outputRoot, checkOnly: false });
    const publicIndexSource = await readFile(
      path.join(outputRoot, 'courses/html-css/index.json'),
      'utf8',
    );
    const publicProvenance = await readFile(
      path.join(outputRoot, 'courses/html-css/provenance.json'),
      'utf8',
    );
    const authoring = await loadAuthoringCourse(courseRoot);

    expect(summary.courseCount).toBe(1);
    expect(summary.catalog).toMatchObject({
      schemaVersion: 3,
      courses: [
        {
          id: 'html-css',
          lessonStarts: [
            {
              lessonId: 'lesson-first',
              target: { kind: 'slide', targetId: 'slide-html-role' },
            },
          ],
        },
      ],
      learningPaths: [],
    });
    expect(summary.catalog.courses[0]?.indexSha256).toBe(
      createHash('sha256').update(publicIndexSource, 'utf8').digest('hex'),
    );
    const runtime = CourseManifestSchema.parse(
      await readSplitCourseArtifacts(path.join(root, 'public'), 'html-css'),
    );
    const publicCourseSource = stringifyCanonicalJson(runtime);
    expect(runtime.id).toBe('html-css');
    expect(runtime.concepts).toContainEqual({
      id: 'html-element',
      introducedBySlideId: 'slide-html-role',
      prerequisiteConceptIds: [],
      minimumProjectLevel: 'transform',
    });
    expect(runtime.phases[0]?.chapters[0]?.lessons[0]?.slides[0]).toMatchObject({
      layout: 'explanation',
      teachesConceptIds: [],
      masteryTarget: 'seen',
      screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 2 },
      assets: [
        expect.objectContaining({
          id: 'html-role-art',
          intrinsicWidth: 640,
          intrinsicHeight: 360,
        }),
      ],
    });
    expect(runtime.phases[0]?.chapters[0]?.lessons[0]?.exercises[0]).toMatchObject({
      requiresConcepts: [],
      scaffoldLevel: 'seen',
      steps: [],
    });
    expect(authoring.exercises[0]?.solutionFiles[0]?.content).toContain('<h1>');
    expect(authoring.exercises[0]?.fixtures[0]?.id).toBe('solution');
    expect(authoring.masteryDiagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'introduction-slide-does-not-teach',
        conceptId: 'html-element',
      }),
    );
    expect(publicCourseSource).not.toMatch(/solutionFiles|fixtures|authoring-solution/u);
    expect(publicCourseSource).not.toContain('conceptsSource');
    expect(publicProvenance).not.toMatch(/authoring-solution|authoring-fixture|promptPath/u);
    expect(publicProvenance).not.toContain('slides/prompts/html-role.txt');
    expect(publicProvenance).toContain('public-html-role-art');
    await expect(
      readFile(path.join(outputRoot, 'assets/html-css/html-role-art.svg'), 'utf8'),
    ).resolves.toBe('<svg viewBox="0 0 640 360" aria-label="HTMLの構造図"></svg>\n');
    await expect(lstat(`${outputRoot}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('AssetのProvenance ID欠落を拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const slidePath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/html-role.md',
    );
    const slide = await readFile(slidePath, 'utf8');
    await writeFile(
      slidePath,
      slide.replace('provenanceId: public-html-role-art', 'provenanceId: missing-art'),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow('Provenance IDがありません');
  });

  it('画像SVGのviewBoxから安全な寸法を取得できない場合は拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const svgPath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/assets/html-role.svg',
    );
    await writeFile(svgPath, '<svg viewBox="0 0 0 360"></svg>\n', 'utf8');

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      '画像SVGの有効なviewBox寸法を取得できません: html-role-art',
    );
  });

  it('別属性値内のviewBox文字列をSVG寸法として受理しない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const svgPath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/assets/html-role.svg',
    );
    await writeFile(svgPath, `<svg aria-label=' viewBox="0 0 640 360"'></svg>\n`, 'utf8');

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      '画像SVGの有効なviewBox寸法を取得できません: html-role-art',
    );
  });

  it('SVG root開始タグにviewBox属性が重複する場合は拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const svgPath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/assets/html-role.svg',
    );
    await writeFile(svgPath, `<svg viewBox="0 0 640 360" viewBox='0 0 800 450'></svg>\n`, 'utf8');

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      '画像SVGの有効なviewBox寸法を取得できません: html-role-art',
    );
  });

  it.each([
    ['16進数', '0 0 0x280 360'],
    ['2進数', '0 0 0b1010000000 360'],
    ['連続comma', '0,,0,640,360'],
    ['NBSP', '0\u00a00\u00a0640\u00a0360'],
    ['空値', ''],
    ['余剰token', '0 0 640 360 1'],
  ])('SVG文法外の%sをviewBox値として拒否する', async (_label, viewBox) => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const svgPath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/assets/html-role.svg',
    );
    await writeFile(svgPath, `<svg viewBox="${viewBox}"></svg>\n`, 'utf8');

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      '画像SVGの有効なviewBox寸法を取得できません: html-role-art',
    );
  });

  it('SVG numberとcomma-wspの符号・小数・指数を含む正当なviewBoxを受理する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const svgPath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/assets/html-role.svg',
    );
    await writeFile(svgPath, `<svg viewBox=' \t-.5\r\n,+.25 6.4e2,\t3.6E+2 \r\n'></svg>\n`, 'utf8');

    await expect(loadAuthoringCourse(courseRoot)).resolves.toMatchObject({
      runtime: {
        phases: [
          {
            chapters: [
              {
                lessons: [
                  {
                    slides: [
                      {
                        assets: [
                          expect.objectContaining({
                            intrinsicWidth: 640,
                            intrinsicHeight: 360,
                          }),
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it('Structured StepのStarter anchor不整合をCompilerで拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const exercisePath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/exercises/exercise-first/exercise.yaml',
    );
    const exercise = await readFile(exercisePath, 'utf8');
    await writeFile(
      exercisePath,
      exercise.replace(
        'instructionsSource: instructions.md\nfiles:',
        `instructionsSource: instructions.md
requiresConcepts:
  - { conceptId: html-element, minimumLevel: fill }
scaffoldLevel: fill
steps:
  - id: write-heading
    file: index.html
    target: main要素の内側
    starterAnchor: "<!-- missing-anchor -->"
    change: h1要素を追加する
    observe: 見出しがPreviewへ表示される
    requiresConceptIds: [html-element]
    validationRuleIds: [rule-h1]
files:`,
      ),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      /exercise-first.*write-heading.*missing-starter-anchor/u,
    );
  });

  it('Legacy Slide kindを移行用Layoutへ正規化する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const slidePath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/html-role.md',
    );
    const slide = await readFile(slidePath, 'utf8');
    await writeFile(slidePath, slide.replace('kind: concept', 'kind: code'), 'utf8');

    await expect(loadAuthoringCourse(courseRoot)).resolves.toMatchObject({
      runtime: {
        phases: [
          {
            chapters: [
              { lessons: [{ slides: [{ id: 'slide-html-role', layout: 'code-preview' }] }] },
            ],
          },
        ],
      },
    });
  });

  it('明示したSlide Layout契約違反をSource path付きで拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const slidePath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/slides/html-role.md',
    );
    const slide = await readFile(slidePath, 'utf8');
    await writeFile(
      slidePath,
      slide.replace(
        'concept: HTML\nassets:',
        `concept: HTML
layout: code-preview
teachesConceptIds: [html-element]
masteryTarget: read
screenBudget: { maxTextCharacters: 240, maxCodeLines: 8, maxVisuals: 1 }
assets:`,
      ),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      /slides\/html-role\.md.*code-preview.*Code 1件以上/u,
    );
  });

  it('公開Assetからauthoring Provenanceを参照しない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const provenancePath = path.join(courseRoot, 'provenance.yaml');
    const provenance = await readFile(provenancePath, 'utf8');
    await writeFile(
      provenancePath,
      provenance.replace(
        '- id: public-html-role-art\n    visibility: public',
        '- id: public-html-role-art\n    visibility: authoring',
      ),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow('authoring Provenance');
  });

  it('Asset SourceとProvenance pathの不一致を拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const provenancePath = path.join(courseRoot, 'provenance.yaml');
    const provenance = await readFile(provenancePath, 'utf8');
    await writeFile(
      provenancePath,
      provenance.replace(
        'path: chapters/ch00/lessons/lesson-first/slides/assets/html-role.svg',
        'path: chapters/ch00/lessons/lesson-first/slides/prompts/html-role.txt',
      ),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      'Asset SourceとProvenance pathが一致しません',
    );
  });

  it('checkOnlyは既存Artifactを変更しない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'public/generated/content');
    await writeMinimalCourse(sourceRoot);
    await compileContent({ sourceRoot, outputRoot, checkOnly: false });
    const before = await readArtifactTree(outputRoot);

    await compileContent({ sourceRoot, outputRoot, checkOnly: true });

    expect(await readArtifactTree(outputRoot)).toEqual(before);
  });

  it('checkOnlyはOutputが存在しなくても親Directoryやlockを作らない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'public/generated/content');
    await writeMinimalCourse(sourceRoot);

    await compileContent({ sourceRoot, outputRoot, checkOnly: true });

    await expect(lstat(path.join(root, 'public'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(`${outputRoot}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('副作用なしCourse APIとAuthoring APIはSource treeへ書き込まない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const before = await readArtifactTree(courseRoot);

    await compileCourse(courseRoot);
    await loadAuthoringCourse(courseRoot);

    expect(await readArtifactTree(courseRoot)).toEqual(before);
  });

  it('既存Compiler lockを奪わず自動削除もしない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'public/generated/content');
    const lockRoot = `${outputRoot}.lock`;
    await writeMinimalCourse(sourceRoot);
    await mkdir(lockRoot, { recursive: true });
    await writeFixtureFile(lockRoot, 'owner.json', '{"token":"other"}\n');

    await expect(compileContent({ sourceRoot, outputRoot, checkOnly: false })).rejects.toThrow(
      '既存Lockは自動削除しません',
    );
    await expect(readFile(path.join(lockRoot, 'owner.json'), 'utf8')).resolves.toContain('other');
  });

  it('同じSourceを別OutputへCompileしてbyte一致する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const firstOutput = path.join(root, 'first/generated/content');
    const secondOutput = path.join(root, 'second/generated/content');
    await writeMinimalCourse(sourceRoot);

    await compileContent({ sourceRoot, outputRoot: firstOutput, checkOnly: false });
    await compileContent({ sourceRoot, outputRoot: secondOutput, checkOnly: false });

    expect(await readArtifactTree(secondOutput)).toEqual(await readArtifactTree(firstOutput));
  });

  it('Solution／Fixture Fileへauthoring Provenanceを要求する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const provenancePath = path.join(courseRoot, 'provenance.yaml');
    const provenance = await readFile(provenancePath, 'utf8');
    await writeFile(
      provenancePath,
      provenance.replace(
        /[ ]{2}- id: authoring-fixture\n[ ]{4}visibility: authoring\n[ ]{4}path: [^\n]+\n/u,
        '',
      ),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow('authoring Provenance');
  });

  it('未参照位置を含むCourse tree内のsymlinkも拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const outside = path.join(root, 'outside.txt');
    await writeFile(outside, 'secret', 'utf8');
    await symlink(outside, path.join(courseRoot, 'unused-link.txt'));

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow('symlink');
  });

  it('Course tree内の未参照な通常Fileを拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    await writeFixtureFile(courseRoot, 'unused.txt', 'stale\n');

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow('未参照File');
  });

  it('明示した制作Documentを検証し、公開Runtimeへ含めず消費する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const coursePath = path.join(courseRoot, 'course.yaml');
    const provenancePath = path.join(courseRoot, 'provenance.yaml');
    const course = await readFile(coursePath, 'utf8');
    const provenance = await readFile(provenancePath, 'utf8');
    await writeFixtureFile(courseRoot, 'assets/README.md', '# 制作手順\n');
    await writeFile(
      coursePath,
      course.replace(
        'glossarySource: glossary.yaml',
        'glossarySource: glossary.yaml\ndocumentationSources: [assets/README.md]',
      ),
      'utf8',
    );
    await writeFile(
      provenancePath,
      `${provenance}  - id: asset-workflow\n    visibility: public\n    path: assets/README.md\n`,
      'utf8',
    );

    const authoring = await loadAuthoringCourse(courseRoot);

    expect(JSON.stringify(authoring.runtime)).not.toContain('assets/README.md');
  });

  it('明示したCourse級Authoring Sourceを公開Runtimeへ含めず消費する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const coursePath = path.join(courseRoot, 'course.yaml');
    const provenancePath = path.join(courseRoot, 'provenance.yaml');
    const course = await readFile(coursePath, 'utf8');
    const provenance = await readFile(provenancePath, 'utf8');
    await writeFixtureFile(courseRoot, 'performance.yaml', 'schemaVersion: 1\n');
    await writeFile(
      coursePath,
      course.replace(
        'glossarySource: glossary.yaml',
        'glossarySource: glossary.yaml\nauthoringSources: [performance.yaml]',
      ),
      'utf8',
    );
    await writeFile(
      provenancePath,
      `${provenance}  - id: release-performance-budget\n    visibility: authoring\n    path: performance.yaml\n`,
      'utf8',
    );

    const authoring = await loadAuthoringCourse(courseRoot);

    expect(JSON.stringify(authoring.runtime)).not.toContain('performance.yaml');
  });

  it('教材Hierarchyから未参照のProvenance itemを拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const provenancePath = path.join(courseRoot, 'provenance.yaml');
    const provenance = await readFile(provenancePath, 'utf8');
    await writeFixtureFile(courseRoot, 'unused.txt', 'stale\n');
    await writeFile(
      provenancePath,
      `${provenance}  - id: stale-public\n    visibility: public\n    path: unused.txt\n`,
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow(
      'Provenance itemが教材Hierarchyから未参照',
    );
  });

  it('Glossaryをfixtures／solution Directoryから公開しない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const coursePath = path.join(courseRoot, 'course.yaml');
    const course = await readFile(coursePath, 'utf8');
    await writeFixtureFile(
      courseRoot,
      'fixtures/private-glossary.yaml',
      'schemaVersion: 1\nentries: []\n',
    );
    await writeFile(
      coursePath,
      course.replace(
        'glossarySource: glossary.yaml',
        'glossarySource: fixtures/private-glossary.yaml',
      ),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow('公開Source');
  });

  it('Adapter payloadのSource fieldからauthoring pathを公開しない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const coursePath = path.join(courseRoot, 'course.yaml');
    const course = await readFile(coursePath, 'utf8');
    await writeFile(
      coursePath,
      course.replace('validatorId: html-css', 'validatorId: custom-validator'),
      'utf8',
    );
    const exercisePath = path.join(
      courseRoot,
      'chapters/ch00/lessons/lesson-first/exercises/exercise-first/exercise.yaml',
    );
    const exercise = await readFile(exercisePath, 'utf8');
    await writeFile(
      exercisePath,
      exercise.replace(
        'assertion: { kind: exists }',
        'assertion: { kind: custom-validator, source: solution/index.html }',
      ),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).rejects.toThrow('Solution／Fixture path');
  });

  it('教材文言にauthoring Provenance IDが現れても誤検知しない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const courseRoot = await writeMinimalCourse(sourceRoot);
    const coursePath = path.join(courseRoot, 'course.yaml');
    const course = await readFile(coursePath, 'utf8');
    await writeFile(
      coursePath,
      course.replace('title: HTML CSS', 'title: authoring-solutionの読み方'),
      'utf8',
    );

    await expect(loadAuthoringCourse(courseRoot)).resolves.toMatchObject({
      runtime: { title: 'authoring-solutionの読み方' },
    });
  });
});

describe('JavaScript draft Course compilation', () => {
  it('Chapter 00 Fixtureの期待statusを保持しauthoring dataを公開Lessonへ混入させない', async () => {
    const courseRoot = path.resolve('content/javascript');
    const authoring = await loadAuthoringCourse(courseRoot);
    const compilation = await compileCourse(courseRoot);
    const exercise = authoring.exercises.find(({ id }) => id === 'javascript-ch00-l01-e01');
    const runtimeExercise = compilation.runtime.phases[0]?.chapters[0]?.lessons[0]?.exercises.find(
      ({ id }) => id === 'javascript-ch00-l01-e01',
    );

    expect(runtimeExercise?.runtime).toEqual({
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'core',
      primaryOutput: 'preview',
    });

    expect(
      Object.fromEntries(
        (exercise?.fixtures ?? []).map(({ id, expectedStatus }) => [id, expectedStatus]),
      ),
    ).toEqual({
      'html-only': 'incomplete',
      incomplete: 'incomplete',
      pass: 'pass',
      security: 'code-error',
      'syntax-error': 'code-error',
      'system-error': 'system-error',
      timeout: 'system-error',
      'wrong-literal': 'incomplete',
    });
    expect(stringifyCanonicalJson(compilation.runtime)).not.toMatch(
      /solutionFiles|fixtures|wrong-literal|syntax-error/u,
    );
  }, 30_000);
});
