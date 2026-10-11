/** 実Python ASTで最小教材の説明範囲とsource factsを調べる。隔離の根拠には使わない。 */
export function pythonLessonAnalysis(source, profile = 'values-vars-print-v1') {
  if (['list-reference-sum-v1', 'dict-value-sum-v1', 'function-return-scope-v1'].includes(profile))
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
)
_lesson_reserved = set(dir(_lesson_builtins))
_lesson_functions = {node.name for node in _lesson_tree.body if isinstance(node, _lesson_ast.FunctionDef)} if _lesson_profile == "function-return-scope-v1" else set()
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

if _lesson_profile == "function-return-scope-v1" and len(_lesson_body) >= 5:
    outer, function = _lesson_body[:2]
    if _lesson_assignment(outer) and _lesson_constant(outer.value, 100) and isinstance(function, _lesson_ast.FunctionDef):
        args = function.args
        parameters = [arg.arg for arg in args.args]
        valid_args = (
            len(parameters) == 2 and len(set(parameters)) == 2
            and not args.posonlyargs and not args.kwonlyargs and not args.defaults and not args.kw_defaults
            and args.vararg is None and args.kwarg is None and not function.decorator_list and function.returns is None
            and all(arg.annotation is None for arg in args.args)
            and function.name not in parameters and function.name != outer.targets[0].id
            and outer.targets[0].id in parameters
        )
        expression = None
        if len(function.body) == 1 and isinstance(function.body[0], _lesson_ast.Return):
            expression = function.body[0].value
        if len(function.body) == 2 and _lesson_assignment(function.body[0]) and isinstance(function.body[1], _lesson_ast.Return):
            binding = function.body[0].targets[0].id
            if binding not in parameters and _lesson_name(function.body[1].value, binding):
                expression = function.body[0].value
        valid_return = (
            isinstance(expression, _lesson_ast.BinOp) and isinstance(expression.op, _lesson_ast.Add)
            and isinstance(expression.left, _lesson_ast.Name) and isinstance(expression.right, _lesson_ast.Name)
            and {expression.left.id, expression.right.id} == set(parameters)
        )
        bindings = {outer.targets[0].id: "outer"}
        printed = []
        valid_flow = True
        def _lesson_result(node):
            if isinstance(node, _lesson_ast.Name):
                return bindings.get(node.id)
            if isinstance(node, _lesson_ast.Call) and _lesson_name(node.func, function.name) and len(node.args) == 2 and not node.keywords:
                if all(isinstance(arg, _lesson_ast.Constant) and type(arg.value) is int for arg in node.args):
                    values = sorted(arg.value for arg in node.args)
                    return "first" if values == [3, 5] else "second" if values == [4, 6] else None
            return None
        for statement in _lesson_body[2:]:
            if _lesson_assignment(statement):
                name = statement.targets[0].id
                result = _lesson_result(statement.value)
                if name in (outer.targets[0].id, function.name) or result not in ("first", "second"):
                    valid_flow = False
                bindings[name] = result
            else:
                arg = _lesson_print_arg(statement)
                result = _lesson_result(arg)
                if result is None:
                    valid_flow = False
                printed.append(result)
        _lesson_function = valid_args and valid_return and valid_flow and printed == ["first", "second", "outer"]
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "listReferenceSummed": _lesson_list,
    "dictValuesSummed": _lesson_dict,
    "functionReturnScoped": _lesson_function,
})
`;
}
