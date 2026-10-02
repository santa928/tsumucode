/** 指定教材Goalだけのproducer→sink関係を有限AST形で確認する。実行やsource変更は行わない。 */
import type { Node } from 'acorn';
import type { JavaScriptTeachingGoal } from '../../../../core/content/javascriptTeachingGoals';

type Ast = Node & Readonly<Record<string, unknown>>;

export interface TeachingBinding {
  readonly name: string;
  readonly declaration: Node;
  readonly scopeOwner: Node;
}

/** 既存Analyzerのlexical identityを再利用する。新たな一般scope/dataflow解析は持たない。 */
export interface TeachingRelationContext {
  readonly program: Node;
  readonly nodes: readonly Node[];
  readonly parent: (node: Node) => Node | undefined;
  readonly resolve: (identifier: Node) => TeachingBinding | undefined;
  readonly global: (name: string) => TeachingBinding | undefined;
  readonly writes: (binding: TeachingBinding) => readonly Node[];
}

/** unknown AST fieldだけをNodeへ絞る。 */
function node(value: unknown): Node | undefined {
  return typeof value === 'object' && value !== null && 'type' in value
    ? (value as Node)
    : undefined;
}

/** Acornのbounded fieldを参照する。 */
function ast(value: Node): Ast {
  return value as Ast;
}

/** 一つの静的propertyを読む。computedはliteral keyだけを扱う。 */
function property(value: Node | undefined): string | number | undefined {
  if (value?.type !== 'MemberExpression') return undefined;
  const key = node(ast(value).property);
  if (key === undefined) return undefined;
  const result = ast(value).computed === true ? ast(key).value : ast(key).name;
  return typeof result === 'string' || typeof result === 'number' ? result : undefined;
}

/** 同名文字列でなく宣言nodeと名前の組でbindingを照合する。 */
function same(left: TeachingBinding | undefined, right: TeachingBinding | undefined): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.declaration === right.declaration &&
    left.name === right.name
  );
}

/** 配列fieldのbounded Nodeだけを列挙する。 */
function list(value: unknown): readonly Node[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const candidate = node(item);
        return candidate === undefined ? [] : [candidate];
      })
    : [];
}

/** Goal内の単純なprimitive literalを確認する。 */
function literal(value: Node | undefined, expected: string | number | boolean): boolean {
  return value?.type === 'Literal' && ast(value).value === expected;
}

/** 関係を借用できないbinding writeを拒否し、Goalが所有する更新だけを例外とする。 */
function stable(
  context: TeachingRelationContext,
  binding: TeachingBinding | undefined,
  allowed: readonly Node[] = [],
): binding is TeachingBinding {
  return binding !== undefined && context.writes(binding).every((write) => allowed.includes(write));
}

/** owner内の直接文だけを受理し、branch/未使用Function/return後を横断しない。 */
function direct(context: TeachingRelationContext, value: Node, owner: Node): boolean {
  if (value === owner) return true;
  let current = value;
  for (let depth = 0; depth < 64; depth += 1) {
    const parent = context.parent(current);
    if (parent === undefined) return false;
    if (parent.type === 'BlockStatement' || parent.type === 'Program') {
      const body = list(ast(parent).body);
      const index = body.indexOf(current);
      if (
        index < 0 ||
        body
          .slice(0, index)
          .some(
            (statement) =>
              statement.type === 'ReturnStatement' ||
              statement.type === 'ThrowStatement' ||
              statement.type === 'BreakStatement' ||
              statement.type === 'ContinueStatement',
          )
      )
        return false;
    }
    if (parent === owner) return true;
    if (
      ![
        'ExpressionStatement',
        'VariableDeclarator',
        'VariableDeclaration',
        'BlockStatement',
        'CallExpression',
        'MemberExpression',
        'BinaryExpression',
        'TemplateLiteral',
        'ReturnStatement',
      ].includes(parent.type)
    )
      return false;
    current = parent;
  }
  return false;
}

/** native Console rootが同名local bindingで置き換えられていないcallだけを返す。 */
function consoles(context: TeachingRelationContext, owner: Node): readonly Node[] {
  return context.nodes.filter((candidate) => {
    const callee = node(ast(candidate).callee);
    const root = callee === undefined ? undefined : node(ast(callee).object);
    return (
      candidate.type === 'CallExpression' &&
      property(callee) === 'log' &&
      root?.type === 'Identifier' &&
      ast(root).name === 'console' &&
      context.resolve(root) === undefined &&
      direct(context, candidate, owner)
    );
  });
}

/** 直接識別子が指定bindingを読むかを確認する。 */
function reference(
  context: TeachingRelationContext,
  value: Node | undefined,
  binding: TeachingBinding | undefined,
): boolean {
  return value?.type === 'Identifier' && same(context.resolve(value), binding);
}

/** 宣言initializerだけを返す。 */
function initializer(binding: TeachingBinding | undefined): Node | undefined {
  return binding?.declaration.type === 'VariableDeclarator'
    ? node(ast(binding.declaration).init)
    : undefined;
}

/** 指定binary式のoperand関係を括弧/operand逆順に依存せず確認する。 */
function binary(
  value: Node | undefined,
  operator: string,
  left: (node: Node | undefined) => boolean,
  right: (node: Node | undefined) => boolean,
  reversible = false,
): boolean {
  if (value?.type !== 'BinaryExpression' || ast(value).operator !== operator) return false;
  const first = node(ast(value).left);
  const second = node(ast(value).right);
  return (left(first) && right(second)) || (reversible && left(second) && right(first));
}

/** Consoleの単一引数を返し、spread/複数引数を推測しない。 */
function argument(call: Node): Node | undefined {
  const args = list(ast(call).arguments);
  return args.length === 1 ? args[0] : undefined;
}

/** literalまたは安定した直結bindingのprimitive型を限定的に取得する。 */
function primitive(
  context: TeachingRelationContext,
  value: Node | undefined,
  depth = 0,
): 'string' | 'number' | 'boolean' | undefined {
  if (value === undefined || depth > 2) return undefined;
  if (value.type === 'Literal') {
    const kind = typeof ast(value).value;
    return kind === 'string' || kind === 'number' || kind === 'boolean' ? kind : undefined;
  }
  if (value.type === 'Identifier') {
    const binding = context.resolve(value);
    return stable(context, binding)
      ? primitive(context, initializer(binding), depth + 1)
      : undefined;
  }
  return undefined;
}

/** 一意で安定したFunction宣言/initializerを解決する。 */
function functionNode(
  context: TeachingRelationContext,
  binding: TeachingBinding | undefined,
): Node | undefined {
  if (!stable(context, binding)) return undefined;
  const value =
    binding.declaration.type === 'FunctionDeclaration' ? binding.declaration : initializer(binding);
  return value !== undefined &&
    ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(value.type)
    ? value
    : undefined;
}

/** Functionの直接bodyだけを検査境界へ返す。 */
function body(fn: Node | undefined): Node | undefined {
  return fn === undefined ? undefined : node(ast(fn).body);
}

/** Programで直接実行される指定Function呼出しを確認する。 */
function invoked(context: TeachingRelationContext, binding: TeachingBinding | undefined): boolean {
  return (
    stable(context, binding) &&
    context.nodes.some(
      (candidate) =>
        candidate.type === 'CallExpression' &&
        reference(context, node(ast(candidate).callee), binding) &&
        direct(context, candidate, context.program),
    )
  );
}

/** 指定ownerの1行Consoleに文字が直接接続することを確認する。 */
function branchMessage(
  context: TeachingRelationContext,
  owner: Node | undefined,
  message: string,
): boolean {
  if (owner === undefined) return false;
  const outputs = consoles(context, owner);
  return outputs.length === 1 && literal(argument(outputs[0]!), message);
}

/** 同じbinding receiverから指定propertyを直接読む式を確認する。 */
function member(
  context: TeachingRelationContext,
  value: Node | undefined,
  binding: TeachingBinding | undefined,
  key: string | number,
): boolean {
  return (
    value?.type === 'MemberExpression' &&
    property(value) === key &&
    reference(context, node(ast(value).object), binding)
  );
}

/** native Arrayとして作られ、関連writeがない指定producerを確認する。 */
function arrayBinding(
  context: TeachingRelationContext,
  binding: TeachingBinding | undefined,
  count?: number,
): binding is TeachingBinding {
  const init = initializer(binding);
  return (
    stable(context, binding) &&
    init?.type === 'ArrayExpression' &&
    (count === undefined || list(ast(init).elements).length === count)
  );
}

/** 一意callback bindingまたはFunction外形を、名前固定なしで解決する。 */
function callback(context: TeachingRelationContext, value: Node | undefined): Node | undefined {
  if (value === undefined) return undefined;
  return ['FunctionExpression', 'ArrowFunctionExpression'].includes(value.type)
    ? value
    : value.type === 'Identifier'
      ? functionNode(context, context.resolve(value))
      : undefined;
}

/** 無条件の単一returnを解決する。if内の未到達returnは借用しない。 */
function returned(context: TeachingRelationContext, fn: Node | undefined): Node | undefined {
  const fnBody = body(fn);
  if (fnBody === undefined) return undefined;
  if (fnBody.type !== 'BlockStatement') return fnBody;
  const returns = context.nodes.filter(
    (value) => value.type === 'ReturnStatement' && direct(context, value, fnBody),
  );
  return returns.length === 1 ? node(ast(returns[0]!).argument) : undefined;
}

/** Object producerの静的data propertyだけを読む。spread/getterは値証拠にしない。 */
function objectValue(value: Node | undefined, key: string): Node | undefined {
  if (value?.type !== 'ObjectExpression') return undefined;
  const fields = list(ast(value).properties).filter(
    (field) =>
      field.type === 'Property' &&
      ast(field).computed === false &&
      ast(field).kind === 'init' &&
      (ast(node(ast(field).key)!).name === key || ast(node(ast(field).key)!).value === key),
  );
  return fields.length === 1 ? node(ast(fields[0]!).value) : undefined;
}

/** 同じcollection resultを反復し、そのiteratorだけから出力する関係を確認する。 */
function iteration(
  context: TeachingRelationContext,
  result: TeachingBinding | undefined,
  outputProperty?: string,
): Node | undefined {
  if (!stable(context, result)) return undefined;
  return context.nodes.find((loop) => {
    if (
      loop.type !== 'ForOfStatement' ||
      !direct(context, loop, context.program) ||
      !reference(context, node(ast(loop).right), result)
    )
      return false;
    const left = node(ast(loop).left);
    const declaration = left === undefined ? undefined : list(ast(left).declarations)[0];
    const id = declaration === undefined ? undefined : node(ast(declaration).id);
    const iterator = id === undefined ? undefined : context.resolve(id);
    const loopBody = node(ast(loop).body);
    if (!stable(context, iterator) || loopBody === undefined) return false;
    const sinks = consoles(context, loopBody);
    return (
      sinks.length === 1 &&
      (outputProperty === undefined
        ? reference(context, argument(sinks[0]!), iterator)
        : member(context, argument(sinks[0]!), iterator, outputProperty))
    );
  });
}

/** 指定Arrayのmap/filter/reduceから同じresult bindingを作る直接initializerを解決する。 */
function transform(
  context: TeachingRelationContext,
  result: TeachingBinding | undefined,
  source: TeachingBinding | undefined,
  method: 'map' | 'filter' | 'reduce',
):
  | { readonly call: Node; readonly fn: Node; readonly params: readonly TeachingBinding[] }
  | undefined {
  const init = initializer(result);
  const callee = init === undefined ? undefined : node(ast(init).callee);
  if (
    !stable(context, result) ||
    !arrayBinding(context, source) ||
    init?.type !== 'CallExpression' ||
    property(callee) !== method ||
    !reference(context, callee === undefined ? undefined : node(ast(callee).object), source) ||
    !direct(context, result.declaration, context.program)
  )
    return undefined;
  const fn = callback(context, list(ast(init).arguments)[0]);
  if (fn === undefined) return undefined;
  const ids = list(ast(fn).params);
  const params = ids.flatMap((id) => {
    const parameter = context.resolve(id);
    return parameter === undefined ? [] : [parameter];
  });
  return params.length === ids.length ? { call: init, fn, params } : undefined;
}

/** captured scoreの更新とreturn、factoryから返された各instanceの結果利用を限定して確認する。 */
function closureRelation(
  context: TeachingRelationContext,
  goal: 'score-closure' | 'score-closure-three' | 'score-closure-instances',
): Node | undefined {
  const factory = context.global('createScoreCounter');
  const fn = functionNode(context, factory);
  const fnBody = body(fn);
  if (fn === undefined || fnBody === undefined) return undefined;
  const inner = callback(context, returned(context, fn));
  const innerBody = body(inner);
  const result = returned(context, inner);
  const score = result?.type === 'Identifier' ? context.resolve(result) : undefined;
  if (
    inner === undefined ||
    innerBody === undefined ||
    score?.name !== 'score' ||
    score.scopeOwner !== fnBody ||
    !literal(initializer(score), 0) ||
    !direct(context, score.declaration, fnBody)
  )
    return undefined;
  const writes = context.writes(score);
  const update = writes.length === 1 ? writes[0] : undefined;
  const stepId = list(ast(fn).params)[0];
  const step = stepId === undefined ? undefined : context.resolve(stepId);
  const increment = (value: Node | undefined): boolean =>
    goal === 'score-closure-instances'
      ? reference(context, value, step) && stable(context, step)
      : literal(value, 10);
  if (
    update?.type !== 'AssignmentExpression' ||
    !direct(context, update, innerBody) ||
    !reference(context, node(ast(update).left), score) ||
    !(
      (ast(update).operator === '+=' && increment(node(ast(update).right))) ||
      (ast(update).operator === '=' &&
        binary(
          node(ast(update).right),
          '+',
          (value) => reference(context, value, score),
          increment,
          true,
        ))
    )
  )
    return undefined;
  const returnStatement = result === undefined ? undefined : context.parent(result);
  if (returnStatement?.type !== 'ReturnStatement' || update.end > returnStatement.start)
    return undefined;
  const instances = context.nodes.flatMap((declaration) => {
    if (declaration.type !== 'VariableDeclarator' || !direct(context, declaration, context.program))
      return [];
    const init = node(ast(declaration).init);
    const id = node(ast(declaration).id);
    const instance = id === undefined ? undefined : context.resolve(id);
    return init?.type === 'CallExpression' &&
      reference(context, node(ast(init).callee), factory) &&
      stable(context, instance)
      ? [instance]
      : [];
  });
  const count = goal === 'score-closure' ? 2 : goal === 'score-closure-three' ? 3 : 5;
  const expectedInstances = goal === 'score-closure-instances' ? 2 : 1;
  const sinks = consoles(context, context.program);
  if (instances.length !== expectedInstances || sinks.length !== count) return undefined;
  const used = sinks.map((sink) => {
    const value = argument(sink);
    return value?.type === 'CallExpression' && list(ast(value).arguments).length === 0
      ? instances.findIndex((instance) => reference(context, node(ast(value).callee), instance))
      : -1;
  });
  const expected =
    expectedInstances === 2 ? [0, 1, 0, 1, 0] : Array.from({ length: count }, () => 0);
  return used.every((instance, index) => instance === expected[index]) ? sinks[0] : undefined;
}

/** 指定throwのErrorが同try callを経てcatch parameter.messageへ届く関係だけを確認する。 */
function caughtRelation(context: TeachingRelationContext): Node | undefined {
  const producer = context.global('readQuestion');
  const fn = functionNode(context, producer);
  const fnBody = body(fn);
  const parameterId = fn === undefined ? undefined : list(ast(fn).params)[0];
  const parameter = parameterId === undefined ? undefined : context.resolve(parameterId);
  if (fnBody === undefined || !stable(context, parameter)) return undefined;
  const branch = context.nodes.find(
    (value) =>
      value.type === 'IfStatement' &&
      direct(context, value, fnBody) &&
      binary(
        node(ast(value).test),
        '===',
        (value) => member(context, value, parameter, 'text'),
        (value) => literal(value, ''),
        true,
      ),
  );
  const branchBody = branch === undefined ? undefined : node(ast(branch).consequent);
  const thrown =
    branchBody === undefined
      ? undefined
      : context.nodes.find(
          (value) => value.type === 'ThrowStatement' && direct(context, value, branchBody),
        );
  const error = thrown === undefined ? undefined : node(ast(thrown).argument);
  const errorCallee = error === undefined ? undefined : node(ast(error).callee);
  if (
    error?.type !== 'NewExpression' ||
    errorCallee?.type !== 'Identifier' ||
    ast(errorCallee).name !== 'Error' ||
    context.resolve(errorCallee) !== undefined ||
    !literal(list(ast(error).arguments)[0], '問題文がありません')
  )
    return undefined;
  return context.nodes.find((attempt) => {
    if (attempt.type !== 'TryStatement' || !direct(context, attempt, context.program)) return false;
    const block = node(ast(attempt).block);
    const handler = node(ast(attempt).handler);
    const catchBody = handler === undefined ? undefined : node(ast(handler).body);
    const caughtId = handler === undefined ? undefined : node(ast(handler).param);
    const caught = caughtId === undefined ? undefined : context.resolve(caughtId);
    if (block === undefined || catchBody === undefined || !stable(context, caught)) return false;
    const calls = consoles(context, block);
    const sinks = consoles(context, catchBody);
    const value = calls.length === 1 ? argument(calls[0]!) : undefined;
    return (
      value?.type === 'CallExpression' &&
      reference(context, node(ast(value).callee), producer) &&
      literal(objectValue(list(ast(value).arguments)[0], 'text'), '') &&
      sinks.length === 1 &&
      member(context, argument(sinks[0]!), caught, 'message')
    );
  });
}

/** 直接代入・更新・削除の対象だけを読む。一般の副作用解析は行わない。 */
function writeTarget(value: Node): Node | undefined {
  return value.type === 'AssignmentExpression'
    ? node(ast(value).left)
    : value.type === 'UpdateExpression' ||
        (value.type === 'UnaryExpression' && ast(value).operator === 'delete')
      ? node(ast(value).argument)
      : undefined;
}

/** 同じnative selector関数の直接writeを拒否し、shadowした別documentへ広げない。 */
function nativeSelectorUnchanged(context: TeachingRelationContext): boolean {
  return !context.nodes.some((write) => {
    const target = writeTarget(write);
    const receiver =
      target?.type === 'Identifier'
        ? target
        : property(target) === 'querySelector'
          ? node(ast(target!).object)
          : undefined;
    return (
      receiver?.type === 'Identifier' &&
      ast(receiver).name === 'document' &&
      context.resolve(receiver) === undefined
    );
  });
}

/** 表示テキストを置き換える2つの既存native propertyだけを関連writeにする。 */
function textProperty(value: Node | undefined): boolean {
  return property(value) === 'textContent' || property(value) === 'innerText';
}

/** native querySelectorの安定receiverと一段の安定aliasだけをDOM sinkへ解決する。 */
function selectorOf(
  context: TeachingRelationContext,
  value: Node | undefined,
  depth = 0,
): string | undefined {
  if (value === undefined || depth > 2) return undefined;
  if (value.type === 'Identifier') {
    const binding = context.resolve(value);
    if (binding === undefined) return undefined;
    const textWrites = context.writes(binding).filter((write) => {
      const target = writeTarget(write);
      return (
        write.type === 'AssignmentExpression' &&
        textProperty(target) &&
        reference(context, target === undefined ? undefined : node(ast(target).object), binding)
      );
    });
    return stable(context, binding, textWrites)
      ? selectorOf(context, initializer(binding), depth + 1)
      : undefined;
  }
  const callee = node(ast(value).callee);
  const root = callee === undefined ? undefined : node(ast(callee).object);
  const args = list(ast(value).arguments);
  const selector = args[0] === undefined ? undefined : ast(args[0]).value;
  return value.type === 'CallExpression' &&
    property(callee) === 'querySelector' &&
    root?.type === 'Identifier' &&
    ast(root).name === 'document' &&
    context.resolve(root) === undefined &&
    args.length === 1 &&
    typeof selector === 'string' &&
    args[0]?.type === 'Literal'
    ? selector
    : undefined;
}

/** 無条件のnative click登録のcallbackだけをGoalの実行ownerへする。 */
function handlers(context: TeachingRelationContext, selector: string): readonly Node[] {
  return context.nodes.flatMap((call) => {
    const callee = node(ast(call).callee);
    const args = list(ast(call).arguments);
    const fn = callback(context, args[1]);
    return call.type === 'CallExpression' &&
      property(callee) === 'addEventListener' &&
      selectorOf(context, callee === undefined ? undefined : node(ast(callee).object)) ===
        selector &&
      literal(args[0], 'click') &&
      args.length === 2 &&
      direct(context, call, context.program) &&
      fn !== undefined
      ? [fn]
      : [];
  });
}

/** 一意なproducerがnative Promiseを直接返すことを確認し、then風のObjectを代用しない。 */
function promiseProducer(context: TeachingRelationContext): TeachingBinding | undefined {
  const producer = context.global('loadQuestions');
  const value = returned(context, functionNode(context, producer));
  const callee = value === undefined ? undefined : node(ast(value).callee);
  return value?.type === 'NewExpression' &&
    callee?.type === 'Identifier' &&
    ast(callee).name === 'Promise' &&
    context.resolve(callee) === undefined
    ? producer
    : undefined;
}

interface PromiseReceipt {
  readonly binding: TeachingBinding;
  readonly owner: Node;
  readonly call: Node;
  readonly then?: Node;
}

/** await receiverまたはthen parameterへ直接渡った同producer結果だけを列挙する。 */
function receipts(
  context: TeachingRelationContext,
  owner: Node,
  producer: TeachingBinding,
  allowAwait: boolean,
): readonly PromiseReceipt[] {
  const found: PromiseReceipt[] = [];
  for (const candidate of context.nodes) {
    if (!direct(context, candidate, owner)) continue;
    if (allowAwait && candidate.type === 'VariableDeclarator') {
      const init = node(ast(candidate).init);
      const call = init === undefined ? undefined : node(ast(init).argument);
      const id = node(ast(candidate).id);
      const binding = id === undefined ? undefined : context.resolve(id);
      if (
        init?.type === 'AwaitExpression' &&
        call?.type === 'CallExpression' &&
        reference(context, node(ast(call).callee), producer) &&
        stable(context, binding)
      ) {
        found.push({ binding, owner, call });
      }
    }
    const callee = node(ast(candidate).callee);
    const call = callee === undefined ? undefined : node(ast(callee).object);
    if (
      candidate.type !== 'CallExpression' ||
      property(callee) !== 'then' ||
      call?.type !== 'CallExpression' ||
      !reference(context, node(ast(call).callee), producer)
    )
      continue;
    const fn = callback(context, list(ast(candidate).arguments)[0]);
    const fnBody = body(fn);
    const id = fn === undefined ? undefined : list(ast(fn).params)[0];
    const binding = id === undefined ? undefined : context.resolve(id);
    if (fnBody !== undefined && stable(context, binding))
      found.push({ binding, owner: fnBody, call, then: candidate });
  }
  return found;
}

/** 同selectorのtextContent/innerTextへの全直接writeを取る。値とownerはcallerが照合する。 */
function domWrites(
  context: TeachingRelationContext,
  selector: string,
  owner?: Node,
): readonly Node[] {
  return context.nodes.filter((write) => {
    const left = writeTarget(write);
    return (
      left !== undefined &&
      textProperty(left) &&
      selectorOf(context, node(ast(left).object)) === selector &&
      (owner === undefined || direct(context, write, owner))
    );
  });
}

/** 問題件数のprefix＋同じ受信Array.lengthを確認する。 */
function countValue(
  context: TeachingRelationContext,
  value: Node | undefined,
  result: TeachingBinding,
): boolean {
  if (
    binary(
      value,
      '+',
      (item) => literal(item, '問題: '),
      (item) => member(context, item, result, 'length'),
    )
  )
    return true;
  if (value?.type !== 'TemplateLiteral') return false;
  const expressions = list(ast(value).expressions);
  return (
    expressions.length === 1 &&
    member(context, expressions[0], result, 'length') &&
    list(ast(value).quasis)
      .map((item) => (ast(item).value as { cooked?: unknown }).cooked)
      .join('') === '問題: '
  );
}

/** 同じPromise receiptから必要DOM全体が作られ、別の固定writeに置き換えられていないことを確認する。 */
function receivedSinks(
  context: TeachingRelationContext,
  receipt: PromiseReceipt,
  includeQuestion: boolean,
  selector = '#count',
): readonly Node[] | undefined {
  const counts = domWrites(context, selector, receipt.owner);
  if (
    counts.length !== 1 ||
    counts[0]!.type !== 'AssignmentExpression' ||
    ast(counts[0]!).operator !== '=' ||
    !countValue(context, node(ast(counts[0]!).right), receipt.binding)
  )
    return undefined;
  const sinks = [counts[0]!];
  if (includeQuestion) {
    const questions = domWrites(context, '#question', receipt.owner);
    const value = questions.length === 1 ? node(ast(questions[0]!).right) : undefined;
    if (
      questions.length !== 1 ||
      questions[0]!.type !== 'AssignmentExpression' ||
      ast(questions[0]!).operator !== '=' ||
      value?.type !== 'MemberExpression' ||
      property(value) !== 'text' ||
      !member(context, node(ast(value).object), receipt.binding, 0)
    )
      return undefined;
    sinks.push(questions[0]!);
  }
  return sinks;
}

/** 登録callbackと単純な一段の直接呼出しbodyだけをconsumer探索対象へする。 */
function consumerBodies(context: TeachingRelationContext, handler: Node): readonly Node[] {
  const owner = body(handler);
  if (owner === undefined) return [];
  const owners = [owner];
  for (const call of context.nodes) {
    const callee = node(ast(call).callee);
    if (
      call.type !== 'CallExpression' ||
      callee?.type !== 'Identifier' ||
      !direct(context, call, owner)
    )
      continue;
    const fn = functionNode(context, context.resolve(callee));
    const fnBody = body(fn);
    if (fnBody !== undefined && !owners.includes(fnBody)) owners.push(fnBody);
  }
  return owners;
}

/** click handlerが指定boolを同一consumerへ渡す直接呼出しを確認する。 */
function forwarded(
  context: TeachingRelationContext,
  handler: Node,
  flag: boolean,
): Node | undefined {
  const owner = body(handler);
  if (owner === undefined) return undefined;
  const calls = context.nodes.filter(
    (call) =>
      call.type === 'CallExpression' &&
      direct(context, call, owner) &&
      literal(list(ast(call).arguments)[0], flag),
  );
  if (calls.length !== 1) return undefined;
  const callee = node(ast(calls[0]!).callee);
  return callee?.type === 'Identifier' ? functionNode(context, context.resolve(callee)) : undefined;
}

/** success/failure入力、同Promise受信、同rejectのcatchを一つの関係へ結ぶ。 */
function promiseFailure(
  context: TeachingRelationContext,
  producer: TeachingBinding,
): Node | undefined {
  const success = handlers(context, '#success');
  const failure = handlers(context, '#failure');
  if (success.length !== 1 || failure.length !== 1) return undefined;
  const fn = forwarded(context, success[0]!, false);
  if (fn === undefined || fn !== forwarded(context, failure[0]!, true)) return undefined;
  const owner = body(fn);
  const flagId = list(ast(fn).params)[0];
  const flag = flagId === undefined ? undefined : context.resolve(flagId);
  if (owner === undefined || !stable(context, flag)) return undefined;
  for (const attempt of context.nodes.filter(
    (value) => value.type === 'TryStatement' && direct(context, value, owner),
  )) {
    const block = node(ast(attempt).block);
    const handler = node(ast(attempt).handler);
    const catchBody = handler === undefined ? undefined : node(ast(handler).body);
    if (block === undefined || catchBody === undefined) continue;
    for (const receipt of receipts(context, block, producer, true)) {
      if (
        receipt.then !== undefined ||
        !reference(context, list(ast(receipt.call).arguments)[0], flag)
      )
        continue;
      const sinks = receivedSinks(context, receipt, false, '#result');
      const errors = domWrites(context, '#result', catchBody);
      if (
        sinks !== undefined &&
        errors.length === 1 &&
        literal(node(ast(errors[0]!).right), '読み込めませんでした') &&
        domWrites(context, '#result').every(
          (write) => sinks.includes(write) || errors.includes(write),
        )
      )
        return sinks[0];
    }
  }
  for (const receipt of receipts(context, owner, producer, false)) {
    if (
      receipt.then === undefined ||
      !reference(context, list(ast(receipt.call).arguments)[0], flag)
    )
      continue;
    const sinks = receivedSinks(context, receipt, false, '#result');
    const catches = context.nodes.filter((call) => {
      const callee = node(ast(call).callee);
      return (
        call.type === 'CallExpression' &&
        property(callee) === 'catch' &&
        node(ast(callee!).object) === receipt.then &&
        direct(context, call, owner)
      );
    });
    const catcher =
      catches.length === 1 ? callback(context, list(ast(catches[0]!).arguments)[0]) : undefined;
    const catchBody = body(catcher);
    const errors = catchBody === undefined ? [] : domWrites(context, '#result', catchBody);
    if (
      sinks !== undefined &&
      errors.length === 1 &&
      literal(node(ast(errors[0]!).right), '読み込めませんでした') &&
      domWrites(context, '#result').every(
        (write) => sinks.includes(write) || errors.includes(write),
      )
    )
      return sinks[0];
  }
  return undefined;
}

/** 登録UI handlerから同Promise結果がnative DOMへ接続する有限パターンだけを受理する。 */
function promiseRelation(
  context: TeachingRelationContext,
  goal: 'promise-then' | 'promise-await' | 'promise-catch',
): Node | undefined {
  if (!nativeSelectorUnchanged(context)) return undefined;
  const producer = promiseProducer(context);
  if (producer === undefined) return undefined;
  if (goal === 'promise-catch') return promiseFailure(context, producer);
  const listeners = handlers(context, '#load');
  if (listeners.length !== 1) return undefined;
  for (const owner of consumerBodies(context, listeners[0]!)) {
    for (const receipt of receipts(context, owner, producer, goal === 'promise-await')) {
      const sinks = receivedSinks(context, receipt, goal === 'promise-then');
      if (sinks === undefined) continue;
      if (
        domWrites(context, '#count').every((write) => sinks.includes(write)) &&
        (goal !== 'promise-then' ||
          domWrites(context, '#question').every((write) => sinks.includes(write)))
      )
        return sinks[0];
    }
  }
  return undefined;
}

/** 対象Goalの必要関係全体が成立した時だけ代表sinkを返す。未指定Goalは呼び出さない。 */
export function findTeachingRelation(
  context: TeachingRelationContext,
  goal: JavaScriptTeachingGoal,
): Node | undefined {
  const outputs = consoles(context, context.program);
  const binding = context.global;
  switch (goal) {
    case 'console-primitives': {
      const types = outputs.map((output) => primitive(context, argument(output)));
      return types.includes('string') && types.includes('number') && types.includes('boolean')
        ? outputs[0]
        : undefined;
    }
    case 'question-binding': {
      const target = binding('questionText');
      return stable(context, target) && direct(context, target.declaration, context.program)
        ? outputs.find((output) => reference(context, argument(output), target))
        : undefined;
    }
    case 'score-update': {
      const target = binding('score');
      const updates = target === undefined ? [] : context.writes(target);
      if (updates.length !== 1 || !literal(initializer(target), 10)) return undefined;
      const update = updates[0]!;
      if (
        update.type !== 'AssignmentExpression' ||
        ast(update).operator !== '+=' ||
        !literal(node(ast(update).right), 5) ||
        !direct(context, update, context.program)
      )
        return undefined;
      return outputs.find(
        (output) =>
          reference(context, argument(output), target) &&
          update.end < output.start &&
          target!.declaration.end < update.start,
      );
    }
    case 'answer-branch':
    case 'answer-chain': {
      const target = binding('answer');
      if (!stable(context, target)) return undefined;
      const branch = context.nodes.find(
        (candidate) =>
          candidate.type === 'IfStatement' &&
          direct(context, candidate, context.program) &&
          binary(
            node(ast(candidate).test),
            '===',
            (value) => reference(context, value, target),
            (value) => literal(value, 'A'),
            true,
          ),
      );
      if (branch === undefined) return undefined;
      if (goal === 'answer-branch')
        return branchMessage(context, node(ast(branch).consequent), '正解です') &&
          branchMessage(context, node(ast(branch).alternate), '不正解です')
          ? branch
          : undefined;
      const alternate = node(ast(branch).alternate);
      return branchMessage(context, node(ast(branch).consequent), 'Aです') &&
        alternate?.type === 'IfStatement' &&
        binary(
          node(ast(alternate).test),
          '===',
          (value) => reference(context, value, target),
          (value) => literal(value, 'B'),
          true,
        ) &&
        branchMessage(context, node(ast(alternate).consequent), 'Bです') &&
        branchMessage(context, node(ast(alternate).alternate), 'その他です')
        ? branch
        : undefined;
    }
    case 'question-loop': {
      return context.nodes.find((loop) => {
        if (loop.type !== 'ForStatement' || !direct(context, loop, context.program)) return false;
        const init = node(ast(loop).init);
        const declaration = init === undefined ? undefined : list(ast(init).declarations)[0];
        const id = declaration === undefined ? undefined : node(ast(declaration).id);
        const target = id === undefined ? undefined : context.resolve(id);
        const update = node(ast(loop).update);
        const loopBody = node(ast(loop).body);
        if (
          target?.name !== 'number' ||
          !literal(initializer(target), 1) ||
          update?.type !== 'UpdateExpression' ||
          ast(update).operator !== '++' ||
          !reference(context, node(ast(update).argument), target) ||
          !stable(context, target, [update]) ||
          !binary(
            node(ast(loop).test),
            '<=',
            (value) => reference(context, value, target),
            (value) => literal(value, 3),
          ) ||
          loopBody === undefined
        )
          return false;
        const sinks = consoles(context, loopBody);
        return (
          sinks.length === 1 &&
          binary(
            argument(sinks[0]!),
            '+',
            (value) => literal(value, '問題'),
            (value) => reference(context, value, target),
            true,
          )
        );
      });
    }
    case 'question-function': {
      const target = binding('showQuestion');
      const fnBody = body(functionNode(context, target));
      return invoked(context, target) && branchMessage(context, fnBody, '問題1: 2 + 3 は？')
        ? fnBody
        : undefined;
    }
    case 'label-scope': {
      const course = binding('courseName');
      const target = binding('showLabels');
      const fn = functionNode(context, target);
      const fnBody = body(fn);
      if (
        !stable(context, course) ||
        fn === undefined ||
        fnBody === undefined ||
        !invoked(context, target)
      )
        return undefined;
      const sinks = consoles(context, fnBody);
      const local = sinks
        .map(argument)
        .filter((value): value is Node => value?.type === 'Identifier')
        .map(context.resolve)
        .find(
          (value) =>
            value?.name === 'lessonName' && value.scopeOwner === fnBody && stable(context, value),
        );
      return local !== undefined &&
        sinks.some((sink) => reference(context, argument(sink), course)) &&
        sinks.some((sink) => reference(context, argument(sink), local))
        ? fnBody
        : undefined;
    }
    case 'score-closure':
    case 'score-closure-three':
    case 'score-closure-instances':
      return closureRelation(context, goal);
    case 'questions-array': {
      const target = binding('questions');
      return arrayBinding(context, target, 3) &&
        outputs.some((sink) => reference(context, argument(sink), target))
        ? outputs.find((sink) => member(context, argument(sink), target, 'length'))
        : undefined;
    }
    case 'questions-access': {
      const target = binding('questions');
      if (
        !arrayBinding(context, target, 3) ||
        !outputs.some((sink) => member(context, argument(sink), target, 0))
      )
        return undefined;
      return outputs.find((sink) => {
        const value = argument(sink);
        const callee = value === undefined ? undefined : node(ast(value).callee);
        return (
          value?.type === 'CallExpression' &&
          property(callee) === 'at' &&
          reference(context, callee === undefined ? undefined : node(ast(callee).object), target) &&
          literal(list(ast(value).arguments)[0], 1)
        );
      });
    }
    case 'questions-for-of': {
      const target = binding('questions');
      return arrayBinding(context, target, 3) ? iteration(context, target) : undefined;
    }
    case 'quiz-properties': {
      const target = binding('quiz');
      return stable(context, target) &&
        initializer(target)?.type === 'ObjectExpression' &&
        outputs.some((sink) => member(context, argument(sink), target, 'question'))
        ? outputs.find((sink) => member(context, argument(sink), target, 'answer'))
        : undefined;
    }
    case 'quiz-destructuring': {
      const quiz = binding('quiz');
      const prompt = binding('prompt');
      const choices = binding('choices');
      const first = binding('firstChoice');
      const pattern = prompt === undefined ? undefined : node(ast(prompt.declaration).id);
      if (
        !stable(context, quiz) ||
        initializer(quiz)?.type !== 'ObjectExpression' ||
        !stable(context, prompt) ||
        !stable(context, choices) ||
        !stable(context, first) ||
        prompt.declaration !== choices.declaration ||
        pattern?.type !== 'ObjectPattern' ||
        !reference(context, initializer(prompt), quiz) ||
        !reference(context, initializer(first), choices)
      )
        return undefined;
      const fields = list(ast(pattern).properties);
      const binds = (key: string, target: TeachingBinding): boolean =>
        fields.some((field) => {
          const id = node(ast(field).key);
          return (
            field.type === 'Property' &&
            id?.type === 'Identifier' &&
            ast(id).name === key &&
            reference(context, node(ast(field).value), target)
          );
        });
      const firstPattern = node(ast(first.declaration).id);
      return binds('text', prompt) &&
        binds('choices', choices) &&
        firstPattern?.type === 'ArrayPattern' &&
        reference(context, list(ast(firstPattern).elements)[0], first) &&
        outputs.some((sink) => reference(context, argument(sink), prompt))
        ? outputs.find((sink) => reference(context, argument(sink), first))
        : undefined;
    }
    case 'question-map': {
      const result = binding('labels');
      const mapped = transform(context, result, binding('questions'), 'map');
      const parameter = mapped?.params[0];
      const expression = returned(context, mapped?.fn);
      if (mapped === undefined || !stable(context, parameter)) return undefined;
      const prefixed =
        binary(
          expression,
          '+',
          (value) => literal(value, '問題: '),
          (value) => reference(context, value, parameter),
        ) ||
        (expression?.type === 'TemplateLiteral' &&
          list(ast(expression).expressions).length === 1 &&
          reference(context, list(ast(expression).expressions)[0], parameter) &&
          list(ast(expression).quasis)
            .map((value) => (ast(value).value as { cooked?: unknown }).cooked)
            .join('') === '問題: ');
      return prefixed ? iteration(context, result) : undefined;
    }
    case 'html-filter': {
      const result = binding('htmlQuestions');
      const filtered = transform(context, result, binding('questions'), 'filter');
      const parameter = filtered?.params[0];
      return filtered !== undefined &&
        stable(context, parameter) &&
        binary(
          returned(context, filtered.fn),
          '===',
          (value) => member(context, value, parameter, 'category'),
          (value) => literal(value, 'HTML'),
          true,
        )
        ? iteration(context, result, 'text')
        : undefined;
    }
    case 'points-reduce': {
      const result = binding('total');
      const reduced = transform(context, result, binding('questions'), 'reduce');
      if (
        reduced === undefined ||
        reduced.params.length !== 2 ||
        !literal(list(ast(reduced.call).arguments)[1], 0) ||
        !reduced.params.every((parameter) => stable(context, parameter)) ||
        !binary(
          returned(context, reduced.fn),
          '+',
          (value) => reference(context, value, reduced.params[0]),
          (value) => member(context, value, reduced.params[1], 'points'),
          true,
        )
      )
        return undefined;
      return outputs.find((sink) => reference(context, argument(sink), result));
    }
    case 'answered-map': {
      const source = binding('questions');
      const result = binding('answeredQuestions');
      const mapped = transform(context, result, source, 'map');
      const expression = returned(context, mapped?.fn);
      const parameter = mapped?.params[0];
      if (
        mapped === undefined ||
        !stable(context, parameter) ||
        expression?.type !== 'ObjectExpression'
      )
        return undefined;
      const fields = list(ast(expression).properties);
      if (
        !fields.some(
          (field) =>
            field.type === 'SpreadElement' &&
            reference(context, node(ast(field).argument), parameter),
        ) ||
        !literal(objectValue(expression, 'answered'), true)
      )
        return undefined;
      const accessed = (sink: Node, target: TeachingBinding | undefined): boolean => {
        const value = argument(sink);
        return (
          value?.type === 'MemberExpression' &&
          property(value) === 'answered' &&
          member(context, node(ast(value).object), target, 0)
        );
      };
      return outputs.some((sink) => accessed(sink, source))
        ? outputs.find((sink) => accessed(sink, result))
        : undefined;
    }
    case 'caught-error':
      return caughtRelation(context);
    case 'promise-then':
    case 'promise-await':
    case 'promise-catch':
      return promiseRelation(context, goal);
    default:
      return undefined;
  }
}
