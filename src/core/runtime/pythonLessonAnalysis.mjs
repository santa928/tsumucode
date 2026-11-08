import { pythonDecoratorFactoryAnalysis } from './pythonDecoratorFactoryAnalysis.mjs';
import { isPythonDecoratorFactoryProfile } from './pythonLessonProfiles.mjs';
import { pythonDecoratorAnalysis } from './pythonDecoratorAnalysis.mjs';
import { isPythonDecoratorProfile } from './pythonLessonProfiles.mjs';
import { pythonObjectProtocolAnalysis } from './pythonObjectProtocolAnalysis.mjs';
import { isPythonObjectProtocolProfile, isPythonOopProfile } from './pythonLessonProfiles.mjs';
import { pythonOopAnalysis } from './pythonOopAnalysis.mjs';
import { pythonIterationAnalysis } from './pythonIterationAnalysis.mjs';
import { pythonDataProjectAnalysis } from './pythonDataProjectAnalysis.mjs';
import { pythonContextAnalysis } from './pythonContextAnalysis.mjs';

/** 実Python ASTで最小教材の説明範囲とsource factsを調べる。隔離の根拠には使わない。 */
export function pythonLessonAnalysis(source, profile = 'values-vars-print-v1') {
  if (isPythonDecoratorFactoryProfile(profile))
    return pythonDecoratorFactoryAnalysis(source, profile);
  if (isPythonDecoratorProfile(profile)) return pythonDecoratorAnalysis(source, profile);
  if (isPythonObjectProtocolProfile(profile)) return pythonObjectProtocolAnalysis(source, profile);
  if (isPythonOopProfile(profile)) return pythonOopAnalysis(source, profile);
  if (profile === 'dataclass-test-project-v1') return pythonDataProjectAnalysis(source);
  if (profile === 'context-manager-close-v1') return pythonContextAnalysis(source);
  if (
    ['list-comprehension-filter-v1', 'iterator-consumption-v1', 'generator-lifecycle-v1'].includes(
      profile,
    )
  )
    return pythonIterationAnalysis(source, profile);
  if (
    [
      'function-call-v1',
      'function-arguments-v1',
      'function-result-v1',
      'function-print-return-v1',
      'function-scope-v2',
    ].includes(profile)
  )
    return functionLessonAnalysis(source, profile);
  if (
    [
      'list-values-update-v1',
      'list-iterate-sum-v1',
      'list-reference-sum-v1',
      'dict-value-sum-v1',
    ].includes(profile)
  )
    return dataLessonAnalysis(source, profile);
  if (profile !== 'values-vars-print-v1') return controlLessonAnalysis(source, profile);
  return `
import ast as _lesson_ast
import builtins as _lesson_builtins
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.Assign, _lesson_ast.Name,
    _lesson_ast.Store, _lesson_ast.Load, _lesson_ast.Constant,
    _lesson_ast.Expr, _lesson_ast.Call, _lesson_ast.BinOp, _lesson_ast.Add,
)
_lesson_supported = True
_lesson_builtin_names = set(dir(_lesson_builtins)) - {"print"}
for _lesson_node in _lesson_ast.walk(_lesson_tree):
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Assign):
        if len(_lesson_node.targets) != 1 or not isinstance(_lesson_node.targets[0], _lesson_ast.Name):
            _lesson_supported = False
        elif _lesson_node.targets[0].id == "print":
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call):
        if not isinstance(_lesson_node.func, _lesson_ast.Name) or _lesson_node.func.id != "print":
            _lesson_supported = False
        if len(_lesson_node.args) != 1 or _lesson_node.keywords:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant):
        if type(_lesson_node.value) not in (int, str):
            _lesson_supported = False
_lesson_values = {}
_lesson_printed = set()
_lesson_added = set()
_lesson_bindings = set()
for _lesson_node in _lesson_tree.body:
    for _lesson_read in _lesson_ast.walk(_lesson_node):
        if isinstance(_lesson_read, _lesson_ast.Name) and isinstance(_lesson_read.ctx, _lesson_ast.Load):
            if _lesson_read.id in _lesson_builtin_names and _lesson_read.id not in _lesson_bindings:
                _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Assign) and len(_lesson_node.targets) == 1:
        _lesson_target = _lesson_node.targets[0]
        if isinstance(_lesson_target, _lesson_ast.Name):
            _lesson_value = _lesson_node.value
            _lesson_values[_lesson_target.id] = isinstance(_lesson_value, _lesson_ast.Constant) and type(_lesson_value.value) is int and _lesson_value.value == 3
            _lesson_bindings.add(_lesson_target.id)
    if isinstance(_lesson_node, _lesson_ast.Expr) and isinstance(_lesson_node.value, _lesson_ast.Call):
        _lesson_call = _lesson_node.value
        if isinstance(_lesson_call.func, _lesson_ast.Name) and _lesson_call.func.id == "print" and len(_lesson_call.args) == 1:
            _lesson_arg = _lesson_call.args[0]
            if isinstance(_lesson_arg, _lesson_ast.Name) and _lesson_values.get(_lesson_arg.id):
                _lesson_printed.add(_lesson_arg.id)
            if isinstance(_lesson_arg, _lesson_ast.BinOp) and isinstance(_lesson_arg.op, _lesson_ast.Add):
                if isinstance(_lesson_arg.left, _lesson_ast.Name) and _lesson_values.get(_lesson_arg.left.id):
                    if isinstance(_lesson_arg.right, _lesson_ast.Constant) and type(_lesson_arg.right.value) is int and _lesson_arg.right.value == 2:
                        _lesson_added.add(_lesson_arg.left.id)
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": bool(_lesson_printed),
    "sameVariableAdditionPrinted": bool(_lesson_printed & _lesson_added),
})
`;
}

/** 小さい3教材のASTを調べる。出力直書きや比較境界・反復回数の誤りを別factsにする。 */
function controlLessonAnalysis(source, profile) {
  return `
import ast as _lesson_ast
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_profile = ${JSON.stringify(profile)}
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.Assign, _lesson_ast.Name,
    _lesson_ast.Store, _lesson_ast.Load, _lesson_ast.Constant,
    _lesson_ast.Expr, _lesson_ast.Call, _lesson_ast.If, _lesson_ast.For,
    _lesson_ast.Compare, _lesson_ast.GtE, _lesson_ast.Gt,
)
_lesson_supported = True
for _lesson_node in _lesson_ast.walk(_lesson_tree):
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name) and _lesson_node.id.startswith("_"):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name) and isinstance(_lesson_node.ctx, _lesson_ast.Store) and _lesson_node.id in ("print", "input", "int", "range"):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call):
        if not isinstance(_lesson_node.func, _lesson_ast.Name) or _lesson_node.func.id not in ("print", "input", "int", "range"):
            _lesson_supported = False
        elif _lesson_node.keywords or len(_lesson_node.args) != (0 if _lesson_node.func.id == "input" else 1):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant) and type(_lesson_node.value) not in (int, str):
        _lesson_supported = False

def _lesson_call(node, name):
    return isinstance(node, _lesson_ast.Call) and isinstance(node.func, _lesson_ast.Name) and node.func.id == name and not node.keywords

def _lesson_print(body, name=None, text=None):
    if len(body) != 1 or not isinstance(body[0], _lesson_ast.Expr):
        return False
    call = body[0].value
    if not _lesson_call(call, "print") or len(call.args) != 1:
        return False
    arg = call.args[0]
    return (isinstance(arg, _lesson_ast.Name) and arg.id == name) if name is not None else (isinstance(arg, _lesson_ast.Constant) and arg.value == text)

_lesson_echo = False
_lesson_branch = False
_lesson_loop = False
_lesson_body = _lesson_tree.body
if len(_lesson_body) == 2 and isinstance(_lesson_body[0], _lesson_ast.Assign):
    assignment = _lesson_body[0]
    if len(assignment.targets) == 1 and isinstance(assignment.targets[0], _lesson_ast.Name):
        name = assignment.targets[0].id
        value = assignment.value
        if _lesson_call(value, "input") and len(value.args) == 0:
            _lesson_echo = _lesson_print(_lesson_body[1:], name=name)
        if _lesson_call(value, "int") and len(value.args) == 1 and _lesson_call(value.args[0], "input") and len(value.args[0].args) == 0:
            branch = _lesson_body[1]
            if isinstance(branch, _lesson_ast.If):
                test = branch.test
                _lesson_branch = (
                    isinstance(test, _lesson_ast.Compare) and isinstance(test.left, _lesson_ast.Name) and test.left.id == name
                    and len(test.ops) == 1 and isinstance(test.ops[0], _lesson_ast.GtE)
                    and len(test.comparators) == 1 and isinstance(test.comparators[0], _lesson_ast.Constant)
                    and type(test.comparators[0].value) is int and test.comparators[0].value == 18
                    and _lesson_print(branch.body, text="adult") and _lesson_print(branch.orelse, text="child")
                )
if len(_lesson_body) == 1 and isinstance(_lesson_body[0], _lesson_ast.For):
    loop = _lesson_body[0]
    count = loop.iter
    _lesson_loop = (
        isinstance(loop.target, _lesson_ast.Name) and not loop.orelse
        and _lesson_call(count, "range") and len(count.args) == 1
        and isinstance(count.args[0], _lesson_ast.Constant) and type(count.args[0].value) is int and count.args[0].value == 3
        and _lesson_print(loop.body, name=loop.target.id)
    )
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "inputEchoed": _lesson_echo,
    "ageBoundaryBranched": _lesson_branch,
    "rangeIterated": _lesson_loop,
})
`;
}

/** Collectionの参照・反復とFunctionの呼出しを結ぶ。学習コードは実行しない。 */
function dataLessonAnalysis(source, profile) {
  return `
import ast as _lesson_ast
import builtins as _lesson_builtins
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_profile = ${JSON.stringify(profile)}
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.Assign, _lesson_ast.AugAssign,
    _lesson_ast.Name, _lesson_ast.Store, _lesson_ast.Load, _lesson_ast.Constant,
    _lesson_ast.Expr, _lesson_ast.Call, _lesson_ast.BinOp, _lesson_ast.Add,
    _lesson_ast.List, _lesson_ast.Dict, _lesson_ast.Subscript, _lesson_ast.For,
    _lesson_ast.FunctionDef, _lesson_ast.arguments, _lesson_ast.arg, _lesson_ast.Return,
${['list-values-update-v1', 'list-iterate-sum-v1'].includes(profile) ? '    _lesson_ast.UnaryOp, _lesson_ast.UAdd, _lesson_ast.USub,' : ''}
)
_lesson_reserved = set(dir(_lesson_builtins))
_lesson_functions = set()
_lesson_supported = True
for _lesson_node in _lesson_ast.walk(_lesson_tree):
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant) and type(_lesson_node.value) not in (int, str):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name):
        if _lesson_node.id.startswith("_") or (isinstance(_lesson_node.ctx, _lesson_ast.Store) and _lesson_node.id in _lesson_reserved):
            _lesson_supported = False
    if isinstance(_lesson_node, (_lesson_ast.FunctionDef, _lesson_ast.arg)):
        name = _lesson_node.name if isinstance(_lesson_node, _lesson_ast.FunctionDef) else _lesson_node.arg
        if name.startswith("_") or name in _lesson_reserved:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call) and (not isinstance(_lesson_node.func, _lesson_ast.Name) or _lesson_node.func.id not in ({"print"} | _lesson_functions) or _lesson_node.keywords):
        _lesson_supported = False

def _lesson_name(node, name):
    return isinstance(node, _lesson_ast.Name) and node.id == name

def _lesson_constant(node, value):
    return isinstance(node, _lesson_ast.Constant) and type(node.value) is type(value) and node.value == value

def _lesson_assignment(node):
    return isinstance(node, _lesson_ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], _lesson_ast.Name)

def _lesson_lookup(node, name, key):
    return isinstance(node, _lesson_ast.Subscript) and _lesson_name(node.value, name) and _lesson_constant(node.slice, key)

def _lesson_print_arg(node):
    if not isinstance(node, _lesson_ast.Expr) or not isinstance(node.value, _lesson_ast.Call):
        return None
    call = node.value
    return call.args[0] if _lesson_name(call.func, "print") and len(call.args) == 1 and not call.keywords else None

def _lesson_sum(node, total, item):
    if isinstance(node, _lesson_ast.AugAssign):
        return _lesson_name(node.target, total) and isinstance(node.op, _lesson_ast.Add) and _lesson_ast.dump(node.value) == _lesson_ast.dump(item)
    if not _lesson_assignment(node) or node.targets[0].id != total:
        return False
    value = node.value
    if not isinstance(value, _lesson_ast.BinOp) or not isinstance(value.op, _lesson_ast.Add):
        return False
    return (
        (_lesson_name(value.left, total) and _lesson_ast.dump(value.right) == _lesson_ast.dump(item))
        or (_lesson_name(value.right, total) and _lesson_ast.dump(value.left) == _lesson_ast.dump(item))
    )

_lesson_list = False
_lesson_dict = False
_lesson_function = False
_lesson_body = _lesson_tree.body
_lesson_is_list = _lesson_profile == "list-reference-sum-v1"
_lesson_expected_length = 7 if _lesson_is_list else 6
if _lesson_profile in ("list-reference-sum-v1", "dict-value-sum-v1") and len(_lesson_body) == _lesson_expected_length:
    initial = _lesson_body[0]
    if _lesson_assignment(initial):
        data_name = initial.targets[0].id
        literal = initial.value
        valid_literal = (
            isinstance(literal, _lesson_ast.List) and all(isinstance(item, _lesson_ast.Constant) and type(item.value) is int for item in literal.elts)
        ) if _lesson_is_list else (
            isinstance(literal, _lesson_ast.Dict)
            and all(isinstance(key, _lesson_ast.Constant) and type(key.value) is str for key in literal.keys)
            and all(isinstance(item, _lesson_ast.Constant) and type(item.value) is int for item in literal.values)
        )
        offset = 1 if _lesson_is_list else 0
        alias = _lesson_body[1] if _lesson_is_list else None
        alias_name = alias.targets[0].id if alias is not None and _lesson_assignment(alias) else None
        valid_alias = not _lesson_is_list or (_lesson_assignment(alias) and alias_name != data_name and _lesson_name(alias.value, data_name))
        changed = _lesson_body[1 + offset]
        total = _lesson_body[2 + offset]
        loop = _lesson_body[3 + offset]
        key = 0 if _lesson_is_list else "red"
        target_name = alias_name if _lesson_is_list else data_name
        valid_change = (
            isinstance(changed, _lesson_ast.Assign) and len(changed.targets) == 1
            and _lesson_lookup(changed.targets[0], target_name, key) and _lesson_constant(changed.value, 4)
        )
        if valid_literal and valid_alias and valid_change and _lesson_assignment(total) and isinstance(loop, _lesson_ast.For) and isinstance(loop.target, _lesson_ast.Name):
            total_name = total.targets[0].id
            item_name = loop.target.id
            names = [data_name, total_name, item_name] + ([alias_name] if _lesson_is_list else [])
            item = _lesson_ast.Name(id=item_name, ctx=_lesson_ast.Load()) if _lesson_is_list else _lesson_ast.Subscript(value=_lesson_ast.Name(id=data_name, ctx=_lesson_ast.Load()), slice=_lesson_ast.Name(id=item_name, ctx=_lesson_ast.Load()), ctx=_lesson_ast.Load())
            matched = (
                len(set(names)) == len(names) and _lesson_constant(total.value, 0)
                and _lesson_name(loop.iter, data_name) and not loop.orelse and len(loop.body) == 1
                and _lesson_sum(loop.body[0], total_name, item)
                and _lesson_lookup(_lesson_print_arg(_lesson_body[4 + offset]), data_name, key)
                and _lesson_name(_lesson_print_arg(_lesson_body[5 + offset]), total_name)
            )
            if _lesson_is_list:
                _lesson_list = matched
            else:
                _lesson_dict = matched

${['list-values-update-v1', 'list-iterate-sum-v1'].includes(profile) ? listIntroductionFacts() : ''}
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
${
  ['list-values-update-v1', 'list-iterate-sum-v1'].includes(profile)
    ? '    "listValuesUpdated": _lesson_values_updated,\n    "listIteratedSummed": _lesson_iterated_summed,'
    : '    "listReferenceSummed": _lesson_list,\n    "dictValuesSummed": _lesson_dict,'
}
})
`;
}

/** 新2課題だけでListの読み書きと1重forの加算関係を追う。学習Sourceは実行しない。 */
function listIntroductionFacts() {
  return `
_lesson_intro_allowed = (
    _lesson_ast.Module, _lesson_ast.Assign, _lesson_ast.AugAssign,
    _lesson_ast.Name, _lesson_ast.Store, _lesson_ast.Load, _lesson_ast.Constant,
    _lesson_ast.Expr, _lesson_ast.Call, _lesson_ast.BinOp, _lesson_ast.Add,
    _lesson_ast.List, _lesson_ast.Subscript, _lesson_ast.For,
    _lesson_ast.UnaryOp, _lesson_ast.UAdd, _lesson_ast.USub,
)
_lesson_supported = _lesson_supported and all(isinstance(node, _lesson_intro_allowed) for node in _lesson_ast.walk(_lesson_tree))
_lesson_bindings = {}
_lesson_displays = []
_lesson_lists = []
_lesson_values_updated = False
_lesson_iterated_summed = False

# 数値の由来だけを追い、任意のPython構文や関数を評価しない。
def _lesson_integer_literal(node):
    if isinstance(node, _lesson_ast.Constant) and type(node.value) is int:
        return node.value
    if (
        isinstance(node, _lesson_ast.UnaryOp) and isinstance(node.op, (_lesson_ast.UAdd, _lesson_ast.USub))
        and isinstance(node.operand, _lesson_ast.Constant) and type(node.operand.value) is int
    ):
        return -node.operand.value if isinstance(node.op, _lesson_ast.USub) else node.operand.value
    raise ValueError("unmatched integer literal")

def _lesson_scalar(node, bindings):
    if isinstance(node, (_lesson_ast.Constant, _lesson_ast.UnaryOp)):
        return (_lesson_integer_literal(node), [])
    if isinstance(node, _lesson_ast.Name) and isinstance(bindings.get(node.id), tuple):
        return bindings[node.id]
    if isinstance(node, _lesson_ast.BinOp) and isinstance(node.op, _lesson_ast.Add):
        left, right = _lesson_scalar(node.left, bindings), _lesson_scalar(node.right, bindings)
        return (left[0] + right[0], left[1] + right[1])
    if isinstance(node, _lesson_ast.Subscript) and isinstance(node.value, _lesson_ast.Name):
        data = bindings.get(node.value.id)
        if isinstance(data, dict):
            index = _lesson_scalar(node.slice, bindings)[0]
            marker = ("read", data["id"], index, data["changed"])
            return (data["items"][index], [marker])
    raise ValueError("unmatched scalar")

def _lesson_scalar_assignment(node, bindings):
    if _lesson_assignment(node):
        bindings[node.targets[0].id] = _lesson_scalar(node.value, bindings)
        return
    if isinstance(node, _lesson_ast.AugAssign) and isinstance(node.target, _lesson_ast.Name) and isinstance(node.op, _lesson_ast.Add):
        name = node.target.id
        left, right = bindings[name], _lesson_scalar(node.value, bindings)
        bindings[name] = (left[0] + right[0], left[1] + right[1])
        return
    raise ValueError("unmatched assignment")

try:
    for node in _lesson_body:
        if _lesson_assignment(node) and isinstance(node.value, _lesson_ast.List):
            data = {"id": len(_lesson_lists), "items": [_lesson_integer_literal(item) for item in node.value.elts], "changed": False}
            data["initial_values_match"] = data["items"] == [3, 5]
            _lesson_lists.append(data)
            _lesson_bindings[node.targets[0].id] = data
        elif _lesson_assignment(node) and isinstance(node.value, _lesson_ast.Name) and isinstance(_lesson_bindings.get(node.value.id), dict):
            _lesson_bindings[node.targets[0].id] = _lesson_bindings[node.value.id]
        elif (
            isinstance(node, _lesson_ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], _lesson_ast.Subscript)
        ) or (
            isinstance(node, _lesson_ast.AugAssign) and isinstance(node.target, _lesson_ast.Subscript) and isinstance(node.op, _lesson_ast.Add)
        ):
            target = node.targets[0] if isinstance(node, _lesson_ast.Assign) else node.target
            if not isinstance(target.value, _lesson_ast.Name) or _lesson_scalar(target.slice, _lesson_bindings)[0] != 0:
                raise ValueError("unmatched update")
            data = _lesson_bindings[target.value.id]
            value = _lesson_scalar(node.value, _lesson_bindings)[0]
            if isinstance(node, _lesson_ast.AugAssign):
                value += _lesson_scalar(target, _lesson_bindings)[0]
            data["items"][0] = value
            data["changed"] = data["initial_values_match"] and value == 4
        elif isinstance(node, _lesson_ast.For) and _lesson_profile == "list-iterate-sum-v1":
            if not isinstance(node.target, _lesson_ast.Name) or not isinstance(node.iter, _lesson_ast.Name) or node.orelse:
                raise ValueError("unmatched loop")
            data = _lesson_bindings[node.iter.id]
            if not isinstance(data, dict):
                raise ValueError("unmatched iterable")
            # 1回分の加算関係を記号で検査し、一時変数や加算順を区別しない。
            candidates = [name for name, value in _lesson_bindings.items() if isinstance(value, tuple) and value[0] == 0 and name != node.target.id]
            for name in candidates:
                local = dict(_lesson_bindings)
                local[name] = (0, [("total", name)])
                local[node.target.id] = (0, [("item", data["id"])])
                for statement in node.body:
                    _lesson_scalar_assignment(statement, local)
                value = local.get(name)
                if isinstance(value, tuple) and value[0] == 0 and sorted(value[1]) == sorted([("total", name), ("item", data["id"])]):
                    # 後から元Listを変更しても、反復時点の合計の由来を変えない。
                    summed = sum(data["items"])
                    for alias, result in local.items():
                        if isinstance(result, tuple) and result == value:
                            _lesson_bindings[alias] = (summed, [("sum", data["id"], summed)])
        elif _lesson_print_arg(node) is not None:
            _lesson_displays.append(_lesson_scalar(_lesson_print_arg(node), _lesson_bindings))
        else:
            _lesson_scalar_assignment(node, _lesson_bindings)
    if _lesson_profile == "list-values-update-v1" and len(_lesson_displays) == 2:
        before, after = _lesson_displays
        _lesson_values_updated = any(
            data["initial_values_match"] and before[0] == 3 and after[0] == 4
            and ("read", data["id"], 0, False) in before[1]
            and ("read", data["id"], 0, True) in after[1]
            for data in _lesson_lists
        )
    if _lesson_profile == "list-iterate-sum-v1" and len(_lesson_displays) == 1:
        displayed = _lesson_displays[0]
        _lesson_iterated_summed = any(
            marker[0] == "sum" and displayed[0] == marker[2]
            for marker in displayed[1]
        )
except (ValueError, KeyError, TypeError, IndexError):
    _lesson_values_updated = False
    _lesson_iterated_summed = False
`;
}

/** 関数5段階を有限ASTとして追う。学習者Sourceをeval/execせず、別入力の意味も検査する。 */
function functionLessonAnalysis(source, profile) {
  return `
import ast as _lesson_ast
import builtins as _lesson_builtins
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_profile = ${JSON.stringify(profile)}
_lesson_definitions = [node for node in _lesson_tree.body if isinstance(node, _lesson_ast.FunctionDef)]
_lesson_functions = {node.name: node for node in _lesson_definitions}
_lesson_unique_functions = len(_lesson_functions) == len(_lesson_definitions)
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.FunctionDef, _lesson_ast.arguments, _lesson_ast.arg,
    _lesson_ast.Assign, _lesson_ast.Expr, _lesson_ast.Return, _lesson_ast.Name,
    _lesson_ast.Store, _lesson_ast.Load, _lesson_ast.Constant, _lesson_ast.Call,
    _lesson_ast.BinOp, _lesson_ast.Add, _lesson_ast.UnaryOp, _lesson_ast.USub, _lesson_ast.UAdd,
)
_lesson_supported = len(list(_lesson_ast.walk(_lesson_tree))) <= 300
_lesson_builtin_names = set(dir(_lesson_builtins))
_lesson_reserved = {"print"}
_lesson_custom_builtin_binding = False
for _lesson_node in _lesson_ast.walk(_lesson_tree):
    if isinstance(_lesson_node, _lesson_ast.Name) and (
        isinstance(_lesson_node.ctx, _lesson_ast.Store) and _lesson_node.id in _lesson_builtin_names
    ):
        _lesson_custom_builtin_binding = True
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant) and type(_lesson_node.value) not in (int, str, type(None)):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name) and (
        _lesson_node.id.startswith("_") or
        (isinstance(_lesson_node.ctx, _lesson_ast.Store) and _lesson_node.id in _lesson_reserved)
    ):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Assign) and (
        len(_lesson_node.targets) != 1 or not isinstance(_lesson_node.targets[0], _lesson_ast.Name)
    ):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call) and (
        not isinstance(_lesson_node.func, _lesson_ast.Name) or
        _lesson_node.func.id not in ({"print"} | set(_lesson_functions)) or
        _lesson_node.keywords
    ):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.FunctionDef):
        args = _lesson_node.args
        names = [arg.arg for arg in args.args]
        if any(name in _lesson_builtin_names for name in names + [_lesson_node.name]):
            _lesson_custom_builtin_binding = True
        if (
            _lesson_node not in _lesson_tree.body or _lesson_node.decorator_list or
            _lesson_node.returns is not None or args.posonlyargs or args.kwonlyargs or
            args.defaults or args.kw_defaults or args.vararg or args.kwarg or
            len(set(names)) != len(names) or any(arg.annotation is not None for arg in args.args) or
            any(name.startswith("_") or name in _lesson_reserved for name in names + [_lesson_node.name])
        ):
            _lesson_supported = False

_lesson_outputs = []
_lesson_calls = []
_lesson_globals = {}
_lesson_visible_functions = set()
_lesson_steps = 0

# 同名の関数でも、渡した2数ごとに戻り値の由来を区別する。
def _lesson_call_origin(name, arguments):
    return "call-args:" + name + ":" + _lesson_json.dumps(arguments)

# 数値と出所を一緒に運び、表示の直書きと戻り値の利用を区別する。
def _lesson_value(node, local, owner="", depth=0):
    global _lesson_steps, _lesson_supported
    _lesson_steps += 1
    if _lesson_steps > 1000 or depth > 8:
        raise ValueError("bounded flow")
    if isinstance(node, _lesson_ast.Constant):
        return (node.value, set())
    if isinstance(node, _lesson_ast.Name):
        if node.id in local:
            return local[node.id]
        if node.id not in _lesson_globals and node.id in _lesson_builtin_names:
            # 未束縛の組込関数を値として取得し、別名へ渡す経路は扱わない。
            _lesson_supported = False
            raise ValueError("unbound builtin value")
        return _lesson_globals[node.id]
    if isinstance(node, _lesson_ast.BinOp) and isinstance(node.op, _lesson_ast.Add):
        left = _lesson_value(node.left, local, owner, depth + 1)
        right = _lesson_value(node.right, local, owner, depth + 1)
        if type(left[0]) is not int or type(right[0]) is not int:
            raise ValueError("integer addition")
        return (left[0] + right[0], left[1] | right[1])
    if isinstance(node, _lesson_ast.UnaryOp):
        value = _lesson_value(node.operand, local, owner, depth + 1)
        if type(value[0]) is not int:
            raise ValueError("integer sign")
        return ((-value[0] if isinstance(node.op, _lesson_ast.USub) else value[0]), value[1])
    if isinstance(node, _lesson_ast.Call) and isinstance(node.func, _lesson_ast.Name):
        name = node.func.id
        shadowed = name in local or name in _lesson_globals
        if name != "print" and not shadowed and name not in _lesson_visible_functions:
            # 後の定義を先取りせず、その時点の本物の組込呼出しを拒否する。
            if name in _lesson_builtin_names:
                _lesson_supported = False
            raise KeyError(name)
        arguments = [_lesson_value(arg, local, owner, depth + 1) for arg in node.args]
        if name == "print":
            if len(arguments) != 1:
                raise ValueError("single display")
            _lesson_outputs.append((arguments[0][0], arguments[0][1] | {"display:" + owner}))
            return (None, set())
        # Pythonも引数を評価してから、呼べない値に対するTypeErrorを出す。
        if shadowed:
            raise TypeError("source function is shadowed by a value")
        function = _lesson_functions[name]
        if len(arguments) != len(function.args.args):
            raise ValueError("argument count")
        local_values = dict(zip([arg.arg for arg in function.args.args], arguments))
        result = _lesson_body(function.body, local_values, name, depth + 1)
        result = (result[0], result[1] | {"call:" + name, _lesson_call_origin(name, [arg[0] for arg in arguments])})
        _lesson_calls.append((name, [arg[0] for arg in arguments], result[0]))
        return result
    raise ValueError("unknown expression")

def _lesson_body(body, local, owner="", depth=0):
    for statement in body:
        if isinstance(statement, _lesson_ast.FunctionDef):
            if owner:
                raise ValueError("nested function")
            _lesson_visible_functions.add(statement.name)
        elif isinstance(statement, _lesson_ast.Assign):
            name = statement.targets[0].id
            # Pythonと同じく右辺を先に解決し、再束縛の検査で組込値の取得を隠さない。
            value = _lesson_value(statement.value, local, owner, depth)
            if name in _lesson_functions:
                raise ValueError("replaced function")
            stored = {"stored"} if not owner else set()
            if not owner and isinstance(statement.value, _lesson_ast.Call):
                stored |= {"stored-" + origin for origin in value[1] if origin.startswith("call-args:")}
            local[name] = (value[0], value[1] | stored)
        elif isinstance(statement, _lesson_ast.Expr):
            _lesson_value(statement.value, local, owner, depth)
        elif isinstance(statement, _lesson_ast.Return) and owner:
            return (None, set()) if statement.value is None else _lesson_value(statement.value, local, owner, depth)
        else:
            raise ValueError("unknown statement")
    return (None, set())

_lesson_verified = False
# 有限解析は定義順の再束縛を扱わない。最後の未使用定義を呼出しの証拠にしない。
if _lesson_supported and _lesson_unique_functions:
    try:
        _lesson_body(_lesson_tree.body, _lesson_globals)
        _lesson_actual_outputs = list(_lesson_outputs)
        _lesson_actual_calls = list(_lesson_calls)
        _lesson_initial_globals = dict(_lesson_globals)

        def _lesson_sum_behavior(name, displayed):
            global _lesson_steps
            function = _lesson_functions[name]
            if len(function.args.args) != 2:
                return False
            for first, second in [(2, 7), (-3, 5), (0, 0)]:
                _lesson_outputs.clear()
                _lesson_steps = 0
                local = {function.args.args[0].arg: (first, set()), function.args.args[1].arg: (second, set())}
                result = _lesson_body(function.body, local, name)
                if displayed:
                    if result[0] is not None or [row[0] for row in _lesson_outputs] != [first + second]:
                        return False
                elif result[0] != first + second or _lesson_outputs:
                    return False
            return True

        def _lesson_pair_calls(name):
            return [args for called, args, result in _lesson_actual_calls if called == name] == [[3, 5], [4, 6]]

        for _lesson_name, _lesson_function in _lesson_functions.items():
            if _lesson_profile == "function-call-v1":
                _lesson_verified |= (
                    not _lesson_function.args.args and
                    [name for name, args, result in _lesson_actual_calls] == [_lesson_name, _lesson_name] and
                    [row[0] for row in _lesson_actual_outputs] == [8, 8] and
                    all("display:" + _lesson_name in row[1] for row in _lesson_actual_outputs)
                )
            elif _lesson_profile == "function-arguments-v1":
                _lesson_verified |= _lesson_pair_calls(_lesson_name) and _lesson_sum_behavior(_lesson_name, True)
            elif _lesson_profile == "function-result-v1":
                _lesson_verified |= (
                    _lesson_pair_calls(_lesson_name) and _lesson_sum_behavior(_lesson_name, False) and
                    len(_lesson_actual_outputs) == 2 and
                    _lesson_call_origin(_lesson_name, [3, 5]) in _lesson_actual_outputs[0][1] and
                    _lesson_call_origin(_lesson_name, [4, 6]) in _lesson_actual_outputs[1][1] and
                    "stored-" + _lesson_call_origin(_lesson_name, [3, 5]) in _lesson_actual_outputs[0][1]
                )
            elif _lesson_profile == "function-print-return-v1" and _lesson_sum_behavior(_lesson_name, False):
                for show in _lesson_functions:
                    if show != _lesson_name and _lesson_sum_behavior(show, True) and len(_lesson_actual_outputs) == 3:
                        first, missing, returned = _lesson_actual_outputs
                        _lesson_verified |= (
                            "display:" + show in first[1] and
                            missing[0] is None and {"call:" + show, "stored"} <= missing[1] and
                            "call:" + _lesson_name in returned[1]
                        )
            elif _lesson_profile == "function-scope-v2":
                parameters = [arg.arg for arg in _lesson_function.args.args]
                _lesson_verified |= (
                    "left" in parameters and _lesson_pair_calls(_lesson_name) and
                    _lesson_sum_behavior(_lesson_name, False) and len(_lesson_actual_outputs) == 3 and
                    _lesson_call_origin(_lesson_name, [3, 5]) in _lesson_actual_outputs[0][1] and
                    _lesson_call_origin(_lesson_name, [4, 6]) in _lesson_actual_outputs[1][1] and
                    _lesson_initial_globals.get("left", (None,))[0] == 100 and
                    isinstance(_lesson_tree.body[-1], _lesson_ast.Expr) and
                    isinstance(_lesson_tree.body[-1].value, _lesson_ast.Call) and
                    isinstance(_lesson_tree.body[-1].value.func, _lesson_ast.Name) and
                    _lesson_tree.body[-1].value.func.id == "print" and
                    len(_lesson_tree.body[-1].value.args) == 1 and
                    isinstance(_lesson_tree.body[-1].value.args[0], _lesson_ast.Name) and
                    _lesson_tree.body[-1].value.args[0].id == "left"
                )
    except (ValueError, KeyError, TypeError, IndexError, RecursionError):
        _lesson_verified = False
# 旧予約名の解禁は、全体の有限解析で正しい動作を確認できたSourceだけに限定する。
# 解析の省略・途中停止を、後続の本物の組込呼出しを実行してよい根拠にしない。
if _lesson_custom_builtin_binding and not _lesson_verified:
    _lesson_supported = False
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "functionBehaviorVerified": bool(_lesson_verified),
})
`;
}
