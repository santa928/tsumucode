import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Page, TestInfo } from '@playwright/test';
import {
  localConsoleRoute,
  localConsolePollState,
  localConsoleGradeRunHash,
  observeLocalConsole,
} from '../e2e/helpers/localConsoleDiagnostics';

describe('Local Consoleの診断へ入力や認証値を持ち出さない', () => {
  it('URLは固定分類だけに変換し、run identityやqueryを返さない', () => {
    expect(localConsoleRoute('http://example.test/api/runs/private-id?data=never-record-me')).toBe(
      'poll',
    );
    expect(localConsoleRoute('http://example.test/api/runs/private-id/cancel')).toBe('cancel');
    expect(localConsoleRoute('http://example.test/api/grades')).toBe('grade');
    expect(localConsoleRoute('http://example.test/api/runs')).toBe('preview');
    expect(localConsoleRoute('http://example.test/unrelated?data=never-record-me')).toBeUndefined();
    expect(localConsoleRoute('not a URL')).toBeUndefined();
  });

  it('完了状態と既知status以外のSource・Console・headerを破棄する', () => {
    expect(
      localConsolePollState({
        state: 'completed',
        result: {
          status: 'succeeded',
          files: { 'main.py': 'private source' },
          console: ['private output'],
          headers: { authorization: 'private value' },
        },
      }),
    ).toEqual({ state: 'completed', resultStatus: 'succeeded' });
  });

  it('不正なpacketの文字列を診断へそのまま転記しない', () => {
    expect(localConsolePollState({ state: 'private value' })).toEqual({ state: 'other' });
    expect(
      localConsolePollState({ state: 'completed', result: { status: 'private value' } }),
    ).toEqual({ state: 'completed', resultStatus: 'other' });
    expect(localConsolePollState({ state: 'running', files: 'private source' })).toEqual({
      state: 'running',
    });
    expect(localConsolePollState(null)).toEqual({ state: 'other' });
  });

  it('暗号学的なrun IDだけを固定hashへ変換し入力や認証値を残さない', () => {
    const input = {
      backend: 'local',
      engine: 'cpython',
      state: 'running',
      runId: '123e4567-e89b-42d3-a456-426614174000:7',
      source: 'PRIVATE_INPUT',
      token: 'PRIVATE_SECRET',
    };
    expect(localConsoleGradeRunHash(input)).toMatch(/^[a-f0-9]{64}$/u);
    expect(localConsoleGradeRunHash({ ...input, runId: 'private id' })).toBe('unknown');
    expect(localConsoleGradeRunHash({ ...input, backend: 'other' })).toBe('unknown');
    expect(localConsoleGradeRunHash({ ...input, engine: 'node' })).toBe('unknown');
    expect(localConsoleGradeRunHash({ ...input, state: 'completed' })).toBe('unknown');
    expect(localConsoleGradeRunHash(null)).toBe('unknown');
  });

  it('対象 grade の受理だけを hash に結合し、応答の他データを保存しない', async () => {
    const page = Object.assign(new EventEmitter(), {
      context: () => ({ browser: () => null }),
      url: () =>
        'http://127.0.0.1:4173/#/courses/python-basics/lessons/python-basics-ch01-l02/exercises/python-basics-ch01-l02-e01',
    });
    const observer = observeLocalConsole(page as unknown as Page);
    const request = { url: () => 'http://127.0.0.1:4173/api/grades' };
    page.emit('request', request);
    page.emit('response', {
      request: () => request,
      status: () => 202,
      json: () =>
        Promise.resolve({
          backend: 'local',
          engine: 'cpython',
          state: 'running',
          runId: '123e4567-e89b-42d3-a456-426614174000:7',
          source: 'PRIVATE_INPUT',
          token: 'PRIVATE_SECRET',
        }),
    });
    await Promise.resolve();
    await Promise.resolve();
    const reports: string[] = [];
    const info = {
      attach: (_name: string, options: { body: string }) => {
        reports.push(options.body);
        return Promise.resolve();
      },
    } as unknown as TestInfo;
    await observer.attach(info);
    const value = JSON.parse(reports[0]!) as { events: { event: string; runHash?: string }[] };
    expect(value.events.find((event) => event.event === 'grade-identity')?.runHash).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(reports[0]).not.toMatch(/PRIVATE|123e4567/u);
    observer.stop();
  });

  it('本文が未完了でもheaders到着を残し、本文完了と区別する', async () => {
    const page = Object.assign(new EventEmitter(), { context: () => ({ browser: () => null }) });
    const observer = observeLocalConsole(page as unknown as Page);
    let finish!: (value: unknown) => void;
    const body = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const request = { url: () => 'http://example.test/api/runs/private-id' };
    page.emit('request', request);
    page.emit('response', { request: () => request, status: () => 200, json: () => body });
    const reports: string[] = [];
    const info = {
      attach: (_name: string, options: { body: string }) => {
        reports.push(options.body);
        return Promise.resolve();
      },
    } as unknown as TestInfo;
    await observer.attach(info);
    const first = JSON.parse(reports[0]!) as { events: { event: string }[] };
    expect(first.events.some(({ event }) => event === 'response-headers')).toBe(true);
    expect(first.events.some(({ event }) => event === 'response-body')).toBe(false);
    finish({ state: 'completed', result: { status: 'succeeded', files: 'private source' } });
    await body;
    await Promise.resolve();
    await observer.attach(info);
    const last = JSON.parse(reports.at(-1)!) as { events: { event: string }[] };
    expect(last.events.some(({ event }) => event === 'response-body')).toBe(true);
    expect(reports.at(-1)).not.toContain('private source');
    observer.stop();
  });
});
