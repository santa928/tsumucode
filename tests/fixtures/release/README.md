# 旧 Source の保存互換 fixture

`historicalProgressCourse.ts` と 2 gzip は、固定 Source の全 Runtime を現在の実 migrator へ渡す旧保存互換 unit 専用。認証済み公開 baseline や現在の教材・採点・学習受入の証拠には使わない。

再生成は repository root で以下を実行する。Node `24.18.0` の既存 Docker image と、旧 `package-lock.json` で準備済みの既存依存 volume `tsumucode-issue130-deps` を読み取り専用で使う。現在の package / lock が旧版と同一であることも先に検査する。依存の取得・新規導入は行わない。

```sh
set -eu
historical_source=f629fc6113fe398ad6cd74d16e2a2c0ca95872ff
git show "$historical_source:package.json" | cmp - package.json
git show "$historical_source:package-lock.json" | cmp - package-lock.json
docker volume inspect tsumucode-issue130-deps >/dev/null
fixture_tmp=$(mktemp -d)
mkdir -p "$fixture_tmp/code/node_modules" "$fixture_tmp/content" "$fixture_tmp/output"
git archive "$historical_source" scripts src package.json package-lock.json \
  tsconfig.app.json tsconfig.node.json | tar -x -C "$fixture_tmp/code"
git archive "$historical_source" content/python-basics content/react \
  | tar -x -C "$fixture_tmp/content"

docker run --rm --init --pull never --network none \
  --memory 1088m --cpus 1 --pids-limit 192 --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount "type=bind,src=$PWD,dst=/workspace,readonly" \
  --mount "type=bind,src=$fixture_tmp/code,dst=/baseline-code,readonly" \
  --mount "type=bind,src=$fixture_tmp/content,dst=/baseline-content,readonly" \
  --mount "type=bind,src=$fixture_tmp/output,dst=/out" \
  --mount type=volume,src=tsumucode-issue130-deps,dst=/workspace/node_modules,readonly \
  --mount type=volume,src=tsumucode-issue130-deps,dst=/baseline-code/node_modules,readonly \
  --workdir /workspace --entrypoint sh \
  sha256:59858950e1af7223d97bf394712e54d0f7b75ef0e8af8a1a7d19fb9f0bf4c52c \
  -eu -c 'test "$(node --version)" = v24.18.0
    node_modules/.bin/tsx tests/fixtures/release/generateHistoricalProgressFixtures.mts \
      /baseline-code /baseline-content /out'

for fixture_name in historical-progress-manifest.json \
  python-basics-f629fc6-progress.json.gz react-f629fc6-progress.json.gz; do
  cmp "$fixture_tmp/output/$fixture_name" "tests/fixtures/release/$fixture_name"
done
```

3 ファイルの `cmp` がすべて成功すれば再生成物と原本は byte 単位で一致する。原本は自動上書きしない。一時生成物は `$fixture_tmp` に残る。gzip の完全一致のため Node / image も固定している。
