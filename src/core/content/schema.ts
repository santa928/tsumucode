/** 公開教材payloadの構造、Course内参照、宣言集計、進捗移行chainを検証する。 */
import { z } from 'zod';
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';

export const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'IDはlower-kebab-caseで指定してください');
export const NonEmptyTextSchema = z.string().trim().min(1, '空でない文字列を指定してください');
const NonBlankPreservedTextSchema = z
  .string()
  .min(1, '空でない文字列を指定してください')
  .refine((value) => value.trim().length > 0, '空白だけでない文字列を指定してください');

/** Task 2と同じcanonical URL境界でPublic相対Pathを検証する。 */
function isSafePublicRelativePath(value: string): boolean {
  try {
    resolvePublicAsset('/', value);
    return true;
  } catch {
    return false;
  }
}

export const RelativePathSchema = z
  .string()
  .min(1)
  .refine(isSafePublicRelativePath, '安全な相対Pathで指定してください');

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u, 'SHA-256を指定してください');

export const MasteryLevelSchema = z.enum(['seen', 'read', 'fill', 'transform', 'compose']);
export const SlideLayoutSchema = z.enum([
  'explanation',
  'code-preview',
  'comparison',
  'checkpoint',
]);
export const ScreenBudgetSchema = z
  .object({
    maxTextCharacters: z.number().int().min(40).max(420),
    maxCodeLines: z.number().int().min(0).max(12),
    maxVisuals: z.number().int().min(0).max(2),
  })
  .strict();
export const ConceptRequirementSchema = z
  .object({ conceptId: IdSchema, minimumLevel: MasteryLevelSchema })
  .strict();
export const ConceptDefinitionSchema = z
  .object({
    id: IdSchema,
    introducedBySlideId: IdSchema,
    prerequisiteConceptIds: z.array(IdSchema),
    minimumProjectLevel: MasteryLevelSchema,
  })
  .strict();
export const ExerciseStepSchema = z
  .object({
    id: IdSchema,
    file: RelativePathSchema,
    target: NonEmptyTextSchema,
    starterAnchor: NonEmptyTextSchema,
    change: NonEmptyTextSchema,
    observe: NonEmptyTextSchema,
    requiresConceptIds: z.array(IdSchema).min(1),
    validationRuleIds: z.array(IdSchema).min(1),
  })
  .strict();

export const PreviewViewportSchema = z
  .object({
    id: IdSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    reducedMotion: z.literal('reduce').optional(),
  })
  .strict()
  .readonly();

export const AssetRefSchema = z
  .object({
    id: IdSchema,
    path: RelativePathSchema,
    mediaType: z.enum(['image', 'font', 'other']),
    alt: z.string().optional(),
    provenanceId: IdSchema,
    intrinsicWidth: z.number().positive().optional(),
    intrinsicHeight: z.number().positive().optional(),
  })
  .strict()
  .superRefine((asset, context) => {
    if ((asset.intrinsicWidth === undefined) === (asset.intrinsicHeight === undefined)) return;
    context.addIssue({
      code: 'custom',
      path: [asset.intrinsicWidth === undefined ? 'intrinsicWidth' : 'intrinsicHeight'],
      message: 'intrinsicWidthとintrinsicHeightは両方を指定してください',
    });
  });

export const SlideBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: NonEmptyTextSchema }).strict(),
  z
    .object({
      type: z.literal('heading'),
      level: z.union([z.literal(2), z.literal(3)]),
      text: NonEmptyTextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('list'),
      style: z.enum(['ordered', 'unordered']),
      items: z.array(NonEmptyTextSchema).min(1),
    })
    .strict(),
  z.object({ type: z.literal('code'), language: NonEmptyTextSchema, code: z.string() }).strict(),
  z.object({ type: z.literal('image'), assetId: IdSchema, alt: NonEmptyTextSchema }).strict(),
  z
    .object({
      type: z.literal('practice'),
      prompt: NonEmptyTextSchema,
      expectedAction: NonEmptyTextSchema,
      estimatedMinutes: z.number().int().min(1).max(5),
    })
    .strict(),
  z
    .object({
      type: z.literal('callout'),
      tone: z.enum(['note', 'tip', 'warning']),
      title: NonEmptyTextSchema.optional(),
      text: NonEmptyTextSchema,
    })
    .strict(),
]);

export const SlideSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    kind: z.enum([
      'concept',
      'comparison',
      'diagram',
      'code',
      'reflection',
      'brief',
      'guide',
      'checklist',
    ]),
    concept: NonEmptyTextSchema.optional(),
    layout: SlideLayoutSchema,
    teachesConceptIds: z.array(IdSchema),
    masteryTarget: MasteryLevelSchema,
    screenBudget: ScreenBudgetSchema,
    blocks: z.array(SlideBlockSchema).min(1),
    assets: z.array(AssetRefSchema),
  })
  .strict()
  .superRefine((slide, context) => {
    let hasLevelTwoHeading = false;

    slide.blocks.forEach((block, index) => {
      if (block.type !== 'heading') return;
      if (block.level === 2) {
        hasLevelTwoHeading = true;
        return;
      }
      if (hasLevelTwoHeading) return;

      context.addIssue({
        code: 'custom',
        path: ['blocks', index, 'level'],
        message: 'level 3見出しより前にlevel 2見出しを置いてください',
      });
    });
  });

export const GlossaryEntrySchema = z
  .object({
    id: IdSchema,
    term: NonEmptyTextSchema,
    definition: NonEmptyTextSchema,
    firstSlideId: IdSchema,
    relatedIds: z.array(IdSchema),
  })
  .strict();

export const ExerciseFileSchema = z
  .object({
    path: RelativePathSchema,
    language: IdSchema,
    content: z.string(),
    editable: z.boolean(),
  })
  .strict();

/** JavaScript ExerciseがAnalyzer／Runnerへ渡す固定Runtime設定。 */
export const JavaScriptExerciseRuntimeSchema = z
  .object({
    kind: z.literal('javascript'),
    entryFile: RelativePathSchema,
    sourceType: z.enum(['script', 'module']),
    capabilityProfile: z.enum(['core', 'modules', 'dom', 'async', 'project']),
    primaryOutput: z.enum(['preview', 'console']),
  })
  .strict();

/** Course追加時にkind単位で拡張するExercise Runtime union。 */
export const ExerciseRuntimeSchema = z.discriminatedUnion('kind', [
  JavaScriptExerciseRuntimeSchema,
]);

/** selectorへ制御文字が混入していないことを文字コードで判定する。 */
function hasNoControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 31) || (codePoint >= 127 && codePoint <= 159))
    ) {
      return false;
    }
  }
  return true;
}

const InteractionSelectorSchema = z
  .string()
  .trim()
  .min(1, '空でないselectorを指定してください')
  .max(256, 'selectorは256文字以内で指定してください')
  .refine(hasNoControlCharacters, 'selectorに制御文字は使用できません');
const InteractionShortValueSchema = z.string().max(256, '値は256文字以内で指定してください');
const InteractionLongValueSchema = z.string().max(4096, '値は4 KiB以内で指定してください');
const InteractionKeySchema = z.enum([
  'Enter',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Space',
  'Tab',
]);

/** 信頼済みBridgeへ送れる有限個の学習者操作だけを表す。 */
export const JavaScriptInteractionActionSchema = z.discriminatedUnion('kind', [
  z
    .object({ id: IdSchema, kind: z.literal('click'), selector: InteractionSelectorSchema })
    .strict(),
  z
    .object({
      id: IdSchema,
      kind: z.literal('fill'),
      selector: InteractionSelectorSchema,
      value: InteractionLongValueSchema,
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      kind: z.literal('select'),
      selector: InteractionSelectorSchema,
      value: InteractionShortValueSchema,
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      kind: z.literal('key'),
      selector: InteractionSelectorSchema,
      key: InteractionKeySchema,
    })
    .strict(),
  z
    .object({ id: IdSchema, kind: z.literal('focus'), selector: InteractionSelectorSchema })
    .strict(),
]);

/** Scenario checkpointがBridgeの観測結果に要求できる有限個の期待値。 */
export const JavaScriptCheckpointExpectationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: IdSchema,
      kind: z.literal('selector-exists'),
      selector: InteractionSelectorSchema,
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      kind: z.literal('selector-text'),
      selector: InteractionSelectorSchema,
      equals: InteractionLongValueSchema,
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      kind: z.literal('attribute'),
      selector: InteractionSelectorSchema,
      name: InteractionSelectorSchema,
      equals: InteractionLongValueSchema,
    })
    .strict(),
  z
    .object({ id: IdSchema, kind: z.literal('focused'), selector: InteractionSelectorSchema })
    .strict(),
  z
    .object({
      id: IdSchema,
      kind: z.literal('console-includes'),
      includes: InteractionLongValueSchema,
    })
    .strict(),
]);

/** 1 action直後に評価するboundedな期待値集合。 */
export const JavaScriptInteractionCheckpointSchema = z
  .object({
    id: IdSchema,
    afterActionId: IdSchema,
    expectations: z.array(JavaScriptCheckpointExpectationSchema).min(1).max(16),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    if (hasDuplicates(checkpoint.expectations, ({ id }) => id)) {
      context.addIssue({
        code: 'custom',
        path: ['expectations'],
        message: 'Expectation IDが重複しています',
      });
    }
  });

/** 1 Exercise内で再生するbounded Interaction Scenario。 */
export const JavaScriptInteractionScenarioSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyTextSchema.max(256, 'Scenario labelは256文字以内で指定してください'),
    actions: z.array(JavaScriptInteractionActionSchema).min(1).max(10),
    checkpoints: z.array(JavaScriptInteractionCheckpointSchema).min(1).max(10),
  })
  .strict()
  .superRefine((scenario, context) => {
    if (hasDuplicates(scenario.actions, ({ id }) => id)) {
      context.addIssue({ code: 'custom', path: ['actions'], message: 'Action IDが重複しています' });
    }
    if (hasDuplicates(scenario.checkpoints, ({ id }) => id)) {
      context.addIssue({
        code: 'custom',
        path: ['checkpoints'],
        message: 'Checkpoint IDが重複しています',
      });
    }
    const actionIds = new Set(scenario.actions.map(({ id }) => id));
    for (const [checkpointIndex, checkpoint] of scenario.checkpoints.entries()) {
      if (!actionIds.has(checkpoint.afterActionId)) {
        context.addIssue({
          code: 'custom',
          path: ['checkpoints', checkpointIndex, 'afterActionId'],
          message: `CheckpointのAction参照先がありません: ${checkpoint.afterActionId}`,
        });
      }
    }
  });

export const HintSchema = z
  .object({
    id: IdSchema,
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    title: NonEmptyTextSchema,
    text: NonEmptyTextSchema,
    relatedSlideId: IdSchema.optional(),
  })
  .strict();

const HtmlCssSelectorTargetSchema = z
  .object({ kind: z.literal('selector'), selector: NonEmptyTextSchema })
  .strict();

const HtmlCssNodeTargetSchema = z
  .object({
    kind: z.literal('node'),
    tagName: NonEmptyTextSchema.optional(),
    role: NonEmptyTextSchema.optional(),
    textIncludes: NonEmptyTextSchema.optional(),
  })
  .strict()
  .refine(
    ({ tagName, role, textIncludes }) =>
      tagName !== undefined || role !== undefined || textIncludes !== undefined,
    'node targetはtagName、role、textIncludesを1件以上指定してください',
  );

const HtmlCssSourceTargetSchema = z
  .object({ kind: z.literal('source'), file: RelativePathSchema })
  .strict();

const JavaScriptSourceTargetSchema = z
  .object({ kind: z.literal('javascript-source'), file: RelativePathSchema })
  .strict();

const JavaScriptConsoleTargetSchema = z.object({ kind: z.literal('javascript-console') }).strict();

export const HtmlCssRuleTargetSchema = z.union([
  HtmlCssSelectorTargetSchema,
  HtmlCssNodeTargetSchema,
  HtmlCssSourceTargetSchema,
]);

const ExistsAssertionSchema = z.object({ kind: z.literal('exists') }).strict();
const CountAssertionSchema = z
  .object({
    kind: z.literal('count'),
    operator: z.enum(['equals', 'gte', 'lte']),
    expected: z.number().int().nonnegative(),
  })
  .strict();
const AttributePresentAssertionSchema = z
  .object({
    kind: z.literal('attribute'),
    name: NonEmptyTextSchema,
    operator: z.literal('present'),
  })
  .strict();
const AttributeEqualsAssertionSchema = z
  .object({
    kind: z.literal('attribute'),
    name: NonEmptyTextSchema,
    operator: z.literal('equals'),
    expected: z.union([z.string(), z.number(), z.boolean()]),
  })
  .strict();
const AttributeContainsAssertionSchema = z
  .object({
    kind: z.literal('attribute'),
    name: NonEmptyTextSchema,
    operator: z.literal('contains'),
    expected: NonEmptyTextSchema,
  })
  .strict();
const AttributeNumberAssertionSchema = z
  .object({
    kind: z.literal('attribute'),
    name: NonEmptyTextSchema,
    operator: z.enum(['gte', 'lte']),
    expected: z.number(),
  })
  .strict();
const TextEqualsAssertionSchema = z
  .object({
    kind: z.literal('text'),
    operator: z.literal('equals'),
    expected: z.string(),
  })
  .strict();
const TextContainsAssertionSchema = z
  .object({
    kind: z.literal('text'),
    operator: z.literal('contains'),
    expected: NonBlankPreservedTextSchema,
  })
  .strict();
const NormalizedTextContainsAssertionSchema = z
  .object({
    kind: z.literal('text'),
    operator: z.literal('contains-normalized'),
    expected: NonBlankPreservedTextSchema,
  })
  .strict();
const ComputedStyleEqualsAssertionSchema = z
  .object({
    kind: z.literal('computed-style'),
    property: NonEmptyTextSchema,
    operator: z.literal('equals'),
    expected: z.union([z.string(), z.number()]),
    tolerance: z.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((assertion, context) => {
    if (typeof assertion.expected === 'string' && assertion.tolerance !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['tolerance'],
        message: '文字列比較へtoleranceは指定できません',
      });
    }
  });
const ComputedStyleContainsAssertionSchema = z
  .object({
    kind: z.literal('computed-style'),
    property: NonEmptyTextSchema,
    operator: z.literal('contains'),
    expected: NonEmptyTextSchema,
  })
  .strict();
const ComputedStyleNumberAssertionSchema = z
  .object({
    kind: z.literal('computed-style'),
    property: NonEmptyTextSchema,
    operator: z.enum(['gte', 'lte']),
    expected: z.number(),
    tolerance: z.number().nonnegative().optional(),
  })
  .strict();
const FocusVisibleStyleEqualsAssertionSchema = z
  .object({
    kind: z.literal('focus-visible-style'),
    property: NonEmptyTextSchema,
    operator: z.literal('equals'),
    expected: z.union([z.string(), z.number()]),
    tolerance: z.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((assertion, context) => {
    if (typeof assertion.expected === 'string' && assertion.tolerance !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['tolerance'],
        message: '文字列比較へtoleranceは指定できません',
      });
    }
  });
const FocusVisibleStyleContainsAssertionSchema = z
  .object({
    kind: z.literal('focus-visible-style'),
    property: NonEmptyTextSchema,
    operator: z.literal('contains'),
    expected: NonEmptyTextSchema,
  })
  .strict();
const FocusVisibleStyleNumberAssertionSchema = z
  .object({
    kind: z.literal('focus-visible-style'),
    property: NonEmptyTextSchema,
    operator: z.enum(['gte', 'lte']),
    expected: z.number(),
    tolerance: z.number().nonnegative().optional(),
  })
  .strict();
const RectAssertionSchema = z
  .object({
    kind: z.literal('rect'),
    metric: z.enum(['x', 'y', 'width', 'height']),
    operator: z.enum(['equals', 'gte', 'lte']),
    expected: z.number(),
    tolerance: z.number().nonnegative().optional(),
  })
  .strict();
const OverflowAssertionSchema = z
  .object({ kind: z.literal('overflow-x'), operator: z.literal('equals'), expected: z.boolean() })
  .strict();
const FocusableAssertionSchema = z
  .object({ kind: z.literal('focusable'), operator: z.literal('equals'), expected: z.boolean() })
  .strict();
const AccessibleNamePresentAssertionSchema = z
  .object({ kind: z.literal('accessible-name'), operator: z.literal('present') })
  .strict();
const AccessibleNameTextAssertionSchema = z
  .object({
    kind: z.literal('accessible-name'),
    operator: z.enum(['equals', 'contains']),
    expected: NonEmptyTextSchema,
  })
  .strict();
const RolePresentAssertionSchema = z
  .object({ kind: z.literal('role'), operator: z.literal('present') })
  .strict();
const RoleEqualsAssertionSchema = z
  .object({ kind: z.literal('role'), operator: z.literal('equals'), expected: NonEmptyTextSchema })
  .strict();
const RelationAssertionSchema = z
  .object({
    kind: z.literal('relation'),
    relation: z.enum(['child', 'descendant', 'next-sibling', 'before', 'contained-by']),
    otherSelector: NonEmptyTextSchema,
  })
  .strict();
const ContrastAssertionSchema = z
  .object({ kind: z.literal('contrast'), minimum: z.number().min(1).max(21) })
  .strict();

const QuerySelectorTextContentAssignmentAssertionSchema = z
  .object({
    kind: z.literal('query-selector-text-content-assignment'),
    selector: NonEmptyTextSchema,
    expected: z.string(),
  })
  .strict();

const JavaScriptSourceFactSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('binding'),
      name: NonEmptyTextSchema.max(128),
      declarationKind: z.enum(['const', 'let', 'var']),
      scopeDepth: z.number().int().min(0).max(32).optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal('literal'), valueType: z.enum(['string', 'number', 'boolean']) })
    .strict(),
  z
    .object({
      kind: z.literal('binary-expression'),
      operator: z.enum([
        '+',
        '-',
        '*',
        '/',
        '%',
        '===',
        '!==',
        '>',
        '>=',
        '<',
        '<=',
        '&&',
        '||',
        '??',
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('assignment'),
      name: NonEmptyTextSchema.max(128),
      operator: z.enum(['=', '+=', '-=', '++', '--']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('branch'),
      branchKind: z.enum(['if', 'switch']),
      hasAlternate: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('loop'),
      loopKind: z.enum(['for', 'for-of', 'for-in', 'while', 'do-while']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('function'),
      functionKind: z.enum(['declaration', 'expression', 'arrow']),
      parameterCount: z.number().int().min(0).max(32),
    })
    .strict(),
  z.object({ kind: z.literal('call'), callee: NonEmptyTextSchema.max(128) }).strict(),
  z.object({ kind: z.literal('return') }).strict(),
  z.object({ kind: z.literal('closure'), capturedName: NonEmptyTextSchema.max(128) }).strict(),
]);

const JavaScriptSourceFactAssertionSchema = z
  .object({
    kind: z.literal('javascript-source-fact'),
    fact: JavaScriptSourceFactSchema,
    minimumCount: z.number().int().min(1).max(16).optional(),
  })
  .strict();

const JavaScriptConsoleRecordExpectationSchema = z
  .object({
    level: z.enum(['log', 'info', 'warn', 'error']),
    text: z.string().max(1024),
  })
  .strict()
  .superRefine((record, context) => {
    if (new TextEncoder().encode(record.text).byteLength <= 1024) return;
    context.addIssue({
      code: 'custom',
      path: ['text'],
      message: 'Console期待値1件はUTF-8で1 KiB以下にしてください',
    });
  });

const JavaScriptConsoleAssertionSchema = z
  .object({
    kind: z.literal('javascript-console'),
    operator: z.literal('equals'),
    expected: z.array(JavaScriptConsoleRecordExpectationSchema).min(1).max(32),
  })
  .strict()
  .superRefine((assertion, context) => {
    const bytes = new TextEncoder().encode(
      assertion.expected.map(({ level, text }) => `${level}\u0000${text}`).join('\u0000'),
    ).byteLength;
    if (bytes <= 16 * 1024) return;
    context.addIssue({
      code: 'custom',
      path: ['expected'],
      message: 'Console期待値は合計16 KiB以下にしてください',
    });
  });

export const HtmlCssRuleAssertionSchema = z.union([
  ExistsAssertionSchema,
  CountAssertionSchema,
  AttributePresentAssertionSchema,
  AttributeEqualsAssertionSchema,
  AttributeContainsAssertionSchema,
  AttributeNumberAssertionSchema,
  TextEqualsAssertionSchema,
  TextContainsAssertionSchema,
  NormalizedTextContainsAssertionSchema,
  ComputedStyleEqualsAssertionSchema,
  ComputedStyleContainsAssertionSchema,
  ComputedStyleNumberAssertionSchema,
  FocusVisibleStyleEqualsAssertionSchema,
  FocusVisibleStyleContainsAssertionSchema,
  FocusVisibleStyleNumberAssertionSchema,
  RectAssertionSchema,
  OverflowAssertionSchema,
  FocusableAssertionSchema,
  AccessibleNamePresentAssertionSchema,
  AccessibleNameTextAssertionSchema,
  RolePresentAssertionSchema,
  RoleEqualsAssertionSchema,
  RelationAssertionSchema,
  ContrastAssertionSchema,
]);

const AUTHORING_ONLY_FIELD_NAMES = new Set(['solutionFiles', 'fixtures']);
const RESERVED_ADAPTER_RULE_KINDS = new Set([
  'javascript-source',
  'javascript-console',
  'javascript-source-fact',
  'query-selector-text-content-assignment',
]);

/** Adapter固有payloadを再帰走査し、公開禁止fieldの最初のpathを返す。 */
function findAuthoringOnlyField(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  path: readonly PropertyKey[] = [],
): readonly PropertyKey[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (AUTHORING_ONLY_FIELD_NAMES.has(key)) return childPath;
    const nested = findAuthoringOnlyField(child, seen, childPath);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

const AdapterRuleObjectSchema = z
  .object({ kind: IdSchema })
  .catchall(z.unknown())
  .superRefine((value, context) => {
    if (RESERVED_ADAPTER_RULE_KINDS.has(value.kind)) {
      context.addIssue({
        code: 'custom',
        path: ['kind'],
        message: '予約済みAdapter Ruleは専用のstrict契約で指定してください',
      });
    }
    const path = findAuthoringOnlyField(value);
    if (path !== undefined) {
      context.addIssue({
        code: 'custom',
        path: [...path],
        message: 'Adapter payloadへauthoring-only fieldを含められません',
      });
    }
  });
export const RuleTargetSchema = z.union([
  HtmlCssRuleTargetSchema,
  JavaScriptSourceTargetSchema,
  JavaScriptConsoleTargetSchema,
  AdapterRuleObjectSchema,
]);
export const RuleAssertionSchema = z.union([
  HtmlCssRuleAssertionSchema,
  QuerySelectorTextContentAssignmentAssertionSchema,
  JavaScriptSourceFactAssertionSchema,
  JavaScriptConsoleAssertionSchema,
  AdapterRuleObjectSchema,
]);

const FeedbackSchema = z
  .object({
    target: NonEmptyTextSchema,
    expected: NonEmptyTextSchema,
    nextAction: NonEmptyTextSchema,
  })
  .strict();

const ValidationRuleBaseShape = {
  id: IdSchema,
  label: NonEmptyTextSchema,
  required: z.boolean(),
  group: z.enum(['all', 'any']),
  groupId: IdSchema.optional(),
  viewportMode: z.enum(['all', 'any']),
  viewportIds: z.array(IdSchema).min(1),
  feedback: FeedbackSchema,
  hintId: IdSchema,
  relatedSlideId: IdSchema,
};

export const HtmlCssValidationRuleDefinitionSchema = z
  .object({
    ...ValidationRuleBaseShape,
    target: HtmlCssRuleTargetSchema,
    assertion: HtmlCssRuleAssertionSchema,
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.target.kind === 'source' && rule.assertion.kind !== 'text') {
      context.addIssue({
        code: 'custom',
        path: ['assertion'],
        message: 'source targetはtext assertionだけ使用できます',
      });
    }
    if (
      rule.assertion.kind === 'text' &&
      rule.assertion.operator === 'contains-normalized' &&
      rule.target.kind !== 'source'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['assertion', 'operator'],
        message: 'contains-normalizedはsource targetだけで使用できます',
      });
    }
  });

const JavaScriptSourceValidationRuleDefinitionSchema = z
  .object({
    ...ValidationRuleBaseShape,
    target: JavaScriptSourceTargetSchema,
    assertion: z.union([
      QuerySelectorTextContentAssignmentAssertionSchema,
      JavaScriptSourceFactAssertionSchema,
    ]),
  })
  .strict();

const JavaScriptConsoleValidationRuleDefinitionSchema = z
  .object({
    ...ValidationRuleBaseShape,
    target: JavaScriptConsoleTargetSchema,
    assertion: JavaScriptConsoleAssertionSchema,
  })
  .strict();

export const JavaScriptValidationRuleDefinitionSchema = z.union([
  JavaScriptSourceValidationRuleDefinitionSchema,
  JavaScriptConsoleValidationRuleDefinitionSchema,
]);

export const ValidationRuleDefinitionSchema = z
  .object({
    ...ValidationRuleBaseShape,
    target: RuleTargetSchema,
    assertion: RuleAssertionSchema,
  })
  .strict()
  .superRefine((rule, context) => {
    const usesJavaScriptContract =
      rule.target.kind === 'javascript-source' ||
      rule.target.kind === 'javascript-console' ||
      rule.assertion.kind === 'query-selector-text-content-assignment' ||
      rule.assertion.kind === 'javascript-source-fact' ||
      rule.assertion.kind === 'javascript-console';
    if (
      usesJavaScriptContract &&
      !JavaScriptValidationRuleDefinitionSchema.safeParse(rule).success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'JavaScript Source targetとassertionを組み合わせて指定してください',
      });
    }
  });

const ExerciseBaseShape = {
  id: IdSchema,
  workspaceId: IdSchema,
  countsTowardStandardExerciseTotal: z.boolean(),
  title: NonEmptyTextSchema,
  instructions: z.array(SlideBlockSchema).min(1),
  requiresConcepts: z.array(ConceptRequirementSchema),
  scaffoldLevel: MasteryLevelSchema,
  steps: z.array(ExerciseStepSchema),
  files: z.array(ExerciseFileSchema).min(1),
  runtime: ExerciseRuntimeSchema.optional(),
  interactionScenarios: z.array(JavaScriptInteractionScenarioSchema).min(1).max(4).optional(),
  validationRules: z.array(ValidationRuleDefinitionSchema).min(1),
  hints: z.array(HintSchema).length(3),
  relatedSlideIds: z.array(IdSchema).min(1),
  previewViewports: z.array(PreviewViewportSchema).min(1),
  assets: z.array(AssetRefSchema),
};

export const ExerciseSchema = z
  .discriminatedUnion('kind', [
    z.object({ ...ExerciseBaseShape, kind: z.literal('standard') }).strict(),
    z
      .object({
        ...ExerciseBaseShape,
        kind: z.literal('guided-project'),
        projectId: IdSchema,
      })
      .strict(),
    z.object({ ...ExerciseBaseShape, kind: z.literal('capstone'), projectId: IdSchema }).strict(),
  ])
  .superRefine((exercise, context) => {
    if (
      exercise.interactionScenarios !== undefined &&
      (exercise.runtime?.kind !== 'javascript' ||
        !['dom', 'async', 'project'].includes(exercise.runtime.capabilityProfile))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['interactionScenarios'],
        message: 'Interaction Scenarioはdom、async、project profileで指定してください',
      });
    }
    if (
      exercise.interactionScenarios !== undefined &&
      hasDuplicates(exercise.interactionScenarios, ({ id }) => id)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['interactionScenarios'],
        message: 'Interaction Scenario IDが重複しています',
      });
    }
  });

const ChecklistItemSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyTextSchema,
    required: z.boolean(),
    ruleIds: z.array(IdSchema).min(1),
  })
  .strict();

const ProjectSchema = z
  .object({
    id: IdSchema,
    brief: z.array(SlideBlockSchema).min(1),
    guide: z.array(SlideBlockSchema),
    checklist: z.array(ChecklistItemSchema).min(1),
  })
  .strict();

const LessonBaseShape = {
  id: IdSchema,
  title: NonEmptyTextSchema,
  goal: NonEmptyTextSchema,
  estimatedMinutes: z.number().int().positive(),
  prerequisiteLessonIds: z.array(IdSchema),
  exercises: z.array(ExerciseSchema).min(1),
  reflection: NonEmptyTextSchema,
  glossaryRefs: z.array(IdSchema),
  nextLessonId: IdSchema.optional(),
};

export const LessonSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...LessonBaseShape,
      kind: z.literal('standard'),
      slides: z.array(SlideSchema).min(1),
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
      ...LessonBaseShape,
      kind: z.literal('guided-project'),
      slides: z.array(SlideSchema),
      project: ProjectSchema,
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
      ...LessonBaseShape,
      kind: z.literal('capstone'),
      slides: z.array(SlideSchema),
      project: ProjectSchema,
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

export const ChapterManifestSchema = z
  .object({
    id: IdSchema,
    sequence: z.number().int().nonnegative(),
    title: NonEmptyTextSchema,
    goal: NonEmptyTextSchema,
    estimatedMinutes: z.number().int().positive(),
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    lessons: z.array(LessonSchema).min(1),
  })
  .strict();

export const PhaseManifestSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    chapters: z.array(ChapterManifestSchema).min(1),
  })
  .strict();

export const ExpectedTotalsSchema = z
  .object({
    chapters: z.number().int().nonnegative(),
    lessons: z.number().int().nonnegative(),
    conceptSlides: z
      .number()
      .int()
      .nonnegative()
      .describe('学習上必要な追加分割を許可するConcept Slide最低枚数'),
    standardExercises: z.number().int().nonnegative(),
    guidedProjectLessons: z.number().int().nonnegative(),
    capstoneLessons: z.number().int().nonnegative(),
    estimatedMinutes: z.number().int().nonnegative(),
  })
  .strict();

export const ProgressEntitySchema = z.enum([
  'chapter',
  'lesson',
  'slide',
  'exercise',
  'rule',
  'hint',
  'checklist',
  'workspace',
]);

const PreserveMigrationStepSchema = z
  .object({ action: z.literal('preserve'), entity: ProgressEntitySchema, id: IdSchema })
  .strict();
const MapMigrationStepSchema = z
  .object({
    action: z.literal('map-to'),
    entity: ProgressEntitySchema,
    fromId: IdSchema,
    toId: IdSchema,
  })
  .strict();
const ResetMigrationStepSchema = z
  .object({
    action: z.literal('intentionally-reset'),
    entity: ProgressEntitySchema,
    id: IdSchema,
    reason: NonEmptyTextSchema,
  })
  .strict();

export const ProgressMigrationStepSchema = z.discriminatedUnion('action', [
  PreserveMigrationStepSchema,
  MapMigrationStepSchema,
  ResetMigrationStepSchema,
]);

export const ContentProgressMigrationSchema = z
  .object({
    fromRevision: NonEmptyTextSchema,
    toRevision: NonEmptyTextSchema,
    steps: z.array(ProgressMigrationStepSchema),
  })
  .strict();

export const SupportedDevicesSchema = z
  .object({
    exercise: z.literal('desktop'),
    study: z.array(z.enum(['desktop', 'tablet', 'mobile'])).min(1),
  })
  .strict();

const CourseManifestBaseSchema = z
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
    phases: z.array(PhaseManifestSchema).min(1),
  })
  .strict();

type CourseManifestValue = z.infer<typeof CourseManifestBaseSchema>;
type ProgressEntity = z.infer<typeof ProgressEntitySchema>;
type ProgressMigrationStep = z.infer<typeof ProgressMigrationStepSchema>;
type AssetRefValue = z.infer<typeof AssetRefSchema>;
type ValidationRuleValue = z.infer<typeof ValidationRuleDefinitionSchema>;
type IssuePath = readonly PropertyKey[];

interface Totals {
  chapters: number;
  lessons: number;
  conceptSlides: number;
  standardExercises: number;
  guidedProjectLessons: number;
  capstoneLessons: number;
  estimatedMinutes: number;
}

interface ProjectWorkspaceOwner {
  readonly projectId: string;
  readonly kind: 'guided-project' | 'capstone';
  readonly lessonId: string;
}

interface ProjectOwner {
  readonly workspaceId: string;
  readonly kind: 'guided-project' | 'capstone';
  readonly lessonId: string;
}

/** Refinement issueへmutable path copyと日本語messageを追加する。 */
function addIssue(context: z.RefinementCtx, path: IssuePath, message: string): void {
  context.addIssue({ code: 'custom', path: [...path], message });
}

/** 配列に重複があるかを同値keyで判定する。 */
function hasDuplicates<T>(items: readonly T[], key: (item: T) => string = String): boolean {
  return new Set(items.map(key)).size !== items.length;
}

/** 同じ集合を重複のない文字列配列として比較する。 */
function hasSameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    !hasDuplicates(left) &&
    !hasDuplicates(right) &&
    left.every((item) => right.includes(item))
  );
}

/** 相対Pathをcanonical pathnameへ変換し、既にSchema issueを持つ値は再throwしない。 */
function canonicalPublicPath(path: string): string | undefined {
  try {
    return resolvePublicAsset('/', path);
  } catch {
    return undefined;
  }
}

/** owner内IDの重複を教材作者向けpathで報告する。 */
function validateOwnerIds(
  context: z.RefinementCtx,
  label: string,
  items: readonly { readonly id: string }[],
  path: IssuePath,
): void {
  if (hasDuplicates(items, ({ id }) => id)) addIssue(context, path, `${label} IDが重複しています`);
}

/** SlideBlockのimage参照をownerのAsset集合へ限定する。 */
function validateImageBlocks(
  context: z.RefinementCtx,
  blocks: readonly z.infer<typeof SlideBlockSchema>[],
  assetsById: ReadonlyMap<string, AssetRefValue>,
  path: IssuePath,
  label: string,
): void {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type === 'image') {
      const asset = assetsById.get(block.assetId);
      if (asset === undefined) {
        addIssue(
          context,
          [...path, blockIndex, 'assetId'],
          `${label}画像Asset参照先が存在しません: ${block.assetId}`,
        );
      } else if (asset.mediaType !== 'image') {
        addIssue(
          context,
          [...path, blockIndex, 'assetId'],
          `${label} image blockはmediaType=imageのAssetだけを参照できます`,
        );
      }
    }
  }
}

/** migration stepの旧ID keyを返す。 */
function migrationSourceId(step: ProgressMigrationStep): string {
  return step.action === 'map-to' ? step.fromId : step.id;
}

/** preserve/map stepの移行先IDを返し、resetはundefinedを返す。 */
function migrationTargetId(step: ProgressMigrationStep): string | undefined {
  if (step.action === 'map-to') return step.toId;
  if (step.action === 'preserve') return step.id;
  return undefined;
}

/** 単一・時系列migration chainと、合成後の現行ID到達を検証する。 */
function validateProgressMigrations(
  course: CourseManifestValue,
  currentIds: Readonly<Record<ProgressEntity, ReadonlySet<string>>>,
  context: z.RefinementCtx,
): void {
  const migrations = course.progressMigrations;
  if (migrations.length === 0) return;

  const byFrom = new Map<string, { readonly index: number; readonly toRevision: string }>();
  const byTo = new Map<string, { readonly index: number; readonly fromRevision: string }>();
  const actionsByMigration: Map<string, ProgressMigrationStep>[] = [];
  let chainDeterministic = true;
  let stepsDeterministic = true;

  for (const [migrationIndex, migration] of migrations.entries()) {
    const migrationPath = ['progressMigrations', migrationIndex] as const;
    if (migration.fromRevision === migration.toRevision) {
      addIssue(
        context,
        [...migrationPath, 'toRevision'],
        'migrationのfrom/to revisionは同一にできません',
      );
      chainDeterministic = false;
    }
    if (byFrom.has(migration.fromRevision)) {
      addIssue(
        context,
        [...migrationPath, 'fromRevision'],
        'migration fromRevisionが重複しています',
      );
      chainDeterministic = false;
    } else {
      byFrom.set(migration.fromRevision, {
        index: migrationIndex,
        toRevision: migration.toRevision,
      });
    }
    if (byTo.has(migration.toRevision)) {
      addIssue(context, [...migrationPath, 'toRevision'], 'migration toRevisionが重複しています');
      chainDeterministic = false;
    } else {
      byTo.set(migration.toRevision, {
        index: migrationIndex,
        fromRevision: migration.fromRevision,
      });
    }

    const sourceActions = new Map<string, ProgressMigrationStep>();
    const targets = new Set<string>();
    for (const [stepIndex, step] of migration.steps.entries()) {
      const stepPath = [...migrationPath, 'steps', stepIndex] as const;
      const sourceId = migrationSourceId(step);
      const sourceKey = `${step.entity}:${sourceId}`;
      if (sourceActions.has(sourceKey)) {
        addIssue(context, stepPath, `同じ旧IDへのactionが重複しています: ${sourceKey}`);
        stepsDeterministic = false;
      } else {
        sourceActions.set(sourceKey, step);
      }

      if (step.action === 'map-to' && step.fromId === step.toId) {
        addIssue(context, stepPath, '同じIDへのmap-toではpreserveを使用してください');
        stepsDeterministic = false;
      }
      const targetId = migrationTargetId(step);
      if (targetId !== undefined) {
        const targetKey = `${step.entity}:${targetId}`;
        if (targets.has(targetKey)) {
          addIssue(context, stepPath, `同じ移行先IDが重複しています: ${targetKey}`);
          stepsDeterministic = false;
        } else {
          targets.add(targetKey);
        }
      }
    }
    actionsByMigration.push(sourceActions);
  }

  let chainValid = chainDeterministic;
  if (chainDeterministic) {
    const completed = new Set<string>();
    let cycleDetected = false;
    for (const start of byFrom.keys()) {
      if (completed.has(start)) continue;
      const path = new Set<string>();
      let revision = start;
      while (!completed.has(revision)) {
        if (path.has(revision)) {
          cycleDetected = true;
          break;
        }
        path.add(revision);
        const edge = byFrom.get(revision);
        if (edge === undefined) break;
        revision = edge.toRevision;
      }
      for (const visited of path) completed.add(visited);
      if (cycleDetected) break;
    }

    if (cycleDetected) {
      addIssue(context, ['progressMigrations'], 'migration revisionがcycleしています');
      chainValid = false;
    } else {
      const heads = [...byFrom.keys()].filter((revision) => !byTo.has(revision));
      const tails = [...byTo.keys()].filter((revision) => !byFrom.has(revision));
      if (heads.length !== 1 || tails.length !== 1) {
        addIssue(context, ['progressMigrations'], 'migration chainが途中で切れています');
        chainValid = false;
      } else {
        const canonicalIndexes: number[] = [];
        let revision = heads[0]!;
        let edge = byFrom.get(revision);
        while (edge !== undefined) {
          canonicalIndexes.push(edge.index);
          revision = edge.toRevision;
          edge = byFrom.get(revision);
        }
        if (canonicalIndexes.length !== migrations.length) {
          addIssue(context, ['progressMigrations'], 'migration chainが途中で切れています');
          chainValid = false;
        }
        if (revision !== course.revision) {
          addIssue(context, ['progressMigrations'], 'migration chainが現行revisionへ到達しません');
          chainValid = false;
        }
        if (!canonicalIndexes.every((originalIndex, index) => originalIndex === index)) {
          addIssue(
            context,
            ['progressMigrations'],
            'migration配列順がoldest→currentではありません',
          );
          chainValid = false;
        }
      }
    }
  }

  if (!chainValid || !stepsDeterministic) return;

  for (const [migrationIndex, migration] of migrations.entries()) {
    for (const [stepIndex, step] of migration.steps.entries()) {
      if (step.action === 'intentionally-reset') continue;
      let terminalId = migrationTargetId(step)!;
      let reset = false;
      for (let nextIndex = migrationIndex + 1; nextIndex < migrations.length; nextIndex += 1) {
        const nextStep = actionsByMigration[nextIndex]!.get(`${step.entity}:${terminalId}`);
        if (nextStep === undefined) continue;
        if (nextStep.action === 'intentionally-reset') {
          reset = true;
          break;
        }
        terminalId = migrationTargetId(nextStep)!;
      }
      if (!reset && !currentIds[step.entity].has(terminalId)) {
        addIssue(
          context,
          ['progressMigrations', migrationIndex, 'steps', stepIndex],
          `migration終端が現行IDへ到達しません: ${step.entity}:${terminalId}`,
        );
      }
    }
  }
}

const CONCEPT_SLIDE_KINDS = new Set(['concept', 'comparison', 'diagram', 'code']);

/** Course内の永続ID、owner-local参照、順序、宣言集計を横断検証する。 */
function validateCourse(course: CourseManifestValue, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  const slideIds = new Set<string>();
  const slideIdsByLesson = new Map(
    course.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) =>
        lessons.map((lesson) => [lesson.id, lesson.slides.map(({ id }) => id)] as const),
      ),
    ),
  );
  const glossaryIds = new Set(course.glossary.map(({ id }) => id));
  const lessonOrder = new Map<string, number>();
  const ruleIds = new Set<string>();
  const explicitRuleGroups = new Map<string, IssuePath>();
  const groupOwnerById = new Map<string, string>();
  const assetSignatureById = new Map<string, string>();
  const workspaceOwnerById = new Map<string, ProjectWorkspaceOwner | undefined>();
  const ownerByProjectId = new Map<string, ProjectOwner>();
  const currentIds: Record<ProgressEntity, Set<string>> = {
    chapter: new Set(),
    lesson: new Set(),
    slide: new Set(),
    exercise: new Set(),
    rule: new Set(),
    hint: new Set(),
    checklist: new Set(),
    workspace: new Set(),
  };
  const totals: Totals = {
    chapters: 0,
    lessons: 0,
    conceptSlides: 0,
    standardExercises: 0,
    guidedProjectLessons: 0,
    capstoneLessons: 0,
    estimatedMinutes: 0,
  };

  /** entity別Course-global IDを登録し、重複を報告する。 */
  const register = (entity: string, id: string, path: IssuePath): void => {
    const key = `${entity}:${id}`;
    if (seen.has(key)) addIssue(context, path, `重複ID: ${key}`);
    seen.add(key);
  };

  /** ownerをまたいで再利用するAsset IDが同じ公開実体を表すことを検証する。 */
  const registerAsset = (asset: AssetRefValue, path: IssuePath): void => {
    const signature = JSON.stringify({
      path: canonicalPublicPath(asset.path) ?? asset.path,
      mediaType: asset.mediaType,
      alt: asset.alt ?? null,
      provenanceId: asset.provenanceId,
      intrinsicWidth: asset.intrinsicWidth ?? null,
      intrinsicHeight: asset.intrinsicHeight ?? null,
    });
    const previous = assetSignatureById.get(asset.id);
    if (previous !== undefined && previous !== signature) {
      addIssue(context, path, `Asset IDの定義がowner間で一致しません: ${asset.id}`);
    }
    assetSignatureById.set(asset.id, signature);
  };

  if (hasDuplicates(course.prerequisites)) {
    addIssue(context, ['prerequisites'], 'Course prerequisite IDが重複しています');
  }
  if (course.prerequisites.includes(course.id)) {
    addIssue(context, ['prerequisites'], 'Courseは自分自身をprerequisiteにできません');
  }
  if (hasDuplicates(course.supportedDevices.study)) {
    addIssue(context, ['supportedDevices', 'study'], 'study対応端末が重複しています');
  }

  let chapterSequence = 0;
  let lessonSequence = 0;
  for (const [phaseIndex, phase] of course.phases.entries()) {
    const phasePath = ['phases', phaseIndex] as const;
    register('phase', phase.id, [...phasePath, 'id']);

    for (const [chapterIndex, chapter] of phase.chapters.entries()) {
      const chapterPath = [...phasePath, 'chapters', chapterIndex] as const;
      register('chapter', chapter.id, [...chapterPath, 'id']);
      currentIds.chapter.add(chapter.id);
      totals.chapters += 1;
      if (chapter.sequence !== chapterSequence) {
        addIssue(
          context,
          [...chapterPath, 'sequence'],
          'Chapter sequenceは配列順の0..n-1で指定してください',
        );
      }
      chapterSequence += 1;

      let chapterMinutes = 0;
      for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
        const lessonPath = [...chapterPath, 'lessons', lessonIndex] as const;
        register('lesson', lesson.id, [...lessonPath, 'id']);
        currentIds.lesson.add(lesson.id);
        lessonOrder.set(lesson.id, lessonSequence);
        lessonSequence += 1;
        totals.lessons += 1;
        totals.estimatedMinutes += lesson.estimatedMinutes;
        chapterMinutes += lesson.estimatedMinutes;
        if (lesson.kind === 'guided-project') totals.guidedProjectLessons += 1;
        if (lesson.kind === 'capstone') totals.capstoneLessons += 1;
        if (lesson.kind !== chapter.kind) {
          addIssue(context, [...lessonPath, 'kind'], 'Lesson kindとChapter kindが一致しません');
        }

        const localSlideIds = new Set<string>();
        const localExerciseIds = new Set<string>();
        const localRequirementIds = new Set<string>();
        const localViewportIds = new Set<string>();
        const localRulesByRequirement = new Map<string, ValidationRuleValue[]>();

        for (const [slideIndex, slide] of lesson.slides.entries()) {
          const slidePath = [...lessonPath, 'slides', slideIndex] as const;
          register('slide', slide.id, [...slidePath, 'id']);
          slideIds.add(slide.id);
          currentIds.slide.add(slide.id);
          localSlideIds.add(slide.id);
          if (CONCEPT_SLIDE_KINDS.has(slide.kind)) {
            totals.conceptSlides += 1;
            if (slide.concept === undefined) {
              addIssue(
                context,
                [...slidePath, 'concept'],
                'Concept系Slideはconceptを指定してください',
              );
            }
            if (slide.blocks.filter(({ type }) => type === 'practice').length !== 1) {
              addIssue(
                context,
                [...slidePath, 'blocks'],
                'Concept Slideは5分以内のMicro-practiceを1件持つ必要があります',
              );
            }
          }
          validateOwnerIds(context, 'Asset', slide.assets, [...slidePath, 'assets']);
          for (const [assetIndex, asset] of slide.assets.entries()) {
            registerAsset(asset, [...slidePath, 'assets', assetIndex]);
          }
          const assetsById = new Map(slide.assets.map((asset) => [asset.id, asset]));
          validateImageBlocks(context, slide.blocks, assetsById, [...slidePath, 'blocks'], 'Slide');
        }

        const reviewableSlideIds =
          lesson.kind !== 'standard' && localSlideIds.size === 0
            ? new Set(
                lesson.prerequisiteLessonIds.flatMap(
                  (prerequisiteId) => slideIdsByLesson.get(prerequisiteId) ?? [],
                ),
              )
            : localSlideIds;
        const reviewableSlideError =
          lesson.kind !== 'standard' && localSlideIds.size === 0
            ? 'Slide 0件の制作Lessonは前提Lesson内のSlideだけを参照できます'
            : '同じLesson内のSlide参照先が存在しません';

        for (const [exerciseIndex, exercise] of lesson.exercises.entries()) {
          const exercisePath = [...lessonPath, 'exercises', exerciseIndex] as const;
          register('exercise', exercise.id, [...exercisePath, 'id']);
          currentIds.exercise.add(exercise.id);
          localExerciseIds.add(exercise.id);
          currentIds.workspace.add(exercise.workspaceId);

          if (course.runnerId === 'javascript' && exercise.runtime?.kind !== 'javascript') {
            addIssue(
              context,
              [...exercisePath, 'runtime'],
              'JavaScript ExerciseにはRuntime設定が必要です',
            );
          }
          if (course.runnerId !== 'javascript' && exercise.runtime?.kind === 'javascript') {
            addIssue(
              context,
              [...exercisePath, 'runtime'],
              'Course RunnerとRuntime設定が一致しません',
            );
          }
          if (exercise.runtime?.kind === 'javascript') {
            const canonicalEntryFile = canonicalPublicPath(exercise.runtime.entryFile);
            const entryFile = exercise.files.find(
              (file) => canonicalPublicPath(file.path) === canonicalEntryFile,
            );
            if (entryFile?.language !== 'javascript') {
              addIssue(
                context,
                [...exercisePath, 'runtime', 'entryFile'],
                'JavaScript Runtime entryFileはjavascript Fileを参照してください',
              );
            }
          }

          if (exercise.kind !== lesson.kind) {
            addIssue(
              context,
              [...exercisePath, 'kind'],
              'Exercise kindとLesson kindが一致しません',
            );
          }
          if (exercise.kind === 'standard') {
            if (!exercise.countsTowardStandardExerciseTotal) {
              addIssue(
                context,
                [...exercisePath, 'countsTowardStandardExerciseTotal'],
                'Standard ExerciseはStandard Exercise集計へ含めてください',
              );
            }
            totals.standardExercises += exercise.countsTowardStandardExerciseTotal ? 1 : 0;
            if (workspaceOwnerById.has(exercise.workspaceId)) {
              addIssue(
                context,
                [...exercisePath, 'workspaceId'],
                'Standard Exercise間でworkspaceを共有できません',
              );
            }
            workspaceOwnerById.set(exercise.workspaceId, undefined);
          } else {
            if (exercise.countsTowardStandardExerciseTotal) {
              addIssue(
                context,
                [...exercisePath, 'countsTowardStandardExerciseTotal'],
                'Project ExerciseはStandard Exercise集計へ含められません',
              );
            }
            const lessonProjectId = lesson.kind === 'standard' ? undefined : lesson.project.id;
            if (exercise.projectId !== lessonProjectId) {
              addIssue(
                context,
                [...exercisePath, 'projectId'],
                'Exercise projectIdとLesson project.idが一致しません',
              );
            }
            const workspaceOwner = workspaceOwnerById.get(exercise.workspaceId);
            if (
              workspaceOwnerById.has(exercise.workspaceId) &&
              (workspaceOwner === undefined ||
                workspaceOwner.projectId !== exercise.projectId ||
                workspaceOwner.kind !== exercise.kind ||
                (exercise.kind === 'capstone' && workspaceOwner.lessonId !== lesson.id))
            ) {
              addIssue(
                context,
                [...exercisePath, 'workspaceId'],
                'workspaceは1つのprojectだけに所属できます。CapstoneではLesson間共有できません',
              );
            }
            const projectOwner = ownerByProjectId.get(exercise.projectId);
            if (
              projectOwner !== undefined &&
              (projectOwner.workspaceId !== exercise.workspaceId ||
                projectOwner.kind !== exercise.kind ||
                (exercise.kind === 'capstone' && projectOwner.lessonId !== lesson.id))
            ) {
              addIssue(
                context,
                [...exercisePath, 'workspaceId'],
                '1つのprojectは1つのworkspaceだけを使用できます。CapstoneではLesson間共有できません',
              );
            }
            workspaceOwnerById.set(exercise.workspaceId, {
              projectId: exercise.projectId,
              kind: exercise.kind,
              lessonId: lesson.id,
            });
            ownerByProjectId.set(exercise.projectId, {
              workspaceId: exercise.workspaceId,
              kind: exercise.kind,
              lessonId: lesson.id,
            });
          }

          const canonicalFilePaths = exercise.files
            .map(({ path }) => canonicalPublicPath(path))
            .filter((path): path is string => path !== undefined);
          if (hasDuplicates(canonicalFilePaths)) {
            addIssue(context, [...exercisePath, 'files'], 'Exercise File pathが重複しています');
          }
          validateOwnerIds(context, 'Viewport', exercise.previewViewports, [
            ...exercisePath,
            'previewViewports',
          ]);
          validateOwnerIds(context, 'Asset', exercise.assets, [...exercisePath, 'assets']);
          for (const [assetIndex, asset] of exercise.assets.entries()) {
            registerAsset(asset, [...exercisePath, 'assets', assetIndex]);
          }
          const exerciseAssetsById = new Map(exercise.assets.map((asset) => [asset.id, asset]));
          validateImageBlocks(
            context,
            exercise.instructions,
            exerciseAssetsById,
            [...exercisePath, 'instructions'],
            'Exercise',
          );

          const viewportIds = new Set(exercise.previewViewports.map(({ id }) => id));
          for (const viewportId of viewportIds) localViewportIds.add(viewportId);
          const localHintIds = new Set<string>();
          for (const [hintIndex, hint] of exercise.hints.entries()) {
            const hintPath = [...exercisePath, 'hints', hintIndex] as const;
            register('hint', hint.id, [...hintPath, 'id']);
            currentIds.hint.add(hint.id);
            localHintIds.add(hint.id);
            if (hint.relatedSlideId !== undefined && !reviewableSlideIds.has(hint.relatedSlideId)) {
              addIssue(
                context,
                [...hintPath, 'relatedSlideId'],
                `${reviewableSlideError}: ${hint.relatedSlideId}`,
              );
            }
          }
          if (exercise.hints.map(({ level }) => level).join(',') !== '1,2,3') {
            addIssue(
              context,
              [...exercisePath, 'hints'],
              'Hint levelは1,2,3を1件ずつ順に指定してください',
            );
          }

          if (hasDuplicates(exercise.relatedSlideIds)) {
            addIssue(
              context,
              [...exercisePath, 'relatedSlideIds'],
              'Exercise relatedSlideIdsが重複しています',
            );
          }
          for (const relatedSlideId of exercise.relatedSlideIds) {
            if (!reviewableSlideIds.has(relatedSlideId)) {
              addIssue(
                context,
                [...exercisePath, 'relatedSlideIds'],
                `${reviewableSlideError}: ${relatedSlideId}`,
              );
            }
          }

          const groupModes = new Map<string, 'all' | 'any'>();
          for (const [ruleIndex, rule] of exercise.validationRules.entries()) {
            const rulePath = [...exercisePath, 'validationRules', ruleIndex] as const;
            const htmlCssRule = HtmlCssValidationRuleDefinitionSchema.safeParse(rule);
            const javaScriptRule = JavaScriptValidationRuleDefinitionSchema.safeParse(rule);
            register('rule', rule.id, [...rulePath, 'id']);
            ruleIds.add(rule.id);
            currentIds.rule.add(rule.id);
            const requirementId = rule.groupId ?? rule.id;
            localRequirementIds.add(requirementId);
            currentIds.rule.add(requirementId);
            const requirementRules = localRulesByRequirement.get(requirementId) ?? [];
            requirementRules.push(rule);
            localRulesByRequirement.set(requirementId, requirementRules);

            if (rule.groupId !== undefined) {
              if (!explicitRuleGroups.has(rule.groupId)) {
                explicitRuleGroups.set(rule.groupId, [...rulePath, 'groupId']);
              }
              const owner = groupOwnerById.get(rule.groupId);
              if (owner !== undefined && owner !== exercise.id) {
                addIssue(
                  context,
                  [...rulePath, 'groupId'],
                  'Rule Groupは同じExercise内だけで共有できます',
                );
              }
              groupOwnerById.set(rule.groupId, exercise.id);
            }
            const previousMode = groupModes.get(requirementId);
            if (previousMode !== undefined && previousMode !== rule.group) {
              addIssue(
                context,
                [...rulePath, 'group'],
                `同じRule Groupのoperatorが一致しません: ${requirementId}`,
              );
            }
            groupModes.set(requirementId, rule.group);

            if (hasDuplicates(rule.viewportIds)) {
              addIssue(context, [...rulePath, 'viewportIds'], 'Rule viewportIdsが重複しています');
            }
            if (!rule.viewportIds.every((id) => viewportIds.has(id))) {
              addIssue(context, [...rulePath, 'viewportIds'], 'RuleのViewport参照先が存在しません');
            }
            if (!localHintIds.has(rule.hintId)) {
              addIssue(context, [...rulePath, 'hintId'], 'RuleのHint参照先が存在しません');
            }
            if (!reviewableSlideIds.has(rule.relatedSlideId)) {
              addIssue(
                context,
                [...rulePath, 'relatedSlideId'],
                `${reviewableSlideError}: ${rule.relatedSlideId}`,
              );
            }
            if (course.validatorId === 'html-css' && !htmlCssRule.success) {
              addIssue(context, rulePath, 'HTML/CSS Validator Ruleの形式が不正です');
            }
            if (
              course.validatorId === 'javascript' &&
              !htmlCssRule.success &&
              !javaScriptRule.success
            ) {
              addIssue(context, rulePath, 'JavaScript Validator Ruleの形式が不正です');
            }
            if (
              javaScriptRule.success &&
              javaScriptRule.data.target.kind === 'javascript-source' &&
              !canonicalFilePaths.includes(
                canonicalPublicPath(javaScriptRule.data.target.file) ?? '',
              )
            ) {
              addIssue(
                context,
                [...rulePath, 'target', 'file'],
                'JavaScript Source Fileが存在しません',
              );
            }
          }
          if (
            course.validatorId === 'javascript' &&
            !exercise.validationRules.some(({ target }) => target.kind === 'javascript-source')
          ) {
            addIssue(
              context,
              [...exercisePath, 'validationRules'],
              'JavaScript ExerciseにはSource Ruleが1件以上必要です',
            );
          }
        }

        if (lesson.kind === 'standard') {
          if (lesson.completion.finalSlideId !== lesson.slides.at(-1)?.id) {
            addIssue(
              context,
              [...lessonPath, 'completion', 'finalSlideId'],
              'finalSlideIdはLesson末尾Slideと一致させてください',
            );
          }
          if (hasDuplicates(lesson.completion.requiredExerciseIds)) {
            addIssue(
              context,
              [...lessonPath, 'completion', 'requiredExerciseIds'],
              'completion requiredExerciseIdsが重複しています',
            );
          }
          for (const id of lesson.completion.requiredExerciseIds) {
            if (!localExerciseIds.has(id)) {
              addIssue(
                context,
                [...lessonPath, 'completion', 'requiredExerciseIds'],
                `同じLesson内のExercise参照先が存在しません: ${id}`,
              );
            }
          }
        } else {
          const projectBlocks = [...lesson.project.brief, ...lesson.project.guide];
          if (projectBlocks.some(({ type }) => type === 'image')) {
            addIssue(
              context,
              [...lessonPath, 'project'],
              'Project brief／guideではimage blockを使用できません',
            );
          }
          validateOwnerIds(context, 'Checklist', lesson.project.checklist, [
            ...lessonPath,
            'project',
            'checklist',
          ]);
          const checklistIds = new Set<string>();
          const requiredChecklistIds: string[] = [];
          for (const [itemIndex, item] of lesson.project.checklist.entries()) {
            const itemPath = [...lessonPath, 'project', 'checklist', itemIndex] as const;
            register('checklist', item.id, [...itemPath, 'id']);
            currentIds.checklist.add(item.id);
            checklistIds.add(item.id);
            if (item.required) requiredChecklistIds.push(item.id);
            if (hasDuplicates(item.ruleIds)) {
              addIssue(context, [...itemPath, 'ruleIds'], 'Checklist ruleIdsが重複しています');
            }
            for (const ruleId of item.ruleIds) {
              if (!localRequirementIds.has(ruleId)) {
                addIssue(
                  context,
                  [...itemPath, 'ruleIds'],
                  `Checklist Rule Group参照先が存在しません: ${ruleId}`,
                );
              }
            }
          }

          if (lesson.kind === 'guided-project') {
            if (
              !hasSameStringSet(lesson.completion.requiredChecklistItemIds, requiredChecklistIds)
            ) {
              addIssue(
                context,
                [...lessonPath, 'completion', 'requiredChecklistItemIds'],
                '必須Checklist IDがrequired=trueの集合と一致しません',
              );
            }
            for (const id of lesson.completion.requiredChecklistItemIds) {
              if (!checklistIds.has(id)) {
                addIssue(
                  context,
                  [...lessonPath, 'completion', 'requiredChecklistItemIds'],
                  `同じLesson内のChecklist参照先が存在しません: ${id}`,
                );
              }
            }
            if (hasDuplicates(lesson.completion.requiredExerciseIds)) {
              addIssue(
                context,
                [...lessonPath, 'completion', 'requiredExerciseIds'],
                'completion requiredExerciseIdsが重複しています',
              );
            }
            for (const id of lesson.completion.requiredExerciseIds) {
              if (!localExerciseIds.has(id)) {
                addIssue(
                  context,
                  [...lessonPath, 'completion', 'requiredExerciseIds'],
                  `同じLesson内のExercise参照先が存在しません: ${id}`,
                );
              }
            }
          } else {
            if (hasDuplicates(lesson.completion.requiredRuleIds)) {
              addIssue(
                context,
                [...lessonPath, 'completion', 'requiredRuleIds'],
                'Capstone requiredRuleIdsが重複しています',
              );
            }
            for (const id of lesson.completion.requiredRuleIds) {
              if (!localRequirementIds.has(id)) {
                addIssue(
                  context,
                  [...lessonPath, 'completion', 'requiredRuleIds'],
                  `同じLesson内のRule Group参照先が存在しません: ${id}`,
                );
                continue;
              }
              const rules = localRulesByRequirement.get(id) ?? [];
              if (
                rules.some(
                  (rule) =>
                    rule.viewportMode !== 'all' ||
                    !lesson.completion.requiredViewportIds.every((viewportId) =>
                      rule.viewportIds.includes(viewportId),
                    ),
                )
              ) {
                addIssue(
                  context,
                  [...lessonPath, 'completion', 'requiredRuleIds'],
                  `Capstone必須Ruleは全requiredViewportをviewportMode=allで評価してください: ${id}`,
                );
              }
            }
            if (hasDuplicates(lesson.completion.requiredViewportIds)) {
              addIssue(
                context,
                [...lessonPath, 'completion', 'requiredViewportIds'],
                'Capstone requiredViewportIdsが重複しています',
              );
            }
            for (const id of lesson.completion.requiredViewportIds) {
              if (!localViewportIds.has(id)) {
                addIssue(
                  context,
                  [...lessonPath, 'completion', 'requiredViewportIds'],
                  `同じLesson内のViewport参照先が存在しません: ${id}`,
                );
              }
            }
          }
        }
      }

      if (chapter.estimatedMinutes !== chapterMinutes) {
        addIssue(
          context,
          [...chapterPath, 'estimatedMinutes'],
          `Chapter estimatedMinutes=${String(chapter.estimatedMinutes)} ですがLesson合計は${String(chapterMinutes)}です`,
        );
      }
    }
  }

  for (const [groupId, groupPath] of explicitRuleGroups) {
    if (ruleIds.has(groupId)) {
      addIssue(
        context,
        groupPath,
        `Rule Group IDはRule IDと衝突できません。自Ruleと同じ場合はgroupIdを省略してください: ${groupId}`,
      );
    }
  }

  for (const [entryIndex, entry] of course.glossary.entries()) {
    const entryPath = ['glossary', entryIndex] as const;
    register('glossary', entry.id, [...entryPath, 'id']);
    if (!slideIds.has(entry.firstSlideId)) {
      addIssue(
        context,
        [...entryPath, 'firstSlideId'],
        `Glossary firstSlide参照先が存在しません: ${entry.firstSlideId}`,
      );
    }
    if (hasDuplicates(entry.relatedIds)) {
      addIssue(context, [...entryPath, 'relatedIds'], 'Glossary関連語IDが重複しています');
    }
    for (const relatedId of entry.relatedIds) {
      if (relatedId === entry.id) {
        addIssue(context, [...entryPath, 'relatedIds'], 'Glossary関連語は自己参照できません');
      } else if (!glossaryIds.has(relatedId)) {
        addIssue(
          context,
          [...entryPath, 'relatedIds'],
          `Glossary関連語参照先が存在しません: ${relatedId}`,
        );
      }
    }
  }

  for (const [phaseIndex, phase] of course.phases.entries()) {
    for (const [chapterIndex, chapter] of phase.chapters.entries()) {
      for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
        const lessonPath = [
          'phases',
          phaseIndex,
          'chapters',
          chapterIndex,
          'lessons',
          lessonIndex,
        ] as const;
        const order = lessonOrder.get(lesson.id)!;
        if (hasDuplicates(lesson.prerequisiteLessonIds)) {
          addIssue(
            context,
            [...lessonPath, 'prerequisiteLessonIds'],
            `Lesson prerequisite IDが重複しています: ${lesson.id}`,
          );
        }
        for (const [prerequisiteIndex, prerequisiteId] of lesson.prerequisiteLessonIds.entries()) {
          const prerequisitePath = [
            ...lessonPath,
            'prerequisiteLessonIds',
            prerequisiteIndex,
          ] as const;
          const prerequisiteOrder = lessonOrder.get(prerequisiteId);
          if (prerequisiteOrder === undefined) {
            addIssue(context, prerequisitePath, `Lesson参照先が存在しません: ${prerequisiteId}`);
          } else if (prerequisiteOrder >= order) {
            addIssue(
              context,
              prerequisitePath,
              `prerequisiteLessonIdsは先行Lessonだけを指定してください: ${prerequisiteId}`,
            );
          }
        }
        if (lesson.nextLessonId !== undefined) {
          const nextOrder = lessonOrder.get(lesson.nextLessonId);
          if (nextOrder === undefined) {
            addIssue(
              context,
              [...lessonPath, 'nextLessonId'],
              `Lesson参照先が存在しません: ${lesson.nextLessonId}`,
            );
          } else if (nextOrder <= order) {
            addIssue(
              context,
              [...lessonPath, 'nextLessonId'],
              `nextLessonIdは後続Lessonだけを指定してください: ${lesson.nextLessonId}`,
            );
          }
        }
        if (hasDuplicates(lesson.glossaryRefs)) {
          addIssue(
            context,
            [...lessonPath, 'glossaryRefs'],
            `Lesson glossaryRefsが重複しています: ${lesson.id}`,
          );
        }
        for (const [glossaryIndex, glossaryId] of lesson.glossaryRefs.entries()) {
          if (!glossaryIds.has(glossaryId)) {
            addIssue(
              context,
              [...lessonPath, 'glossaryRefs', glossaryIndex],
              `Glossary参照先が存在しません: ${glossaryId}`,
            );
          }
        }
      }
    }
  }

  for (const key of Object.keys(totals) as (keyof Totals)[]) {
    if (key === 'conceptSlides') continue;
    if (course.expectedTotals[key] !== totals[key]) {
      addIssue(
        context,
        ['expectedTotals', key],
        `expectedTotals.${key}=${String(course.expectedTotals[key])} ですが実集計は${String(totals[key])}です`,
      );
    }
  }
  if (totals.conceptSlides < course.expectedTotals.conceptSlides) {
    addIssue(
      context,
      ['expectedTotals', 'conceptSlides'],
      `Concept Slideの最低枚数は${String(course.expectedTotals.conceptSlides)}ですが実集計は${String(totals.conceptSlides)}です`,
    );
  }
  if (course.estimatedMinutes !== totals.estimatedMinutes) {
    addIssue(
      context,
      ['estimatedMinutes'],
      `Course estimatedMinutes=${String(course.estimatedMinutes)} ですがLesson合計は${String(totals.estimatedMinutes)}です`,
    );
  }

  validateProgressMigrations(course, currentIds, context);
}

export const CourseManifestSchema = CourseManifestBaseSchema.superRefine(validateCourse);

export const LessonStartTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slide'), targetId: IdSchema }).strict(),
  z.object({ kind: z.literal('exercise'), targetId: IdSchema }).strict(),
]);

export const CourseCatalogLessonStartSchema = z
  .object({
    lessonId: IdSchema,
    target: LessonStartTargetSchema,
  })
  .strict();

export const LearningPathStepSchema = z
  .object({
    courseId: IdSchema,
    role: z.enum(['required', 'recommended']),
    prerequisiteCourseIds: z.array(IdSchema),
  })
  .strict();

export const LearningPathDefinitionSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    publicationStatus: z.enum(['draft', 'published']),
    steps: z.array(LearningPathStepSchema).min(1),
  })
  .strict();
