import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[4] / 'scripts/release/v2/anchor-control/resolve_running_job.py'
spec = importlib.util.spec_from_file_location('resolve_running_job', MODULE)
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)

SOURCE = 'a' * 40
JOB = {'id': 201, 'run_id': 101, 'run_attempt': 2, 'head_sha': SOURCE,
       'name': 'parent_producer', 'status': 'in_progress', 'conclusion': None,
       'check_run_url': 'https://api.github.com/repos/santa928/tsumucode/check-runs/301'}


class RunningJobTest(unittest.TestCase):
    def test_exact_match(self):
        self.assertEqual(resolver.resolve([{'total_count': 1, 'jobs': [JOB]}],
                                          '101', '2', SOURCE, '301'), '201')

    def test_rejects_stale_context_and_incomplete_or_duplicate_pages(self):
        for changed in ({'run_id': 102}, {'run_attempt': 1}, {'head_sha': 'b' * 40},
                        {'run_id': '101'}, {'run_attempt': '2'}, {'run_id': True},
                        {'run_attempt': True},
                        {'name': 'other'}, {'status': 'completed'}, {'conclusion': 'success'},
                        {'check_run_url': 'https://evil.example/check-runs/301'}):
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError):
                    resolver.resolve([{'total_count': 1, 'jobs': [{**JOB, **changed}]}],
                                     '101', '2', SOURCE, '301')
        missing_conclusion = {key: value for key, value in JOB.items() if key != 'conclusion'}
        with self.assertRaises(ValueError):
            resolver.resolve([{'total_count': 1, 'jobs': [missing_conclusion]}],
                             '101', '2', SOURCE, '301')
        for pages in ([{'total_count': 2, 'jobs': [JOB]}],
                      [{'total_count': 2, 'jobs': [JOB, JOB]}],
                      [{'total_count': 501, 'jobs': [JOB]}],
                      [{'total_count': 1, 'jobs': [{**JOB, 'id': True}]}]):
            with self.subTest(pages=pages):
                with self.assertRaises(ValueError):
                    resolver.resolve(pages, '101', '2', SOURCE, '301')

    def test_fixed_origin_attempt_scoped_fetch_and_redirect_refusal(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def read(self, limit):
                self.limit = limit
                return json.dumps({'total_count': 1, 'jobs': [JOB]}).encode()

        class Opener:
            def open(self, request, timeout):
                self.request = request
                self.timeout = timeout
                return Response()

        opener = Opener()
        with patch.object(resolver.urllib.request, 'build_opener', return_value=opener):
            pages = resolver.fetch_pages('test_only', '101', '2')
        self.assertEqual(resolver.resolve(pages, '101', '2', SOURCE, '301'), '201')
        self.assertGreater(opener.timeout, 0)
        self.assertLessEqual(opener.timeout, 15)
        self.assertEqual(opener.request.full_url,
                         'https://api.github.com/repos/santa928/tsumucode/actions/runs/101/attempts/2/jobs?per_page=100&page=1')
        with self.assertRaises(ValueError):
            resolver.NoRedirect().redirect_request(None, None, 302, None, None, 'https://evil.example/')
        with self.assertRaises(ValueError):
            resolver.unique_object([('id', 1), ('id', 2)])
        with self.assertRaises(ValueError):
            resolver.fetch_pages('bad\ntoken', '101', '2')

    def test_pagination_requires_every_unique_job(self):
        other = [{**JOB, 'id': 500 + index, 'check_run_url': f'https://example.invalid/{index}'}
                 for index in range(100)]
        pages = [{'total_count': 101, 'jobs': other}, {'total_count': 101, 'jobs': [JOB]}]
        self.assertEqual(resolver.resolve(pages, '101', '2', SOURCE, '301'), '201')
        with self.assertRaises(ValueError):
            resolver.resolve(pages[:1], '101', '2', SOURCE, '301')
        with self.assertRaises(ValueError):
            resolver.resolve([pages[0], {'total_count': 100, 'jobs': [JOB]}],
                             '101', '2', SOURCE, '301')

    def test_source_tree_is_bound_to_exact_commit(self):
        class Response:
            status = 200
            payload = {'sha': SOURCE, 'tree': {'sha': 'b' * 40}}

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def read(self, limit):
                return json.dumps(self.payload).encode()

        class Opener:
            def open(self, request, timeout):
                self.url = request.full_url
                return Response()

        opener = Opener()
        with patch.object(resolver.urllib.request, 'build_opener', return_value=opener):
            self.assertEqual(resolver.fetch_source_tree('test_only', SOURCE), 'b' * 40)
            self.assertEqual(opener.url,
                             'https://api.github.com/repos/santa928/tsumucode/git/commits/' + SOURCE)
            Response.payload = {'sha': 'c' * 40, 'tree': {'sha': 'b' * 40}}
            with self.assertRaises(ValueError):
                resolver.fetch_source_tree('test_only', SOURCE)

    def test_fifo_input_is_rejected_without_blocking(self):
        with tempfile.TemporaryDirectory() as directory:
            fifo = Path(directory) / 'input'
            os.mkfifo(fifo)
            result = subprocess.run(['/usr/bin/python3', '-I', str(MODULE), str(fifo),
                                     '101', '2', SOURCE, '301'], timeout=2,
                                    capture_output=True, check=False)
            self.assertNotEqual(result.returncode, 0)

    def test_inherited_tls_overrides_are_rejected_before_network_setup(self):
        for name in ('SSL_CERT_FILE', 'SSL_CERT_DIR', 'SSLKEYLOGFILE'):
            with self.subTest(variable=name):
                with patch.dict(os.environ, {name: '/tmp/untrusted'}, clear=True), \
                        patch.object(resolver.urllib.request, 'build_opener') as opener:
                    with self.assertRaises(ValueError):
                        resolver.fetch_pages('test_only', '101', '2')
                    with self.assertRaises(ValueError):
                        resolver.fetch_source_tree('test_only', SOURCE)
                    opener.assert_not_called()

    def test_unexpected_api_failure_never_prints_token_or_partial_output(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        self.assertTrue(hasattr(resolver, 'entry'))
        with patch.dict(os.environ, {'ANCHOR_ACTIONS_READ_TOKEN': 'synthetic_test_token'}, clear=True), \
                patch.object(resolver, 'fetch_pages', side_effect=RuntimeError('synthetic_test_token')), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.assertEqual(resolver.entry(['--api', '101', '2', SOURCE, '301']), 1)
        self.assertEqual(stdout.getvalue(), '')
        self.assertEqual(stderr.getvalue(), 'anchor job resolution failed\n')

    def test_source_tree_rejects_invalid_api_responses(self):
        class Response:
            def __init__(self, body, status=200):
                self.body, self.status = body, status

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def read(self, limit):
                return self.body[:limit]

        valid = json.dumps({'sha': SOURCE, 'tree': {'sha': 'b' * 40}}).encode()
        bad_bodies = [
            b'{"sha":"' + SOURCE.encode() + b'","sha":"' + SOURCE.encode() + b'"}',
            json.dumps({'sha': SOURCE, 'tree': {'sha': 'not-a-sha'}}).encode(),
            json.dumps({'sha': SOURCE, 'tree': []}).encode(),
            b'x' * (resolver.MAX_BYTES + 1),
        ]
        for response in [Response(body) for body in bad_bodies] + [Response(valid, 403)]:
            with self.subTest(status=response.status, size=len(response.body)):
                with patch.dict(os.environ, {}, clear=True), \
                        patch.object(resolver.urllib.request, 'build_opener') as opener:
                    opener.return_value.open.return_value = response
                    with self.assertRaises(ValueError):
                        resolver.fetch_source_tree('test_only', SOURCE)
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(resolver.urllib.request, 'build_opener') as opener, \
                patch.object(resolver.time, 'monotonic', side_effect=[0, 16]):
            opener.return_value.open.return_value = Response(valid)
            with self.assertRaises(ValueError):
                resolver.fetch_source_tree('test_only', SOURCE)


if __name__ == '__main__':
    unittest.main()
