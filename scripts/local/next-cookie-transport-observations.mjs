import console from 'node:console';

const failures = new Set([
  'net::ERR_ABORTED',
  'net::ERR_CONTENT_LENGTH_MISMATCH',
  'net::ERR_INCOMPLETE_CHUNKED_ENCODING',
  'net::ERR_CONTENT_DECODING_FAILED',
  'net::ERR_CONNECTION_RESET',
  'net::ERR_CONNECTION_CLOSED',
  'net::ERR_EMPTY_RESPONSE',
  'net::ERR_FAILED',
  'net::ERR_HTTP2_PROTOCOL_ERROR',
]);

/** 固定enumと数値・booleanだけを出力し、URL/header/body/opaque IDを保存しない。 */
function emit(stage, fields) {
  console.log(
    JSON.stringify({
      event: 'main-cookie-transport',
      boundary: 'chromium',
      stage,
      epochMs: Date.now(),
      ...fields,
    }),
  );
}

/** header名のcaseを正規化するが、値の原本は返り値以外へ保存しない。 */
function header(headers, name) {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

/** CDP長さをbody長と混同せず、identityかつdataイベント取得済みの時だけ比較する。 */
function observation(record) {
  return {
    sequence: record.sequence,
    ordinal: record.ordinal,
    inputIncluded: record.inputIncluded,
    status: record.status ?? null,
    protocol: record.protocol ?? null,
    contentLength: record.contentLength ?? null,
    encoding: record.encoding ?? null,
    fromDiskCache: record.fromDiskCache ?? null,
    fromServiceWorker: record.fromServiceWorker ?? null,
    loaderMatchesBaseline: record.loaderMatchesBaseline,
    frameMatch: record.frameMatch,
    dataEvents: record.dataEvents,
    decodedBodyBytes: record.decodedBytes,
    encodedDataChunkBytes: record.encodedBytes,
    identityBodyLengthMatches:
      record.encoding === 'identity' && record.dataEvents > 0 && record.contentLength !== null
        ? record.decodedBytes === record.contentLength
        : null,
    terminal: record.terminal,
    errorClass: record.errorClass ?? null,
    canceled: record.canceled ?? null,
    loadingFinishedEncodedLength: record.finishedEncodedLength ?? null,
    encodedLengthIsNotBodyLength: true,
    requestCdpSeconds: record.requestCdpSeconds,
    requestWallEpochMs: record.requestWallEpochMs,
    responseCdpSeconds: record.responseCdpSeconds ?? null,
    firstDataCdpSeconds: record.firstDataCdpSeconds ?? null,
    lastDataCdpSeconds: record.lastDataCdpSeconds ?? null,
    terminalCdpSeconds: record.terminalCdpSeconds ?? null,
    estimatedTerminalEpochMs:
      typeof record.terminalCdpSeconds === 'number' &&
      typeof record.requestCdpSeconds === 'number' &&
      typeof record.requestWallEpochMs === 'number'
        ? record.requestWallEpochMs + (record.terminalCdpSeconds - record.requestCdpSeconds) * 1000
        : null,
    emittedEpochIsNodeReceiptTime: true,
  };
}

/** Page作成時に観測を開始する。submit間にCDP初期化待ちを追加しない。 */
export async function installChromiumObserver(context) {
  const pages = new WeakMap();
  await context.exposeBinding('__tsumuPrivateTransportPagehide', ({ frame }, event) => {
    const state = pages.get(frame.page());
    if (state?.active?.frame === frame && event?.kind === 'pagehide')
      emit('pagehide', {
        sequence: state.active.sequence,
        persisted: event.persisted === true,
      });
  });
  await context.addInitScript(() => {
    globalThis.addEventListener('pagehide', (event) => {
      void globalThis
        .__tsumuPrivateTransportPagehide({
          kind: 'pagehide',
          persisted: event.persisted,
        })
        .catch(() => {});
    });
  });
  context.on('page', (page) => {
    const state = {
      active: null,
      records: new Map(),
      frames: new Map(),
      ready: false,
    };
    pages.set(page, state);
    void attach(page, state).catch(() => emit('observer-setup-failed', {}));
  });

  /** session固有のIDは内部Mapにだけ保持し、公開値へ変換してから出す。 */
  async function attach(page, state) {
    const session = await context.newCDPSession(page);
    session.on('Page.frameNavigated', ({ frame }) => {
      state.frames.set(frame.id, {
        id: frame.id,
        url: frame.url,
        loader: frame.loaderId,
      });
      const active = state.active;
      if (active && (active.routes.includes(frame.url) || active.frameId === frame.id))
        emit('frame-navigated', {
          sequence: active.sequence,
          loaderChanged: active.loader === null ? null : active.loader !== frame.loaderId,
        });
    });
    session.on('Page.frameDetached', ({ frameId }) => state.frames.delete(frameId));
    session.on('Page.navigatedWithinDocument', (event) => {
      const active = state.active;
      if (active && (active.frameId === event.frameId || active.routes.includes(event.url)))
        emit('same-document-navigation', { sequence: active.sequence });
    });
    for (const name of [
      'frameRequestedNavigation',
      'frameScheduledNavigation',
      'frameStartedLoading',
    ]) {
      session.on(`Page.${name}`, (event) => {
        const active = state.active;
        if (active && (active.frameId === event.frameId || active.routes.includes(event.url)))
          emit(name, { sequence: active.sequence });
      });
    }
    session.on('Network.requestWillBeSent', (event) => {
      const active = state.active;
      if (!active || event.request.method !== 'POST' || !active.routes.includes(event.request.url))
        return;
      if (active.frameId !== null && event.frameId !== active.frameId) return;
      const record = {
        sequence: active.sequence,
        ordinal: ++active.ordinal,
        requestCdpSeconds: event.timestamp,
        requestWallEpochMs: event.wallTime * 1000,
        frameMatch: active.frameId === null ? 'unknown' : 'matched',
        inputIncluded:
          typeof event.request.postData === 'string'
            ? event.request.postData.includes(active.input)
            : null,
        loaderMatchesBaseline: active.loader === null ? null : event.loaderId === active.loader,
        dataEvents: 0,
        decodedBytes: 0,
        encodedBytes: 0,
        contentLength: null,
        terminal: 'pending',
      };
      state.records.set(event.requestId, record);
      emit('request', observation(record));
    });
    session.on('Network.responseReceived', (event) => {
      const record = state.records.get(event.requestId);
      if (!record) return;
      const response = event.response;
      const length = header(response.headers, 'content-length');
      const encoding = header(response.headers, 'content-encoding');
      Object.assign(record, {
        responseCdpSeconds: event.timestamp,
        status: response.status,
        protocol: ['http/1.1', 'h2', 'h3'].includes(response.protocol)
          ? response.protocol
          : 'other',
        contentLength: typeof length === 'string' && /^\d+$/u.test(length) ? Number(length) : null,
        encoding:
          encoding === undefined
            ? 'identity'
            : ['identity', 'gzip', 'br', 'deflate'].includes(encoding)
              ? encoding
              : 'other',
        fromDiskCache: response.fromDiskCache === true,
        fromServiceWorker: response.fromServiceWorker === true,
      });
      emit('response', observation(record));
    });
    session.on('Network.dataReceived', (event) => {
      const record = state.records.get(event.requestId);
      if (!record) return;
      record.dataEvents++;
      record.firstDataCdpSeconds ??= event.timestamp;
      record.lastDataCdpSeconds = event.timestamp;
      record.decodedBytes += event.dataLength;
      record.encodedBytes += event.encodedDataLength;
    });
    session.on('Network.loadingFinished', (event) => {
      const record = state.records.get(event.requestId);
      if (!record) return;
      record.terminal = 'finished';
      record.terminalCdpSeconds = event.timestamp;
      record.finishedEncodedLength = event.encodedDataLength;
      emit('finished', observation(record));
    });
    session.on('Network.loadingFailed', (event) => {
      const record = state.records.get(event.requestId);
      if (!record) return;
      record.terminal = 'failed';
      record.terminalCdpSeconds = event.timestamp;
      record.errorClass = failures.has(event.errorText) ? event.errorText : 'other';
      record.canceled = event.canceled === true;
      emit('failed', observation(record));
    });
    await session.send('Network.enable');
    await session.send('Page.enable');
    state.ready = true;
  }

  return {
    /** 同期設定だけで操作を開始し、本文やURLをconsoleへ出さない。 */
    begin(frame, sequence, routes, input) {
      const state = pages.get(frame.page());
      if (!state?.ready) {
        emit('observer-unavailable', { sequence });
        return;
      }
      const candidates = [...state.frames.values()].filter(
        (candidate) => candidate.url === frame.url(),
      );
      const playwrightFrames = frame
        .page()
        .frames()
        .filter((candidate) => candidate.url() === frame.url());
      const known =
        candidates.length === 1 && playwrightFrames.length === 1 ? candidates[0] : undefined;
      state.active = {
        frame,
        sequence,
        routes,
        input,
        ordinal: 0,
        frameId: known?.id ?? null,
        loader: known?.loader ?? null,
      };
    },
    /** 観測終了時点の状態はterminalイベント原本とは別に残す。 */
    end(frame, sequence) {
      const state = pages.get(frame.page());
      if (!state) return;
      for (const record of state.records.values())
        if (record.sequence === sequence) emit('operation-end', observation(record));
      state.active = null;
    },
  };
}
