import type {
  HtmlCssRuleAssertion,
  HtmlCssRuleTarget,
  HtmlCssValidationRuleDefinition,
} from '../content/types';
import type {
  PreviewNode,
  PreviewSnapshot,
  RunnerDiagnostic,
  SnapshotPolicy,
} from '../runtime/contracts';
import type {
  ValidationCheck,
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
  ValidatorRule,
} from './contracts';
import {
  buildSnapshotPolicy as buildHtmlCssSnapshotPolicy,
  parseValidatorRules,
} from './validatorRuleSchema';

interface SnapshotIndex {
  readonly snapshot: PreviewSnapshot;
  readonly nodes: readonly PreviewNode[];
  readonly byId: ReadonlyMap<number, PreviewNode>;
  readonly siblingsByParent: ReadonlyMap<number | null, readonly PreviewNode[]>;
}

interface AssertionEvaluation {
  readonly passed: boolean;
  readonly actual: string;
}

interface ContrastMeasurement extends AssertionEvaluation {
  readonly ratio?: number;
}

interface RuleEvaluation {
  readonly rule: HtmlCssValidationRuleDefinition;
  readonly passed: boolean;
  readonly actual: string;
}

interface RequirementEvaluation {
  readonly id: string;
  readonly required: boolean;
  readonly passed: boolean;
}

interface SnapshotPreflight {
  readonly snapshots: ReadonlyMap<string, PreviewSnapshot>;
  readonly executionRevision: number | null;
  readonly diagnostics: readonly RunnerDiagnostic[];
}

interface RgbaColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

const STRICT_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const CSS_NUMERIC_PATTERN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:%|[a-z][a-z0-9-]*)?$/i;

/** QuoteとSelector内の意味ある空白を保ち、区切り記号周辺の整形差だけを畳む。 */
function normalizeSourceWhitespace(source: string): string {
  let normalized = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let pendingWhitespace = false;
  const separators = new Set(['{', '}', ':', ';', ',']);
  for (const character of source) {
    if (quote !== undefined) {
      normalized += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (/\s/u.test(character)) {
      pendingWhitespace = true;
      continue;
    }
    if (separators.has(character)) {
      normalized = normalized.trimEnd();
      normalized += character;
      pendingWhitespace = false;
      continue;
    }
    if (pendingWhitespace && normalized.length > 0 && !separators.has(normalized.at(-1) ?? '')) {
      normalized += ' ';
    }
    pendingWhitespace = false;
    if (character === '"' || character === "'") {
      quote = character;
      normalized += character;
    } else {
      normalized += character;
    }
  }
  return normalized.trim();
}

/** 学習者向け情報を保ったsystem diagnosticを生成する。 */
function systemDiagnostic(code: string, message: string): RunnerDiagnostic {
  return {
    code,
    kind: 'system',
    severity: 'error',
    message,
    learnerMessage:
      '判定用プレビューを再実行してください。続く場合は教材の問題として報告してください。',
  };
}

/** Rule評価前の失敗を空checkのValidationResultへ変換する。 */
function blockedResult(
  context: ValidationContext,
  status: 'code-error' | 'system-error',
  diagnostics: readonly RunnerDiagnostic[],
  executionRevision: number | null,
): ValidationResult {
  return {
    exerciseId: context.exerciseId,
    executionRevision,
    status,
    checks: [],
    passedRequirementIds: [],
    diagnostics: [...diagnostics],
    evaluatedAt: context.now,
  };
}

/** Ruleが参照するviewportを入力順に一度だけ列挙する。 */
function referencedViewportIds(
  rules: readonly HtmlCssValidationRuleDefinition[],
): readonly string[] {
  const ids = new Set<string>();
  for (const rule of rules) {
    for (const viewportId of rule.viewportIds) ids.add(viewportId);
  }
  return [...ids];
}

/** Snapshotの存在・Record key・同一session/revisionをRule評価前に確認する。 */
function preflightSnapshots(
  rules: readonly HtmlCssValidationRuleDefinition[],
  snapshots: Readonly<Record<string, PreviewSnapshot>>,
): SnapshotPreflight {
  const selected = new Map<string, PreviewSnapshot>();
  const diagnostics: RunnerDiagnostic[] = [];
  let expectedSession: string | undefined;
  let expectedRevision: number | undefined;

  for (const viewportId of referencedViewportIds(rules)) {
    const snapshot = snapshots[viewportId];
    if (snapshot === undefined) {
      diagnostics.push(
        systemDiagnostic(
          'VALIDATION_SNAPSHOT_MISSING',
          `Validation snapshot is missing for viewport: ${viewportId}`,
        ),
      );
      continue;
    }
    if (snapshot.viewport.id !== viewportId) {
      diagnostics.push(
        systemDiagnostic(
          'VALIDATION_SNAPSHOT_KEY_MISMATCH',
          `Snapshot key ${viewportId} does not match viewport ${snapshot.viewport.id}`,
        ),
      );
      continue;
    }
    selected.set(viewportId, snapshot);
    expectedSession ??= snapshot.exerciseSessionId;
    expectedRevision ??= snapshot.executionRevision;
    if (
      snapshot.exerciseSessionId !== expectedSession ||
      snapshot.executionRevision !== expectedRevision
    ) {
      diagnostics.push(
        systemDiagnostic(
          'VALIDATION_SNAPSHOT_IDENTITY_MISMATCH',
          `Snapshot identity differs at viewport: ${viewportId}`,
        ),
      );
    }
  }

  return {
    snapshots: selected,
    executionRevision: diagnostics.length === 0 ? (expectedRevision ?? null) : null,
    diagnostics,
  };
}

/** Snapshotをdocument orderと親子参照へ一度だけ索引化する。 */
function indexSnapshot(snapshot: PreviewSnapshot): SnapshotIndex {
  const nodes = [...snapshot.nodes].sort(
    (left, right) => left.documentOrder - right.documentOrder || left.nodeId - right.nodeId,
  );
  const byId = new Map<number, PreviewNode>();
  const mutableSiblings = new Map<number | null, PreviewNode[]>();
  for (const node of nodes) {
    byId.set(node.nodeId, node);
    const siblings = mutableSiblings.get(node.parentId) ?? [];
    siblings.push(node);
    mutableSiblings.set(node.parentId, siblings);
  }
  return { snapshot, nodes, byId, siblingsByParent: mutableSiblings };
}

type PreviewTarget = Exclude<HtmlCssRuleTarget, { readonly kind: 'source' }>;
type SourceTarget = Extract<HtmlCssRuleTarget, { readonly kind: 'source' }>;

/** selector/node targetを観測済みNode集合へ解決する。 */
function targetNodes(index: SnapshotIndex, target: PreviewTarget): readonly PreviewNode[] {
  if (target.kind === 'selector') {
    return index.nodes.filter((node) => node.matchedSelectors.includes(target.selector));
  }
  return index.nodes.filter(
    (node) =>
      (target.tagName === undefined ||
        node.tagName.toLowerCase() === target.tagName.toLowerCase()) &&
      (target.role === undefined || node.role === target.role) &&
      (target.textIncludes === undefined || node.text.includes(target.textIncludes)),
  );
}

/** 編集Sourceをtext assertionへ適用し、全内容を漏らさない要約を返す。 */
function evaluateSourceAssertion(
  files: Readonly<Record<string, string>>,
  target: SourceTarget,
  assertion: HtmlCssRuleAssertion,
): AssertionEvaluation {
  const source = files[target.file];
  if (source === undefined) {
    return { passed: false, actual: `${target.file}: Fileが見つかりません` };
  }
  if (assertion.kind !== 'text') {
    return { passed: false, actual: `${target.file}: 非対応のSource判定です` };
  }
  const passed =
    assertion.operator === 'equals'
      ? source === assertion.expected
      : assertion.operator === 'contains-normalized'
        ? normalizeSourceWhitespace(source).includes(normalizeSourceWhitespace(assertion.expected))
        : source.includes(assertion.expected);
  return {
    passed,
    actual: `${target.file}: 指定文字列${passed ? 'あり' : 'なし'}`,
  };
}

/** 有限なHTML属性数値だけを返し、単位や末尾junkを拒否する。 */
function parseStrictNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!STRICT_NUMBER_PATTERN.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 単一のCSS numeric valueから有限な数値部を返す。 */
function parseCssNumeric(value: string): number | undefined {
  const match = CSS_NUMERIC_PATTERN.exec(value.trim());
  if (match?.[1] === undefined) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** equals/gte/lteをtolerance込みで比較する。 */
function compareNumber(
  actual: number,
  operator: 'equals' | 'gte' | 'lte',
  expected: number,
  tolerance = 0,
): boolean {
  if (![actual, expected, tolerance].every(Number.isFinite)) return false;
  if (operator === 'equals') return Math.abs(actual - expected) <= tolerance;
  if (operator === 'gte') return actual + tolerance >= expected;
  return actual - tolerance <= expected;
}

/** count演算子を数値比較へ適用する。 */
function compareCount(
  actual: number,
  operator: 'equals' | 'gte' | 'lte',
  expected: number,
): boolean {
  return compareNumber(actual, operator, expected);
}

/** 欠落値と空文字を判別できる表示へ変換する。 */
function displayValue(value: string | undefined): string {
  if (value === undefined) return '<missing>';
  if (value.length === 0) return '""';
  return value;
}

/** HTML属性assertionをNode一件へ適用する。 */
function evaluateAttribute(
  node: PreviewNode,
  assertion: Extract<HtmlCssRuleAssertion, { readonly kind: 'attribute' }>,
): AssertionEvaluation {
  const present = Object.prototype.hasOwnProperty.call(node.attributes, assertion.name);
  const value = node.attributes[assertion.name];
  if (assertion.operator === 'present') return { passed: present, actual: displayValue(value) };
  if (assertion.operator === 'contains') {
    return { passed: value?.includes(assertion.expected) ?? false, actual: displayValue(value) };
  }
  if (assertion.operator === 'equals') {
    const expected = assertion.expected;
    if (typeof expected === 'number') {
      const numeric = value === undefined ? undefined : parseStrictNumber(value);
      return { passed: numeric === expected, actual: displayValue(value) };
    }
    return { passed: value === String(expected), actual: displayValue(value) };
  }
  const numeric = value === undefined ? undefined : parseStrictNumber(value);
  return {
    passed: numeric !== undefined && compareNumber(numeric, assertion.operator, assertion.expected),
    actual: displayValue(value),
  };
}

/** computed style assertionをNode一件へ適用する。 */
function evaluateComputedStyle(
  node: PreviewNode,
  assertion: Extract<
    HtmlCssRuleAssertion,
    { readonly kind: 'computed-style' | 'focus-visible-style' }
  >,
): AssertionEvaluation {
  const styles =
    assertion.kind === 'focus-visible-style'
      ? node.focusVisibleComputedStyles
      : node.computedStyles;
  const value = styles[assertion.property];
  if (assertion.operator === 'contains') {
    return { passed: value?.includes(assertion.expected) ?? false, actual: displayValue(value) };
  }
  if (assertion.operator === 'equals' && typeof assertion.expected === 'string') {
    return { passed: value === assertion.expected, actual: displayValue(value) };
  }
  if (typeof assertion.expected !== 'number') {
    return { passed: false, actual: displayValue(value) };
  }
  const numeric = value === undefined ? undefined : parseCssNumeric(value);
  return {
    passed:
      numeric !== undefined &&
      compareNumber(numeric, assertion.operator, assertion.expected, assertion.tolerance ?? 0),
    actual: displayValue(value),
  };
}

/** parent参照をboundedに辿り、candidateがsourceの子孫か確認する。 */
function isDescendant(index: SnapshotIndex, source: PreviewNode, candidate: PreviewNode): boolean {
  const visited = new Set<number>();
  let parentId = candidate.parentId;
  while (parentId !== null && !visited.has(parentId)) {
    if (parentId === source.nodeId) return true;
    visited.add(parentId);
    parentId = index.byId.get(parentId)?.parentId ?? null;
  }
  return false;
}

/** sourceから見た4種のDOM関係を評価する。 */
function evaluateRelation(
  index: SnapshotIndex,
  sources: readonly PreviewNode[],
  assertion: Extract<HtmlCssRuleAssertion, { readonly kind: 'relation' }>,
): AssertionEvaluation {
  const candidates = index.nodes.filter((node) =>
    node.matchedSelectors.includes(assertion.otherSelector),
  );
  const sourceEvaluations = sources.map((source) => {
    const passed = (() => {
      if (assertion.relation === 'child') {
        return candidates.some((candidate) => candidate.parentId === source.nodeId);
      }
      if (assertion.relation === 'descendant') {
        return candidates.some((candidate) => isDescendant(index, source, candidate));
      }
      if (assertion.relation === 'next-sibling') {
        const siblings = index.siblingsByParent.get(source.parentId) ?? [];
        const sourceIndex = siblings.findIndex(({ nodeId }) => nodeId === source.nodeId);
        const next = sourceIndex < 0 ? undefined : siblings[sourceIndex + 1];
        return next?.matchedSelectors.includes(assertion.otherSelector) ?? false;
      }
      if (assertion.relation === 'contained-by') {
        const tolerance = 0.5;
        return candidates.some((candidate) => {
          if (!isDescendant(index, candidate, source)) return false;
          const sourceRight = source.rect.x + source.rect.width;
          const sourceBottom = source.rect.y + source.rect.height;
          const candidateRight = candidate.rect.x + candidate.rect.width;
          const candidateBottom = candidate.rect.y + candidate.rect.height;
          return (
            source.rect.x + tolerance >= candidate.rect.x &&
            source.rect.y + tolerance >= candidate.rect.y &&
            sourceRight <= candidateRight + tolerance &&
            sourceBottom <= candidateBottom + tolerance
          );
        });
      }
      return candidates.some((candidate) => source.documentOrder < candidate.documentOrder);
    })();
    return { nodeId: source.nodeId, passed };
  });
  const passed = sourceEvaluations.length > 0 && sourceEvaluations.every((item) => item.passed);
  const sourceActual =
    sourceEvaluations.length === 0
      ? '対象0件'
      : sourceEvaluations
          .map(
            ({ nodeId, passed: sourcePassed }) =>
              `#${String(nodeId)}:${sourcePassed ? '成立' : '不成立'}`,
          )
          .join(' | ');
  return {
    passed,
    actual: `${sourceActual} (${assertion.relation} ${assertion.otherSelector})`,
  };
}

/** 0..255またはpercentageのRGB channelを0..1へ正規化する。 */
function parseColorChannel(token: string): number | undefined {
  const trimmed = token.trim();
  const percentage = trimmed.endsWith('%');
  const numericText = percentage ? trimmed.slice(0, -1) : trimmed;
  if (!STRICT_NUMBER_PATTERN.test(numericText)) return undefined;
  const value = Number(numericText);
  const maximum = percentage ? 100 : 255;
  if (!Number.isFinite(value) || value < 0 || value > maximum) return undefined;
  return value / maximum;
}

/** 0..1またはpercentageのalphaを検証する。 */
function parseAlpha(token: string | undefined): number | undefined {
  if (token === undefined) return 1;
  const trimmed = token.trim();
  const percentage = trimmed.endsWith('%');
  const numericText = percentage ? trimmed.slice(0, -1) : trimmed;
  if (!STRICT_NUMBER_PATTERN.test(numericText)) return undefined;
  const value = Number(numericText);
  const maximum = percentage ? 100 : 1;
  if (!Number.isFinite(value) || value < 0 || value > maximum) return undefined;
  return value / maximum;
}

/** computed colorのlegacy/modern rgb表記を検証済みRGBAへ変換する。 */
function parseCssColor(value: string | undefined): RgbaColor | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent') return { red: 0, green: 0, blue: 0, alpha: 0 };
  if (normalized === 'black') return { red: 0, green: 0, blue: 0, alpha: 1 };
  if (normalized === 'white') return { red: 1, green: 1, blue: 1, alpha: 1 };
  const functionMatch = /^rgba?\((.*)\)$/i.exec(normalized);
  if (functionMatch?.[1] === undefined) return undefined;

  const body = functionMatch[1].trim();
  let channels: readonly string[];
  let alphaToken: string | undefined;
  if (body.includes(',')) {
    const parts = body.split(',').map((part) => part.trim());
    if (parts.length !== 3 && parts.length !== 4) return undefined;
    channels = parts.slice(0, 3);
    alphaToken = parts[3];
  } else {
    const slashParts = body.split('/').map((part) => part.trim());
    if (slashParts.length > 2) return undefined;
    channels = slashParts[0]?.split(/\s+/) ?? [];
    alphaToken = slashParts[1];
  }
  if (channels.length !== 3) return undefined;
  const red = channels[0] === undefined ? undefined : parseColorChannel(channels[0]);
  const green = channels[1] === undefined ? undefined : parseColorChannel(channels[1]);
  const blue = channels[2] === undefined ? undefined : parseColorChannel(channels[2]);
  const alpha = parseAlpha(alphaToken);
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    return undefined;
  }
  return { red, green, blue, alpha };
}

/** foregroundをopaqueなbackgroundへalpha合成する。 */
function composite(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
  return {
    red:
      (foreground.red * foreground.alpha +
        background.red * background.alpha * (1 - foreground.alpha)) /
      alpha,
    green:
      (foreground.green * foreground.alpha +
        background.green * background.alpha * (1 - foreground.alpha)) /
      alpha,
    blue:
      (foreground.blue * foreground.alpha +
        background.blue * background.alpha * (1 - foreground.alpha)) /
      alpha,
    alpha,
  };
}

/** sRGB channelをWCAG相対輝度のlinear値へ変換する。 */
function linearChannel(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG相対輝度を算出する。 */
function relativeLuminance(color: RgbaColor): number {
  return (
    0.2126 * linearChannel(color.red) +
    0.7152 * linearChannel(color.green) +
    0.0722 * linearChannel(color.blue)
  );
}

/** Nodeからrootまでを循環検知しながら返す。 */
function ancestry(index: SnapshotIndex, node: PreviewNode): readonly PreviewNode[] | undefined {
  const chain: PreviewNode[] = [node];
  const visited = new Set<number>([node.nodeId]);
  let parentId = node.parentId;
  while (parentId !== null) {
    if (visited.has(parentId)) return undefined;
    const parent = index.byId.get(parentId);
    if (parent === undefined) return undefined;
    chain.push(parent);
    visited.add(parentId);
    parentId = parent.parentId;
  }
  return chain.reverse();
}

/** Nodeの透明色と祖先背景を合成しWCAG contrastを測定する。 */
function measureContrast(index: SnapshotIndex, node: PreviewNode): ContrastMeasurement {
  const chain = ancestry(index, node);
  if (chain === undefined) return { passed: false, actual: '測定できません: 親参照が不正です' };
  let background: RgbaColor = { red: 1, green: 1, blue: 1, alpha: 1 };
  for (const ancestor of chain) {
    const image = ancestor.computedStyles['background-image'];
    if (image === undefined || image.trim().toLowerCase() !== 'none') {
      return { passed: false, actual: '測定できません: 背景画像または背景情報が不明です' };
    }
    const layer = parseCssColor(ancestor.computedStyles['background-color']);
    if (layer === undefined) {
      return { passed: false, actual: '測定できません: 背景色が不正です' };
    }
    background = composite(layer, background);
  }
  const foreground = parseCssColor(node.computedStyles.color);
  if (foreground === undefined) {
    return { passed: false, actual: '測定できません: 前景色が不正です' };
  }
  const renderedForeground = composite(foreground, background);
  const foregroundLuminance = relativeLuminance(renderedForeground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return { passed: true, actual: `${ratio.toFixed(2)}:1`, ratio };
}

/** 単一Node assertionを評価し、比較した値を説明可能な文字列で返す。 */
function evaluateNodeAssertion(
  index: SnapshotIndex,
  node: PreviewNode,
  assertion: Exclude<HtmlCssRuleAssertion, { readonly kind: 'exists' | 'count' | 'relation' }>,
): AssertionEvaluation {
  switch (assertion.kind) {
    case 'attribute':
      return evaluateAttribute(node, assertion);
    case 'text':
      return {
        passed:
          assertion.operator === 'equals'
            ? node.text === assertion.expected
            : node.text.includes(assertion.expected),
        actual: displayValue(node.text),
      };
    case 'computed-style':
    case 'focus-visible-style':
      return evaluateComputedStyle(node, assertion);
    case 'rect': {
      const actual = node.rect[assertion.metric];
      return {
        passed: compareNumber(
          actual,
          assertion.operator,
          assertion.expected,
          assertion.tolerance ?? 0,
        ),
        actual: String(actual),
      };
    }
    case 'overflow-x':
      return { passed: node.overflow.x === assertion.expected, actual: String(node.overflow.x) };
    case 'focusable':
      return { passed: node.focusable === assertion.expected, actual: String(node.focusable) };
    case 'accessible-name':
      return {
        passed:
          assertion.operator === 'present'
            ? node.accessibleName.trim().length > 0
            : assertion.operator === 'equals'
              ? node.accessibleName === assertion.expected
              : node.accessibleName.includes(assertion.expected),
        actual: displayValue(node.accessibleName),
      };
    case 'role':
      return {
        passed:
          assertion.operator === 'present'
            ? node.role.trim().length > 0
            : node.role === assertion.expected,
        actual: displayValue(node.role),
      };
    case 'contrast': {
      const measured = measureContrast(index, node);
      if (!measured.passed || measured.ratio === undefined) return measured;
      return {
        passed: measured.ratio >= assertion.minimum,
        actual: measured.actual,
      };
    }
  }
}

/** 単一viewport上のRuleをtarget集合の規則どおり評価する。 */
function evaluateOnSnapshot(
  rule: HtmlCssValidationRuleDefinition,
  index: SnapshotIndex,
  files: Readonly<Record<string, string>>,
): AssertionEvaluation {
  if (rule.target.kind === 'source') {
    return evaluateSourceAssertion(files, rule.target, rule.assertion);
  }
  const nodes = targetNodes(index, rule.target);
  const assertion = rule.assertion;
  if (assertion.kind === 'exists') {
    return { passed: nodes.length > 0, actual: `${String(nodes.length)}件` };
  }
  if (assertion.kind === 'count') {
    return {
      passed: compareCount(nodes.length, assertion.operator, assertion.expected),
      actual: `${String(nodes.length)}件`,
    };
  }
  if (assertion.kind === 'relation') {
    return evaluateRelation(index, nodes, assertion);
  }
  if (nodes.length === 0) return { passed: false, actual: '対象0件' };
  const evaluations = nodes.map((node) => evaluateNodeAssertion(index, node, assertion));
  return {
    passed: evaluations.every(({ passed }) => passed),
    actual: evaluations.map(({ actual }) => actual).join(' | '),
  };
}

/** viewportごとの結果をRuleのall/anyへ集約する。 */
function evaluateRule(
  rule: HtmlCssValidationRuleDefinition,
  indexes: ReadonlyMap<string, SnapshotIndex>,
  files: Readonly<Record<string, string>>,
): RuleEvaluation {
  const viewportEvaluations = rule.viewportIds.map((viewportId) => {
    const index = indexes.get(viewportId)!;
    return { viewportId, ...evaluateOnSnapshot(rule, index, files) };
  });
  return {
    rule,
    passed:
      rule.viewportMode === 'all'
        ? viewportEvaluations.every(({ passed }) => passed)
        : viewportEvaluations.some(({ passed }) => passed),
    actual: viewportEvaluations
      .map(({ viewportId, actual }) => `[${viewportId}] ${actual}`)
      .join(' ; '),
  };
}

/** Rule結果をRequirementのall/anyへ初出順で集約する。 */
function aggregateRequirements(
  evaluations: readonly RuleEvaluation[],
): readonly RequirementEvaluation[] {
  const grouped = new Map<string, RuleEvaluation[]>();
  for (const evaluation of evaluations) {
    const requirementId = evaluation.rule.groupId ?? evaluation.rule.id;
    const members = grouped.get(requirementId) ?? [];
    members.push(evaluation);
    grouped.set(requirementId, members);
  }
  return [...grouped].map(([id, members]) => ({
    id,
    required: members[0]!.rule.required,
    passed:
      members[0]!.rule.group === 'all'
        ? members.every(({ passed }) => passed)
        : members.some(({ passed }) => passed),
  }));
}

/** Rule結果とRequirement結果から説明可能なcheckを構築する。 */
function createChecks(
  evaluations: readonly RuleEvaluation[],
  requirements: readonly RequirementEvaluation[],
): readonly ValidationCheck[] {
  const byId = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  return evaluations.map(({ rule, passed, actual }) => {
    const requirementId = rule.groupId ?? rule.id;
    const requirement = byId.get(requirementId)!;
    return {
      ruleId: rule.id,
      requirementId,
      label: rule.label,
      required: rule.required,
      passed,
      requirementPassed: requirement.passed,
      message: passed
        ? `${rule.label}：条件を満たしています`
        : `${rule.feedback.target}を確認してください`,
      expected: rule.feedback.expected,
      actual,
      nextAction: rule.feedback.nextAction,
      hintId: rule.hintId,
      relatedSlideId: rule.relatedSlideId,
    };
  });
}

/** data-only HTML/CSS Ruleを同一時点Snapshotへ評価する説明可能なValidator。 */
export class ValidatorRuleEngine implements ValidatorAdapter {
  /** 検証済みRuleからBridgeへ要求する観測fieldを導出する。 */
  buildSnapshotPolicy(rules: readonly ValidatorRule[]): SnapshotPolicy {
    return buildHtmlCssSnapshotPolicy(parseValidatorRules(rules));
  }

  /** system/code境界を先に判定し、RuleとRequirementを入力順に評価する。 */
  async validate(context: ValidationContext): Promise<ValidationResult> {
    let rules: readonly HtmlCssValidationRuleDefinition[];
    try {
      rules = parseValidatorRules(context.rules);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown rule validation error';
      return blockedResult(
        context,
        'system-error',
        [...context.diagnostics, systemDiagnostic('VALIDATION_RULE_INVALID', message)],
        null,
      );
    }

    try {
      const hasSystemError = context.diagnostics.some(
        ({ kind, severity }) => kind === 'system' && severity === 'error',
      );
      if (hasSystemError) {
        return blockedResult(context, 'system-error', context.diagnostics, null);
      }
      const preflight = preflightSnapshots(rules, context.snapshots);
      const hasLearnerError = context.diagnostics.some(
        ({ kind, severity }) => kind !== 'system' && severity === 'error',
      );
      if (hasLearnerError) {
        return blockedResult(
          context,
          'code-error',
          context.diagnostics,
          preflight.executionRevision,
        );
      }
      if (preflight.diagnostics.length > 0) {
        return blockedResult(
          context,
          'system-error',
          [...context.diagnostics, ...preflight.diagnostics],
          null,
        );
      }

      const indexes = new Map(
        [...preflight.snapshots].map(([viewportId, snapshot]) => [
          viewportId,
          indexSnapshot(snapshot),
        ]),
      );
      const evaluations = rules.map((rule) => evaluateRule(rule, indexes, context.files));
      const requirements = aggregateRequirements(evaluations);
      const checks = createChecks(evaluations, requirements);
      const passedRequirementIds = requirements.filter(({ passed }) => passed).map(({ id }) => id);
      const status = requirements.every(({ required, passed }) => !required || passed)
        ? 'pass'
        : 'incomplete';
      return {
        exerciseId: context.exerciseId,
        executionRevision: preflight.executionRevision,
        status,
        checks,
        passedRequirementIds,
        diagnostics: [...context.diagnostics],
        evaluatedAt: context.now,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown validation engine error';
      return blockedResult(
        context,
        'system-error',
        [...context.diagnostics, systemDiagnostic('VALIDATION_ENGINE_FAILED', message)],
        null,
      );
    }
  }
}
