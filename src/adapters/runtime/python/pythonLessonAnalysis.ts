/** 実Python ASTで最小教材の説明範囲とsource factsを調べる。隔離の根拠には使わない。 */
export function pythonLessonAnalysis(source: string): string {
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
