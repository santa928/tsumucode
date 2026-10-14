/** 追加2教材の設定・装飾・呼出と記録Projectの構造を確認する。学習コードは実行しない。 */
export function pythonDecoratorFactoryAnalysis(source, profile) {
  const observations =
    profile === 'configured-decorator-v1'
      ? `print(decorated(3, extra=2))
print(decorated(4, 1))
print(double(3, extra=1))
print(again(2))
try:
    decorated(-1, extra=2)
except ValueError as error:
    print(str(error))
print(decorated(2))
print(double(4))
print(again(3))
print(decorated.__name__ == original.__name__)
print(decorated.__doc__ == original.__doc__)
print(decorated.__wrapped__ is original)
print(double.__name__)
`
      : `print(book(first, 3, extra=2))
print(book(first, 1))
print(bonus(second, 2, extra=1))
print(again(second, 1))
try:
    book(first, -1)
except ValueError as error:
    print(str(error))
print(first.total, second.total)
print(book(first, 2))
print(bonus(second, 3))
print(again(second, 2))
print(book.__name__, bonus.__name__)
print(book.__doc__ == book.__wrapped__.__doc__)
print(bonus.__doc__ == bonus.__wrapped__.__doc__)
print(again.__wrapped__ is book.__wrapped__)
`;
  return `
import ast as _ast
import builtins as _builtins
import json as _lesson_json
_tree = _ast.parse(${JSON.stringify(source)})
_metadata = True
_project = ${JSON.stringify(profile)} == "decorator-ledger-project-v1"
_observation_tree = _ast.parse(${JSON.stringify(observations)})
_allowed = (
    _ast.Module, _ast.ClassDef, _ast.Import, _ast.ImportFrom, _ast.alias, _ast.FunctionDef,
    _ast.arguments, _ast.arg, _ast.Assign, _ast.AugAssign, _ast.Name,
    _ast.Load, _ast.Store, _ast.Expr, _ast.Call, _ast.Starred, _ast.keyword,
    _ast.Return, _ast.Nonlocal, _ast.Constant, _ast.BinOp, _ast.Add, _ast.Mult,
    _ast.If, _ast.Compare, _ast.Lt, _ast.Eq, _ast.Is, _ast.Raise,
    _ast.Try, _ast.ExceptHandler, _ast.Attribute, _ast.UnaryOp, _ast.USub,
)
_nodes = list(_ast.walk(_tree))
_supported = len(_nodes) <= 1000 and len(_tree.body) <= 40
_bindings = set()
_wraps_name = None
_module_name = None
for _node in _nodes:
    if isinstance(_node, (_ast.FunctionDef, _ast.ClassDef, _ast.arg)):
        _bindings.add(_node.name if isinstance(_node, (_ast.FunctionDef, _ast.ClassDef)) else _node.arg)
    if isinstance(_node, _ast.Name) and isinstance(_node.ctx, _ast.Store):
        _bindings.add(_node.id)
    if isinstance(_node, _ast.ExceptHandler) and _node.name:
        _bindings.add(_node.name)
    if isinstance(_node, _ast.ImportFrom):
        if not (_metadata and _node.module == "functools" and _node.level == 0
                and len(_node.names) == 1 and _node.names[0].name == "wraps"):
            _supported = False
        else:
            _wraps_name = _node.names[0].asname or "wraps"
            _bindings.add(_wraps_name)
    if isinstance(_node, _ast.Import):
        if not (_metadata and len(_node.names) == 1 and _node.names[0].name == "functools"):
            _supported = False
        else:
            _module_name = _node.names[0].asname or "functools"
            _bindings.add(_module_name)
_reserved = set(dir(_builtins))
if _bindings & _reserved:
    _supported = False
for _node in _nodes:
    if isinstance(_node, _ast.ClassDef) and (not _project or _node.bases or _node.keywords or _node.decorator_list or _node.type_params):
        _supported = False
    if not isinstance(_node, _allowed):
        _supported = False
    if isinstance(_node, _ast.Constant):
        if type(_node.value) not in (int, str):
            _supported = False
        elif type(_node.value) is int and abs(_node.value) > 512:
            _supported = False
        elif type(_node.value) is str and len(_node.value) > 256:
            _supported = False
    if isinstance(_node, _ast.Name) and isinstance(_node.ctx, _ast.Load):
        if _node.id not in _bindings | {"print", "str", "ValueError"}:
            _supported = False
    if isinstance(_node, _ast.Attribute):
        _metadata_read = _metadata and _node.attr in {"__name__", "__doc__", "__wrapped__"}
        _ledger_access = _project and _node.attr in {"total", "add"}
        _wraps_read = _metadata and _node.attr == "wraps" and isinstance(_node.value, _ast.Name) and _node.value.id == _module_name
        if not (_metadata_read or _wraps_read or _ledger_access):
            _supported = False
    if isinstance(_node, _ast.FunctionDef):
        if (_node.returns or _node.type_params or _node.args.posonlyargs
                or _node.args.kwonlyargs or _node.args.kw_defaults
                or any(_arg.annotation for _arg in _node.args.args)
                or (_node.args.vararg and _node.args.vararg.annotation)
                or (_node.args.kwarg and _node.args.kwarg.annotation)):
            _supported = False
    if isinstance(_node, _ast.Call) and not isinstance(_node.func, (_ast.Name, _ast.Call, _ast.Attribute)):
        _supported = False


def _name(node, value):
    return isinstance(node, _ast.Name) and node.id == value


def _constant(node, value):
    return isinstance(node, _ast.Constant) and type(node.value) is type(value) and node.value == value


def _body(node):
    body = node.body
    if body and isinstance(body[0], _ast.Expr) and isinstance(body[0].value, _ast.Constant) and type(body[0].value.value) is str:
        return body[1:]
    return body


def _assigned(node):
    if isinstance(node, _ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], _ast.Name):
        return node.targets[0].id
    return None


def _call(node, name, arguments):
    return (isinstance(node, _ast.Call) and _name(node.func, name) and not node.keywords
        and len(node.args) == len(arguments)
        and all(_name(value, expected) for value, expected in zip(node.args, arguments)))


def _wraps(node, function):
    return (isinstance(node, _ast.Call) and len(node.args) == 1 and not node.keywords
        and _name(node.args[0], function)
        and (_name(node.func, _wraps_name)
            or isinstance(node.func, _ast.Attribute) and _name(node.func.value, _module_name) and node.func.attr == "wraps"))


def _forwarded(node, function, args, kwargs):
    return (isinstance(node, _ast.Call) and _name(node.func, function)
        and len(node.args) == 1 and isinstance(node.args[0], _ast.Starred)
        and _name(node.args[0].value, args) and len(node.keywords) == 1
        and node.keywords[0].arg is None and _name(node.keywords[0].value, kwargs))


def _returned(body):
    if len(body) == 1 and isinstance(body[0], _ast.Return):
        return body[0].value
    if (len(body) == 2 and _assigned(body[0]) and isinstance(body[1], _ast.Return)
            and _name(body[1].value, _assigned(body[0]))):
        return body[0].value
    return None


def _increment(node, count):
    if isinstance(node, _ast.AugAssign):
        return _name(node.target, count) and isinstance(node.op, _ast.Add) and _constant(node.value, 1)
    if _assigned(node) == count and isinstance(node.value, _ast.BinOp) and isinstance(node.value.op, _ast.Add):
        return ((_name(node.value.left, count) and _constant(node.value.right, 1))
            or (_constant(node.value.left, 1) and _name(node.value.right, count)))
    return False


def _factory(node):
    args = node.args
    if len(args.args) != 1 or args.vararg or args.kwarg or args.defaults or node.decorator_list:
        return False
    outer = _body(node)
    if (len(outer) != 2 or not isinstance(outer[0], _ast.FunctionDef)
            or not isinstance(outer[1], _ast.Return) or not _name(outer[1].value, outer[0].name)):
        return False
    decorate = outer[0]
    args = decorate.args
    if len(args.args) != 1 or args.vararg or args.kwarg or args.defaults or decorate.decorator_list:
        return False
    body = _body(decorate)
    if len(body) not in (3, 4) or not _assigned(body[0]) or not _constant(body[0].value, 0):
        return False
    count = _assigned(body[0])
    function = args.args[0].arg
    wrapper = body[1]
    if not isinstance(wrapper, _ast.FunctionDef) or not isinstance(body[-1], _ast.Return) or not _name(body[-1].value, wrapper.name):
        return False
    explicit = len(body) == 4
    if explicit:
        application = body[2]
        if not (_assigned(application) == wrapper.name and isinstance(application.value, _ast.Call)
                and _wraps(application.value.func, function) and len(application.value.args) == 1
                and _name(application.value.args[0], wrapper.name) and not application.value.keywords):
            return False
        if wrapper.decorator_list:
            return False
    elif len(wrapper.decorator_list) != 1 or not _wraps(wrapper.decorator_list[0], function):
        return False
    args = wrapper.args
    if args.args or args.defaults or args.vararg is None or args.kwarg is None:
        return False
    wrapped = _body(wrapper)
    if len(wrapped) not in (4, 5) or not isinstance(wrapped[0], _ast.Nonlocal) or wrapped[0].names != [count]:
        return False
    if not _increment(wrapped[1], count):
        return False
    printed = wrapped[2]
    if not (isinstance(printed, _ast.Expr) and isinstance(printed.value, _ast.Call)
            and _name(printed.value.func, "print") and not printed.value.keywords
            and len(printed.value.args) == 2 and _name(printed.value.args[0], node.args.args[0].arg)
            and _name(printed.value.args[1], count)):
        return False
    return _forwarded(_returned(wrapped[3:]), function, args.vararg.arg, args.kwarg.arg)


class _Rename(_ast.NodeTransformer):
    def __init__(self, names):
        self.names = names
    def visit_Name(self, node):
        node.id = self.names.get(node.id, node.id)
        return node
    def visit_keyword(self, node):
        node.arg = self.names.get(node.arg, node.arg)
        return self.generic_visit(node)
    def visit_BinOp(self, node):
        self.generic_visit(node)
        if isinstance(node.op, (_ast.Add, _ast.Mult)) and _ast.dump(node.left) > _ast.dump(node.right):
            node.left, node.right = node.right, node.left
        return node


def _target(node, doubled):
    args = node.args
    size = 3 if _project else 2
    if (len(args.args) != size or args.vararg or args.kwarg or len(args.defaults) != 1
            or not _constant(args.defaults[0], 0) or node.decorator_list):
        return False
    if not (node.body and isinstance(node.body[0], _ast.Expr)
            and isinstance(node.body[0].value, _ast.Constant)
            and type(node.body[0].value.value) is str and node.body[0].value.value):
        return False
    names = ["ledger", "value", "extra"] if _project else ["value", "extra"]
    rename = _Rename(dict(zip([arg.arg for arg in args.args], names)))
    body = _body(node)
    if not _project:
        if len(body) not in (2, 3):
            return False
        branch = rename.visit(body[0])
        expected = _ast.parse('if value < 0: raise ValueError("負の値")').body[0]
        if _ast.dump(branch) != _ast.dump(expected):
            return False
        body = body[1:]
    value = _returned(body)
    if value is None:
        return False
    expression = "value * 2 + extra" if doubled else "value + extra"
    if _project:
        expression = "ledger.add(" + expression + ")"
    return _ast.dump(rename.visit(value)) == _ast.dump(_Rename({}).visit(_ast.parse(expression, mode="eval").body))


def _ledger(node):
    if not isinstance(node, _ast.ClassDef) or len(_body(node)) != 2:
        return False
    init, add = _body(node)
    if not all(isinstance(method, _ast.FunctionDef) for method in (init, add)):
        return False
    if (init.name != "__init__" or add.name != "add" or init.decorator_list or add.decorator_list
            or len(init.args.args) != 1 or len(add.args.args) != 2
            or any(method.args.vararg or method.args.kwarg or method.args.defaults for method in (init, add))):
        return False
    rename_init = _Rename({init.args.args[0].arg: "self"})
    actual_init = rename_init.visit(_ast.Module(body=_body(init), type_ignores=[]))
    if _ast.dump(actual_init) != _ast.dump(_ast.parse("self.total = 0")):
        return False
    rename = _Rename({add.args.args[0].arg: "self", add.args.args[1].arg: "value"})
    body = [rename.visit(item) for item in _body(add)]
    if len(body) not in (3, 4):
        return False
    if _ast.dump(body[0]) != _ast.dump(_ast.parse('if value < 0: raise ValueError("負の値")').body[0]):
        return False
    update = body[1]
    expected_update = _ast.parse("self.total += value").body[0]
    if isinstance(update, _ast.Assign) and len(update.targets) == 1:
        expected_assign = _Rename({}).visit(_ast.parse("self.total = self.total + value").body[0])
        if _ast.dump(update) != _ast.dump(expected_assign):
            return False
    elif _ast.dump(update) != _ast.dump(expected_update):
        return False
    returned = _returned(body[2:])
    return returned is not None and _ast.dump(returned) == _ast.dump(_ast.parse("self.total", mode="eval").body)


def _expanded(body):
    result = []
    for node in body:
        if isinstance(node, _ast.FunctionDef) and node.decorator_list:
            if len(node.decorator_list) != 1:
                return []
            decorator = node.decorator_list[0]
            node.decorator_list = []
            result.append(node)
            result.append(_ast.Assign(
                targets=[_ast.Name(id=node.name, ctx=_ast.Store())],
                value=_ast.Call(func=decorator, args=[_ast.Name(id=node.name, ctx=_ast.Load())], keywords=[])))
        else:
            result.append(node)
    return result


def _configured(node, factory, label):
    return (isinstance(node, _ast.Call) and _name(node.func, factory)
        and len(node.args) == 1 and _constant(node.args[0], label) and not node.keywords)


def _fact():
    if not _tree.body or not isinstance(_tree.body[0], (_ast.Import, _ast.ImportFrom)):
        return False
    body = _expanded(_tree.body[1:])
    if len(body) < (11 if _project else 9) or not isinstance(body[0], _ast.FunctionDef):
        return False
    factory = body[0]
    if not _factory(factory):
        return False
    if _project:
        ledger, configuration, target, application, other, second_application, repeated, first, second = body[1:10]
        if not _ledger(ledger):
            return False
        if not all(_assigned(item) and _call(item.value, ledger.name, []) for item in (first, second)):
            return False
        observations = body[10:]
        names = {ledger.name: "Ledger", _assigned(first): "first", _assigned(second): "second"}
    else:
        target, original, configuration, application, other, second_application, repeated = body[1:8]
        if not (_assigned(original) and isinstance(target, _ast.FunctionDef) and _name(original.value, target.name)):
            return False
        observations = body[8:]
        names = {_assigned(original): "original"}
    if not (isinstance(target, _ast.FunctionDef) and isinstance(other, _ast.FunctionDef)
            and _target(target, False) and _target(other, True)):
        return False
    configured = _assigned(configuration)
    decorated = _assigned(application)
    again = _assigned(repeated)
    label = "記録" if _project else "加算"
    other_label = "特典" if _project else "倍算"
    if not (configured and decorated and again and _configured(configuration.value, factory.name, label)
            and _call(application.value, configured, [target.name])):
        return False
    if not (_assigned(second_application) == other.name and isinstance(second_application.value, _ast.Call)
            and _configured(second_application.value.func, factory.name, other_label)
            and len(second_application.value.args) == 1 and _name(second_application.value.args[0], other.name)
            and not second_application.value.keywords):
        return False
    repeated_argument = repeated.value.args[0] if isinstance(repeated.value, _ast.Call) and len(repeated.value.args) == 1 else None
    if _project:
        original_reference = (isinstance(repeated_argument, _ast.Attribute)
            and _name(repeated_argument.value, target.name) and repeated_argument.attr == "__wrapped__")
    else:
        original_reference = _name(repeated_argument, target.name)
    if not (isinstance(repeated.value, _ast.Call) and _name(repeated.value.func, configured)
            and not repeated.value.keywords and original_reference):
        return False
    names.update({factory.name: "trace_calls", target.name: "book" if _project else "add",
        other.name: "bonus" if _project else "double", configured: "configured",
        decorated: "book" if _project else "decorated", again: "again"})
    actual = _Rename(names).visit(_ast.Module(body=observations, type_ignores=[]))
    return _ast.dump(actual) == _ast.dump(_observation_tree)

_fact_value = _fact() if _supported else False
_lesson_json.dumps({
    "supported": _supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "configuredDecoratorCompared": _fact_value and not _project,
    "decoratorProjectRecorded": _fact_value and _project,
})
`;
}
