import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LocalPythonPracticeClient,
  type PythonPracticeSnapshot,
} from '../../../adapters/runtime/local/LocalPythonPracticeClient';
import { RuntimeConsole } from '../components/RuntimeConsole';
import type { PythonPracticePanelProps } from '../localRuntime';

/** 練習の生Consoleと入力はこの画面だけに保持し、学習Sessionへ渡さない。 */
export function LocalPythonPractice(props: PythonPracticePanelProps) {
  const client = useMemo(() => new LocalPythonPracticeClient(), []);
  const [snapshot, setSnapshot] = useState<PythonPracticeSnapshot>();
  const [line, setLine] = useState('');
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [cancelled, setCancelled] = useState(false);
  const mounted = useRef(true);
  const operation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const waiting = snapshot?.phase === 'waiting-input';
  const onBusyChange = props.onBusyChange;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current += 1;
      void client.stop().catch(() => undefined);
      onBusyChange(false);
    };
  }, [client, onBusyChange]);
  useEffect(() => {
    if (props.disabled) {
      const generation = ++operation.current;
      void client
        .stop()
        .catch(() => undefined)
        .finally(() => {
          if (mounted.current && generation === operation.current) {
            setSnapshot(undefined);
            setLine('');
            setRunning(false);
            setSending(false);
            onBusyChange(false);
          }
        });
    }
  }, [client, props.disabled, onBusyChange]);
  useEffect(() => {
    if (waiting) inputRef.current?.focus();
    if (!running && snapshot?.phase === 'ended') {
      if (snapshot.removed || snapshot.recoveryNeeded) startRef.current?.focus();
    }
  }, [
    waiting,
    running,
    snapshot?.phase,
    snapshot?.removed,
    snapshot?.recoveryNeeded,
    snapshot?.inputRequestSequence,
  ]);

  async function start() {
    const generation = ++operation.current;
    setCancelled(false);
    setError(undefined);
    setLine('');
    setSnapshot(undefined);
    setRunning(true);
    onBusyChange(true);
    try {
      // Source編集後に予約された自動Previewも回収してから、同じ実行枠へ進む。
      await props.prepare();
      if (!mounted.current || generation !== operation.current) return;
      await client.start(
        {
          exerciseId: props.exerciseId,
          contentRevision: props.contentRevision,
          exerciseSessionId: props.exerciseSessionId,
          executionRevision: props.executionRevision,
          files: { ...props.files },
        },
        (value) => {
          if (mounted.current && generation === operation.current) {
            setSnapshot(value);
            if (value.phase === 'ended') setLine('');
          }
        },
      );
    } catch (reason: unknown) {
      if (mounted.current && generation === operation.current)
        setError(reason instanceof Error ? reason.message : '練習を実行できません。');
    } finally {
      if (mounted.current && generation === operation.current) {
        setRunning(false);
        setLine('');
        onBusyChange(false);
      }
    }
  }

  async function send(eof = false) {
    const sequence = snapshot?.inputRequestSequence;
    if (snapshot === undefined || sequence == null || sending) return;
    const generation = operation.current;
    const runId = snapshot.identity.runId;
    setSending(true);
    setError(undefined);
    try {
      await client.send(sequence, eof ? undefined : line, eof);
      if (mounted.current && generation === operation.current) {
        setLine('');
        setSnapshot((value) =>
          value?.identity.runId === runId &&
          value.phase === 'waiting-input' &&
          value.inputRequestSequence === sequence
            ? { ...value, phase: 'resuming', inputRequestSequence: null }
            : value,
        );
      }
    } catch (reason: unknown) {
      if (mounted.current && generation === operation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : '入力を送れません。同じ入力を再送しないでください。',
        );
    } finally {
      if (mounted.current && generation === operation.current) setSending(false);
    }
  }

  async function cancel() {
    const generation = ++operation.current;
    try {
      const value = await client.stop();
      if (mounted.current && generation === operation.current) {
        setSnapshot(value);
        setCancelled(true);
      }
    } catch (reason: unknown) {
      if (mounted.current && generation === operation.current) {
        setSnapshot(undefined);
        setCancelled(false);
        setError(reason instanceof Error ? reason.message : '回収を確認できません。');
      }
    } finally {
      if (mounted.current && generation === operation.current) {
        setLine('');
        setRunning(false);
        setSending(false);
        onBusyChange(false);
      }
    }
  }

  const records = [
    ...(snapshot?.stdout ?? '')
      .split('\n')
      .filter((text, index, all) => text || index < all.length - 1)
      .map((text) => ({ level: 'log' as const, text })),
    ...(snapshot?.stderr ?? '')
      .split('\n')
      .filter((text, index, all) => text || index < all.length - 1)
      .map((text) => ({ level: 'error' as const, text })),
  ]
    .slice(0, 200)
    .map((record, sequence) => ({ ...record, sequence }));

  return (
    <section aria-label="CPythonの練習実行" className="my-4 space-y-3 rounded border p-3">
      <p>
        対話実行は練習専用です。正誤・進捗へ反映しません。採点は「判定する」で固定テストを別実行します。
      </p>
      <p>
        入力要求はプログラムの申告で、本物のinput待機の証明ではありません。偽の要求で不要な入力欄が出る場合があります。
      </p>
      <div className="flex gap-3">
        <button
          ref={startRef}
          type="button"
          className="tc-exercise-pager-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.disabled || running || snapshot?.recoveryNeeded}
          onClick={() => {
            void start();
          }}
        >
          練習実行
        </button>
        <button
          type="button"
          className="tc-exercise-pager-secondary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!running}
          onClick={() => {
            void cancel();
          }}
        >
          練習を中止
        </button>
      </div>
      <p role="status" aria-live="polite">
        {waiting
          ? 'プログラムから入力要求を受信し、実行を一時停止中です。'
          : snapshot?.phase === 'ended'
            ? !snapshot.removed && !snapshot.recoveryNeeded
              ? '実行の回収を確認しています。'
              : snapshot.recoveryNeeded
                ? '回収を確認できません。Sourceを保存して学習モードを再起動してください。未採点です。'
                : snapshot.reason === 'completed'
                  ? '正常終了しました。未採点です。'
                  : snapshot.reason === 'cancelled'
                    ? '練習を中止しました。未採点です。'
                    : '練習は終了しました。未採点です。期限・Console・実行環境を確認してください。'
            : running
              ? '練習を実行しています。未採点です。'
              : cancelled
                ? '練習を中止しました。未採点です。'
                : error
                  ? '練習の状態を確認してください。未採点です。'
                  : '練習実行を開始できます。'}
      </p>
      {waiting ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label htmlFor="python-practice-input">練習へ送る1行（空欄は空文字列）</label>
          <input
            id="python-practice-input"
            ref={inputRef}
            value={line}
            maxLength={1024}
            disabled={props.disabled || sending}
            onChange={(event) => {
              setLine(event.target.value);
            }}
            aria-describedby="python-practice-help"
            className="w-full rounded border p-2"
          />
          <div className="mt-2 flex gap-3">
            <button
              type="submit"
              className="tc-exercise-pager-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={props.disabled || sending}
            >
              1行を送信
            </button>
            <button
              type="button"
              className="tc-exercise-pager-secondary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={props.disabled || sending}
              onClick={() => {
                void send(true);
              }}
            >
              入力を終了（EOF）
            </button>
          </div>
        </form>
      ) : null}
      <p id="python-practice-help">
        合計16行・UTF-8で1
        KiB、待機は累計60秒、計算は5秒までです。入力は保存・共有されません。表示出力に入力が含まれる場合があります。
      </p>
      {snapshot ? (
        <p>
          送達した入力: {snapshot.inputCount}/16行・{snapshot.inputBytes}/1024
          bytes（消費の証明ではありません）
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <RuntimeConsole records={records} freshness="current" label="練習のConsole出力" />
    </section>
  );
}
