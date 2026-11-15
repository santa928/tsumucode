#!/bin/sh
# Intended only for a fixed, isolated validation runner; not release authorization.
set -eu
test "$(node --version)" = v24.18.0
test "${LINEAGE_EXEC_SCRATCH-}" = /tmp/lineage-exec
/usr/bin/git --version
# Prove the isolated fixture helper can execute before relying on absent markers.
scratch="$(mktemp -d /tmp/lineage-exec/helper-check-XXXXXX)"
trap 'rm -f "$scratch/helper" "$scratch/marker"; rmdir "$scratch"' EXIT
printf '#!/bin/sh\nprintf invoked > "$1"\n' > "$scratch/helper"
chmod 700 "$scratch/helper"
"$scratch/helper" "$scratch/marker"
test "$(cat "$scratch/marker")" = invoked
node --check scripts/release/v2/isolatedCandidateGit.mjs
node --test \
  tests/local/signer-fixture-policy/policy.test.cjs \
  tests/local/signer-fixture-policy/integration-empty.test.cjs \
  tests/local/signer-fixture-policy/topology-check.test.cjs \
  tests/unit/release/v2/isolatedCandidateGit.node-test.mjs
./node_modules/.bin/vitest run --configLoader runner --no-cache --maxWorkers=1 --no-file-parallelism \
  tests/unit/release/v2/lineageCallerPolicy.test.ts \
  tests/unit/release/v2/lineageCallerIsolated.test.ts
./node_modules/.bin/tsc --ignoreConfig --noEmit --target es2022 --module esnext \
  --moduleResolution bundler --types node --skipLibCheck --strict \
  scripts/release/v2/lineageCallerPolicy.ts scripts/release/v2/trustedLineagePolicy.ts \
  scripts/release/v2/signerTopology.ts
