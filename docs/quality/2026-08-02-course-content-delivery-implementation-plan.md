# Course教材分割配信 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TsumuCodeのAuthoring教材と既存進捗契約を維持したまま、公開CourseをIndexとLessonへ分割し、全対象URLのLCPを2,500 ms以下へ戻す。

**Architecture:** compilerで完全検証済み`CourseManifest`を`CourseIndex`とLesson単位Artifactへ決定的に投影し、再結合完全一致とSHA-256を保証する。Runtimeはsingle-flight repositoryからCatalog v3、Index、必要Lessonだけを読み、Course map／migrationはIndex、Slide／Exerciseは現在Lesson、共有workspaceだけは現在工程までの所有Lessonを使う。

**Tech Stack:** React 19.2.7、TypeScript 6.0.3、React Router 8.3.0、Zod 4.4.3、Vite 8.2.0、Vitest 4.1.10、Playwright 1.61.1、Lighthouse CI 0.15.1、GitHub Pages

## Global Constraints

- 実装branchはユーザー指定どおり`main`とし、別worktreeへ移さない。
- 開発・test・build・server・npm操作は`./scripts/docker-compose.sh`経由でDocker内だけで実行する。
- Authoring Course形式、既存URL、全永続ID、IndexedDB store／record key、進捗、下書き、Reset、Review、Libraryを変更しない。
- 旧`generated/content/catalog.json`と`generated/content/courses/<courseId>.json`は公開Artifactへ残さない。
- HomeはCatalog v3だけ、Course mapはIndexまで、Slideは対象Lessonまでを必須取得する。
- Exerciseは対象Lessonと同じworkspaceの現在工程までに必要なLessonだけを追加取得し、別workspaceと未来工程を読まない。
- Catalog v3 gzipは20,480 bytes、Course Indexは40,960 bytes、Lesson Manifestは12,288 bytes、route map追加分は8,192 bytes以下とする。
- Home初期JavaScript gzipは256,000 bytes以下、LCPは4 URL×3 runの全結果で2,500 ms以下、CLSは0.1以下、主要操作は200 ms以下とする。
- Runtime取得はBASE_URL配下・SHA一致・strict契約を必須にし、rejected Promiseをcacheから除いて再試行可能にする。
- 新規または実質改修するmodule、class、functionには意図・前提・副作用が分かる簡潔な日本語docstringを付ける。
- 各内部TaskはRED→GREEN→関連回帰test→日本語commitまで行う。中間commitは公開単位ではないためpushしない。
- 全Taskの受け入れ条件、secret scan、全Gate、公開後確認が合格した時だけmainをpushし、GitHub Pages betaをdeployする。

---

### Task 0: 依存脆弱性0件の基盤を分離コミットする

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.node.json`
- Modify: `tests/vite.config.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/contentLoaders.ts`
- Modify: `src/app/libraryContentLoaders.ts`
- Modify: `src/design-system/components/ActionLink.tsx`
- Modify: `src/features/course/CourseMapPage.tsx`
- Modify: `src/features/course/LearningStepPendingPage.tsx`
- Modify: `src/features/home/ContentErrorPage.tsx`
- Modify: `src/features/home/HomePage.tsx`
- Modify: `src/features/learning/layout/LearningToolRail.tsx`
- Modify: `src/features/learning/pages/CompletionPage.tsx`
- Modify: `src/features/learning/pages/EditableExercisePage.tsx`
- Modify: `src/features/learning/pages/ExercisePage.tsx`
- Modify: `src/features/learning/pages/ReadOnlyExercisePage.tsx`
- Modify: `src/features/learning/pages/ReviewPage.tsx`
- Modify: `src/features/learning/pages/SlidePage.tsx`
- Modify: `src/features/library/LibraryIndexPage.tsx`
- Modify: `src/features/library/LibraryShell.tsx`
- Modify: `src/features/library/LibrarySlidePage.tsx`
- Modify: `src/features/library/LibraryToolRail.tsx`
- Modify: `src/features/paths/LearningPathCard.tsx`
- Modify: `src/features/paths/LearningPathPage.tsx`
- Modify: `src/features/progress/ProgressTransferPanel.tsx`
- Modify: `src/features/progress/WorkspaceLeaseGate.tsx`
- Modify: `src/app/AppShell.test.tsx`
- Modify: `src/app/router.test.tsx`
- Modify: `src/design-system/components/components.test.tsx`
- Modify: `src/features/course/CourseMapPage.test.tsx`
- Modify: `src/features/course/LearningStepPendingPage.test.tsx`
- Modify: `src/features/home/ContentErrorPage.test.tsx`
- Modify: `src/features/home/HomePage.test.tsx`
- Modify: `src/features/learning/pages/LearningRoutes.test.tsx`
- Modify: `src/features/learning/pages/SlidePage.test.tsx`
- Modify: `src/features/library/LibraryIndexPage.test.tsx`
- Modify: `src/features/library/LibraryShell.test.tsx`
- Modify: `src/features/library/LibrarySlidePage.test.tsx`
- Modify: `src/features/paths/LearningPathCard.test.tsx`
- Modify: `src/features/paths/LearningPathPage.test.tsx`
- Modify: `src/features/progress/ProgressTransferPanel.test.tsx`
- Modify: `src/features/progress/WorkspaceLeaseGate.test.tsx`
- Modify: `src/test/renderWithRouter.tsx`
- Test: Router／Page／componentの既存`*.test.tsx`

**Interfaces:**

- Consumes: React Router v7の既存route objectと`RouterProvider`契約
- Produces: `react-router@8.3.0`、`react-router/dom`、Vite 8.2.0、audit 0件のbuild基盤

- [ ] **Step 1: 依存差分が意図したversionだけであることを確認する**

```bash
git diff -- package.json package-lock.json vite.config.ts tsconfig.node.json
```

Expected: `react-router-dom`を削除し`react-router@8.3.0`を追加、Vite 8.2.0、ESLint 10.8.0、`@types/jsdom@28.0.3`が完全一致で記録される。

- [ ] **Step 2: production／全依存の脆弱性が0件であることを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm audit --omit=dev
./scripts/docker-compose.sh run --rm app npm audit
```

Expected: 両方とも`found 0 vulnerabilities`。

- [ ] **Step 3: Router importとVite native loaderの回帰testを実行する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/app/router.test.tsx src/app/AppShell.test.tsx tests/vite.config.test.ts
./scripts/docker-compose.sh run --rm app npm run typecheck
```

Expected: Router警告、HydrateFallback警告、Vite config loader警告がなく全test PASS。

- [ ] **Step 4: 基盤差分だけをcommitする**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.node.json tests/vite.config.test.ts \
  src/app/App.tsx src/app/AppShell.tsx src/app/AppShell.test.tsx \
  src/app/router.tsx src/app/router.test.tsx src/app/contentLoaders.ts \
  src/app/libraryContentLoaders.ts src/design-system/components/ActionLink.tsx \
  src/design-system/components/components.test.tsx \
  src/features/course/CourseMapPage.tsx src/features/course/CourseMapPage.test.tsx \
  src/features/course/LearningStepPendingPage.tsx \
  src/features/course/LearningStepPendingPage.test.tsx \
  src/features/home/ContentErrorPage.tsx src/features/home/ContentErrorPage.test.tsx \
  src/features/home/HomePage.tsx src/features/home/HomePage.test.tsx \
  src/features/learning/layout/LearningToolRail.tsx \
  src/features/learning/pages/CompletionPage.tsx \
  src/features/learning/pages/EditableExercisePage.tsx \
  src/features/learning/pages/ExercisePage.tsx \
  src/features/learning/pages/LearningRoutes.test.tsx \
  src/features/learning/pages/ReadOnlyExercisePage.tsx \
  src/features/learning/pages/ReviewPage.tsx src/features/learning/pages/SlidePage.tsx \
  src/features/learning/pages/SlidePage.test.tsx \
  src/features/library/LibraryIndexPage.tsx src/features/library/LibraryIndexPage.test.tsx \
  src/features/library/LibraryShell.tsx src/features/library/LibraryShell.test.tsx \
  src/features/library/LibrarySlidePage.tsx src/features/library/LibrarySlidePage.test.tsx \
  src/features/library/LibraryToolRail.tsx \
  src/features/paths/LearningPathCard.tsx src/features/paths/LearningPathCard.test.tsx \
  src/features/paths/LearningPathPage.tsx src/features/paths/LearningPathPage.test.tsx \
  src/features/progress/ProgressTransferPanel.tsx \
  src/features/progress/ProgressTransferPanel.test.tsx \
  src/features/progress/WorkspaceLeaseGate.tsx \
  src/features/progress/WorkspaceLeaseGate.test.tsx src/test/renderWithRouter.tsx
git diff --cached --check
git commit -m "保守: 依存関係の脆弱性を解消する"
```

Expected: `scripts/inline-production-css.ts`、同test、`tests/performance/bundle-budget.test.ts`はこのcommitへ含めない。

---

### Task 1: Catalog v3／Course Index／Lesson Manifestの型契約を定義する

**Files:**

- Create: `src/core/content/deliverySchema.ts`
- Create: `src/core/content/deliverySchema.test.ts`
- Modify: `src/core/content/schema.ts`
- Modify: `src/core/content/types.ts`
- Modify: `tests/fixtures/course.ts`

**Interfaces:**

- Consumes: `LessonSchema`、`ContentProgressMigrationSchema`、`CourseManifest`
- Produces: `CourseCatalogV3Schema`、`CourseIndexSchema`、`LessonManifestSchema`、`CourseCatalogV3`、`CourseCatalogEntryV3`、`CourseIndex`、`LessonManifest`、`LessonOutline`

- [ ] **Step 1: exact-keyと識別Unionの失敗testを書く**

```ts
it('Course IndexへLesson本文を混入できない', () => {
  const index = structuredClone(fixtureCourseIndex) as Record<string, unknown>;
  const phases = index.phases as Array<{
    chapters: Array<{ lessons: Array<Record<string, unknown>> }>;
  }>;
  phases[0]!.chapters[0]!.lessons[0]!.blocks = [];
  expect(CourseIndexSchema.safeParse(index).success).toBe(false);
});

it('Lesson ManifestのCourse revision対応を検証する', () => {
  expect(
    LessonManifestSchema.safeParse({
      schemaVersion: 1,
      courseId: fixtureCourse.id,
      courseRevision: fixtureCourse.revision,
      lessonId: fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.id,
      lesson: fixtureCourse.phases[0]!.chapters[0]!.lessons[0],
    }).success,
  ).toBe(true);
});
```

- [ ] **Step 2: testが未定義exportでREDになることを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/core/content/deliverySchema.test.ts
```

Expected: `CourseIndexSchema`または`LessonManifestSchema`が未定義でFAIL。

- [ ] **Step 3: 公開契約を実装する**

```ts
export const RequiredChecklistItemOutlineSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyTextSchema,
    ruleIds: z.array(IdSchema).min(1),
  })
  .strict();

export const SlideKindSchema = z.enum([
  'concept',
  'comparison',
  'diagram',
  'code',
  'reflection',
  'brief',
  'guide',
  'checklist',
]);

export const SlideOutlineSchema = z
  .object({ id: IdSchema, title: NonEmptyTextSchema, kind: SlideKindSchema })
  .strict();

export const ExerciseOutlineSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    workspaceId: IdSchema,
  })
  .strict();

const LessonOutlineBaseShape = {
  id: IdSchema,
  title: NonEmptyTextSchema,
  goal: NonEmptyTextSchema,
  estimatedMinutes: z.number().int().positive(),
  prerequisiteLessonIds: z.array(IdSchema),
  nextLessonId: IdSchema.optional(),
  slides: z.array(SlideOutlineSchema),
  exercises: z.array(ExerciseOutlineSchema).min(1),
  manifestPath: RelativePathSchema,
  manifestSha256: Sha256Schema,
};

export const LessonOutlineSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...LessonOutlineBaseShape,
      kind: z.literal('standard'),
      completion: z
        .object({
          kind: z.literal('standard'),
          finalSlideId: IdSchema,
          requiredExerciseIds: z.array(IdSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...LessonOutlineBaseShape,
      kind: z.literal('guided-project'),
      requiredChecklistItems: z.array(RequiredChecklistItemOutlineSchema),
      completion: z
        .object({
          kind: z.literal('guided-project'),
          requiredChecklistItemIds: z.array(IdSchema).min(1),
          requiredExerciseIds: z.array(IdSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...LessonOutlineBaseShape,
      kind: z.literal('capstone'),
      requiredChecklistItems: z.array(RequiredChecklistItemOutlineSchema),
      completion: z
        .object({
          kind: z.literal('capstone'),
          requiredRuleIds: z.array(IdSchema).min(1),
          requiredViewportIds: z.array(IdSchema).min(1),
        })
        .strict(),
    })
    .strict(),
]);

export const CourseIndexChapterSchema = z
  .object({
    id: IdSchema,
    sequence: z.number().int().nonnegative(),
    title: NonEmptyTextSchema,
    goal: NonEmptyTextSchema,
    estimatedMinutes: z.number().int().positive(),
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    lessons: z.array(LessonOutlineSchema).min(1),
  })
  .strict();

export const CourseIndexPhaseSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    chapters: z.array(CourseIndexChapterSchema).min(1),
  })
  .strict();

export const CourseIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    audience: NonEmptyTextSchema,
    estimatedMinutes: z.number().int().positive(),
    revision: NonEmptyTextSchema,
    runnerId: IdSchema,
    validatorId: IdSchema,
    glossary: z.array(GlossaryEntrySchema),
    concepts: z.array(ConceptDefinitionSchema),
    supportedDevices: SupportedDevicesSchema,
    prerequisites: z.array(IdSchema),
    publicationStatus: z.enum(['draft', 'published']),
    expectedTotals: ExpectedTotalsSchema,
    provenanceManifestPath: RelativePathSchema,
    progressMigrations: z.array(ContentProgressMigrationSchema),
    entityIds: z
      .object({
        chapter: z.array(IdSchema),
        lesson: z.array(IdSchema),
        slide: z.array(IdSchema),
        exercise: z.array(IdSchema),
        rule: z.array(IdSchema),
        hint: z.array(IdSchema),
        checklist: z.array(IdSchema),
        workspace: z.array(IdSchema),
      })
      .strict(),
    phases: z.array(CourseIndexPhaseSchema).min(1),
  })
  .strict();

export const CourseCatalogEntryV3Schema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    audience: NonEmptyTextSchema,
    estimatedMinutes: z.number().int().positive(),
    revision: NonEmptyTextSchema,
    publicationStatus: z.enum(['draft', 'published']),
    indexPath: RelativePathSchema,
    indexSha256: Sha256Schema,
    lessonStarts: z.array(CourseCatalogLessonStartSchema).min(1),
  })
  .strict();

export const CourseCatalogV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    courses: z.array(CourseCatalogEntryV3Schema).min(1),
    learningPaths: z.array(LearningPathDefinitionSchema),
  })
  .strict();

export const LessonManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: IdSchema,
    courseRevision: NonEmptyTextSchema,
    lessonId: IdSchema,
    lesson: LessonSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.lesson.id !== manifest.lessonId) {
      context.addIssue({ code: 'custom', path: ['lessonId'], message: 'Lesson IDが一致しません' });
    }
  });
```

`requiredChecklistItems`は`project.checklist`のうち`required: true`だけを教材順で投影する。`src/core/content/schema.ts`から`IdSchema`、`NonEmptyTextSchema`、`RelativePathSchema`、`ExpectedTotalsSchema`、`SupportedDevicesSchema`など既存契約をexportし、`Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)`を1箇所へ抽出して正規表現や制約を複製しない。全配列は重複ID／path、outline内参照、CatalogのLearningPath公開規則を`superRefine`で既存Courseと同じfail-closed条件にする。

- [ ] **Step 4: 型exportと既存fixtureをCatalog v3へ更新する**

```ts
export type CourseCatalogV3 = z.infer<typeof CourseCatalogV3Schema>;
export type CourseCatalogEntryV3 = z.infer<typeof CourseCatalogEntryV3Schema>;
export type CourseIndex = z.infer<typeof CourseIndexSchema>;
export type LessonManifest = z.infer<typeof LessonManifestSchema>;
export type LessonOutline = z.infer<typeof LessonOutlineSchema>;
```

既存`CourseCatalog`／`CourseCatalogEntry` v2 aliasとSchemaはTask 7の原子的切替まで残す。Task 1〜6の既存build、`loadCourseCatalog`、公開Artifactを変えず、新v3型は明示的な`V3`名だけで参照する。

- [ ] **Step 5: schema testと既存Course schema回帰を通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/core/content/deliverySchema.test.ts src/core/content/schema.test.ts
./scripts/docker-compose.sh run --rm app npm run typecheck
```

Expected: v3 strict keys、重複path／ID、unsafe path、SHA、Lesson対応testと既存Course testがPASS。

- [ ] **Step 6: commitする**

```bash
git add src/core/content/deliverySchema.ts src/core/content/deliverySchema.test.ts src/core/content/schema.ts src/core/content/types.ts tests/fixtures/course.ts
git diff --cached --check
git commit -m "追加: 分割教材の公開契約を定義する"
```

---

### Task 2: Courseを損失なく分割・再結合する純粋compilerを作る

**Files:**

- Create: `scripts/content/splitCourseArtifacts.ts`
- Create: `scripts/content/splitCourseArtifacts.test.ts`
- Test: `scripts/content/compileCourse.test.ts`

**Interfaces:**

- Consumes: `CourseManifest`、`CourseIndexSchema`、`LessonManifestSchema`、`stringifyCanonicalJson`
- Produces: `splitCourseArtifacts(course)`、`reconstructCourseManifest(index, lessons)`、`canonicalSha256(value)`、`SplitCourseArtifacts`

- [ ] **Step 1: 再結合完全一致と決定性の失敗testを書く**

```ts
it('分割Artifactを再結合すると元Courseへ完全一致する', () => {
  const split = splitCourseArtifacts(fixtureCourse);
  expect(reconstructCourseManifest(split.index, split.lessons)).toEqual(fixtureCourse);
  expect(stringifyCanonicalJson(splitCourseArtifacts(fixtureCourse))).toBe(
    stringifyCanonicalJson(splitCourseArtifacts(structuredClone(fixtureCourse))),
  );
});

it('Lesson pathとSHAをCourse ID／Lesson IDから決定的に作る', () => {
  const split = splitCourseArtifacts(fixtureCourse);
  const first = split.index.phases[0]!.chapters[0]!.lessons[0]!;
  expect(first.manifestPath).toBe(
    `generated/content/courses/${fixtureCourse.id}/lessons/${first.id}.json`,
  );
  expect(first.manifestSha256).toMatch(/^[0-9a-f]{64}$/u);
});
```

- [ ] **Step 2: REDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content/splitCourseArtifacts.test.ts
```

Expected: `splitCourseArtifacts`未定義でFAIL。

- [ ] **Step 3: 分割・hash・再結合を実装する**

```ts
export interface SplitCourseArtifacts {
  readonly index: CourseIndex;
  readonly lessons: readonly LessonManifest[];
}

export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(stringifyCanonicalJson(value), 'utf8').digest('hex');
}

export function lessonManifestPath(courseId: string, lessonId: string): string {
  return `generated/content/courses/${courseId}/lessons/${lessonId}.json`;
}
```

`splitCourseArtifacts`は教材順を変えず、Lesson Manifestを先に構築してSHAをoutlineへ記録する。`entityIds`はchapter、lesson、slide、exercise、rule、hint、checklist、workspaceを重複なしの教材順で収集する。`reconstructCourseManifest`は全Lessonが1回ずつ対応することを確認し、outlineだけ／余分なManifest／SHA不一致を拒否して`CourseManifestSchema.parse`へ戻す。

- [ ] **Step 4: tamper／missing／extra／共有workspace順序testを追加する**

```ts
it('同じworkspaceのExercise outlineをCourse教材順で保持する', () => {
  const split = splitCourseArtifacts(fixtureCourse);
  const exercises = split.index.phases.flatMap((phase) =>
    phase.chapters.flatMap((chapter) => chapter.lessons.flatMap((lesson) => lesson.exercises)),
  );
  expect(exercises.map(({ id }) => id)).toEqual(
    fixtureCourse.phases.flatMap((phase) =>
      phase.chapters.flatMap((chapter) =>
        chapter.lessons.flatMap((lesson) => lesson.exercises.map(({ id }) => id)),
      ),
    ),
  );
});
```

- [ ] **Step 5: targeted testを通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content/splitCourseArtifacts.test.ts scripts/content/compileCourse.test.ts
./scripts/docker-compose.sh run --rm app npm run typecheck
```

Expected: 再結合、順序、SHA、tamper、既存compileCourseがPASS。

- [ ] **Step 6: commitする**

```bash
git add scripts/content/splitCourseArtifacts.ts scripts/content/splitCourseArtifacts.test.ts
git diff --cached --check
git commit -m "追加: Course教材をLesson単位へ分割する"
```

---

### Task 3: 分割Artifactのstaging builderを既存公開経路へ追加する

**Files:**

- Create: `scripts/content/splitContentDelivery.ts`
- Create: `scripts/content/splitContentDelivery.test.ts`
- Modify: `src/core/content/lessonStart.ts`
- Modify: `src/core/content/lessonStart.test.ts`
- Test: `scripts/content/compile.test.ts`

**Interfaces:**

- Consumes: `CompiledCourseArtifacts`、`SplitCourseArtifacts`、`CourseCatalogV3Schema`、`resolveInside`
- Produces: `LessonStartSource`、`projectCourseForSplitDelivery(course)`、`createCourseCatalog(indexes, learningPaths)`、`buildSplitContentDelivery(compilations, learningPaths)`、`writeSplitContentDeliveryTree(stagingRoot, delivery)`

- [ ] **Step 1: 非公開staging treeとdraft掲載規則の失敗testを書く**

```ts
it('Catalog v3と分割Course treeだけを指定stagingへ書く', async () => {
  const compilation = await compileCourse(
    path.resolve('tests/fixtures/foundation-content/html-css'),
  );
  const delivery = buildSplitContentDelivery([compilation], []);
  await writeSplitContentDeliveryTree(stagingRoot, delivery);
  await expect(readFile(path.join(stagingRoot, 'catalog-v3.json'), 'utf8')).resolves.toContain(
    '"schemaVersion":3',
  );
  await expect(lstat(path.join(stagingRoot, 'courses/html-css/index.json'))).resolves.toBeDefined();
  await expect(
    lstat(path.join(stagingRoot, 'courses/html-css/lessons/lesson-first-heading.json')),
  ).resolves.toBeDefined();
  await expect(lstat(path.join(stagingRoot, 'catalog.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

it('draft Courseは直リンク用entryを残し公開LearningPathから除外する', () => {
  const draftCourse = CourseManifestSchema.parse({
    ...structuredClone(fixtureCourse),
    id: 'draft-course',
    title: '直接URL検証用Course',
    publicationStatus: 'draft',
  });
  const publishedLearningPath: LearningPathDefinition = {
    id: 'published-path',
    title: '公開Path',
    description: '公開Courseだけを案内します。',
    publicationStatus: 'published',
    steps: [
      {
        courseId: fixtureCourse.id,
        role: 'required',
        prerequisiteCourseIds: [],
      },
    ],
  };
  const catalog = createCourseCatalog(
    [splitCourseArtifacts(fixtureCourse).index, splitCourseArtifacts(draftCourse).index],
    [publishedLearningPath],
  );
  expect(catalog.courses.map(({ id }) => id)).toContain('draft-course');
  expect(
    catalog.learningPaths
      .filter(({ publicationStatus }) => publicationStatus === 'published')
      .flatMap(({ steps }) => steps)
      .some(({ courseId }) => courseId === 'draft-course'),
  ).toBe(false);
});
```

- [ ] **Step 2: REDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content/splitContentDelivery.test.ts
```

Expected: `buildSplitContentDelivery`またはwriterが未定義でFAIL。

- [ ] **Step 3: outline対応Lesson startとdelivery modelを実装する**

```ts
export interface LessonStartSource {
  readonly id: string;
  readonly kind: LessonOutline['kind'];
  readonly slides: readonly Pick<SlideOutline, 'id'>[];
  readonly exercises: readonly Pick<ExerciseOutline, 'id'>[];
}

export function projectCourseForSplitDelivery(course: CourseManifest): CourseManifest {
  return CourseManifestSchema.parse({
    ...course,
    provenanceManifestPath: `generated/content/courses/${course.id}/provenance.json`,
  });
}

export function createCourseCatalog(
  indexes: readonly CourseIndex[],
  learningPaths: readonly LearningPathDefinition[],
): CourseCatalogV3 {
  return CourseCatalogV3Schema.parse({
    schemaVersion: 3,
    courses: indexes
      .map((index) => ({
        id: index.id,
        title: index.title,
        description: index.description,
        audience: index.audience,
        estimatedMinutes: index.estimatedMinutes,
        revision: index.revision,
        publicationStatus: index.publicationStatus,
        indexPath: `generated/content/courses/${index.id}/index.json`,
        indexSha256: canonicalSha256(index),
        lessonStarts: index.phases.flatMap(({ chapters }) =>
          [...chapters]
            .sort((left, right) => left.sequence - right.sequence)
            .flatMap(({ lessons }) =>
              lessons.map((lesson) => ({
                lessonId: lesson.id,
                target: lessonStartTarget(lesson),
              })),
            ),
        ),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    learningPaths,
  });
}
```

`lessonStartTarget`の引数を`LessonStartSource`へ狭め、full Lessonとoutlineの両方が既存と同じ開始targetを返すようにする。

- [ ] **Step 4: staging writerを実装する**

```ts
export interface SplitContentDelivery {
  readonly catalog: CourseCatalogV3;
  readonly courses: readonly {
    readonly compilation: CompiledCourseArtifacts;
    readonly split: SplitCourseArtifacts;
  }[];
}

export function buildSplitContentDelivery(
  compilations: readonly CompiledCourseArtifacts[],
  learningPaths: readonly LearningPathDefinition[],
): SplitContentDelivery {
  const courses = compilations.map((compilation) => ({
    compilation,
    split: splitCourseArtifacts(projectCourseForSplitDelivery(compilation.runtime)),
  }));
  return {
    catalog: createCourseCatalog(
      courses.map(({ split }) => split.index),
      learningPaths,
    ),
    courses,
  };
}
```

`writeSplitContentDeliveryTree`は`resolveInside`だけでstaging配下を解決し、`catalog-v3.json`、`courses/<id>/index.json`、全`lessons/<id>.json`、`provenance.json`、既存Assetをcanonical JSONまたは元bytesで書く。旧`catalog.json`と`courses/<id>.json`は書かない。Directory／Lessonはcanonical ID順、Assetはpath順で決定的に処理する。

- [ ] **Step 5: 新builderと既存公開compilerの回帰を通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content/splitContentDelivery.test.ts src/core/content/lessonStart.test.ts scripts/content/compile.test.ts
./scripts/docker-compose.sh run --rm app npm run typecheck
```

Expected: 新staging treeはv3だけを生成し、既存`compileContent`と現在公開中v2経路はTask 7まで変化せず全test／typecheckがPASS。

- [ ] **Step 6: production未接続を確認する**

```bash
rg -n 'buildSplitContentDelivery|writeSplitContentDeliveryTree' scripts/content/compile.ts index.html src
```

Expected: 新builderをproduction `compile.ts`／HTML／Runtimeがまだ参照せず、中間commitで公開サイトの読込契約を壊さない。

- [ ] **Step 7: commitする**

```bash
git add scripts/content/splitContentDelivery.ts \
  scripts/content/splitContentDelivery.test.ts src/core/content/lessonStart.ts \
  src/core/content/lessonStart.test.ts
git diff --cached --check
git commit -m "追加: 分割教材のstaging builderを作る"
```

---

### Task 4: single-flightのCourseContentRepositoryを実装する

**Files:**

- Create: `src/core/content/CourseContentRepository.ts`
- Create: `src/core/content/CourseContentRepository.test.ts`
- Modify: `src/core/content/runtimeValidation.ts`
- Modify: `src/core/content/loadCourseCatalog.ts`
- Modify: `src/core/content/loadCourseCatalog.test.ts`
- Modify: `src/features/home/ContentErrorPage.tsx`
- Modify: `src/features/home/ContentErrorPage.test.tsx`

**Interfaces:**

- Consumes: Catalog v3／Index／LessonのpathとSHA、`resolvePublicAsset`
- Produces: `CourseContentRepository`、default `courseContentRepository`、`loadCourseCatalogV3`、`loadCourseIndex`、`loadLessonManifest`、status付き`ContentLoadError`

```ts
export interface CourseContentRepositoryContract {
  loadCatalog(baseUrl: string): Promise<CourseCatalogV3>;
  loadCourseIndex(baseUrl: string, entry: CourseCatalogEntryV3): Promise<CourseIndex>;
  loadLesson(baseUrl: string, index: CourseIndex, lessonId: string): Promise<LessonManifest>;
  prefetchLesson(baseUrl: string, index: CourseIndex, lessonId: string): Promise<void>;
}
```

- [ ] **Step 1: single-flight、integrity、retryの失敗testを書く**

```ts
it('同じIndexの同時取得を1 fetchへ集約する', async () => {
  const repository = new CourseContentRepository();
  fetchMock.mockResolvedValueOnce(jsonResponse(indexSource));
  const [first, second] = await Promise.all([
    repository.loadCourseIndex('/', catalogEntry),
    repository.loadCourseIndex('/', catalogEntry),
  ]);
  expect(first).toBe(second);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('失敗Promiseを除去して同じLessonを再試行する', async () => {
  fetchMock
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(jsonResponse(lessonSource));
  await expect(repository.loadLesson('/', index, lessonId)).rejects.toMatchObject({ kind: 'http' });
  await expect(repository.loadLesson('/', index, lessonId)).resolves.toEqual(lessonManifest);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: REDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/core/content/CourseContentRepository.test.ts
```

Expected: class未定義でFAIL。

- [ ] **Step 3: repositoryとstatus付きErrorを実装する**

```ts
export class ContentLoadError extends Error {
  constructor(
    readonly kind: ContentLoadErrorKind,
    readonly resource: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(CONTENT_LOAD_ERROR_MESSAGE, options);
    this.name = 'ContentLoadError';
  }
}

private singleFlight<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const current = this.resources.get(key) as Promise<T> | undefined;
  if (current !== undefined) return current;
  const guarded = operation().catch((error: unknown) => {
    if (this.resources.get(key) === guarded) this.resources.delete(key);
    throw error;
  });
  this.resources.set(key, guarded);
  return guarded;
}
```

Catalogは軽量strict parse、Index／Lessonはbytes取得→SHA-256→UTF-8 JSON→top-level exact keys→ID／revision対応の順に検証する。cache keyは`JSON.stringify([resource, expectedSha256])`とする。`prefetchLesson`は`loadLesson`を再利用し、失敗を呼出側へ返すがrejected cacheは必ず除去する。`loadWorkspaceLessons`はselector完成後のTask 7で追加する。

- [ ] **Step 4: facadeをv3 repositoryへ接続する**

```ts
export const loadCourseCatalogV3 = (baseUrl: string): Promise<CourseCatalogV3> =>
  courseContentRepository.loadCatalog(baseUrl);
export const loadCourseIndex = (
  baseUrl: string,
  entry: CourseCatalogEntryV3,
): Promise<CourseIndex> => courseContentRepository.loadCourseIndex(baseUrl, entry);
export const loadLessonManifest = (
  baseUrl: string,
  index: CourseIndex,
  lessonId: string,
): Promise<LessonManifest> => courseContentRepository.loadLesson(baseUrl, index, lessonId);
```

既存v2の`loadCourseCatalog`／`loadCourseManifest`はTask 7までそのまま残し、現在公開中のappを壊さない。Task 4の新Repositoryはunit testと依存注入経路だけから利用する。

- [ ] **Step 5: 404／410だけにreload CTAを出す**

```tsx
const isRemovedArtifact =
  error instanceof ContentLoadError &&
  error.kind === 'http' &&
  (error.status === 404 || error.status === 410);

{
  isRemovedArtifact ? (
    <button type="button" onClick={() => window.location.reload()}>
      ページを再読み込みして最新版へ更新
    </button>
  ) : null;
}
```

- [ ] **Step 6: repository／Error UI回帰を通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/core/content/CourseContentRepository.test.ts src/core/content/loadCourseCatalog.test.ts src/features/home/ContentErrorPage.test.tsx
./scripts/docker-compose.sh run --rm app npm run typecheck
```

Expected: HTTP status、unsafe path、SHA、malformed UTF-8、JSON、schema、retry、CTA testと既存v2 RuntimeのtypecheckがPASS。

- [ ] **Step 7: commitする**

```bash
git add src/core/content/CourseContentRepository.ts src/core/content/CourseContentRepository.test.ts src/core/content/runtimeValidation.ts src/core/content/loadCourseCatalog.ts src/core/content/loadCourseCatalog.test.ts src/features/home/ContentErrorPage.tsx src/features/home/ContentErrorPage.test.tsx
git diff --cached --check
git commit -m "追加: 分割教材を安全に取得するRepositoryを作る"
```

---

### Task 5: Course Index専用selector／Course map／Library順序を作る

**Files:**

- Modify: `src/core/content/selectors.ts`
- Modify: `src/core/content/selectors.test.ts`
- Test: `src/core/content/lessonStart.test.ts`
- Modify: `src/core/content/courseMap.ts`
- Modify: `src/core/content/courseMap.test.ts`
- Modify: `src/features/library/courseSlideSequence.ts`
- Modify: `src/features/library/courseSlideSequence.test.ts`

**Interfaces:**

- Consumes: `CourseIndex`、`LessonOutline`、`LessonManifest`
- Produces: `findLessonOutline`、`findSlideOwner`、`findExerciseOwner`、`resolveWorkspaceExerciseLocations`、`resolveWorkspaceLessonIds`、構造型`buildCourseMap`、`resolveCourseSlideOutlineContext`

- [ ] **Step 1: 本文なしでCourse navigationを解決する失敗testを書く**

```ts
it('Course IndexだけでSlide所有Lessonと前後順序を返す', () => {
  const owner = findSlideOwner(fixtureCourseIndex, 'slide-html-role');
  expect(owner.lesson.id).toBe('lesson-first-heading');
  const context = resolveCourseSlideOutlineContext(
    fixtureCourseIndex,
    owner.lesson.id,
    'slide-html-role',
  );
  expect(context.current.slide.id).toBe('slide-html-role');
});

it('共有workspaceは現在工程までの所有Lessonだけを返す', () => {
  expect(resolveWorkspaceLessonIds(sharedWorkspaceIndex, 'exercise-step-3')).toEqual([
    'lesson-step-1',
    'lesson-step-2',
    'lesson-step-3',
  ]);
});

it('同じLesson内の未来Exerciseをworkspace対象へ含めない', () => {
  expect(resolveWorkspaceExerciseLocations(sharedWorkspaceIndex, 'exercise-step-3')).toEqual([
    { lessonId: 'lesson-step-1', exerciseId: 'exercise-step-1' },
    { lessonId: 'lesson-step-2', exerciseId: 'exercise-step-2' },
    { lessonId: 'lesson-step-3', exerciseId: 'exercise-step-3' },
  ]);
});
```

- [ ] **Step 2: REDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/core/content/selectors.test.ts src/features/library/courseSlideSequence.test.ts
```

Expected: Index selector未定義または型不一致でFAIL。

- [ ] **Step 3: Index走査を1つの純粋iteratorへ集約する**

```ts
export function courseLessonOutlines(course: CourseIndex): readonly LessonOutline[] {
  return course.phases.flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons));
}

export interface WorkspaceExerciseLocation {
  readonly lessonId: string;
  readonly exerciseId: string;
}

export function resolveWorkspaceExerciseLocations(
  course: CourseIndex,
  currentExerciseId: string,
): readonly WorkspaceExerciseLocation[] {
  const exercises = courseLessonOutlines(course).flatMap((lesson) =>
    lesson.exercises.map((exercise) => ({
      lessonId: lesson.id,
      exerciseId: exercise.id,
      workspaceId: exercise.workspaceId,
    })),
  );
  const currentIndex = exercises.findIndex(({ exerciseId }) => exerciseId === currentExerciseId);
  if (currentIndex < 0) throw new Error(`ExerciseがCourseにありません: ${currentExerciseId}`);
  const workspaceId = exercises[currentIndex]!.workspaceId;
  return exercises
    .slice(0, currentIndex + 1)
    .filter((exercise) => exercise.workspaceId === workspaceId)
    .map(({ lessonId, exerciseId }) => ({ lessonId, exerciseId }));
}

export function resolveWorkspaceLessonIds(
  course: CourseIndex,
  currentExerciseId: string,
): readonly string[] {
  return [
    ...new Set(
      resolveWorkspaceExerciseLocations(course, currentExerciseId).map(({ lessonId }) => lessonId),
    ),
  ];
}
```

- [ ] **Step 4: Course mapとLibrary sequenceをoutline型へ移行する**

Task 3の`lessonStartTarget`契約をそのまま使う。`buildCourseMap`の引数を画面に必要なmetadataだけの`CourseMapSource`へ狭め、full CourseとIndexの両方を受けられる後方互換にする。Libraryには`resolveCourseSlideOutlineContext`を追加し、既存full Course用`resolveCourseSlideContext`はTask 7まで残す。outline contextは本文を返さず、Task 7のloaderが対象LessonからSlide本文を別途渡す。

- [ ] **Step 5: selector回帰を通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/core/content/selectors.test.ts src/core/content/lessonStart.test.ts src/core/content/courseMap.test.ts src/features/library/courseSlideSequence.test.ts
./scripts/docker-compose.sh run --rm app npm run typecheck
```

Expected: unknown／duplicate／empty Slide、開始target、共有workspace順序、Course mapがPASS。

- [ ] **Step 6: commitする**

```bash
git add src/core/content/selectors.ts src/core/content/selectors.test.ts src/core/content/courseMap.ts src/core/content/courseMap.test.ts src/features/library/courseSlideSequence.ts src/features/library/courseSlideSequence.test.ts
git diff --cached --check
git commit -m "変更: Course索引だけで学習順を解決する"
```

---

### Task 6: 進捗・migrationへCourse Index対応を追加する

**Files:**

- Modify: `src/core/learning/completion.ts`
- Modify: `src/core/persistence/progressUpdates.ts`
- Modify: `tests/unit/persistence/progressUpdates.test.ts`
- Modify: `src/core/persistence/contentProgressMigration.ts`
- Modify: `tests/unit/persistence/contentProgressMigration.test.ts`
- Modify: `src/app/catalogProgressMigrations.ts`
- Modify: `src/app/catalogProgressMigrations.test.ts`
- Modify: `src/features/learning/runtimeServices.ts`
- Modify: `src/features/learning/runtimeServices.test.ts`
- Modify: `src/core/persistence/transferService.ts`

**Interfaces:**

- Consumes: `CourseIndex`、現在`Lesson`、`workspaceLessons`
- Produces: `CourseMigrationDescriptor`、`recordSlideViewFromIndex`、`recordDraftMutationFromIndex`、`recordValidationFromIndex`、`findWorkspaceValidationTargets`、`ensureCourseIndex`

- [ ] **Step 1: Index＋必要Lessonだけで既存進捗結果が一致する失敗testを書く**

```ts
it('共有workspaceの現在工程までを同じsnapshotで累積判定する', () => {
  const targets = findWorkspaceValidationTargets(
    fixtureCourseIndex,
    [lessonStep1, lessonStep2, lessonStep3],
    'exercise-step-3',
  );
  expect(targets.map(({ exercise }) => exercise.id)).toEqual([
    'exercise-step-1',
    'exercise-step-2',
    'exercise-step-3',
  ]);
});

it('未来工程または別workspaceをtargetへ含めない', () => {
  const targets = findWorkspaceValidationTargets(
    fixtureCourseIndex,
    [lessonStep1, lessonStep2, lessonStep3, lessonStep4],
    'exercise-step-3',
  );
  expect(targets.map(({ exercise }) => exercise.id)).not.toContain('exercise-step-4');
  expect(targets.map(({ exercise }) => exercise.id)).not.toContain('exercise-other-workspace');
});
```

- [ ] **Step 2: REDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- tests/unit/persistence/progressUpdates.test.ts tests/unit/persistence/contentProgressMigration.test.ts
```

Expected: Index専用更新関数またはmigration descriptorが未定義でFAIL。

- [ ] **Step 3: Progress descriptorを定義して純粋更新を移行する**

```ts
export type CourseMigrationDescriptor = Pick<
  CourseIndex,
  'id' | 'revision' | 'progressMigrations' | 'entityIds'
>;

export function findWorkspaceValidationTargets(
  course: CourseIndex,
  loadedLessons: readonly Lesson[],
  currentExerciseId: string,
): readonly WorkspaceValidationTarget[] {
  const lessonById = new Map(loadedLessons.map((lesson) => [lesson.id, lesson]));
  return resolveWorkspaceExerciseLocations(course, currentExerciseId).map((location) => {
    const lesson = lessonById.get(location.lessonId);
    if (lesson === undefined) {
      throw new Error(`Workspace Lessonが未読込です: ${location.lessonId}`);
    }
    const exercise = lesson.exercises.find(({ id }) => id === location.exerciseId);
    if (exercise === undefined) {
      throw new Error(
        `Workspace Exerciseが未読込です: ${location.lessonId}/${location.exerciseId}`,
      );
    }
    const outline = findLessonOutline(course, location.lessonId);
    const exerciseOutline = outline.exercises.find(({ id }) => id === location.exerciseId);
    if (exerciseOutline?.workspaceId !== exercise.workspaceId) {
      throw new Error(`Workspace対応がIndexとLessonで一致しません: ${location.exerciseId}`);
    }
    return { lesson, exercise };
  });
}
```

`recordSlideViewFromIndex`、`recordDraftMutationFromIndex`、`recordValidationFromIndex`は既存関数と同じrecord key／atomic updateを使い、`assertTargetBelongsToCourse`だけをIndex outlineのLesson／Exercise ID／workspace対応へ差し替える。guided checklist evidenceはIndexの`requiredChecklistItems`を使い、Lesson本文のproject briefへ依存させない。既存full Course版関数はTask 7の原子的切替まで残す。

- [ ] **Step 4: migration registryとTransferをIndexへ変更する**

```ts
registerCourseDescriptor(course: CourseMigrationDescriptor): void;
ensureStoredCourseDescriptor(
  course: CourseMigrationDescriptor,
): Promise<readonly ContentMigrationNotice[]>;
```

`ContentProgressMigrationService`と`TransferService`へdescriptor受付口を追加し、既存`registerCourse(CourseManifest)`はdescriptorへ投影して後方互換を維持する。Catalog revision差分migration用に`loadTransferCourseIndexesFromCatalog`を追加するが、既定`loadTransferCoursesFromCatalog`の置換はTask 7まで行わない。

`LearningRuntimeServices`へ次を追加し、既存`ensureCourse(course)`はTask 7まで残す。

```ts
export interface CourseIndexRuntimeRegistration {
  ensureCourseIndex(index: CourseIndex): Promise<readonly ContentMigrationNotice[]>;
}
```

既存`LearningRuntimeServices`へ`extends CourseIndexRuntimeRegistration`を追加し、他のfield／methodは変更しない。

- [ ] **Step 5: progress／migration／runtime回帰を通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- tests/unit/persistence/progressUpdates.test.ts tests/unit/persistence/contentProgressMigration.test.ts src/app/catalogProgressMigrations.test.ts src/features/learning/runtimeServices.test.ts tests/unit/runtime/runtimeExtensibility.test.tsx
./scripts/docker-compose.sh run --rm app npm run typecheck
```

Expected: record key、atomic save、migration notice、shared workspace batch、Import／Exportが既存期待値のままPASS。

- [ ] **Step 6: commitする**

```bash
git add src/core/learning/completion.ts src/core/persistence/progressUpdates.ts tests/unit/persistence/progressUpdates.test.ts src/core/persistence/contentProgressMigration.ts tests/unit/persistence/contentProgressMigration.test.ts src/app/catalogProgressMigrations.ts src/app/catalogProgressMigrations.test.ts src/features/learning/runtimeServices.ts src/features/learning/runtimeServices.test.ts src/core/persistence/transferService.ts
git diff --cached --check
git commit -m "変更: 進捗処理をCourse索引へ分離する"
```

---

### Task 7: 公開Compiler／Runtime／画面を分割配信へ原子的に切り替える

**Files:**

- Modify: `scripts/content/compile.ts`
- Modify: `scripts/content/compile.test.ts`
- Modify: `scripts/content/checkProvenance.ts`
- Modify: `scripts/content/verifyContentReview.ts`
- Create: `scripts/content/readSplitCourseArtifacts.ts`
- Create: `scripts/content/readSplitCourseArtifacts.test.ts`
- Modify: `scripts/release/releaseHashes.ts`
- Modify: `scripts/release/checkReleaseContinuity.ts`
- Modify: `src/core/content/schema.ts`
- Modify: `src/core/content/schema.test.ts`
- Modify: `src/core/content/types.ts`
- Modify: `src/core/content/runtimeValidation.ts`
- Modify: `src/core/content/loadCourseCatalog.ts`
- Modify: `src/core/content/loadCourseCatalog.test.ts`
- Modify: `src/core/content/CourseContentRepository.ts`
- Modify: `src/core/content/CourseContentRepository.test.ts`
- Modify: `src/app/catalogProgressMigrations.ts`
- Modify: `src/app/catalogProgressMigrations.test.ts`
- Modify: `src/features/learning/runtimeServices.ts`
- Modify: `src/features/learning/runtimeServices.test.ts`
- Modify: `src/app/contentLoaders.ts`
- Modify: `src/app/contentLoaders.test.ts`
- Modify: `src/app/libraryContentLoaders.ts`
- Modify: `src/app/libraryContentLoaders.test.ts`
- Modify: `src/features/course/CourseMapPage.tsx`
- Modify: `src/features/course/CourseMapPage.test.tsx`
- Modify: `src/features/learning/pages/SlidePage.tsx`
- Modify: `src/features/learning/pages/SlidePage.test.tsx`
- Modify: `src/features/learning/pages/ExercisePage.tsx`
- Modify: `src/features/learning/pages/EditableExercisePage.tsx`
- Modify: `src/features/learning/pages/ReadOnlyExercisePage.tsx`
- Modify: `src/features/learning/pages/ReviewPage.tsx`
- Modify: `src/features/learning/pages/CompletionPage.tsx`
- Modify: `src/features/learning/pages/LearningRoutes.test.tsx`
- Modify: `src/features/library/LibraryIndexPage.tsx`
- Modify: `src/features/library/LibraryIndexPage.test.tsx`
- Modify: `src/features/library/LibrarySlidePage.tsx`
- Modify: `src/features/library/LibrarySlidePage.test.tsx`
- Modify: `src/features/paths/LearningPathPage.test.tsx`
- Modify: `src/features/progress/learningPathProgress.test.ts`
- Modify: `src/features/progress/useLearningPathProgress.test.tsx`
- Modify: `src/features/progress/catalogCourseProgress.test.ts`
- Modify: `tests/fixtures/course.ts`
- Modify: `tests/fixtures/runtimeCourse.ts`
- Modify: `tests/content/content-revision-migration.test.ts`
- Modify: `tests/content/html-css-release.test.ts`
- Modify: `tests/content/authorship-quality.test.ts`
- Modify: `tests/content/compileFixture.test.ts`
- Modify: `tests/content/release-continuity.test.ts`
- Modify: `index.html`
- Modify: `tests/metadata.test.ts`
- Modify: `README.md`
- Generate but do not track: `public/generated/content/`

**Interfaces:**

- Consumes: `buildSplitContentDelivery`、`writeSplitContentDeliveryTree`、`courseContentRepository`、Index selector、Index progress APIs
- Produces: production Catalog v3 tree、v3 `CourseCatalog` alias、`CourseContentRepository.loadWorkspaceLessons`、`CourseLoaderData`、`SlideLoaderData`、`ExerciseLoaderData`、`ReviewLoaderData`、`LibrarySlideLoaderData`

- [ ] **Step 1: production Artifactとroute別fetch境界の失敗testを書く**

```ts
it('production compilerはCatalog v3と分割Courseだけをatomic publishする', async () => {
  await compileContent({ sourceRoot, outputRoot, checkOnly: false });
  await expect(readFile(path.join(outputRoot, 'catalog-v3.json'), 'utf8')).resolves.toContain(
    '"schemaVersion":3',
  );
  await expect(lstat(path.join(outputRoot, 'courses/html-css/index.json'))).resolves.toBeDefined();
  await expect(lstat(path.join(outputRoot, 'catalog.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await expect(lstat(path.join(outputRoot, 'courses/html-css.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

it('Course mapはCatalogとIndexだけを読む', async () => {
  const result = await courseLoader({ params: { courseId: fixtureIndex.id } });
  expect(result).toEqual(fixtureIndex);
  expect(content.loadLessonManifest).not.toHaveBeenCalled();
});

it('共有workspace Exerciseは現在工程までの所有Lessonだけを読む', async () => {
  await exerciseLoader({
    params: {
      courseId: fixtureIndex.id,
      lessonId: 'lesson-step-3',
      exerciseId: 'exercise-step-3',
    },
  });
  expect(content.loadLessonManifest.mock.calls.map(([, , lessonId]) => lessonId)).toEqual([
    'lesson-step-1',
    'lesson-step-2',
    'lesson-step-3',
  ]);
});

it('ReviewはExerciseと関連Slideの所有Lessonだけを読みworkspace依存を読まない', async () => {
  await reviewLoader({
    params: {
      courseId: fixtureIndex.id,
      lessonId: 'lesson-step-3',
      exerciseId: 'exercise-step-3',
    },
  });
  expect(content.loadLessonManifest.mock.calls.map(([, , lessonId]) => lessonId)).toEqual([
    'lesson-step-3',
    'lesson-review-slide',
  ]);
});
```

- [ ] **Step 2: REDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content/compile.test.ts src/app/contentLoaders.test.ts src/app/libraryContentLoaders.test.ts
```

Expected: production compilerはv2、loaderはCourse全体Manifestを読むためFAIL。

- [ ] **Step 3: production compilerとv3 Runtime aliasを同じ差分で切り替える**

```ts
export type CourseCatalog = CourseCatalogV3;
export type CourseCatalogEntry = CourseCatalogEntryV3;

export const loadCourseCatalog = (baseUrl: string): Promise<CourseCatalog> =>
  courseContentRepository.loadCatalog(baseUrl);
```

`loadCourseManifest` exportと全参照を削除する。`compileContent`は既存のsource検証、lock、staging、backup、rename、cleanupを維持したまま、staging書込みだけを`buildSplitContentDelivery`＋`writeSplitContentDeliveryTree`へ置換する。`index.html`のCatalog preloadを`%BASE_URL%generated/content/catalog-v3.json`へ変更し、`CourseCatalogSchema`／`CourseCatalogEntrySchema` v2を削除する。`runtimeServices`とCatalog migrationの既定Transfer読込はCatalog v3→全Course Indexだけに切り替え、Lesson Manifestを取得しない。`verifyContentReview`は既定入力を`public/generated/content/`とCourse IDへ変更し、同じ`readSplitCourseArtifacts`で再構成したCourseをReview台帳と照合する。

```ts
export async function readSplitCourseArtifacts(
  publicRoot: string,
  courseId: string,
): Promise<CourseManifest> {
  const index = CourseIndexSchema.parse(
    JSON.parse(
      await readFile(
        resolveInside(publicRoot, `generated/content/courses/${courseId}/index.json`),
        'utf8',
      ),
    ),
  );
  const lessons = await Promise.all(
    courseLessonOutlines(index).map(async ({ manifestPath }) =>
      LessonManifestSchema.parse(
        JSON.parse(await readFile(resolveInside(publicRoot, manifestPath), 'utf8')),
      ),
    ),
  );
  return reconstructCourseManifest(index, lessons);
}
```

実装は各JSONのSHAもIndex値と照合し、unsafe path、欠落、余分Lesson、Course／revision不一致を拒否する。`releaseHashes.calculateArtifactHashes`は再構成Courseのcanonical JSONを`courseHash`へ、`courses/<id>/provenance.json`のbytesを`provenanceHash`へ使う。`checkReleaseContinuity`も`projectCourseForSplitDelivery((await compileCourse(path.join(root, 'content/html-css'))).runtime)`をhashし、CIのCourse hash定義を一致させる。公開Course全体を読んでいたVitestはこのreaderへ移行する。

- [ ] **Step 4: loader data契約を実装する**

```ts
export interface ExerciseLoaderData {
  readonly course: CourseIndex;
  readonly lesson: Lesson;
  readonly exercise: Exercise;
  readonly workspaceLessons: readonly Lesson[];
}

export interface SlideLoaderData {
  readonly course: CourseIndex;
  readonly lesson: Lesson;
  readonly slide: Slide;
}

async loadWorkspaceLessons(
  baseUrl: string,
  index: CourseIndex,
  currentExerciseId: string,
): Promise<readonly LessonManifest[]> {
  const lessonIds = resolveWorkspaceLessonIds(index, currentExerciseId);
  return Promise.all(lessonIds.map((lessonId) => this.loadLesson(baseUrl, index, lessonId)));
}
```

このmethodは`CourseContentRepository` classへ追加する。`courseLoader`はCatalog entry→Index→`ensureCourseIndex`、`slideLoader`は所有Lesson、`exerciseLoader`は`loadWorkspaceLessons`を使う。`reviewLoader`はworkspace依存を読まず、related Slide所有Lessonだけを追加する。Exercise所有LessonとSlide所有Lessonが同一ならrepositoryのsingle-flightで1 fetchにし、loader dataでもLessonを1件だけ保持する。

- [ ] **Step 5: Page propsと進捗呼出をIndexへ移行する**

Course title、glossary、expectedTotals、Course mapはIndexから読む。現在Slide／Exercise本文はLessonから読む。`SlidePage`は`recordSlideViewFromIndex`、演習画面は`recordDraftMutationFromIndex`／`recordValidationFromIndex`を使う。`EditableExercisePage`は`workspaceLessons`を`findWorkspaceValidationTargets`へ渡す。Libraryの前後labelはoutline、現在のblocksはLesson本文のSlideを使う。

- [ ] **Step 6: compiler／loader／Page／進捗の統合回帰を通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content/compile.test.ts scripts/content/splitContentDelivery.test.ts scripts/content/readSplitCourseArtifacts.test.ts src/core/content/schema.test.ts src/core/content/CourseContentRepository.test.ts src/core/content/loadCourseCatalog.test.ts src/app/contentLoaders.test.ts src/app/libraryContentLoaders.test.ts src/app/catalogProgressMigrations.test.ts src/features/learning/runtimeServices.test.ts src/features/course/CourseMapPage.test.tsx src/features/learning/pages/LearningRoutes.test.tsx src/features/learning/pages/SlidePage.test.tsx src/features/library/LibraryIndexPage.test.tsx src/features/library/LibrarySlidePage.test.tsx tests/unit/persistence/progressUpdates.test.ts tests/content/content-revision-migration.test.ts tests/content/html-css-release.test.ts tests/content/authorship-quality.test.ts tests/content/compileFixture.test.ts tests/content/release-continuity.test.ts tests/metadata.test.ts
./scripts/docker-compose.sh run --rm app npm run content:compile
./scripts/docker-compose.sh run --rm app npm run content:review
./scripts/docker-compose.sh run --rm app npm run check
```

Expected: atomic recovery、route 404、Review、mobile read-only、Course map、Library、進捗record key、production buildがPASSし、生成先はv3だけになる。

- [ ] **Step 7: 旧Runtime／Artifact参照を除去確認する**

```bash
rg -n 'generated/content/catalog\.json|generated/content/courses/[^/]+\.json|CourseCatalogEntrySchema|loadCourseManifest' index.html README.md scripts src --glob '!*.test.ts' --glob '!*.test.tsx'
```

Expected: production sourceにv2公開path／Schema／loader参照がない。E2E／performance／旧Artifact不在testの文字列はTask 9で移行または否定assertへ限定する。

- [ ] **Step 8: commitする**

```bash
git add scripts/content/compile.ts scripts/content/compile.test.ts \
  scripts/content/checkProvenance.ts scripts/content/verifyContentReview.ts \
  scripts/content/readSplitCourseArtifacts.ts \
  scripts/content/readSplitCourseArtifacts.test.ts scripts/release/releaseHashes.ts \
  scripts/release/checkReleaseContinuity.ts src/core/content/schema.ts \
  src/core/content/schema.test.ts src/core/content/types.ts \
  src/core/content/runtimeValidation.ts src/core/content/loadCourseCatalog.ts \
  src/core/content/loadCourseCatalog.test.ts \
  src/core/content/CourseContentRepository.ts \
  src/core/content/CourseContentRepository.test.ts \
  src/app/catalogProgressMigrations.ts src/app/catalogProgressMigrations.test.ts \
  src/features/learning/runtimeServices.ts \
  src/features/learning/runtimeServices.test.ts src/app/contentLoaders.ts \
  src/app/contentLoaders.test.ts src/app/libraryContentLoaders.ts \
  src/app/libraryContentLoaders.test.ts src/features/course/CourseMapPage.tsx \
  src/features/course/CourseMapPage.test.tsx src/features/learning/pages/SlidePage.tsx \
  src/features/learning/pages/SlidePage.test.tsx \
  src/features/learning/pages/ExercisePage.tsx \
  src/features/learning/pages/EditableExercisePage.tsx \
  src/features/learning/pages/ReadOnlyExercisePage.tsx \
  src/features/learning/pages/ReviewPage.tsx \
  src/features/learning/pages/CompletionPage.tsx \
  src/features/learning/pages/LearningRoutes.test.tsx \
  src/features/library/LibraryIndexPage.tsx \
  src/features/library/LibraryIndexPage.test.tsx \
  src/features/library/LibrarySlidePage.tsx \
  src/features/library/LibrarySlidePage.test.tsx \
  src/features/paths/LearningPathPage.test.tsx \
  src/features/progress/learningPathProgress.test.ts \
  src/features/progress/useLearningPathProgress.test.tsx \
  src/features/progress/catalogCourseProgress.test.ts tests/fixtures/course.ts \
  tests/fixtures/runtimeCourse.ts tests/content/content-revision-migration.test.ts \
  tests/content/html-css-release.test.ts tests/content/authorship-quality.test.ts \
  tests/content/compileFixture.test.ts tests/content/release-continuity.test.ts \
  index.html tests/metadata.test.ts README.md
git diff --cached --check
git commit -m "変更: 公開教材をLesson分割配信へ切り替える"
```

`public/generated/content/`は`.gitignore`対象でありcommitへ含めない。このTaskの全差分とbuildが揃うまでcommitせず、v2 compilerとv3 Runtimeが混在する中間commitを作らない。

---

### Task 8: route-aware preloadと隣接Lesson prefetchを実装する

**Files:**

- Modify: `scripts/inline-production-css.ts`
- Modify: `scripts/inline-production-css.test.ts`
- Create: `src/core/content/lessonPrefetch.ts`
- Create: `src/core/content/lessonPrefetch.test.ts`
- Create: `src/features/learning/useAdjacentLessonPrefetch.ts`
- Create: `src/features/learning/useAdjacentLessonPrefetch.test.tsx`
- Modify: `src/features/learning/pages/SlidePage.tsx`
- Modify: `src/features/learning/pages/EditableExercisePage.tsx`
- Modify: `src/features/learning/pages/ReadOnlyExercisePage.tsx`
- Modify: `src/features/library/LibrarySlidePage.tsx`
- Modify: `tests/performance/bundle-budget.test.ts`

**Interfaces:**

- Consumes: production Catalog v3／Index route map、`courseContentRepository.prefetchLesson`
- Produces: `data-tsumucode-course-index-preload`、`data-tsumucode-lesson-preload`、`adjacentLessonIds(course, lessonId)`、`scheduleAdjacentLessonPrefetch(input): Promise<void>`、`useAdjacentLessonPrefetch`

- [ ] **Step 1: Home／Course／Lesson／unknown hashのRED testを書く**

```ts
it.each([
  ['#/', 0, 0],
  ['#/courses/html-css', 1, 0],
  ['#/courses/html-css/lessons/html-css-ch01-l01/slides/html-css-ch01-l01-s01', 1, 1],
  ['#/courses/unknown', 0, 0],
])('%s はIndex %i件、Lesson %i件だけ先読みする', async (hash, indexCount, lessonCount) => {
  const document = await executeProductionBootstrap(hash);
  expect(document.querySelectorAll('[data-tsumucode-course-index-preload]')).toHaveLength(
    indexCount,
  );
  expect(document.querySelectorAll('[data-tsumucode-lesson-preload]')).toHaveLength(lessonCount);
});
```

- [ ] **Step 2: REDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/inline-production-css.test.ts
```

Expected: 現在のCourse全体preload属性またはpath不一致でFAIL。

- [ ] **Step 3: compiler由来route mapだけをbootstrapへ埋め込む**

```ts
interface CoursePreloadRoute {
  readonly courseId: string;
  readonly indexPath: string;
  readonly lessons: Readonly<Record<string, string>>;
}
```

bootstrapはCourse／Library hashをexact regexで照合し、route mapに存在するIDだけをpreloadする。Home、unknown、`constructor`、uppercase、encoded slashで0件にする。全pathは`assertRegularDistFile`と`resolvePublicAsset`でbuild時に検証する。現行の全Course JSON preload実装とtestは削除する。

- [ ] **Step 4: visible／idle／Save-Data対応schedulerのRED testを書く**

```ts
it('visibleな画面だけ前後1 Lessonを最大2件prefetchする', async () => {
  scheduleAdjacentLessonPrefetch({
    course: fixtureCourseIndex,
    lessonId: 'lesson-middle',
    visibilityState: 'visible',
    saveData: false,
    schedule: (task) => task(),
    prefetch,
  });
  expect(prefetch.mock.calls.map(([lessonId]) => lessonId)).toEqual([
    'lesson-before',
    'lesson-after',
  ]);
});

it('任意prefetch失敗は画面処理へ伝播せず実移動時の再取得を許す', async () => {
  prefetch.mockRejectedValueOnce(new TypeError('offline'));
  const scheduled = scheduleAdjacentLessonPrefetch({
    course: fixtureCourseIndex,
    lessonId: 'lesson-middle',
    visibilityState: 'visible',
    saveData: false,
    schedule: (task) => task(),
    prefetch,
  });
  await expect(scheduled).resolves.toBeUndefined();
  await expect(
    courseContentRepository.loadLesson('/', fixtureCourseIndex, 'lesson-before'),
  ).resolves.toEqual(lessonBeforeManifest);
});
```

- [ ] **Step 5: pure schedulerとReact hookを実装する**

`scheduleAdjacentLessonPrefetch`は前後IDを重複排除し、hiddenまたは`saveData === true`なら0件、visibleなら最大2件を呼ぶ。各`prefetch`を`Promise.allSettled`で待ち、任意取得の失敗を現在画面へthrowしない。Repository側のrejected cache除去は維持するため、実移動時の`loadLesson`は通常取得を再試行する。hookは`requestIdleCallback(..., { timeout: 1500 })`、非対応時`setTimeout(..., 500)`を使い、unmount時にcancelする。

```ts
export interface AdjacentLessonPrefetchInput {
  readonly course: CourseIndex;
  readonly lessonId: string;
  readonly visibilityState: DocumentVisibilityState;
  readonly saveData: boolean;
  readonly schedule: (task: () => Promise<void>) => Promise<void>;
  readonly prefetch: (lessonId: string) => Promise<void>;
}

/** Course表示順で現在Lessonの直前・直後を返し、現在または不明IDは含めない。 */
export function adjacentLessonIds(course: CourseIndex, lessonId: string): readonly string[] {
  const ids = courseLessonOutlines(course).map(({ id }) => id);
  const current = ids.indexOf(lessonId);
  if (current < 0) return [];
  return [ids[current - 1], ids[current + 1]].filter(
    (candidate): candidate is string => candidate !== undefined,
  );
}

export async function scheduleAdjacentLessonPrefetch(
  input: AdjacentLessonPrefetchInput,
): Promise<void> {
  if (input.visibilityState !== 'visible' || input.saveData) return;
  const lessonIds = adjacentLessonIds(input.course, input.lessonId).slice(0, 2);
  await input.schedule(async () => {
    await Promise.allSettled(lessonIds.map((lessonId) => input.prefetch(lessonId)));
  });
}
```

- [ ] **Step 6: preload／prefetch／bundle回帰を通す**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/inline-production-css.test.ts src/core/content/lessonPrefetch.test.ts src/features/learning/useAdjacentLessonPrefetch.test.tsx
./scripts/docker-compose.sh run --rm app npm run build
./scripts/docker-compose.sh run --rm app npx vitest run --config vitest.bundle.config.ts tests/performance/bundle-budget.test.ts
```

Expected: Home 0、Course Index 1、Lesson Index＋Lesson各1、unknown 0、route map gzip 8,192 bytes以下、Home JS budget PASS。

- [ ] **Step 7: commitする**

```bash
git add scripts/inline-production-css.ts scripts/inline-production-css.test.ts src/core/content/lessonPrefetch.ts src/core/content/lessonPrefetch.test.ts src/features/learning/useAdjacentLessonPrefetch.ts src/features/learning/useAdjacentLessonPrefetch.test.tsx src/features/learning/pages/SlidePage.tsx src/features/learning/pages/EditableExercisePage.tsx src/features/learning/pages/ReadOnlyExercisePage.tsx src/features/library/LibrarySlidePage.tsx tests/performance/bundle-budget.test.ts
git diff --cached --check
git commit -m "改善: 現在Lessonを優先して先読みする"
```

---

### Task 9: Artifact／network／Lighthouse品質Gateを固定する

**Files:**

- Modify: `content/html-css/performance.yaml`
- Modify: `tests/performance/manifest.ts`
- Modify: `tests/performance/manifest.test.ts`
- Modify: `tests/performance/bundle-budget.test.ts`
- Modify: `tests/e2e/network-contract.spec.ts`
- Modify: `tests/e2e/runtime-learning-flow.spec.ts`
- Modify: `tests/e2e/slide-library.spec.ts`
- Modify: `tests/e2e/helpers/progress.ts`
- Modify: `tests/e2e/runtime-persistence.spec.ts`
- Modify: `tests/e2e/course-fixtures.spec.ts`
- Modify: `tests/e2e/responsive-layout.spec.ts`
- Modify: `tests/e2e/visual-regression.spec.ts`
- Modify: `tests/e2e/learning-path.spec.ts`
- Modify: `tests/performance/preview-validation.spec.ts`
- Modify: `scripts/release/checkStaticArtifact.ts`
- Modify: `tests/content/static-artifact.test.ts`
- Modify: `scripts/smoke-subpath.ts`
- Modify: `scripts/smoke-subpath.test.ts`
- Modify: `docs/quality/2026-08-02-course-content-delivery-design.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: production `dist`、Playwright request log、Lighthouse report
- Produces: Catalog／Index／Lesson／route map容量Gate、route別fetch Gate、旧Artifact不在Gate

- [ ] **Step 1: 容量予算schemaと失敗testを追加する**

```ts
content: z.object({
  catalogGzipMaxBytes: z.literal(20_480),
  courseIndexGzipMaxBytes: z.literal(40_960),
  lessonManifestGzipMaxBytes: z.literal(12_288),
  routeMapAddedGzipMaxBytes: z.literal(8_192),
  singleImageMaxBytes: PositiveInteger,
  totalImagesMaxBytes: PositiveInteger,
  singleFontMaxBytes: PositiveInteger,
  totalFontsMaxBytes: PositiveInteger,
  authoringFieldsForbidden: z.array(z.string().min(1)).min(1),
});
```

- [ ] **Step 2: build前のREDを確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- tests/performance/manifest.test.ts
```

Expected: performance YAMLに新fieldがなくFAIL。

- [ ] **Step 3: YAMLとbundle budgetを新Artifactへ移行する**

`bundle-budget.test.ts`は全Index／Lessonを列挙し、各gzip上限、旧Artifact不在、authoring field不在を検証する。Course全体Manifestの旧予算は削除する。

E2E／performance fixtureがCourse全体JSONを直接読んでいる箇所は、Node側では`readSplitCourseArtifacts`、Browser側ではCatalog v3→Index→必要Lessonのfetchへ移す。改ざんtestは対象IndexまたはLesson responseだけをroute overrideし、SHA不一致と再試行を同じ失敗分類で維持する。

- [ ] **Step 4: route別network E2Eを追加する**

```ts
test('Course mapはLesson本文を取得しない', async ({ page }) => {
  const lessons: string[] = [];
  page.on('request', (request) => {
    if (/\/lessons\/[^/]+\.json$/u.test(request.url())) lessons.push(request.url());
  });
  await page.goto(`${baseUrl}#/courses/html-css`);
  await expect(page.getByRole('heading', { name: 'HTML/CSS はじめの一歩' })).toBeVisible();
  expect(lessons).toEqual([]);
});
```

HomeはCatalogだけ、Slideは対象1件、通常Exerciseは対象1件、`html-css-ch12-l03`は同workspaceのL01〜L03だけをassertする。ReviewはExercise所有Lessonとrelated Slide所有Lessonだけでworkspace依存を読まず、Library courseはIndexだけ、Library Slideは対象1件をassertする。draft Courseは直リンク成功、Home／公開LearningPath／Library非掲載をassertする。

- [ ] **Step 5: release／subpathの旧path検査を更新する**

```ts
await assertRegularArtifact('generated/content/catalog-v3.json');
await assertMissingArtifact('generated/content/catalog.json');
await assertMissingArtifact('generated/content/courses/html-css.json');
```

- [ ] **Step 6: performance Gateを実行する**

```bash
./scripts/docker-compose.sh run --rm app npm run build
./scripts/docker-compose.sh run --rm app npx playwright test tests/e2e/network-contract.spec.ts tests/e2e/runtime-persistence.spec.ts tests/e2e/course-fixtures.spec.ts tests/e2e/learning-path.spec.ts tests/e2e/runtime-learning-flow.spec.ts tests/e2e/slide-library.spec.ts
./scripts/docker-compose.sh run --rm app npm run test:performance
./scripts/docker-compose.sh run --rm app npm run test:lighthouse
```

Expected: 3 Browserの対象E2Eにfailure／retryなし、Playwright performance 18件、bundle budget全件、Home／Course／Slide／Exercise各3 runのLCP最大2,500 ms以下。

- [ ] **Step 7: 設計書を実装済みへ更新しcommitする**

```bash
git add content/html-css/performance.yaml tests/performance/manifest.ts \
  tests/performance/manifest.test.ts tests/performance/bundle-budget.test.ts \
  tests/performance/preview-validation.spec.ts \
  tests/e2e/network-contract.spec.ts tests/e2e/runtime-learning-flow.spec.ts \
  tests/e2e/slide-library.spec.ts tests/e2e/helpers/progress.ts \
  tests/e2e/runtime-persistence.spec.ts tests/e2e/course-fixtures.spec.ts \
  tests/e2e/responsive-layout.spec.ts tests/e2e/visual-regression.spec.ts \
  tests/e2e/learning-path.spec.ts scripts/release/checkStaticArtifact.ts \
  tests/content/static-artifact.test.ts scripts/smoke-subpath.ts \
  scripts/smoke-subpath.test.ts \
  docs/quality/2026-08-02-course-content-delivery-design.md README.md
git diff --cached --check
git commit -m "品質: 分割教材の配信予算を固定する"
```

---

### Task 10: 全Gate、security scan、main push、Pages公開を完了する

**Files:**

- Verify: repository全体
- Generate but do not track: `.lighthouseci/`、`lhci-report/`、Playwright report／screenshots
- Update if required: `docs/quality/visual-review.md`

**Interfaces:**

- Consumes: Task 0〜9のcommitsとproduction Artifact
- Produces: remote main、GitHub Pages beta deployment、公開後検証証跡

- [ ] **Step 1: clean installと全静的／Unit Gateを実行する**

```bash
./scripts/docker-compose.sh run --rm app npm ci
./scripts/docker-compose.sh run --rm app npm audit --omit=dev
./scripts/docker-compose.sh run --rm app npm audit
./scripts/docker-compose.sh run --rm app npm run check
./scripts/docker-compose.sh run --rm app npm run format:check
```

Expected: audit 0、Content／Lint／Typecheck／Unit／build／learning chunksが全PASS。

- [ ] **Step 2: 3 Browser E2Eと性能Gateをfresh実行する**

```bash
./scripts/docker-compose.sh run --rm app npm run test:e2e
./scripts/docker-compose.sh run --rm app npm run test:performance
./scripts/docker-compose.sh run --rm app npm run test:lighthouse
```

Expected: Chromium／Firefox／WebKitにfailure／retryなし、既知skipだけ、全性能予算PASS。

- [ ] **Step 3: release／subpath／continuityを実行する**

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run smoke:subpath
./scripts/docker-compose.sh run --rm app npm run release:check
./scripts/docker-compose.sh run --rm app npm run release:continuity -- --quality-only
```

Expected: `/tsumucode/`配下のCatalog、Index、Lesson、全Assetが解決し、旧Artifact不在、beta workflowと同じquality-only release continuityがPASS。

- [ ] **Step 4: 代表viewportをcache-busting URLで実画像確認する**

```bash
./scripts/docker-compose.sh run --rm app npm run preview -- --host 0.0.0.0 --port 4174
```

最初に`git rev-parse HEAD`で検証対象SHAを取得し、その40文字を`?verify=`へ付ける。1280x720と390x844のHome、Course、Slide、Exercise、Libraryを撮影する。画像を目視し、重なり、はみ出し、通常Scroll回帰、CTA文言、console error 0を確認する。カード内部のbottom／right境界も数値assertする。

- [ ] **Step 5: visual確認結果を証跡へ記録してcommitする**

`docs/quality/visual-review.md`へ検証SHA、viewport、対象route、通常Scroll、重なり、境界数値、consoleの結果を追記する。

```bash
git add docs/quality/visual-review.md
git diff --cached --check
git commit -m "文書: 教材分割後の実画面確認を記録する"
```

- [ ] **Step 6: 未追跡Artifactと差分を監査する**

```bash
git status --short
git diff --check
rg -n 'generated/content/catalog\.json|generated/content/courses/[^/]+\.json' index.html README.md scripts src tests
```

Expected: 旧pathは削除検査test以外に残らず、report／秘密／一時fileがstageされていない。

- [ ] **Step 7: outgoing全履歴をsecret scanする**

`pre-push-security-check` Skillの手順でstaged diffだけでなく`origin/main..HEAD`全体を検査する。`.env`、秘密鍵、token、credential、個人情報、巨大生成物がないことを確認する。

- [ ] **Step 8: mainをpushしremote一致を確認する**

```bash
git push origin main
git fetch origin main
git status --short --branch
git rev-list --left-right --count origin/main...main
```

Expected: ahead／behind `0 0`、`git ls-remote origin refs/heads/main`がlocal HEADと一致。

- [ ] **Step 9: GitHub Pages betaをdispatchして監視する**

```bash
SOURCE_SHA=$(git rev-parse HEAD)
gh workflow run "TsumuCode Pages" --ref main -f source_sha="$SOURCE_SHA" -f release_mode=beta -f deploy=true
RUN_ID=$(gh run list --workflow="TsumuCode Pages" --branch=main --commit="$SOURCE_SHA" --event=workflow_dispatch --limit=1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Expected: build／test／artifact／deploy jobが全successし、deployment SHAが検証済みHEADと一致。

- [ ] **Step 10: 公開URLを2 viewportとconsoleで確認する**

公開URL `https://santa928.github.io/tsumucode/` をcache-busting queryで開き、390x844と1280x720でHome→Course→Slide→Exercise→Libraryを確認する。NetworkでCourse mapがLessonを読まないこと、Slideが対象Lessonだけを読むこと、console error 0、LCP対象内容が表示されることを確認する。

- [ ] **Step 11: Issue #1へ公開証跡を記録する**

```bash
gh issue comment 1 --body "教材分割配信を完了しました。source: ${SOURCE_SHA} / Pages workflow: ${RUN_ID} / 公開URL: https://santa928.github.io/tsumucode/"
```

Expected: Issue #1へsource SHA、成功Run ID、公開URLが1件だけ記録される。

- [ ] **Step 12: goalを継続して次のJavaScript縦切りへ移る**

教材分割タスクだけを完了扱いにし、ロードマップ全体goalはactiveのまま維持する。`docs/quality/javascript-vertical-slice-design.md`の書面承認を得て、次の`writing-plans`へ進む。
