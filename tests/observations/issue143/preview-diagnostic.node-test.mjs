import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { capturePreviewFailure, createPreviewTracker, previewLines, safeUi } from './preview-diagnostic.mjs';
const req = (method, url) => ({ method: () => method, url: () => url });
const response = (method, url, status) => ({ request: () => req(method, url), status: () => status });
const origin = 'http://127.0.0.1:4173';
const goodUi = { version:'expected', result:'succeeded', line8:true, lineEnd:true, alert:false };

test('collects only fixed preview endpoints and HTTP classes, never body or headers', () => {
  const t=createPreviewTracker();
  t.request(req('POST',origin+'/api/session'));
  t.response(response('POST',origin+'/api/session',200));
  t.request(req('POST',origin+'/api/python-capabilities'));
  t.response(response('POST',origin+'/api/python-capabilities',403));
  t.request(req('POST',origin+'/api/runs'));
  t.failed(req('POST',origin+'/api/runs'));
  t.request(req('POST',origin+'/api/runs/PRIVATE_MARKER_id'));
  t.response(response('POST',origin+'/api/runs/PRIVATE_MARKER_id',503));
  const result=t.snapshot(goodUi);
  assert.deepEqual(result.network,{session:'2xx',capabilities:'4xx',run:'network-failed',poll:'5xx'});
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_MARKER/);
});
test('ignores wrong origins, methods and unknown endpoints; reports pending and mixed', () => {
  const t=createPreviewTracker();
  t.request(req('POST','https://PRIVATE_MARKER.example/api/session'));
  t.request(req('GET',origin+'/api/session'));
  t.request(req('POST',origin+'/api/PRIVATE_MARKER'));
  assert.deepEqual(t.snapshot(goodUi).network,{session:'none',capabilities:'none',run:'none',poll:'none'});
  t.request(req('POST',origin+'/api/runs')); assert.equal(t.snapshot(goodUi).network.run,'pending');
  t.response(response('POST',origin+'/api/runs',200)); t.response(response('POST',origin+'/api/runs',500));
  assert.equal(t.snapshot(goodUi).network.run,'mixed');
});
test('unrecognized page data is never returned, and status fields are finite', () => {
  const x=safeUi({version:'PRIVATE_MARKER',result:'PRIVATE_MARKER',line8:'PRIVATE_MARKER',lineEnd:null,alert:'PRIVATE_MARKER'});
  assert.deepEqual(x,{version:'unknown',result:'unknown',line8:'unknown',lineEnd:'unknown',alert:'unknown'});
  assert.doesNotMatch(JSON.stringify(x),/PRIVATE_MARKER/);
});
test('report output rejects arbitrary fields and unknown values without echoing them', () => {
  const bad={network:{session:'PRIVATE_MARKER'},ui:{version:'PRIVATE_MARKER'}};
  assert.deepEqual(previewLines(bad,'PRIVATE_MARKER'),['preview-diagnostic spec-mismatch']);
  assert.deepEqual(previewLines(bad,'1f36bb58a33602f93a11d3b7e6d0376f9a350729a62e6781b70eea8e4f945735'),['preview-diagnostic invalid']);
  assert.doesNotMatch(JSON.stringify(previewLines(bad,'1f36bb58a33602f93a11d3b7e6d0376f9a350729a62e6781b70eea8e4f945735')),/PRIVATE_MARKER/);
});

test('bounded DOM capture emits only the fixed schema and handles evaluation failure', async () => {
  const marker='PRIVATE_MARKER_dom';
  const t=createPreviewTracker();
  const bad=await capturePreviewFailure({evaluate:async()=>({version:marker,result:marker,line8:marker,lineEnd:marker,alert:marker})},t);
  assert.deepEqual(bad.ui,{version:'unknown',result:'unknown',line8:'unknown',lineEnd:'unknown',alert:'unknown'});
  assert.doesNotMatch(JSON.stringify(bad),/PRIVATE_MARKER/);
  const failed=await capturePreviewFailure({evaluate:async()=>{throw Error(marker);}},t);
  assert.deepEqual(failed.ui,bad.ui);
});
test('valid report emits exactly two fixed-category lines', () => {
  const hash='1f36bb58a33602f93a11d3b7e6d0376f9a350729a62e6781b70eea8e4f945735';
  const value=createPreviewTracker().snapshot(goodUi);
  assert.deepEqual(previewLines(value,hash),[
    'preview network-session=none capabilities=none run=none poll=none',
    'preview ui-version=expected result=succeeded line8=yes line-end=yes alert=no',
  ]);
});
