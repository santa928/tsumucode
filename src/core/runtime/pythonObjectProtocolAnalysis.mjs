/** 固定3教材の継承・Property・dunderをASTで調べる。実行や隔離の代替にはしない。 */
export function pythonObjectProtocolAnalysis(source, profile) {
  return `
import ast as _ast
import builtins as _builtins
import json as _lesson_json
import textwrap as _lesson_textwrap
_tree = _ast.parse(${JSON.stringify(source)})
_profile = ${JSON.stringify(profile)}
_inheritance_profile = _profile == "inheritance-delegation-v1"
_property_profile = _profile == "validated-property-v1"
_length_profile = _profile == "length-string-protocol-v1"
_classes = [node for node in _tree.body if isinstance(node, _ast.ClassDef)]
_class_names = {node.name for node in _classes}
_builtins_allowed = {"print"}
_attributes = {"value", "counter", "calculate", "read"}
_methods = {"__init__", "calculate", "read"}
if _property_profile:
    _builtins_allowed |= {"property", "ValueError"}
    _attributes = {"value", "_value", "setter"}
    _methods = {"__init__", "value"}
if _length_profile:
    _builtins_allowed |= {"len", "str", "list"}
    _attributes = {"titles", "append", "copy"}
    _methods = {"__init__", "__len__", "__str__"}
_reserved = set(dir(_builtins))
_allowed = (
    _ast.Module, _ast.ClassDef, _ast.FunctionDef, _ast.arguments, _ast.arg,
    _ast.Assign, _ast.Name, _ast.Load, _ast.Store, _ast.Attribute,
    _ast.Constant, _ast.Expr, _ast.Call, _ast.Return, _ast.BinOp,
    _ast.Mult, _ast.Add, _ast.UnaryOp, _ast.USub, _ast.Not,
    _ast.If, _ast.Compare, _ast.Lt, _ast.Gt, _ast.LtE, _ast.GtE,
    _ast.BoolOp, _ast.Or, _ast.Try, _ast.ExceptHandler, _ast.Raise,
    _ast.List, _ast.Subscript, _ast.Slice, _ast.JoinedStr, _ast.FormattedValue,
)
_nodes = list(_ast.walk(_tree))
_supported = len(_nodes) <= 900 and len(_tree.body) <= 40
for _node in _nodes:
    if not isinstance(_node, _allowed):
        _supported = False
    if isinstance(_node, _ast.Constant):
        if type(_node.value) not in (int, str):
            _supported = False
        elif type(_node.value) is int and abs(_node.value) > 512:
            _supported = False
        elif type(_node.value) is str and len(_node.value) > 160:
            _supported = False
    if isinstance(_node, _ast.Name):
        if (
            _node.id.startswith("_")
            or (isinstance(_node.ctx, _ast.Store) and _node.id in _reserved)
            or (_node.id in _reserved and _node.id not in _builtins_allowed)
        ):
            _supported = False
    if isinstance(_node, _ast.Attribute) and _node.attr not in _attributes:
        _supported = False
    if isinstance(_node, _ast.ClassDef):
        if (
            _node.keywords or _node.decorator_list or _node.type_params
            or _node.name.startswith("_") or _node.name in _reserved
            or len(_node.bases) > (1 if _inheritance_profile else 0)
            or any(not isinstance(base, _ast.Name) or base.id not in _class_names for base in _node.bases)
        ):
            _supported = False
    if isinstance(_node, _ast.FunctionDef):
        args = _node.args
        decorators = _node.decorator_list
        if (
            _node.name not in _methods or _node.returns or _node.type_params
            or args.defaults or args.kw_defaults or args.kwonlyargs
            or args.vararg or args.kwarg or args.posonlyargs
            or not 1 <= len(args.args) <= 2
            or (decorators and not _property_profile)
            or len(decorators) > 1
            or any(
                not (
                    isinstance(item, _ast.Name) and item.id == "property"
                    or isinstance(item, _ast.Attribute) and item.attr == "setter"
                    and isinstance(item.value, _ast.Name) and item.value.id == "value"
                )
                for item in decorators
            )
        ):
            _supported = False
    if isinstance(_node, _ast.arg):
        if _node.annotation or _node.arg.startswith("_") or _node.arg in _reserved:
            _supported = False
    if isinstance(_node, _ast.Call):
        if _node.keywords or len(_node.args) > 2:
            _supported = False
        if isinstance(_node.func, _ast.Name):
            if _node.func.id not in (_builtins_allowed | _class_names):
                _supported = False
        elif not isinstance(_node.func, _ast.Attribute):
            _supported = False
    if isinstance(_node, _ast.FormattedValue):
        if _node.conversion not in (-1, 115) or _node.format_spec is not None:
            _supported = False


def _body(nodes):
    if nodes and isinstance(nodes[0], _ast.Expr):
        value = nodes[0].value
        if isinstance(value, _ast.Constant) and type(value.value) is str:
            return nodes[1:]
    return nodes


def _name(node, name):
    return isinstance(node, _ast.Name) and node.id == name


def _constant(node, value):
    return isinstance(node, _ast.Constant) and type(node.value) is type(value) and node.value == value


def _attribute(node, owner, attribute):
    return isinstance(node, _ast.Attribute) and _name(node.value, owner) and node.attr == attribute


def _call(node, name, arguments):
    return (
        isinstance(node, _ast.Call) and _name(node.func, name) and not node.keywords
        and len(node.args) == len(arguments)
        and all(check(value) for check, value in zip(arguments, node.args))
    )


def _assignment(node, target, value):
    return (
        isinstance(node, _ast.Assign) and len(node.targets) == 1
        and target(node.targets[0]) and value(node.value)
    )


def _functions(node):
    body = _body(node.body)
    if all(isinstance(item, _ast.FunctionDef) for item in body):
        return body
    return []


def _method_value(node, count):
    if node is None or len(node.args.args) != count:
        return None
    body = _body(node.body)
    if len(body) == 1 and isinstance(body[0], _ast.Return):
        return body[0].value
    if (
        len(body) == 2 and isinstance(body[0], _ast.Assign)
        and len(body[0].targets) == 1 and isinstance(body[0].targets[0], _ast.Name)
        and isinstance(body[1], _ast.Return)
        and _name(body[1].value, body[0].targets[0].id)
    ):
        return body[0].value
    return None


def _initializes(node, attribute, copied=False):
    if node is None or len(node.args.args) != 2 or node.decorator_list:
        return False
    owner, value = [arg.arg for arg in node.args.args]
    body = _body(node.body)
    def source(item):
        if not copied:
            return _name(item, value)
        return (
            _call(item, "list", [lambda entry: _name(entry, value)])
            or isinstance(item, _ast.Call) and not item.args and not item.keywords
            and _attribute(item.func, value, "copy")
            or isinstance(item, _ast.Subscript) and _name(item.value, value)
            and isinstance(item.slice, _ast.Slice)
            and item.slice.lower is None and item.slice.upper is None and item.slice.step is None
        )
    return len(body) == 1 and _assignment(
        body[0], lambda item: _attribute(item, owner, attribute), source,
    )


def _product_method(node, multiplier):
    value = _method_value(node, 1)
    if not isinstance(value, _ast.BinOp) or not isinstance(value.op, _ast.Mult):
        return False
    owner = node.args.args[0].arg
    return (
        _attribute(value.left, owner, "value") and _constant(value.right, multiplier)
        or _constant(value.left, multiplier) and _attribute(value.right, owner, "value")
    )


def _observation_names(nodes, expected):
    if len(nodes) < len(expected):
        return None
    names = []
    for node in nodes[:len(expected)]:
        if (
            not isinstance(node, _ast.Assign) or len(node.targets) != 1
            or not isinstance(node.targets[0], _ast.Name)
        ):
            return None
        names.append(node.targets[0].id)
    if len(set(names)) != len(names) or set(names) & _class_names:
        return None
    return dict(zip(names, expected))


def _observations(nodes, source, renamed):
    # 比較対象はstarterの観察行だけ。作者の解答定義は埋め込まない。
    class Rename(_ast.NodeTransformer):
        def visit_Name(self, node):
            node.id = renamed.get(node.id, node.id)
            return node
    actual = Rename().visit(_ast.Module(body=nodes, type_ignores=[]))
    # CPython wrapperによって文字列へ入った共通の字下げだけを除く。
    return _ast.dump(actual) == _ast.dump(_ast.parse(_lesson_textwrap.dedent(source)))


def _inheritance():
    if len(_classes) != 3 or _tree.body[:3] != _classes:
        return False
    base, derived, view = _classes
    if base.bases or view.bases or len(derived.bases) != 1 or not _name(derived.bases[0], base.name):
        return False
    base_methods = {item.name: item for item in _functions(base)}
    derived_methods = {item.name: item for item in _functions(derived)}
    view_methods = {item.name: item for item in _functions(view)}
    if (
        len(_functions(base)) != 2 or set(base_methods) != {"__init__", "calculate"}
        or len(_functions(derived)) != 1 or set(derived_methods) != {"calculate"}
        or len(_functions(view)) != 2 or set(view_methods) != {"__init__", "read"}
    ):
        return False
    delegated = _method_value(view_methods["read"], 1)
    owner = view_methods["read"].args.args[0].arg
    if not (
        _initializes(base_methods["__init__"], "value")
        and _product_method(base_methods["calculate"], 2)
        and _product_method(derived_methods["calculate"], 3)
        and _initializes(view_methods["__init__"], "counter")
        and isinstance(delegated, _ast.Call) and not delegated.args and not delegated.keywords
        and isinstance(delegated.func, _ast.Attribute) and delegated.func.attr == "calculate"
        and _attribute(delegated.func.value, owner, "counter")
    ):
        return False
    nodes = _tree.body[3:]
    renamed = _observation_names(nodes, ["base", "other", "child", "view", "other_view"])
    if renamed is None:
        return False
    renamed.update({base.name: "Counter", derived.name: "TripledCounter", view.name: "CounterView"})
    return _observations(nodes, """
base = Counter(3)
other = Counter(5)
child = TripledCounter(3)
view = CounterView(base)
other_view = CounterView(other)
print(base.calculate())
print(child.calculate())
print(view.read())
base.value = 4
print(view.read())
print(other_view.read())
print(child.calculate())
""", renamed)


def _outside_bound(node, argument, lower):
    if not isinstance(node, _ast.Compare) or len(node.ops) != 1:
        return False
    bound = 0 if lower else 100
    operator = _ast.Lt if lower else _ast.Gt
    reversed_operator = _ast.Gt if lower else _ast.Lt
    return (
        _name(node.left, argument) and isinstance(node.ops[0], operator)
        and _constant(node.comparators[0], bound)
        or _constant(node.left, bound) and isinstance(node.ops[0], reversed_operator)
        and _name(node.comparators[0], argument)
    )


def _outside(node, argument):
    if isinstance(node, _ast.BoolOp) and isinstance(node.op, _ast.Or) and len(node.values) == 2:
        left, right = node.values
        return (
            _outside_bound(left, argument, True) and _outside_bound(right, argument, False)
            or _outside_bound(right, argument, True) and _outside_bound(left, argument, False)
        )
    if not isinstance(node, _ast.UnaryOp) or not isinstance(node.op, _ast.Not):
        return False
    return _inside_range(node.operand, argument)


def _inside_range(value, argument):
    if not isinstance(value, _ast.Compare) or len(value.ops) != 2:
        return False
    return (
        _constant(value.left, 0) and _name(value.comparators[0], argument)
        and _constant(value.comparators[1], 100) and all(isinstance(op, _ast.LtE) for op in value.ops)
        or _constant(value.left, 100) and _name(value.comparators[0], argument)
        and _constant(value.comparators[1], 0) and all(isinstance(op, _ast.GtE) for op in value.ops)
    )


def _raises(node):
    if not isinstance(node, _ast.Raise) or node.cause is not None:
        return False
    return _name(node.exc, "ValueError") or (
        isinstance(node.exc, _ast.Call) and _name(node.exc.func, "ValueError")
        and not node.exc.keywords and len(node.exc.args) <= 1
        and all(isinstance(arg, _ast.Constant) and type(arg.value) is str for arg in node.exc.args)
    )


def _validated_setter(node):
    if len(node.args.args) != 2:
        return False
    owner, argument = [arg.arg for arg in node.args.args]
    body = _body(node.body)
    if len(body) == 1 and isinstance(body[0], _ast.If):
        branch = body[0]
        return (
            _inside_range(branch.test, argument)
            and len(branch.body) == 1 and len(branch.orelse) == 1
            and _assignment(
                branch.body[0], lambda item: _attribute(item, owner, "_value"),
                lambda item: _name(item, argument),
            )
            and _raises(branch.orelse[0])
        )
    if len(body) not in (2, 3) or not _assignment(
        body[-1], lambda item: _attribute(item, owner, "_value"), lambda item: _name(item, argument),
    ):
        return False
    guards = body[:-1]
    if any(
        not isinstance(item, _ast.If) or item.orelse or len(item.body) != 1 or not _raises(item.body[0])
        for item in guards
    ):
        return False
    if len(guards) == 1:
        return _outside(guards[0].test, argument)
    first, second = [item.test for item in guards]
    return (
        _outside_bound(first, argument, True) and _outside_bound(second, argument, False)
        or _outside_bound(second, argument, True) and _outside_bound(first, argument, False)
    )


def _property():
    if len(_classes) != 1 or _tree.body[0] is not _classes[0]:
        return False
    target = _classes[0]
    methods = _functions(target)
    initializers = [item for item in methods if item.name == "__init__" and not item.decorator_list]
    getters = [item for item in methods if item.name == "value" and len(item.decorator_list) == 1 and _name(item.decorator_list[0], "property")]
    setters = [item for item in methods if item.name == "value" and len(item.decorator_list) == 1 and _attribute(item.decorator_list[0], "value", "setter")]
    if len(methods) != 3 or len(initializers) != 1 or len(getters) != 1 or len(setters) != 1:
        return False
    getter, setter = getters[0], setters[0]
    value = _method_value(getter, 1)
    if not (
        _initializes(initializers[0], "value")
        and _attribute(value, getter.args.args[0].arg, "_value")
        and _validated_setter(setter)
    ):
        return False
    nodes = _tree.body[1:]
    renamed = _observation_names(nodes, ["first", "second"])
    if renamed is None:
        return False
    renamed[target.name] = "Score"
    return _observations(nodes, """
first = Score(70)
second = Score(50)
print(first.value)
first.value = 90
print(first.value)
print(second.value)
try:
    first.value = -1
except ValueError:
    print("範囲外")
print(first.value)
try:
    first.value = 101
except ValueError:
    print("範囲外")
print(first.value)
first.value = 0
print(first.value)
first.value = 100
print(first.value)
try:
    Score(-1)
except ValueError:
    print("初期値も範囲外")
""", renamed)


def _length_expression(node, owner):
    return _call(node, "len", [lambda item: _attribute(item, owner, "titles")])


def _string_expression(node, owner):
    def count(item):
        return _call(item, "len", [lambda entry: _name(entry, owner)]) or _length_expression(item, owner)
    if isinstance(node, _ast.BinOp) and isinstance(node.op, _ast.Add):
        return _constant(node.left, "本:") and _call(node.right, "str", [count])
    return (
        isinstance(node, _ast.JoinedStr) and len(node.values) == 2
        and _constant(node.values[0], "本:") and isinstance(node.values[1], _ast.FormattedValue)
        and count(node.values[1].value)
    )


def _length_and_string():
    if len(_classes) != 1 or _tree.body[0] is not _classes[0]:
        return False
    target = _classes[0]
    methods = {item.name: item for item in _functions(target)}
    if len(_functions(target)) != 3 or set(methods) != {"__init__", "__len__", "__str__"}:
        return False
    length = methods["__len__"]
    text = methods["__str__"]
    if not (
        _initializes(methods["__init__"], "titles", copied=True)
        and _length_expression(_method_value(length, 1), length.args.args[0].arg)
        and _string_expression(_method_value(text, 1), text.args.args[0].arg)
    ):
        return False
    nodes = _tree.body[1:]
    renamed = _observation_names(nodes, ["titles", "shelf", "empty"])
    if renamed is None:
        return False
    renamed[target.name] = "ReadingList"
    return _observations(nodes, """
titles = ["A", "B"]
shelf = ReadingList(titles)
empty = ReadingList([])
print(len(shelf))
print(shelf)
titles.append("C")
print(len(shelf))
shelf.titles.append("D")
print(len(shelf))
print(shelf)
print(len(empty))
print(empty)
""", renamed)

_inheritance_fact = False
_property_fact = False
_length_fact = False
if _supported:
    if _inheritance_profile:
        _inheritance_fact = _inheritance()
    elif _property_profile:
        _property_fact = _property()
    elif _length_profile:
        _length_fact = _length_and_string()
_lesson_json.dumps({
    "supported": _supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "inheritanceDelegationCompared": _inheritance_fact,
    "propertyRangeValidated": _property_fact,
    "dunderProtocolsUsed": _length_fact,
})
`;
}
