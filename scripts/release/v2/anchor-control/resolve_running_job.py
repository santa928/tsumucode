#!/usr/bin/env python3
"""Resolve one running job from bounded API pages; caller must authenticate page origin.

Input and context are claims until obtained from the trusted GitHub runner and API. This
does not authenticate a workflow, result, output, artifact, signature or publication.
"""
import json
import os
import re
import stat
import sys
import time
import urllib.error
import urllib.request

MAX_BYTES = 1024 * 1024
MAX_JOBS = 500
REPO = 'santa928/tsumucode'


def resolve(pages, run, attempt, source, check_run):
    decimal = re.compile(r'[1-9][0-9]{0,15}\Z')
    if (not all(decimal.fullmatch(x) and int(x) <= 9007199254740991
                for x in (run, attempt, check_run)) or
            not re.fullmatch(r'[a-f0-9]{40}', source)):
        raise ValueError('invalid context')
    if not isinstance(pages, list) or not 1 <= len(pages) <= 5:
        raise ValueError('invalid pages')
    jobs = []
    total = None
    for page in pages:
        if not isinstance(page, dict) or type(page.get('total_count')) is not int:
            raise ValueError('invalid page')
        count = page['total_count']
        if not 1 <= count <= MAX_JOBS or (total is not None and count != total):
            raise ValueError('invalid total')
        total = count
        entries = page.get('jobs')
        if not isinstance(entries, list) or len(entries) > 100:
            raise ValueError('invalid jobs')
        jobs.extend(entries)
    if len(jobs) != total or any(not isinstance(j, dict) for j in jobs):
        raise ValueError('incomplete pages')
    ids = [j.get('id') for j in jobs]
    if any(type(i) is not int or i <= 0 or i > 9007199254740991 for i in ids):
        raise ValueError('invalid job id')
    if len(set(ids)) != len(ids):
        raise ValueError('duplicate job')
    check_url = f'https://api.github.com/repos/{REPO}/check-runs/{check_run}'
    matching = [j for j in jobs if j.get('check_run_url') == check_url]
    if len(matching) != 1:
        raise ValueError('job is not unique')
    job = matching[0]
    if (job.get('name') != 'parent_producer' or job.get('status') != 'in_progress' or
            'conclusion' not in job or job['conclusion'] is not None or
            type(job.get('run_id')) is not int or job['run_id'] != int(run) or
            type(job.get('run_attempt')) is not int or job['run_attempt'] != int(attempt) or
            job.get('head_sha') != source):
        raise ValueError('job context differs')
    return str(job['id'])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('redirect refused')


def fetch_pages(token, run, attempt):
    """Authenticated, fixed-origin attempt-scoped read. Token must never enter producer."""
    if (not re.fullmatch(r'[A-Za-z0-9_]{1,4096}', token) or
            not re.fullmatch(r'[1-9][0-9]{0,15}', run) or
            not re.fullmatch(r'[1-9][0-9]{0,15}', attempt)):
        raise ValueError('invalid request')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    pages = []
    total = None
    deadline = time.monotonic() + 45
    for page_number in range(1, 6):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('API deadline exceeded')
        url = (f'https://api.github.com/repos/{REPO}/actions/runs/{run}/attempts/{attempt}'
               f'/jobs?per_page=100&page={page_number}')
        request = urllib.request.Request(url, headers={
            'Accept': 'application/vnd.github+json',
            'Authorization': 'Bearer ' + token,
            'User-Agent': 'tsumucode-anchor-job-resolver',
            'X-GitHub-Api-Version': '2022-11-28',
        })
        with opener.open(request, timeout=min(15, remaining)) as response:
            if response.status != 200:
                raise ValueError('API request failed')
            body = response.read(MAX_BYTES + 1)
        if time.monotonic() > deadline:
            raise ValueError('API deadline exceeded')
        if len(body) > MAX_BYTES:
            raise ValueError('API response too large')
        page = json.loads(body, object_pairs_hook=unique_object)
        if not isinstance(page, dict) or type(page.get('total_count')) is not int:
            raise ValueError('invalid API page')
        count = page['total_count']
        if not 1 <= count <= MAX_JOBS or (total is not None and count != total):
            raise ValueError('invalid API total')
        total = count
        pages.append(page)
        if page_number * 100 >= total:
            return pages
    raise ValueError('too many pages')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def main(args):
    if len(args) != 5 or not os.path.isabs(args[0]):
        raise ValueError('invalid arguments')
    fd = os.open(args[0], os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= MAX_BYTES:
            raise ValueError('invalid input file')
        chunks = []
        count = 0
        while count <= MAX_BYTES:
            part = os.read(fd, min(65536, MAX_BYTES + 1 - count))
            if not part:
                break
            chunks.append(part)
            count += len(part)
        after = os.fstat(fd)
        if (count != before.st_size or count > MAX_BYTES or before.st_size != after.st_size or
                before.st_mtime_ns != after.st_mtime_ns or before.st_ctime_ns != after.st_ctime_ns):
            raise ValueError('input changed')
        pages = json.loads(b''.join(chunks), object_pairs_hook=unique_object)
    finally:
        os.close(fd)
    print(resolve(pages, *args[1:]))


def api_main(args):
    if len(args) != 4:
        raise ValueError('invalid arguments')
    token = os.environ.get('ANCHOR_ACTIONS_READ_TOKEN', '')
    pages = fetch_pages(token, args[0], args[1])
    print(resolve(pages, *args))


if __name__ == '__main__':
    try:
        if len(sys.argv) > 1 and sys.argv[1] == '--api':
            api_main(sys.argv[2:])
        else:
            main(sys.argv[1:])
    except (OSError, ValueError, TypeError, urllib.error.URLError):
        print('anchor job resolution failed', file=sys.stderr)
        sys.exit(1)
