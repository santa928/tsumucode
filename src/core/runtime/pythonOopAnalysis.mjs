/** 固定2教材のClass・参照・method引数を解析する。実行結果や隔離の代替にはしない。 */
export function pythonOopAnalysis(source, profile) {
  return `
import ast as _lesson_ast
import builtins as _lesson_builtins
import json as _lesson_json
_lesson_tree = _lesson_ast.parse(${JSON.stringify(source)})
_lesson_profile = ${JSON.stringify(profile)}
_lesson_allowed = (
    _lesson_ast.Module, _lesson_ast.ClassDef, _lesson_ast.FunctionDef,
    _lesson_ast.arguments, _lesson_ast.arg, _lesson_ast.Assign,
    _lesson_ast.Name, _lesson_ast.Load, _lesson_ast.Store,
    _lesson_ast.Attribute, _lesson_ast.Constant, _lesson_ast.Expr,
    _lesson_ast.Call, _lesson_ast.Return, _lesson_ast.BinOp,
    _lesson_ast.Mult, _lesson_ast.Compare, _lesson_ast.Is,
)
_lesson_attributes = {"value", "factor", "doubled", "doubled_from", "doubled_value"}
_lesson_reserved = set(dir(_lesson_builtins))
_lesson_nodes = list(_lesson_ast.walk(_lesson_tree))
_lesson_supported = len(_lesson_nodes) <= 600 and len(_lesson_tree.body) <= 40
for _lesson_node in _lesson_nodes:
    if not isinstance(_lesson_node, _lesson_allowed):
        _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Constant):
        if type(_lesson_node.value) not in (int, str):
            _lesson_supported = False
        elif type(_lesson_node.value) is int and abs(_lesson_node.value) > 128:
            _lesson_supported = False
        elif type(_lesson_node.value) is str and len(_lesson_node.value) > 160:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Name):
        if _lesson_node.id.startswith("_") or (
            isinstance(_lesson_node.ctx, _lesson_ast.Store)
            and _lesson_node.id in _lesson_reserved
        ) or (
            isinstance(_lesson_node.ctx, _lesson_ast.Load)
            and _lesson_node.id in _lesson_reserved
            and _lesson_node.id not in {"print", "classmethod", "staticmethod"}
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Attribute):
        if _lesson_node.attr not in _lesson_attributes:
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.ClassDef):
        if (
            _lesson_node.bases or _lesson_node.keywords or _lesson_node.decorator_list
            or _lesson_node.type_params or _lesson_node.name.startswith("_")
            or _lesson_node.name in _lesson_reserved
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.FunctionDef):
        args = _lesson_node.args
        if (
            _lesson_node.name not in ({"__init__"} | _lesson_attributes)
            or _lesson_node.returns or _lesson_node.type_params
            or args.defaults or args.kw_defaults or args.kwonlyargs
            or args.vararg or args.kwarg or args.posonlyargs
            or not 1 <= len(args.args) <= 3
            or len(_lesson_node.decorator_list) > 1
            or any(
                not isinstance(item, _lesson_ast.Name)
                or item.id not in {"classmethod", "staticmethod"}
                for item in _lesson_node.decorator_list
            )
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.arg):
        if (
            _lesson_node.annotation or _lesson_node.arg.startswith("_")
            or _lesson_node.arg in _lesson_reserved
        ):
            _lesson_supported = False
    if isinstance(_lesson_node, _lesson_ast.Call):
        if _lesson_node.keywords or len(_lesson_node.args) > 3:
            _lesson_supported = False
        if not isinstance(_lesson_node.func, (_lesson_ast.Name, _lesson_ast.Attribute)):
            _lesson_supported = False

def _lesson_body(nodes):
    if nodes and isinstance(nodes[0], _lesson_ast.Expr):
        value = nodes[0].value
        if isinstance(value, _lesson_ast.Constant) and type(value.value) is str:
            return nodes[1:]
    return nodes

def _lesson_name(node, name):
    return isinstance(node, _lesson_ast.Name) and node.id == name

def _lesson_value(node, value):
    return isinstance(node, _lesson_ast.Constant) and type(node.value) is int and node.value == value

def _lesson_attr(node, owner, attribute):
    return (
        isinstance(node, _lesson_ast.Attribute)
        and _lesson_name(node.value, owner) and node.attr == attribute
    )

def _lesson_assignment(node, target, value):
    return (
        isinstance(node, _lesson_ast.Assign) and len(node.targets) == 1
        and target(node.targets[0]) and value(node.value)
    )

def _lesson_print(node):
    if (
        isinstance(node, _lesson_ast.Expr) and isinstance(node.value, _lesson_ast.Call)
        and _lesson_name(node.value.func, "print") and len(node.value.args) == 1
        and not node.value.keywords
    ):
        return node.value.args[0]
    return None

def _lesson_call(node, owner, method, arguments):
    return (
        isinstance(node, _lesson_ast.Call) and not node.keywords
        and (_lesson_name(node.func, owner) if method is None else _lesson_attr(node.func, owner, method))
        and len(node.args) == len(arguments)
        and all(check(value) for check, value in zip(arguments, node.args))
    )

def _lesson_instance(node, class_name, value):
    if (
        isinstance(node, _lesson_ast.Assign) and len(node.targets) == 1
        and isinstance(node.targets[0], _lesson_ast.Name)
        and _lesson_call(node.value, class_name, None, [lambda item: _lesson_value(item, value)])
    ):
        return node.targets[0].id
    return None

def _lesson_product(node, left, right):
    return (
        isinstance(node, _lesson_ast.BinOp) and isinstance(node.op, _lesson_ast.Mult)
        and ((left(node.left) and right(node.right)) or (right(node.left) and left(node.right)))
    )

def _lesson_method(node, count, decorator, expression):
    body = _lesson_body(node.body)
    value = None
    if len(body) == 1 and isinstance(body[0], _lesson_ast.Return):
        value = body[0].value
    elif (
        len(body) == 2 and isinstance(body[0], _lesson_ast.Assign)
        and len(body[0].targets) == 1 and isinstance(body[0].targets[0], _lesson_ast.Name)
        and isinstance(body[1], _lesson_ast.Return)
        and _lesson_name(body[1].value, body[0].targets[0].id)
    ):
        value = body[0].value
    return (
        len(node.args.args) == count
        and ([item.id for item in node.decorator_list] == ([decorator] if decorator else []))
        and expression(value, [item.arg for item in node.args.args])
    )


def _lesson_instance_product(node, args):
    return _lesson_product(
        node,
        lambda item: _lesson_attr(item, args[0], "value"),
        lambda item: _lesson_attr(item, args[0], "factor"),
    )

def _lesson_class_product(node, args):
    return _lesson_product(
        node,
        lambda item: _lesson_name(item, args[1]),
        lambda item: _lesson_attr(item, args[0], "factor"),
    )

def _lesson_static_product(node, args):
    return _lesson_product(
        node,
        lambda item: _lesson_name(item, args[0]),
        lambda item: _lesson_name(item, args[1]),
    )

def _lesson_print_call(nodes, index, owner, method, arguments):
    return _lesson_call(_lesson_print(nodes[index]), owner, method, arguments)

def _lesson_compare_calls(nodes, start, class_name, instance, value):
    return (
        _lesson_print_call(nodes, start, instance, "doubled", [])
        and _lesson_print_call(
            nodes, start + 1, class_name, "doubled",
            [lambda item: _lesson_name(item, instance)],
        )
        and _lesson_print_call(
            nodes, start + 2, class_name, "doubled_from",
            [lambda item: _lesson_value(item, value)],
        )
        and _lesson_print_call(
            nodes, start + 3, class_name, "doubled_value",
            [lambda item: _lesson_value(item, value), lambda item: _lesson_value(item, 2)],
        )
    )

_lesson_classes = [node for node in _lesson_tree.body if isinstance(node, _lesson_ast.ClassDef)]
_lesson_lookup = False
_lesson_methods = False
if len(_lesson_classes) > 1:
    _lesson_supported = False
_lesson_calls = {"print"} | {node.name for node in _lesson_classes}
if any(
    isinstance(node, _lesson_ast.Call) and isinstance(node.func, _lesson_ast.Name)
    and node.func.id not in _lesson_calls
    for node in _lesson_nodes
):
    _lesson_supported = False
if any(isinstance(node, _lesson_ast.FunctionDef) for node in _lesson_tree.body):
    _lesson_supported = False
if len(_lesson_classes) == 1 and _lesson_tree.body[0] is _lesson_classes[0]:
    _lesson_class = _lesson_classes[0]
    _lesson_class_name = _lesson_class.name
    _lesson_class_body = _lesson_body(_lesson_class.body)
    _lesson_functions = {node.name: node for node in _lesson_class_body if isinstance(node, _lesson_ast.FunctionDef)}
    _lesson_init = _lesson_functions.get("__init__")
    _lesson_constructed = False
    if _lesson_init and len(_lesson_init.args.args) == 2 and not _lesson_init.decorator_list:
        _lesson_args = [item.arg for item in _lesson_init.args.args]
        _lesson_init_body = _lesson_body(_lesson_init.body)
        _lesson_constructed = len(_lesson_init_body) == 1 and _lesson_assignment(
            _lesson_init_body[0],
            lambda node: _lesson_attr(node, _lesson_args[0], "value"),
            lambda node: _lesson_name(node, _lesson_args[1]),
        )
    _lesson_factor = any(
        _lesson_assignment(node, lambda item: _lesson_name(item, "factor"), lambda item: _lesson_value(item, 2))
        for node in _lesson_class_body
    )
    _lesson_body_nodes = _lesson_tree.body
    if len(_lesson_body_nodes) >= 3:
        _lesson_first = _lesson_instance(_lesson_body_nodes[1], _lesson_class_name, 3)
        _lesson_second = _lesson_instance(_lesson_body_nodes[2], _lesson_class_name, 5)
        _lesson_instances = bool(
            _lesson_first and _lesson_second and _lesson_first != _lesson_second
            and _lesson_class_name not in {_lesson_first, _lesson_second}
        )
    else:
        _lesson_instances = False
    if _lesson_constructed and _lesson_factor and _lesson_instances:
        if _lesson_profile == "class-instance-lookup-v1" and len(_lesson_body_nodes) == 17:
            alias = _lesson_body_nodes[3]
            if (
                isinstance(alias, _lesson_ast.Assign) and len(alias.targets) == 1
                and isinstance(alias.targets[0], _lesson_ast.Name)
            ):
                alias_name = alias.targets[0].id
                def same(node, first, second):
                    return (
                        isinstance(node, _lesson_ast.Compare) and len(node.ops) == 1
                        and isinstance(node.ops[0], _lesson_ast.Is) and len(node.comparators) == 1
                        and ((_lesson_name(node.left, first) and _lesson_name(node.comparators[0], second))
                             or (_lesson_name(node.left, second) and _lesson_name(node.comparators[0], first)))
                    )
                _lesson_lookup = (
                    set(_lesson_functions) == {"__init__"} and len(_lesson_class_body) == 2
                    and alias_name not in {_lesson_first, _lesson_second, _lesson_class_name}
                    and _lesson_name(alias.value, _lesson_first)
                    and same(_lesson_print(_lesson_body_nodes[4]), _lesson_first, alias_name)
                    and same(_lesson_print(_lesson_body_nodes[5]), _lesson_first, _lesson_second)
                    and all(
                        _lesson_attr(_lesson_print(_lesson_body_nodes[index]), owner, attribute)
                        for index, owner, attribute in [
                            (6, _lesson_first, "value"), (7, _lesson_second, "value"),
                            (8, _lesson_first, "factor"), (9, _lesson_second, "factor"),
                            (11, _lesson_first, "factor"), (12, _lesson_second, "factor"),
                            (13, _lesson_class_name, "factor"), (15, _lesson_first, "factor"),
                            (16, _lesson_second, "factor"),
                        ]
                    )
                    and _lesson_assignment(
                        _lesson_body_nodes[10],
                        lambda node: _lesson_attr(node, _lesson_first, "factor"),
                        lambda node: _lesson_value(node, 7),
                    )
                    and _lesson_assignment(
                        _lesson_body_nodes[14],
                        lambda node: _lesson_attr(node, _lesson_class_name, "factor"),
                        lambda node: _lesson_value(node, 4),
                    )
                )
        if _lesson_profile == "method-binding-comparison-v1" and len(_lesson_body_nodes) == 16:
            required = {"__init__", "doubled", "doubled_from", "doubled_value"}
            if set(_lesson_functions) == required and len(_lesson_class_body) == 5:
                instance = _lesson_functions["doubled"]
                class_method = _lesson_functions["doubled_from"]
                static = _lesson_functions["doubled_value"]
                _lesson_methods = (
                    _lesson_method(instance, 1, None, _lesson_instance_product)
                    and _lesson_method(class_method, 2, "classmethod", _lesson_class_product)
                    and _lesson_method(static, 2, "staticmethod", _lesson_static_product)
                    and all(
                        _lesson_compare_calls(
                            _lesson_body_nodes, start, _lesson_class_name, owner, value,
                        )
                        for start, owner, value in [(3, _lesson_first, 3), (7, _lesson_second, 5)]
                    )
                    and _lesson_assignment(
                        _lesson_body_nodes[11],
                        lambda node: _lesson_attr(node, _lesson_class_name, "factor"),
                        lambda node: _lesson_value(node, 4),
                    )
                    and _lesson_print_call(_lesson_body_nodes, 12, _lesson_first, "doubled", [])
                    and _lesson_print_call(
                        _lesson_body_nodes, 13, _lesson_class_name, "doubled_from",
                        [lambda item: _lesson_value(item, 3)],
                    )
                    and _lesson_print_call(
                        _lesson_body_nodes, 14, _lesson_class_name, "doubled_value",
                        [lambda item: _lesson_value(item, 3), lambda item: _lesson_value(item, 4)],
                    )
                    and _lesson_print_call(
                        _lesson_body_nodes, 15, _lesson_class_name, "doubled_value",
                        [lambda item: _lesson_value(item, 3), lambda item: _lesson_value(item, 2)],
                    )
                )
_lesson_json.dumps({
    "supported": _lesson_supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "classInstanceCompared": _lesson_lookup,
    "methodsCompared": _lesson_methods,
})
`;
}
