/** 公開Course契約の最小成功例を、CompilerとRuntimeのTestで共有する。 */
import type { CourseCatalog, CourseManifest } from '../../src/core/content/types';

export const fixtureCourse: CourseManifest = {
  schemaVersion: 1,
  id: 'html-css',
  title: 'HTML/CSS はじめの一歩',
  description: '最初の見出しを積むFixture Course',
  audience: 'プログラミングを初めて学ぶ人',
  estimatedMinutes: 15,
  revision: '2026-07-10.1',
  runnerId: 'html-css',
  validatorId: 'html-css',
  supportedDevices: {
    exercise: 'desktop',
    study: ['desktop', 'tablet', 'mobile'],
  },
  glossary: [
    {
      id: 'html',
      term: 'HTML',
      definition: 'Webページの意味と構造を表す言語',
      firstSlideId: 'slide-html-role',
      relatedIds: ['element'],
    },
    {
      id: 'element',
      term: '要素',
      definition: 'Tagと内容を合わせたHTMLの構成単位',
      firstSlideId: 'slide-html-role',
      relatedIds: ['html'],
    },
  ],
  concepts: [],
  prerequisites: [],
  publicationStatus: 'published',
  expectedTotals: {
    chapters: 1,
    lessons: 1,
    conceptSlides: 1,
    standardExercises: 1,
    guidedProjectLessons: 0,
    capstoneLessons: 0,
    estimatedMinutes: 15,
  },
  provenanceManifestPath: 'generated/content/courses/html-css.provenance.json',
  progressMigrations: [],
  phases: [
    {
      id: 'first-piece',
      title: '最初のピース',
      description: 'Web制作の入口',
      chapters: [
        {
          id: 'ch00-web-map',
          sequence: 0,
          title: 'Web制作の地図',
          goal: 'HTMLの役割を説明する',
          estimatedMinutes: 15,
          kind: 'standard',
          lessons: [
            {
              id: 'lesson-first-heading',
              kind: 'standard',
              title: '見出しを置く',
              goal: 'h1要素を使う',
              estimatedMinutes: 15,
              prerequisiteLessonIds: [],
              slides: [
                {
                  id: 'slide-html-role',
                  title: 'HTMLは意味を伝える',
                  kind: 'concept',
                  concept: 'HTML',
                  layout: 'code-preview',
                  teachesConceptIds: ['html-element'],
                  masteryTarget: 'read',
                  screenBudget: {
                    maxTextCharacters: 240,
                    maxCodeLines: 8,
                    maxVisuals: 1,
                  },
                  blocks: [
                    {
                      type: 'paragraph',
                      text: 'HTMLはページの意味と構造を表します。',
                    },
                    {
                      type: 'practice',
                      prompt: 'Preview内でページの題名を探します。',
                      expectedAction: 'h1が題名を表すことを指差して確認する',
                      estimatedMinutes: 2,
                    },
                  ],
                  assets: [],
                },
              ],
              exercises: [
                {
                  id: 'exercise-first-heading',
                  kind: 'standard',
                  workspaceId: 'workspace-first-heading',
                  countsTowardStandardExerciseTotal: true,
                  title: 'h1見出しを追加する',
                  instructions: [
                    {
                      type: 'paragraph',
                      text: 'ページにh1見出しを1つ追加します。',
                    },
                  ],
                  requiresConcepts: [{ conceptId: 'html-element', minimumLevel: 'fill' }],
                  scaffoldLevel: 'fill',
                  steps: [
                    {
                      id: 'write-heading',
                      file: 'index.html',
                      target: 'main要素の内側',
                      starterAnchor: '<main></main>',
                      change: 'h1要素を追加する',
                      observe: '見出しがPreviewへ表示される',
                      requiresConceptIds: ['html-element'],
                      validationRuleIds: ['rule-h1-exists'],
                    },
                  ],
                  files: [
                    {
                      path: 'index.html',
                      language: 'html',
                      content: '<main></main>',
                      editable: true,
                    },
                  ],
                  validationRules: [
                    {
                      id: 'rule-h1-exists',
                      label: 'h1見出しがある',
                      required: true,
                      group: 'all',
                      viewportMode: 'all',
                      viewportIds: ['desktop'],
                      target: { kind: 'selector', selector: 'h1' },
                      assertion: { kind: 'exists' },
                      feedback: {
                        target: 'h1見出し',
                        expected: 'ページに1つある',
                        nextAction: 'main要素の中へh1要素を書きます。',
                      },
                      hintId: 'hint-h1-1',
                      relatedSlideId: 'slide-html-role',
                    },
                  ],
                  hints: [
                    {
                      id: 'hint-h1-1',
                      level: 1,
                      title: '見出しのTagを思い出す',
                      text: '一番大きな見出しにはh1を使います。',
                      relatedSlideId: 'slide-html-role',
                    },
                    {
                      id: 'hint-h1-2',
                      level: 2,
                      title: '置く場所を確認する',
                      text: 'main要素の開始Tagと終了Tagの間へ見出しを置きます。',
                      relatedSlideId: 'slide-html-role',
                    },
                    {
                      id: 'hint-h1-3',
                      level: 3,
                      title: 'Tagの形を確認する',
                      text: '開始Tagはh1、終了Tagはスラッシュ付きのh1です。間に見出し文を書きます。',
                      relatedSlideId: 'slide-html-role',
                    },
                  ],
                  relatedSlideIds: ['slide-html-role'],
                  previewViewports: [{ id: 'desktop', width: 1280, height: 720 }],
                  assets: [],
                },
              ],
              reflection: 'HTMLでページの意味を積みました。',
              glossaryRefs: ['html', 'element'],
              completion: {
                kind: 'standard',
                finalSlideId: 'slide-html-role',
                requiredExerciseIds: ['exercise-first-heading'],
              },
            },
          ],
        },
      ],
    },
  ],
};

export const fixtureCatalog: CourseCatalog = {
  schemaVersion: 2,
  courses: [
    {
      id: fixtureCourse.id,
      title: fixtureCourse.title,
      description: fixtureCourse.description,
      audience: fixtureCourse.audience,
      estimatedMinutes: fixtureCourse.estimatedMinutes,
      revision: fixtureCourse.revision,
      publicationStatus: fixtureCourse.publicationStatus,
      manifestPath: 'generated/content/courses/html-css.json',
      manifestSha256: 'a199fa17eb3da55123cf99d5d7234af710d551a6a6d8c90f350251c6b203e3bb',
      lessonStarts: [
        {
          lessonId: 'lesson-first-heading',
          target: { kind: 'slide', targetId: 'slide-html-role' },
        },
      ],
    },
  ],
  learningPaths: [
    {
      id: 'frontend',
      title: 'フロントエンド学習パス',
      description: 'Webページから対話型アプリへ、順番に技術を積み上げます。',
      publicationStatus: 'published',
      steps: [
        {
          courseId: 'html-css',
          role: 'required',
          prerequisiteCourseIds: [],
        },
      ],
    },
  ],
};
