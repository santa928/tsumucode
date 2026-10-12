// 固定構造の照合用。JSON文字列化してLocalのtry内への字下げでも内容を保つ。
const expectedSource = `from io import StringIO
with StringIO("通常") as normal:
    print(normal.getvalue())
    print(normal.closed)
print(normal.closed)
try:
    with StringIO("例外") as broken:
        print(broken.getvalue())
        print(broken.closed)
        raise ValueError("中断")
except ValueError:
    print("例外を受け止めた")
print(broken.closed)
try:
    print(broken.getvalue())
except ValueError:
    print("終了後は利用できない")
`;

/** 固定StringIO課題の構文と値の流れをASTで照合する。学習コードを実行しない。 */
export function pythonContextAnalysis(source) {
  return `
import ast as _lesson_ast
import builtins as _lesson_builtins
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.ImportFrom, _lesson_ast.alias,
    _lesson_ast.With, _lesson_ast.withitem, _lesson_ast.Try,
    _lesson_ast.ExceptHandler, _lesson_ast.Raise, _lesson_ast.Assign,
    _lesson_ast.Expr, _lesson_ast.Call, _lesson_ast.Attribute,
    _lesson_ast.Name, _lesson_ast.Load, _lesson_ast.Store, _lesson_ast.Constant,
)
_lesson_reserved = set(dir(_lesson_builtins)) | {"StringIO"}
_lesson_supported = len(_lesson_tree.body) <= 18
for _lesson_node in _lesson_ast.walk(_lesson_tree):
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.ImportFrom):
        if (
            _lesson_node.module != "io" or _lesson_node.level != 0
            or len(_lesson_node.names) != 1
            or _lesson_node.names[0].name != "StringIO"
            or _lesson_node.names[0].asname is not None
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name):
        if _lesson_node.id.startswith("_") or (
            isinstance(_lesson_node.ctx, _lesson_ast.Store)
            and _lesson_node.id in _lesson_reserved
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant):
        if type(_lesson_node.value) not in (str, bool):
            _lesson_supported = False
        elif type(_lesson_node.value) is str and len(_lesson_node.value) > 80:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Attribute):
        if (
            not isinstance(_lesson_node.value, _lesson_ast.Name)
            or not isinstance(_lesson_node.ctx, _lesson_ast.Load)
            or _lesson_node.attr not in ("getvalue", "closed", "close")
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Assign):
        if (
            len(_lesson_node.targets) != 1
            or not isinstance(_lesson_node.targets[0], _lesson_ast.Name)
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call):
        function = _lesson_node.func
        if _lesson_node.keywords:
            _lesson_supported = False
        elif isinstance(function, _lesson_ast.Name):
            if function.id not in ("StringIO", "print", "ValueError") or len(_lesson_node.args) != 1:
                _lesson_supported = False
        elif isinstance(function, _lesson_ast.Attribute):
            if function.attr not in ("getvalue", "close") or _lesson_node.args:
                _lesson_supported = False
        else:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.With):
        if len(_lesson_node.items) != 1:
            _lesson_supported = False
        else:
            item = _lesson_node.items[0]
            if (
                not isinstance(item.optional_vars, _lesson_ast.Name)
                or not isinstance(item.context_expr, _lesson_ast.Call)
                or not isinstance(item.context_expr.func, _lesson_ast.Name)
                or item.context_expr.func.id != "StringIO"
            ):
                _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Try):
        if len(_lesson_node.handlers) != 1 or _lesson_node.orelse or _lesson_node.finalbody:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.ExceptHandler):
        if (
            not isinstance(_lesson_node.type, _lesson_ast.Name)
            or _lesson_node.type.id != "ValueError" or _lesson_node.name is not None
        ):
            _lesson_supported = False

# 固定課題の構造は維持し、2つのstreamの変数名だけを役割名へ正規化する。
_lesson_expected = _lesson_ast.parse(${JSON.stringify(expectedSource)})
_lesson_stream_names = [
    node.items[0].optional_vars.id
    for node in _lesson_ast.walk(_lesson_tree)
    if isinstance(node, _lesson_ast.With) and len(node.items) == 1
    and isinstance(node.items[0].optional_vars, _lesson_ast.Name)
]

class _LessonRoleNames(_lesson_ast.NodeTransformer):
    def visit_Name(self, node):
        if node.id in _lesson_names:
            node.id = _lesson_names[node.id]
        return node

_lesson_managed = False
if _lesson_supported and len(_lesson_stream_names) == 2 and len(set(_lesson_stream_names)) == 2:
    _lesson_names = dict(zip(_lesson_stream_names, ("normal", "broken")))
    _lesson_normalized = _LessonRoleNames().visit(_lesson_tree)
    _lesson_managed = _lesson_ast.dump(_lesson_normalized) == _lesson_ast.dump(_lesson_expected)
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "contextManagedClosed": _lesson_managed,
})
`;
}
