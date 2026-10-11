/** 学習コードを実行せず両fileのASTと信頼側intで教材条件・期待出力を決める。 */
export function pythonModuleAnalysis(files, profile, inputLines = []) {
  return `
import ast as _ast
import builtins as _builtins
import json as _json
import warnings as _warnings
_files = _json.loads(${JSON.stringify(JSON.stringify(files))})
_profile = ${JSON.stringify(profile)}
_inputs = _json.loads(${JSON.stringify(JSON.stringify(inputLines))})

def _name(node, name):
    return isinstance(node, _ast.Name) and node.id == name

def _call(node, name, count):
    return isinstance(node, _ast.Call) and _name(node.func, name) and len(node.args) == count and not node.keywords

def _assignment(node):
    return isinstance(node, _ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], _ast.Name)

def _printed(node):
    return node.value.args[0] if isinstance(node, _ast.Expr) and _call(node.value, "print", 1) else None

def _constant(node, value):
    return isinstance(node, _ast.Constant) and type(node.value) is type(value) and node.value == value

def _symbol(node, bindings):
    if isinstance(node, _ast.Name):
        return bindings.get(node.id)
    if isinstance(node, _ast.Constant):
        return ("constant", node.value)
    if isinstance(node, _ast.BinOp) and isinstance(node.op, _ast.Add):
        return ("sum", _symbol(node.left, bindings), _symbol(node.right, bindings))
    if isinstance(node, _ast.Call) and isinstance(node.func, _ast.Name):
        return (node.func.id, *[_symbol(arg, bindings) for arg in node.args])
    return None

def _function_matches(function, kind):
    parameters = [arg.arg for arg in function.args.args]
    if len(parameters) != (2 if kind == "add" else 1):
        return False
    if len(function.body) not in (1, 2):
        return False
    if len(function.body) == 2:
        assignment, returned = function.body
        if not _assignment(assignment) or not isinstance(returned, _ast.Return) or not _name(returned.value, assignment.targets[0].id):
            return False
    bindings = {name: ("parameter", index) for index, name in enumerate(parameters)}
    for node in function.body[:-1]:
        if not _assignment(node):
            return False
        bindings[node.targets[0].id] = _symbol(node.value, bindings)
    if not function.body or not isinstance(function.body[-1], _ast.Return):
        return False
    returned = _symbol(function.body[-1].value, bindings)
    first = ("parameter", 0)
    second = ("parameter", 1)
    return returned in (("sum", first, second), ("sum", second, first)) if kind == "add" else returned == ("int", first)

def _exception_shape(node):
    return (isinstance(node, _ast.Try) and not node.orelse and not node.finalbody
        and len(node.handlers) == 1 and _name(node.handlers[0].type, "ValueError")
        and node.handlers[0].name is None and len(node.handlers[0].body) == 1
        and _constant(_printed(node.handlers[0].body[0]), "整数を入力してください"))

def _expected():
    if _profile == "module-import-v1":
        return "8\\n10\\n"
    count = 2 if _profile == "console-project-v1" else 1
    if len(_inputs) < count:
        return None
    try:
        numbers = [int(text) for text in _inputs[:count]]
    except ValueError:
        return "整数を入力してください\\n終了\\n"
    return str(sum(numbers) if count == 2 else numbers[0]) + "\\n終了\\n"

def _analyze():
    result = {"analysisVersion": 1, "state": "supported", "supported": True,
        "numericVariablePrinted": False, "sameVariableAdditionPrinted": False,
        "moduleImported": False, "exceptionHandled": False, "projectSummed": False,
        "expectedOutput": _expected(), "syntaxFile": None, "syntaxMessage": None}
    trees = {}
    for path in ("main.py", "lesson_tools.py"):
        try:
            trees[path] = _ast.parse(_files[path], filename=path)
            with _warnings.catch_warnings():
                _warnings.simplefilter("ignore", SyntaxWarning)
                compile(trees[path], path, "exec")
        except SyntaxError as error:
            result.update(state="syntax-error", supported=False, syntaxFile=path,
                syntaxMessage=(path + ": " + str(error.msg) + " (line " + str(error.lineno) + ")")[:1024])
            return result
    imported = {"add"} if _profile == "module-import-v1" else ({"parse_number"} if _profile == "exception-recovery-v1" else {"add", "parse_number"})
    reserved = set(dir(_builtins)) | {"add", "parse_number"}
    allowed = (_ast.Module, _ast.Assign, _ast.Name, _ast.Store, _ast.Load, _ast.Constant,
        _ast.Expr, _ast.Call, _ast.BinOp, _ast.Add, _ast.List, _ast.For,
        _ast.FunctionDef, _ast.arguments, _ast.arg, _ast.Return,
        _ast.ImportFrom, _ast.alias, _ast.Try, _ast.ExceptHandler)
    for path, tree in trees.items():
        for node in _ast.walk(tree):
            invalid = not isinstance(node, allowed)
            if isinstance(node, _ast.Constant):
                invalid |= type(node.value) not in (int, str)
            if isinstance(node, _ast.Name):
                invalid |= node.id.startswith("_") or (isinstance(node.ctx, _ast.Store) and node.id in reserved)
            if isinstance(node, _ast.Assign):
                invalid |= not _assignment(node)
            if isinstance(node, _ast.Call):
                calls = {"int", "print"} if path == "lesson_tools.py" else ({"print", "input", "int"} | imported)
                invalid |= not isinstance(node.func, _ast.Name) or node.func.id not in calls or bool(node.keywords)
            if isinstance(node, _ast.ImportFrom):
                names = [alias.name for alias in node.names]
                invalid |= path != "main.py" or node.module != "lesson_tools" or node.level != 0
                invalid |= any(alias.asname is not None for alias in node.names) or not set(names) <= imported or len(set(names)) != len(names)
            if isinstance(node, _ast.FunctionDef):
                args = node.args
                names = [arg.arg for arg in args.args]
                invalid |= path != "lesson_tools.py" or node.name not in imported or bool(node.decorator_list) or node.returns is not None
                invalid |= bool(args.posonlyargs or args.kwonlyargs or args.defaults or args.kw_defaults) or args.vararg is not None or args.kwarg is not None
                invalid |= len(set(names)) != len(names) or any(name.startswith("_") or name in reserved for name in names) or any(arg.annotation is not None for arg in args.args)
            if isinstance(node, _ast.ExceptHandler):
                invalid |= not _name(node.type, "ValueError") or node.name is not None
            if path == "lesson_tools.py" and isinstance(node, (_ast.ImportFrom, _ast.Try, _ast.For)):
                invalid = True
            if invalid:
                result.update(state="unsupported", supported=False)
                return result
        if path == "lesson_tools.py" and any(not isinstance(node, _ast.FunctionDef) for node in tree.body):
            result.update(state="unsupported", supported=False)
            return result
    definitions = trees["lesson_tools.py"].body
    if len({node.name for node in definitions}) != len(definitions):
        result.update(state="unsupported", supported=False)
        return result
    functions = {node.name: node for node in definitions}
    valid_add = "add" in functions and _function_matches(functions["add"], "add")
    valid_parse = "parse_number" in functions and _function_matches(functions["parse_number"], "parse")
    body = trees["main.py"].body
    imports = [node for node in body if isinstance(node, _ast.ImportFrom)]
    valid_import = len(imports) == 1 and body[0] is imports[0] and {alias.name for alias in imports[0].names} == imported
    body = [node for node in body if not isinstance(node, _ast.ImportFrom)]
    if not valid_import:
        return result
    if _profile == "module-import-v1":
        bindings = {}
        printed = []
        for node in body:
            if _assignment(node):
                bindings[node.targets[0].id] = _symbol(node.value, bindings)
            elif _printed(node) is not None:
                printed.append(_symbol(_printed(node), bindings))
            else:
                return result
        result["moduleImported"] = valid_add and printed == [
            ("add", ("constant", 3), ("constant", 5)),
            ("add", ("constant", 4), ("constant", 6))]
    elif _profile == "exception-recovery-v1" and len(body) == 3:
        initial, guarded, final = body
        if _assignment(initial) and _call(initial.value, "input", 0) and _exception_shape(guarded) and _constant(_printed(final), "終了"):
            if len(guarded.body) not in (1, 2):
                return result
            if len(guarded.body) == 2:
                assignment, displayed = guarded.body
                if not _assignment(assignment) or not _name(_printed(displayed), assignment.targets[0].id):
                    return result
            bindings = {initial.targets[0].id: ("input",)}
            printed = []
            for node in guarded.body:
                if _assignment(node):
                    bindings[node.targets[0].id] = _symbol(node.value, bindings)
                elif _printed(node) is not None:
                    printed.append(_symbol(_printed(node), bindings))
                else:
                    return result
            result["exceptionHandled"] = valid_parse and printed == [("parse_number", ("input",))]
    elif _profile == "console-project-v1" and len(body) == 4:
        initial, total, guarded, final = body
        if not (_assignment(initial) and isinstance(initial.value, _ast.List) and len(initial.value.elts) == 2 and all(_call(node, "input", 0) for node in initial.value.elts)
            and _assignment(total) and _constant(total.value, 0) and _exception_shape(guarded) and _constant(_printed(final), "終了") and len(guarded.body) == 2):
            return result
        loop, displayed = guarded.body
        if not (isinstance(loop, _ast.For) and isinstance(loop.target, _ast.Name) and _name(loop.iter, initial.targets[0].id) and not loop.orelse and len(loop.body) == 1):
            return result
        names = [initial.targets[0].id, total.targets[0].id, loop.target.id]
        updated = loop.body[0]
        if len(set(names)) != 3 or not _assignment(updated) or updated.targets[0].id != names[1] or not _name(_printed(displayed), names[1]):
            return result
        expression = _symbol(updated.value, {names[1]: ("total",), names[2]: ("item",)})
        parsed = ("parse_number", ("item",))
        result["projectSummed"] = valid_add and valid_parse and expression in (("add", ("total",), parsed), ("add", parsed, ("total",)))
    return result
_json.dumps(_analyze())
`;
}

/** 独立解析の固定packetだけを信用し、欠落・余剰・異常状態を環境障害にする。 */
export function parsePythonModuleAnalysis(value) {
  const fields = [
    'analysisVersion',
    'state',
    'supported',
    'numericVariablePrinted',
    'sameVariableAdditionPrinted',
    'moduleImported',
    'exceptionHandled',
    'projectSummed',
    'expectedOutput',
    'syntaxFile',
    'syntaxMessage',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field)) ||
    value.analysisVersion !== 1 ||
    !['supported', 'unsupported', 'syntax-error'].includes(value.state) ||
    fields.slice(2, 8).some((field) => typeof value[field] !== 'boolean') ||
    value.supported !== (value.state === 'supported') ||
    !(
      value.expectedOutput === null ||
      (typeof value.expectedOutput === 'string' && value.expectedOutput.length <= 4096)
    ) ||
    (value.state === 'syntax-error'
      ? !['main.py', 'lesson_tools.py'].includes(value.syntaxFile) ||
        typeof value.syntaxMessage !== 'string' ||
        value.syntaxMessage.length > 1024
      : value.syntaxFile !== null || value.syntaxMessage !== null)
  )
    throw new Error('Pythonの両file解析状態が不正です');
  return value;
}
