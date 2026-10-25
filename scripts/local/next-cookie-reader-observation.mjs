/**
 * 作者検証で既存consumerのread結果だけを記録する。追加read・drain・fetch置換はしない。
 * Previewの診断連番を持つRSC応答だけを対象にし、本文・URL・header原本は保存しない。
 * addInitScriptで使うため外部変数へ依存せず、Responseやstreamを強参照で保持しない。
 */
export function installActionReaderObservation() {
  const responseBody = Object.getOwnPropertyDescriptor(globalThis.Response.prototype, 'body');
  const responseClone = Object.getOwnPropertyDescriptor(globalThis.Response.prototype, 'clone');
  const streamReader = Object.getOwnPropertyDescriptor(
    globalThis.ReadableStream.prototype,
    'getReader',
  );
  const readerRead = Object.getOwnPropertyDescriptor(
    globalThis.ReadableStreamDefaultReader.prototype,
    'read',
  );
  const readerCancel = Object.getOwnPropertyDescriptor(
    globalThis.ReadableStreamDefaultReader.prototype,
    'cancel',
  );
  const streamRecords = new WeakMap();
  const readerRecords = new WeakMap();
  const clonedResponses = new WeakSet();
  const records = new Map();
  const snapshotKey = '__tsumucodeActionReaderSnapshot';
  const limit = 512 * 1024;

  if (
    !responseBody?.get ||
    !responseClone?.value ||
    !streamReader?.value ||
    !readerRead?.value ||
    !readerCancel?.value ||
    globalThis[snapshotKey]
  )
    throw new Error('Action reader observation unavailable');

  Object.defineProperty(globalThis.Response.prototype, 'body', {
    ...responseBody,
    get() {
      const body = Reflect.apply(responseBody.get, this, []);
      if (!body || clonedResponses.has(this) || streamRecords.has(body)) return body;
      const ordinal = this.headers.get('x-tsumucode-cookie-observation');
      if (!/^[1-9]\d{0,8}$/u.test(ordinal ?? '')) return body;
      if (
        this.status !== 200 ||
        this.headers.get('content-type')?.split(';')[0] !== 'text/x-component'
      )
        return body;
      const id = Number(ordinal);
      const record = {
        ordinal: id,
        readers: 0,
        streams: 1,
        reads: 0,
        pending: 0,
        bytes: 0,
        done: false,
        error: false,
        cancelled: false,
        invalidChunk: false,
        overflow: false,
      };
      const previous = records.get(id);
      if (previous) {
        previous.streams++;
        return body;
      }
      if (records.size >= 128) return body;
      records.set(id, record);
      streamRecords.set(body, record);
      return body;
    },
  });

  Object.defineProperty(globalThis.Response.prototype, 'clone', {
    ...responseClone,
    value(...args) {
      const clone = Reflect.apply(responseClone.value, this, args);
      clonedResponses.add(clone);
      return clone;
    },
  });

  Object.defineProperty(globalThis.ReadableStream.prototype, 'getReader', {
    ...streamReader,
    value(...args) {
      const reader = Reflect.apply(streamReader.value, this, args);
      const record = streamRecords.get(this);
      if (record) {
        record.readers++;
        readerRecords.set(reader, record);
      }
      return reader;
    },
  });

  Object.defineProperty(globalThis.ReadableStreamDefaultReader.prototype, 'read', {
    ...readerRead,
    value(...args) {
      const promise = Reflect.apply(readerRead.value, this, args);
      const record = readerRecords.get(this);
      if (!record) return promise;
      record.reads++;
      record.pending++;
      void promise.then(
        (chunk) => {
          record.pending--;
          if (chunk.done) record.done = true;
          else if (!ArrayBuffer.isView(chunk.value)) record.invalidChunk = true;
          else {
            record.bytes += chunk.value.byteLength;
            if (record.bytes > limit) record.overflow = true;
          }
        },
        () => {
          record.pending--;
          record.error = true;
        },
      );
      // 元のPromiseをそのまま返し、consumerのreadや例外の扱いを変えない。
      return promise;
    },
  });

  Object.defineProperty(globalThis.ReadableStreamDefaultReader.prototype, 'cancel', {
    ...readerCancel,
    value(...args) {
      const promise = Reflect.apply(readerCancel.value, this, args);
      const record = readerRecords.get(this);
      if (record) record.cancelled = true;
      return promise;
    },
  });

  Object.defineProperty(globalThis, snapshotKey, {
    value: (ordinal) => {
      const record = records.get(ordinal);
      return record ? { ...record } : null;
    },
  });
}

/** 同一応答の一つのconsumerが正常EOFまで読み切った場合だけ真を返す。 */
export function completeActionReader(record, ordinal, length) {
  return Boolean(
    record &&
    Number.isSafeInteger(ordinal) &&
    ordinal > 0 &&
    Number.isSafeInteger(length) &&
    length > 0 &&
    length <= 512 * 1024 &&
    record.ordinal === ordinal &&
    record.streams === 1 &&
    record.readers === 1 &&
    record.reads > 0 &&
    record.pending === 0 &&
    record.bytes === length &&
    record.done === true &&
    record.error === false &&
    record.cancelled === false &&
    record.invalidChunk === false &&
    record.overflow === false,
  );
}
