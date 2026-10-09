/**
 * 固定Action POSTのCDP診断。本文・URL・入力・任意headerは保持しない。
 * Browser側の連番とtrusted bridgeの連番を区別し、欠落を成功の根拠にしない。
 */
export async function watchNextFormReceipts(page, origin, base, emit) {
  const network = await page.context().newCDPSession(page);
  const records = new Map();
  const actionUrl = (url) => [origin + base, origin + base.slice(0, -1)].includes(url);
  const snapshot = (record) => ({
    request: record.request,
    bridgeRequest: record.bridgeRequest,
    status: record.status,
    expectedBytes: record.expectedBytes,
    receivedBytes: record.receivedBytes,
    state: record.state,
    encoding: record.encoding,
  });
  const responseHeaders = (record, status, headers, rawHeaders = false) => {
    if (record.rawHeaders && !rawHeaders) return;
    if (Number.isInteger(status) && status >= 100 && status <= 599) record.status = status;
    const values = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
    );
    const sequence = values['x-tsumucode-form-response'];
    const length = values['content-length'];
    record.bridgeRequest = /^[1-8]$/u.test(sequence ?? '') ? Number(sequence) : 'unknown';
    record.expectedBytes =
      /^\d{1,6}$/u.test(length ?? '') && Number(length) <= 512 * 1024 ? Number(length) : 'unknown';
    record.encoding = values['content-encoding'] ? 'encoded' : 'plain';
    record.rawHeaders = rawHeaders;
  };
  network.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (
      records.size >= 8 ||
      records.has(requestId) ||
      request.method !== 'POST' ||
      !actionUrl(request.url)
    )
      return;
    records.set(requestId, {
      request: records.size + 1,
      bridgeRequest: 'unknown',
      status: 'unknown',
      expectedBytes: 'unknown',
      receivedBytes: 0,
      state: 'open',
      encoding: 'unknown',
      rawHeaders: false,
    });
  });
  network.on('Network.responseReceived', ({ requestId, response }) => {
    const record = records.get(requestId);
    if (record && actionUrl(response.url))
      responseHeaders(record, response.status, response.headers);
  });
  // ExtraInfoはresponseReceivedの前後どちらにも届く。byte数・終端状態は上書きしない。
  network.on('Network.responseReceivedExtraInfo', ({ requestId, statusCode, headers }) => {
    const record = records.get(requestId);
    if (record) responseHeaders(record, statusCode, headers, true);
  });
  network.on('Network.dataReceived', ({ requestId, dataLength }) => {
    const record = records.get(requestId);
    if (record && Number.isInteger(dataLength) && dataLength >= 0)
      record.receivedBytes = Math.min(512 * 1024 + 1, record.receivedBytes + dataLength);
  });
  const finish = (requestId, state) => {
    const record = records.get(requestId);
    if (!record || record.state !== 'open') return;
    record.state = state;
    // 全体期限で強制回収される前にも、既に観測した終端を残す。
    emit(snapshot(record));
  };
  network.on('Network.loadingFinished', ({ requestId }) => finish(requestId, 'finished'));
  network.on('Network.loadingFailed', ({ requestId, canceled }) =>
    finish(requestId, canceled ? 'aborted' : 'failed'),
  );
  await network.send('Network.enable');
  return () => [...records.values()].map(snapshot);
}
