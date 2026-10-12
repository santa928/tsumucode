// 固定課題の解答構造。文字列化してLocal解析wrapperの字下げと分離する。
const expectedSource = String.raw`from dataclasses import dataclass
from io import StringIO


@dataclass
class Record:
    """集計する1件の値をまとめる。型注釈は値を検証しない。"""

    label: str
    amount: int


def read_records(text: str):
    """メモリ内の各行を整数へ変換し、負値を拒否して1件ずつ返す。"""
    with StringIO(text) as stream:
        for line in stream:
            amount = int(line)
            if amount < 0:
                raise ValueError("負値は使えません")
            yield Record("記録", amount)


def total(text: str) -> int:
    """反復で受け取る値を合計する。空データは0になる。"""
    return sum(record.amount for record in read_records(text))


sample = Record("型注釈だけ", "4")
print(isinstance(sample.amount, str))

try:
    assert total("2\n4\n") == 6
    print(total("2\n4\n"))
    assert total("") == 0
    print(total(""))
    for invalid in ("bad\n", "-1\n"):
        try:
            total(invalid)
        except ValueError:
            print("不正: ValueError")
        else:
            raise AssertionError("不正データを受け入れました")
    print("Test成功")
except AssertionError:
    print("Test失敗")
`;

/** 固定データProjectの構文とTest構造を照合する。学習コードは実行しない。 */
export function pythonDataProjectAnalysis(source) {
  return `
import ast as _lesson_ast
import builtins as _lesson_builtins
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.ImportFrom, _lesson_ast.alias,
    _lesson_ast.ClassDef, _lesson_ast.AnnAssign, _lesson_ast.FunctionDef,
    _lesson_ast.arguments, _lesson_ast.arg, _lesson_ast.Return,
    _lesson_ast.With, _lesson_ast.withitem, _lesson_ast.For, _lesson_ast.If,
    _lesson_ast.Yield, _lesson_ast.GeneratorExp, _lesson_ast.comprehension,
    _lesson_ast.Try, _lesson_ast.ExceptHandler, _lesson_ast.Raise,
    _lesson_ast.Assert, _lesson_ast.Compare, _lesson_ast.Eq, _lesson_ast.Lt,
    _lesson_ast.Assign, _lesson_ast.Pass, _lesson_ast.Tuple,
    _lesson_ast.Expr, _lesson_ast.Call, _lesson_ast.Attribute,
    _lesson_ast.Name, _lesson_ast.Load, _lesson_ast.Store, _lesson_ast.Constant,
)
_lesson_reserved = set(dir(_lesson_builtins)) | {"Record", "dataclass", "StringIO", "read_records", "total"}
_lesson_nodes = list(_lesson_ast.walk(_lesson_tree))
_lesson_supported = len(_lesson_tree.body) <= 18 and len(_lesson_nodes) <= 500
_lesson_arities = {"Record": 2, "StringIO": 1, "int": 1, "sum": 1, "print": 1,
    "isinstance": 2, "read_records": 1, "total": 1, "ValueError": 1, "AssertionError": 1}
for _lesson_node in _lesson_nodes:
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.ImportFrom):
        if (_lesson_node.module, [name.name for name in _lesson_node.names]) not in (
            ("dataclasses", ["dataclass"]), ("io", ["StringIO"])
        ) or _lesson_node.level != 0 or any(name.asname is not None for name in _lesson_node.names):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name):
        if _lesson_node.id.startswith("_") or (
            isinstance(_lesson_node.ctx, _lesson_ast.Store) and _lesson_node.id in _lesson_reserved
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant):
        if type(_lesson_node.value) not in (str, int, bool):
            _lesson_supported = False
        elif type(_lesson_node.value) is str and len(_lesson_node.value) > 100:
            _lesson_supported = False
        elif type(_lesson_node.value) is int and abs(_lesson_node.value) > 100:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.ClassDef):
        if (
            _lesson_node.name != "Record" or _lesson_node.bases or _lesson_node.keywords
            or _lesson_node.type_params
            or len(_lesson_node.decorator_list) != 1
            or not isinstance(_lesson_node.decorator_list[0], _lesson_ast.Name)
            or _lesson_node.decorator_list[0].id != "dataclass"
            or any(not isinstance(item, (_lesson_ast.AnnAssign, _lesson_ast.Expr)) for item in _lesson_node.body)
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.AnnAssign):
        if (not isinstance(_lesson_node.target, _lesson_ast.Name)
            or not isinstance(_lesson_node.annotation, _lesson_ast.Name)
            or _lesson_node.annotation.id not in ("str", "int") or _lesson_node.value is not None):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.FunctionDef):
        args = _lesson_node.args
        if (
            _lesson_node.name not in ("read_records", "total") or _lesson_node.decorator_list
            or _lesson_node.type_params or args.posonlyargs or args.kwonlyargs
            or args.vararg or args.kwarg or args.defaults or args.kw_defaults
            or len(args.args) != 1 or args.args[0].arg != "text"
            or not isinstance(args.args[0].annotation, _lesson_ast.Name)
            or args.args[0].annotation.id != "str"
            or (_lesson_node.returns is not None and (
                not isinstance(_lesson_node.returns, _lesson_ast.Name) or _lesson_node.returns.id != "int"))
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Attribute):
        if (not isinstance(_lesson_node.value, _lesson_ast.Name)
            or not isinstance(_lesson_node.ctx, _lesson_ast.Load)
            or _lesson_node.attr not in ("amount", "closed")):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Assign):
        if len(_lesson_node.targets) != 1 or not isinstance(_lesson_node.targets[0], _lesson_ast.Name):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call):
        if (not isinstance(_lesson_node.func, _lesson_ast.Name) or _lesson_node.keywords
            or len(_lesson_node.args) != _lesson_arities.get(_lesson_node.func.id, -1)):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.With):
        if len(_lesson_node.items) != 1:
            _lesson_supported = False
        else:
            item = _lesson_node.items[0]
            if (not isinstance(item.optional_vars, _lesson_ast.Name)
                or not isinstance(item.context_expr, _lesson_ast.Call)
                or not isinstance(item.context_expr.func, _lesson_ast.Name)
                or item.context_expr.func.id != "StringIO"):
                _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.ExceptHandler):
        if (not isinstance(_lesson_node.type, _lesson_ast.Name)
            or _lesson_node.type.id not in ("ValueError", "AssertionError") or _lesson_node.name is not None):
            _lesson_supported = False

# docstringの説明変更は採点構造へ含めない。名前・Test・値の流れは固定課題の契約。
class _LessonDocumentation(_lesson_ast.NodeTransformer):
    def visit_ClassDef(self, node):
        self.generic_visit(node)
        return self.strip_documentation(node)

    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        return self.strip_documentation(node)

    def strip_documentation(self, node):
        if node.body and isinstance(node.body[0], _lesson_ast.Expr):
            value = node.body[0].value
            if isinstance(value, _lesson_ast.Constant) and isinstance(value.value, str):
                node.body = node.body[1:]
        return node

_lesson_expected = _lesson_ast.parse(${JSON.stringify(expectedSource)})
_lesson_normalized = _LessonDocumentation().visit(_lesson_tree)
_lesson_expected = _LessonDocumentation().visit(_lesson_expected)
_lesson_project = _lesson_supported and _lesson_ast.dump(_lesson_normalized) == _lesson_ast.dump(_lesson_expected)
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "dataProjectTested": _lesson_project,
})
`;
}
