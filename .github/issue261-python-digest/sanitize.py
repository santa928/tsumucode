#!/usr/bin/env python3
"""Admit only bounded, fixed-schema synthetic digest results."""
import json
import re
import sys
from pathlib import Path

IDS = [
    'python-practice-ch01-l01', 'python-practice-ch01-l02',
    'python-practice-ch01-l03', 'python-practice-ch02-l01',
    'python-practice-ch03-l01',
]
OLD_LEARNER = [
    '8b4bbbf2ddb1459f2b31dcfa008c2de31830d730ea1863dfeea01130609b180c',
    '72e66a94686a745072faeb02623a8b76783d2e552ca8c6d423cfa1907e543010',
    '03f49ed4a4ab4956288e6e246506e711b5d405c3d03cca3cd9127baa3ae00203',
    'ce1564f40cad0aabc3bb3c1185ec7fb6b20d190450391ee6551893547cefe48c',
    'e82e34c6c3caffc58e1819d9386e16801cb00a74bc8ab934d145e45cda9dd288',
]
OLD_SOURCE = [
    '9d4d2d00cd605379212b52acce927a72f8258d8874fb333ecee556ede20a2f6b',
    'aa2e8ecf42a172c8eadd25c65d1e9c0782f6ab29605ad3674fc2213e12821823',
    '6124d978f4927f68021fda26b4f478ca84026160f024e447f08fa102510dfd0d',
    '2d43ba1d8ea2722d73fa0fd2b25946ec512c16f5635b0559005f719d0722db77',
    'a72b6ad57235d1767abbbe8b265702c0635119bf8ad269154db755beb154211c',
]
MARKERS = [
    'candidate-current-review=reject-stale-source',
    'synthetic-prior-review-control=reject-learner-digest',
    'scratch-cleanup=success',
    'probe=complete; scratch removed; no receipt or acceptance created',
]


def sha(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate field')
        result[key] = value
    return result


def validate(raw):
    if len(raw) > 16384:
        raise ValueError('oversized')
    lines = raw.decode('utf-8').splitlines()
    if len(lines) != 14 or lines[-4:] != MARKERS:
        raise ValueError('incomplete')
    records = [json.loads(line, object_pairs_hook=unique_object) for line in lines[:10]]
    learner_keys = {'lesson', 'learnerBefore', 'learnerAfter', 'exerciseChanged', 'navigationChanged', 'persistenceChanged'}
    source_keys = {'lesson', 'sourceBefore', 'sourceAfter'}
    for index, lesson in enumerate(IDS):
        a, b = records[index], records[index + 5]
        if not isinstance(a, dict) or set(a) != learner_keys or a['lesson'] != lesson:
            raise ValueError('learner fields')
        if not isinstance(b, dict) or set(b) != source_keys or b['lesson'] != lesson:
            raise ValueError('source fields')
        if a['learnerBefore'] != OLD_LEARNER[index] or b['sourceBefore'] != OLD_SOURCE[index]:
            raise ValueError('original differs')
        if not sha(a['learnerAfter']) or not sha(b['sourceAfter']):
            raise ValueError('digest format')
        if any(type(a[k]) is not bool for k in ('exerciseChanged', 'navigationChanged', 'persistenceChanged')):
            raise ValueError('scope format')
        if (a['learnerBefore'] != a['learnerAfter']) != (index < 3):
            raise ValueError('learner scope')
        if (b['sourceBefore'] != b['sourceAfter']) != (index < 3):
            raise ValueError('source scope')
    return '\n'.join([*(json.dumps(row, separators=(',', ':'), sort_keys=True) for row in records), *MARKERS]) + '\n'


def main():
    try:
        if len(sys.argv) != 3:
            raise ValueError('arguments')
        with Path(sys.argv[1]).open('rb') as source:
            result = validate(source.read(16385))
        Path(sys.argv[2]).write_text(result, encoding='utf-8')
    except Exception:
        print('digest-output-validation=failed', file=sys.stderr)
        return 1
    print('digest-output-validation=passed')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
