/** 固定2教材のFunction変換・Closure・wrapsをASTで確認する。隔離の代替にはしない。 */
export function pythonDecoratorAnalysis(source, profile) {
  const observations =
    profile === 'function-decorator-flow-v1'
      ? `print(decorated is original)
print(decorated(3, extra=2))
print(decorated(4, 1))
print(double(3, extra=1))
try:
    decorated(-1, extra=2)
except ValueError as error:
    print(str(error))
print(decorated(2))
print(double(4))
`
      : `print(decorated is original)
print(decorated.__name__ == original.__name__)
print(decorated.__doc__ == original.__doc__)
print(decorated.__wrapped__ is original)
print(decorated(3, extra=2))
print(decorated(4, 1))
print(double(3, extra=1))
try:
    decorated(-1, extra=2)
except ValueError as error:
    print(str(error))
print(decorated(2))
print(double(4))
`;
  return `
import ast as _ast
import builtins as _builtins
import json as _lesson_json
_tree = _ast.parse(${JSON.stringify(source)})
_metadata = ${JSON.stringify(profile)} == "wraps-metadata-preserved-v1"
_observation_tree = _ast.parse(${JSON.stringify(observations)})
_allowed = (
    _ast.Module, _ast.Import, _ast.ImportFrom, _ast.alias, _ast.FunctionDef,
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
    if isinstance(_node, (_ast.FunctionDef, _ast.arg)):
        _bindings.add(_node.name if isinstance(_node, _ast.FunctionDef) else _node.arg)
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
        _wraps_read = _metadata and _node.attr == "wraps" and isinstance(_node.value, _ast.Name) and _node.value.id == _module_name
        if not (_metadata_read or _wraps_read):
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
    if len(node.args.args) != 1 or node.args.vararg or node.args.kwarg or node.args.defaults or node.decorator_list:
        return False
    body = _body(node)
    if len(body) not in (3, 4) or not _assigned(body[0]) or not _constant(body[0].value, 0):
        return False
    count = _assigned(body[0])
    function = node.args.args[0].arg
    wrapper = body[1]
    if not isinstance(wrapper, _ast.FunctionDef) or not isinstance(body[-1], _ast.Return) or not _name(body[-1].value, wrapper.name):
        return False
    explicit = len(body) == 4
    if explicit:
        application = body[2]
        if not (_metadata and _assigned(application) == wrapper.name and isinstance(application.value, _ast.Call)
                and _wraps(application.value.func, function) and len(application.value.args) == 1
                and _name(application.value.args[0], wrapper.name) and not application.value.keywords):
            return False
    decorators = wrapper.decorator_list
    if _metadata and not explicit:
        if len(decorators) != 1 or not _wraps(decorators[0], function):
            return False
    elif decorators:
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
            and len(printed.value.args) == 2 and _constant(printed.value.args[0], "呼出") and _name(printed.value.args[1], count)):
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
    if len(args.args) != 2 or args.vararg or args.kwarg or len(args.defaults) != 1 or not _constant(args.defaults[0], 0):
        return False
    if _metadata and not (node.body and isinstance(node.body[0], _ast.Expr) and isinstance(node.body[0].value, _ast.Constant) and type(node.body[0].value.value) is str and node.body[0].value.value):
        return False
    body = _body(node)
    if len(body) not in (2, 3):
        return False
    renamed = _Rename({args.args[0].arg: "value", args.args[1].arg: "extra"})
    branch = renamed.visit(body[0])
    expected_branch = _ast.parse('if value < 0: raise ValueError("負の値")').body[0]
    if _ast.dump(branch) != _ast.dump(expected_branch):
        return False
    returned = _returned(body[1:])
    if returned is None:
        return False
    actual = renamed.visit(returned)
    expected = renamed.visit(_ast.parse("value * 2 + extra" if doubled else "value + extra", mode="eval").body)
    return _ast.dump(actual) == _ast.dump(expected)


def _fact():
    body = list(_tree.body)
    if _metadata:
        if not body or not isinstance(body[0], (_ast.ImportFrom, _ast.Import)):
            return False
        body = body[1:]
    if len(body) < 6 or not all(isinstance(body[index], _ast.FunctionDef) for index in (0, 1, 4)):
        return False
    factory, target, other = body[0], body[1], body[4]
    if not _factory(factory) or target.decorator_list or not _target(target, False) or not _target(other, True):
        return False
    original = _assigned(body[2])
    decorated = _assigned(body[3])
    if not (original and decorated and _name(body[2].value, target.name)
            and _call(body[3].value, factory.name, [target.name])):
        return False
    observations = body[5:]
    if other.decorator_list:
        if len(other.decorator_list) != 1 or not _name(other.decorator_list[0], factory.name):
            return False
    else:
        if not observations or _assigned(observations[0]) != other.name or not _call(observations[0].value, factory.name, [other.name]):
            return False
        observations = observations[1:]
    renamed = _Rename({factory.name: "count_calls", target.name: "add", other.name: "double", original: "original", decorated: "decorated"})
    actual = renamed.visit(_ast.Module(body=observations, type_ignores=[]))
    return _ast.dump(actual) == _ast.dump(_observation_tree)

_fact_value = _fact() if _supported else False
_lesson_json.dumps({
    "supported": _supported,
    "numericVariablePrinted": False,
    "sameVariableAdditionPrinted": False,
    "decoratorFlowCompared": _fact_value and not _metadata,
    "wrapsMetadataPreserved": _fact_value and _metadata,
})
`;
}
