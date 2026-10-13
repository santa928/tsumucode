import type { PythonCore, PythonCoreProgress } from './pythonProtocol';

const CORE_FILES = [
  {
    name: 'core.wasm',
    bytes: 9_598_218,
    hash: 'cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6',
  },
  {
    name: 'stdlib.zip',
    bytes: 2_545_637,
    hash: 'fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a',
  },
  {
    name: 'lock.json',
    bytes: 119_077,
    hash: '5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010',
  },
] as const;

/** 固定同origin assetを上限内で読み、bytes/hashを照合してからWorkerへ渡す。 */
async function readBytes(
  name: string,
  maximum: number,
  signal: AbortSignal,
  received: (bytes: number) => void,
): Promise<ArrayBuffer> {
  const url = new URL(
    `${import.meta.env.BASE_URL}python-runtime/314.0.7/${name}`,
    window.location.origin,
  );
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok || response.body === null) throw new Error('Python固定assetを読み込めません');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new Error('Python assetがbytes上限を超えました');
      chunks.push(value);
      received(value.byteLength);
    }
  } catch (error: unknown) {
    chunks.length = 0;
    throw error;
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  chunks.length = 0;
  return bytes.buffer;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Python演習の実行時だけ固定coreを準備する。失敗したPromiseをcacheして再試行を妨げない。 */
export async function loadPythonCore(
  signal: AbortSignal,
  reportProgress: (progress: PythonCoreProgress) => void = () => {},
): Promise<PythonCore> {
  let receivedBytes = 0;
  let reportedBytes = 0;
  const report = (stage: PythonCoreProgress['stage']): void => {
    reportedBytes = receivedBytes;
    reportProgress({ stage, receivedBytes });
  };
  const received = (bytes: number): void => {
    receivedBytes += bytes;
    // 小さなstream chunkごとの再描画を避け、取得量と段階を通知する。
    if (receivedBytes - reportedBytes >= 64 * 1024) report('download');
  };
  report('download');
  let remainingCoreReads = CORE_FILES.length;
  const bytes = await Promise.all(
    CORE_FILES.map(async (file) => {
      const data = await readBytes(file.name, file.bytes, signal, received);
      remainingCoreReads -= 1;
      report(remainingCoreReads === 0 ? 'verify' : 'download');
      if (data.byteLength !== file.bytes || (await sha256(data)) !== file.hash)
        throw new Error('Python固定coreの照合に失敗しました');
      return data;
    }),
  );
  report('download');
  const metadata: unknown = JSON.parse(
    new TextDecoder().decode(await readBytes('worker.json', 1024, signal, received)),
  );
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('sha256' in metadata) ||
    typeof metadata.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(metadata.sha256)
  )
    throw new Error('Python Worker hashがありません');
  report('download');
  const worker = await readBytes('worker.js', 2 * 1024 * 1024, signal, received);
  report('verify');
  if ((await sha256(worker)) !== metadata.sha256)
    throw new Error('Python Workerの照合に失敗しました');
  const lock: unknown = JSON.parse(new TextDecoder().decode(bytes[2]));
  if (typeof lock !== 'object' || lock === null || Array.isArray(lock))
    throw new Error('Python lockが壊れています');
  return {
    workerSource: new TextDecoder().decode(worker),
    wasm: bytes[0]!,
    stdlib: bytes[1]!,
    lock: lock as Record<string, unknown>,
  };
}
