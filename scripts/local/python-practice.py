"""入力要求は不信な練習用申告。採点evidenceには使わない固定CPythonの練習実行。"""

import base64
import builtins
import json
import os
import sys

_payload = json.loads(base64.b64decode("".join(sys.argv[1:])))
_RUN_ID = _payload["runId"]
_CONTROL_FD = 3
_sequence = 0
_input_eof = False
_original_input = builtins.input
os.dup2(2, _CONTROL_FD)


def _emit_wait():
    """同processから偽装できる申告。形式/順番は相関確認にだけ使う。"""
    global _sequence
    _sequence += 1
    packet = {"type": "request-input", "runId": _RUN_ID, "sequence": _sequence}
    os.write(_CONTROL_FD, ("TSUMUCODE_INPUT " + json.dumps(packet) + "\n").encode())


def _practice_input(prompt="", /):
    """元のbuiltinで同runのstdinを読み、EOF後は再要求しない。"""
    global _input_eof
    if not _input_eof:
        _emit_wait()
    try:
        return _original_input(prompt)
    except EOFError:
        _input_eof = True
        raise


builtins.input = _practice_input
for _name, _source in _payload["files"].items():
    with open("/workspace/" + _name, "xb") as _file:
        _file.write(_source.encode("utf-8"))
if "lesson_tools.py" in _payload["files"]:
    sys.path.insert(0, "/workspace")
exec(compile(_payload["files"]["main.py"], "/workspace/main.py", "exec"),
     {"__name__": "__main__", "__file__": "/workspace/main.py"})
