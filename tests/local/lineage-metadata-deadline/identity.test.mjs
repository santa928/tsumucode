/** Synthetic artifact identities only. No external request or token is used. */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectPredeployArtifactMetadata,
  inspectSameRunArtifactMetadata,
} from './lineageArtifactMetadata.ts';

const { Response } = globalThis;
const input = {
  runId: '123',
  source: 'a'.repeat(40),
  attempt: '2',
  candidateId: '11',
  metadataId: '12',
  qualificationId: '13',
  reportId: '14',
};
const oldFetch = globalThis.fetch;
const denied = async () => {
  throw Error('Unexpected network access');
};
globalThis.fetch = denied;
after(() => {
  globalThis.fetch = oldFetch;
});

const metadata = (index) => ({
  id: 11 + index,
  name: `${['candidate', 'candidate-metadata', 'qualification', 'public-report'][index]}-123-${index < 2 ? 1 : 2}`,
  size_in_bytes: 100,
  expired: false,
  digest: `sha256:${'b'.repeat(64)}`,
  workflow_run: {
    id: 123,
    repository_id: 1303564490,
    head_repository_id: 1303564490,
    head_branch: 'main',
    head_sha: input.source,
  },
});

async function withMetadata(mutator, run) {
  let index = 0;
  globalThis.fetch = async () => {
    const value = metadata(index);
    mutator(value, index++);
    return new Response(JSON.stringify(value));
  };
  try {
    await run(() => index);
  } finally {
    globalThis.fetch = denied;
  }
}

for (const [label, mutate] of [
  [
    'run',
    (m) => {
      m.workflow_run.id = 124;
    },
  ],
  [
    'repository',
    (m) => {
      m.workflow_run.repository_id = 1;
    },
  ],
  [
    'head repository',
    (m) => {
      m.workflow_run.head_repository_id = 1;
    },
  ],
  [
    'branch',
    (m) => {
      m.workflow_run.head_branch = 'other';
    },
  ],
  [
    'source',
    (m) => {
      m.workflow_run.head_sha = 'c'.repeat(40);
    },
  ],
  [
    'missing digest',
    (m) => {
      m.digest = null;
    },
  ],
  [
    'expired',
    (m) => {
      m.expired = true;
    },
  ],
  [
    'future attempt',
    (m) => {
      m.name = 'candidate-123-3';
    },
  ],
  [
    'artifact ID',
    (m) => {
      m.id = 999;
    },
  ],
  [
    'candidate size',
    (m) => {
      m.size_in_bytes = 1024 * 1024 * 1024 + 1;
    },
  ],
]) {
  test(`rejects mismatched ${label}`, async () => {
    await withMetadata(
      (m, i) => {
        if (i === 0) mutate(m);
      },
      async (fetchCount) => {
        const schemaFailures = new Set([
          'repository',
          'head repository',
          'branch',
          'missing digest',
          'expired',
        ]);
        const message = schemaFailures.has(label)
          ? 'Artifact metadata invalid'
          : 'Artifact metadata identity differs';
        await assert.rejects(inspectSameRunArtifactMetadata(input, 'synthetic-token'), { message });
        assert.equal(fetchCount(), 1);
      },
    );
  });
}

test('rejects candidate and metadata attempt mismatch', async () => {
  await withMetadata(
    (m, i) => {
      if (i === 1) m.name = 'candidate-metadata-123-2';
    },
    async (fetchCount) => {
      await assert.rejects(
        inspectSameRunArtifactMetadata(input, 'synthetic-token'),
        /Candidate metadata attempt differs/,
      );
      assert.equal(fetchCount(), 4);
    },
  );
});

test('predeploy rejects any older attempt even if postdeploy allows it', async () => {
  const { reportId, ...predeploy } = input;
  void reportId;
  await withMetadata(
    () => {},
    async (fetchCount) => {
      await assert.rejects(
        inspectPredeployArtifactMetadata(predeploy, 'synthetic-token'),
        /Predeploy artifact attempt differs/,
      );
      assert.equal(fetchCount(), 3);
    },
  );
});
