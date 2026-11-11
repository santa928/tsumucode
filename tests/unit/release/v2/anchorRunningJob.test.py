import importlib.util
import json
from pathlib import Path
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


if __name__ == '__main__':
    unittest.main()
