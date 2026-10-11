/** 実Python ASTで最小教材の説明範囲とsource factsを調べる。隔離の根拠には使わない。 */
export function pythonLessonAnalysis(source, profile = 'values-vars-print-v1') {
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
