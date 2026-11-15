"""Test volume ownership with a synthetic command, never a Docker daemon."""

import os
import pathlib
import subprocess
import tempfile

helper = pathlib.Path(__file__).with_name("volume-lifecycle.sh").resolve()
fake = r'''#!/usr/bin/env python3
import os,pathlib,sys
p=pathlib.Path(os.environ['OOP_FAKE_ROOT']); a=sys.argv[1:]
if a[:2]==['volume','ls']:
 if os.environ.get('OOP_FAKE_FAIL_LIST')=='1': sys.exit(1)
 print('\n'.join(x.name for x in p.iterdir()))
elif a[:2]==['volume','create']:
 f=p/a[-1]
 if not f.exists(): f.write_text('foreign' if os.environ.get('OOP_FAKE_RACE')=='1' else a[3].split('=',1)[1])
elif a[:2]==['volume','inspect']:
 f=p/a[-1]
 if not f.is_file(): sys.exit(1)
 print(f.read_text())
elif a[:2]==['volume','rm']:
 f=p/a[-1]
 if not f.is_file(): sys.exit(1)
 f.unlink()
else: sys.exit(1)
'''

with tempfile.TemporaryDirectory(prefix="oop-volume-tests-") as tmp:
    root = pathlib.Path(tmp)
    binary = root / "bin"
    binary.mkdir()
    executable = binary / "docker"
    executable.write_text(fake)
    executable.chmod(0o700)
    state = root / "state"
    state.mkdir()
    env = {
        "PATH": str(binary) + os.pathsep + "/usr/bin:/bin",
        "RUNNER_TEMP": tmp,
        "GITHUB_RUN_ID": "123456",
        "GITHUB_RUN_ATTEMPT": "2",
        "OOP_FAKE_ROOT": str(state),
        "HOME": tmp,
    }
    name = "oop-reading-123456-2"

    def run(commands, **extra):
        return subprocess.run(
            ["bash", "-c", f'set -eu; source "$1"; {commands}', "test", str(helper)],
            env={**env, **extra},
            text=True,
            capture_output=True,
            timeout=5,
        )

    (state / name).write_text("foreign")
    assert run("if probe_volume_create; then exit 1; fi; probe_volume_cleanup").returncode == 0
    assert (state / name).read_text() == "foreign"
    (state / name).unlink()
    (state / "unrelated").write_text("foreign")
    assert run("probe_volume_create; probe_volume_cleanup").returncode == 0
    assert not (state / name).exists() and (state / "unrelated").read_text() == "foreign"
    assert run("if probe_volume_create; then exit 1; fi; probe_volume_cleanup", OOP_FAKE_RACE="1").returncode == 0
    assert (state / name).read_text() == "foreign"
    (state / name).unlink()
    assert run("probe_volume_create; printf foreign > \"$OOP_FAKE_ROOT/$probe_volume_name\"; if probe_volume_cleanup; then exit 1; fi").returncode == 0
    assert (state / name).read_text() == "foreign"
    (state / name).unlink()
    assert run("if probe_volume_create; then exit 1; fi", OOP_FAKE_FAIL_LIST="1").returncode == 0
    assert not (state / name).exists()
    assert run("if probe_volume_create; then exit 1; fi", GITHUB_RUN_ID="not-a-run").returncode == 0
    assert run("if probe_volume_create; then exit 1; fi", GITHUB_RUN_ATTEMPT="").returncode == 0
    assert list(state.iterdir()) == [state / "unrelated"]
    print("volume-ownership=passed; create-cleanup=1; preexisting/race/changed-owner/list-failure/identity=blocked")
