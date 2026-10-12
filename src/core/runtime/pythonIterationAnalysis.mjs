/** 固定3教材の構文と値の流れを調べる。学習コードの実行や隔離の代替には使わない。 */
export function pythonIterationAnalysis(source, profile) {
  return `
import ast as _lesson_ast
import builtins as _lesson_builtins
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_profile = ${JSON.stringify(profile)}
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.Assign, _lesson_ast.Name,
    _lesson_ast.Load, _lesson_ast.Store, _lesson_ast.Constant,
    _lesson_ast.Expr, _lesson_ast.Call, _lesson_ast.List,
    _lesson_ast.ListComp, _lesson_ast.comprehension,
    _lesson_ast.BinOp, _lesson_ast.Add, _lesson_ast.UnaryOp, _lesson_ast.USub,
    _lesson_ast.Compare, _lesson_ast.Gt, _lesson_ast.GtE,
    _lesson_ast.FunctionDef, _lesson_ast.arguments, _lesson_ast.arg,
    _lesson_ast.For, _lesson_ast.Yield, _lesson_ast.Return,
)
_lesson_functions = {
    node.name for node in _lesson_tree.body
    if isinstance(node, _lesson_ast.FunctionDef)
}
_lesson_reserved = set(dir(_lesson_builtins))
_lesson_supported = len(_lesson_tree.body) <= 24
for _lesson_node in _lesson_ast.walk(_lesson_tree):
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant):
        if type(_lesson_node.value) not in (int, str):
            _lesson_supported = False
        elif type(_lesson_node.value) is int and abs(_lesson_node.value) > 128:
            _lesson_supported = False
        elif type(_lesson_node.value) is str and len(_lesson_node.value) > 80:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.List) and len(_lesson_node.elts) > 8:
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.ListComp):
        if (
            len(_lesson_node.generators) != 1
            or _lesson_node.generators[0].is_async
            or len(_lesson_node.generators[0].ifs) > 1
        ):
            _lesson_supported = False
        if any(
            isinstance(child, _lesson_ast.ListComp) and child is not _lesson_node
            for child in _lesson_ast.walk(_lesson_node)
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name):
        if _lesson_node.id.startswith("_") or (
            isinstance(_lesson_node.ctx, _lesson_ast.Store)
            and _lesson_node.id in _lesson_reserved
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, (_lesson_ast.FunctionDef, _lesson_ast.arg)):
        name = (
            _lesson_node.name
            if isinstance(_lesson_node, _lesson_ast.FunctionDef)
            else _lesson_node.arg
        )
        if name.startswith("_") or name in _lesson_reserved:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.FunctionDef):
        args = _lesson_node.args
        if (
            _lesson_node.decorator_list or _lesson_node.returns
            or _lesson_node.type_params or args.defaults or args.kw_defaults
            or args.kwonlyargs or args.vararg or args.kwarg or args.posonlyargs
            or len(args.args) != 1
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call):
        if not isinstance(_lesson_node.func, _lesson_ast.Name) or _lesson_node.keywords:
            _lesson_supported = False
        elif _lesson_node.func.id == "next":
            if len(_lesson_node.args) not in (1, 2):
                _lesson_supported = False
        elif _lesson_node.func.id in ({"print", "iter", "list"} | _lesson_functions):
            if len(_lesson_node.args) != 1:
                _lesson_supported = False
        else:
            _lesson_supported = False

def _lesson_name(node, name):
    return isinstance(node, _lesson_ast.Name) and node.id == name

def _lesson_value(node):
    if isinstance(node, _lesson_ast.Constant) and type(node.value) in (int, str):
        return node.value
    if (
        isinstance(node, _lesson_ast.UnaryOp)
        and isinstance(node.op, _lesson_ast.USub)
        and isinstance(node.operand, _lesson_ast.Constant)
        and type(node.operand.value) is int
    ):
        return -node.operand.value
    return None

def _lesson_list(node, values):
    return (
        isinstance(node, _lesson_ast.List)
        and [_lesson_value(item) for item in node.elts] == values
    )

def _lesson_assign(node):
    return (
        isinstance(node, _lesson_ast.Assign) and len(node.targets) == 1
        and isinstance(node.targets[0], _lesson_ast.Name)
    )

def _lesson_call(node, name, count=1):
    return (
        isinstance(node, _lesson_ast.Call) and _lesson_name(node.func, name)
        and len(node.args) == count and not node.keywords
    )

def _lesson_print(node):
    if not isinstance(node, _lesson_ast.Expr) or not _lesson_call(node.value, "print"):
        return None
    return node.value.args[0]

def _lesson_next(node, name):
    return (
        _lesson_call(node, "next", 2) and _lesson_name(node.args[0], name)
        and _lesson_value(node.args[1]) == "END"
    )

def _lesson_double(node, name):
    return (
        isinstance(node, _lesson_ast.BinOp) and isinstance(node.op, _lesson_ast.Add)
        and _lesson_name(node.left, name) and _lesson_name(node.right, name)
    )

def _lesson_comprehension(node, name):
    if not isinstance(node, _lesson_ast.ListComp) or len(node.generators) != 1:
        return False
    generator = node.generators[0]
    if (
        not isinstance(generator.target, _lesson_ast.Name)
        or not _lesson_name(generator.iter, name) or generator.is_async
        or len(generator.ifs) != 1
    ):
        return False
    condition = generator.ifs[0]
    return (
        _lesson_double(node.elt, generator.target.id)
        and isinstance(condition, _lesson_ast.Compare)
        and _lesson_name(condition.left, generator.target.id)
        and len(condition.ops) == len(condition.comparators) == 1
        and isinstance(condition.ops[0], _lesson_ast.GtE)
        and _lesson_value(condition.comparators[0]) == 0
    )

_lesson_body = _lesson_tree.body
_lesson_comprehended = False
_lesson_consumed = False
_lesson_generated = False
if _lesson_profile == "list-comprehension-filter-v1" and len(_lesson_body) == 5:
    data, transformed, printed, empty, empty_printed = _lesson_body
    if all(_lesson_assign(node) for node in (data, transformed, empty)):
        _lesson_comprehended = (
            _lesson_list(data.value, [-2, 0, 3])
            and _lesson_comprehension(transformed.value, data.targets[0].id)
            and _lesson_name(_lesson_print(printed), transformed.targets[0].id)
            and _lesson_list(empty.value, [])
            and _lesson_comprehension(_lesson_print(empty_printed), empty.targets[0].id)
            and len({data.targets[0].id, transformed.targets[0].id, empty.targets[0].id}) == 3
        )
if _lesson_profile == "iterator-consumption-v1" and len(_lesson_body) == 11:
    data, cursor = _lesson_body[:2]
    fresh, fresh_printed, empty, empty_cursor, empty_printed = _lesson_body[6:]
    if all(_lesson_assign(node) for node in (data, cursor, fresh, empty, empty_cursor)):
        _lesson_consumed = (
            _lesson_list(data.value, [3, 5])
            and _lesson_call(cursor.value, "iter")
            and _lesson_name(cursor.value.args[0], data.targets[0].id)
            and all(
                _lesson_next(_lesson_print(node), cursor.targets[0].id)
                for node in _lesson_body[2:6]
            )
            and _lesson_call(fresh.value, "iter")
            and _lesson_name(fresh.value.args[0], data.targets[0].id)
            and _lesson_next(_lesson_print(fresh_printed), fresh.targets[0].id)
            and _lesson_list(empty.value, [])
            and _lesson_call(empty_cursor.value, "iter")
            and _lesson_name(empty_cursor.value.args[0], empty.targets[0].id)
            and _lesson_next(_lesson_print(empty_printed), empty_cursor.targets[0].id)
            and len({node.targets[0].id for node in (data, cursor, fresh, empty, empty_cursor)}) == 5
        )
if _lesson_profile == "generator-lifecycle-v1" and len(_lesson_body) == 15:
    function = _lesson_body[0]
    if (
        isinstance(function, _lesson_ast.FunctionDef)
        and len(function.args.args) == 1 and len(function.body) == 2
    ):
        loop = function.body[1]
        if (
            isinstance(loop, _lesson_ast.For)
            and isinstance(loop.target, _lesson_ast.Name)
            and len(loop.body) == 2 and not loop.orelse
        ):
            yielded = loop.body[1]
            body_valid = (
                _lesson_value(_lesson_print(function.body[0])) == "開始"
                and _lesson_name(loop.iter, function.args.args[0].arg)
                and _lesson_value(_lesson_print(loop.body[0])) == "生成"
                and isinstance(yielded, _lesson_ast.Expr)
                and isinstance(yielded.value, _lesson_ast.Yield)
                and _lesson_double(yielded.value.value, loop.target.id)
            )
            current, empty, fresh = _lesson_body[1], _lesson_body[7], _lesson_body[11]
            if body_valid and all(_lesson_assign(node) for node in (current, empty, fresh)):
                _lesson_generated = (
                    _lesson_call(current.value, function.name)
                    and _lesson_list(current.value.args[0], [3, 5])
                    and _lesson_value(_lesson_print(_lesson_body[2])) == "作成済み"
                    and all(
                        _lesson_next(_lesson_print(node), current.targets[0].id)
                        for node in _lesson_body[3:7]
                    )
                    and _lesson_call(empty.value, function.name)
                    and _lesson_list(empty.value.args[0], [])
                    and _lesson_value(_lesson_print(_lesson_body[8])) == "空を作成"
                    and all(
                        _lesson_next(_lesson_print(node), empty.targets[0].id)
                        for node in _lesson_body[9:11]
                    )
                    and _lesson_call(fresh.value, function.name)
                    and _lesson_list(fresh.value.args[0], [3, 5])
                    and _lesson_value(_lesson_print(_lesson_body[12])) == "まとめて消費"
                    and _lesson_call(_lesson_print(_lesson_body[13]), "list")
                    and _lesson_name(_lesson_print(_lesson_body[13]).args[0], fresh.targets[0].id)
                    and _lesson_next(_lesson_print(_lesson_body[14]), fresh.targets[0].id)
                    and len({node.targets[0].id for node in (current, empty, fresh)}) == 3
                    and function.name not in {node.targets[0].id for node in (current, empty, fresh)}
                )
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "listComprehensionFiltered": _lesson_comprehended,
    "iteratorConsumed": _lesson_consumed,
    "generatorLifecycle": _lesson_generated,
})
`;
}
