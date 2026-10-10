# Python最小教材のローカル実証

この手順は承認済みローカル環境だけに使う。公開Course登録、公開用CSPの適用、deployを行わない。実行境界・期限・現在の未完事項は[実行契約](python-runtime-contract.md)を参照する。

## 入力の準備

Node 24.18.0とこのlockfileの依存がある開発Dockerを使用する。固定[Pyodide 314.0.7 core](https://github.com/pyodide/pyodide/releases/download/314.0.7/pyodide-core-314.0.7.tar.bz2)を取得し、archiveのサイズ6,757,104 bytesとSHA-256 `2abdcc2e35208af406e07724cffa85bc582ced97e9028383ecf5462541393f95`を先に照合する。

Docker内でarchiveを安全なtar展開機能で展開し、coreの5ファイルを`.release-issue138/core/pyodide/`へ置く。準備コマンドは各ファイルのbytes/hashも再照合する。coreや生成bundleは既存の`.release-*` ignore配下に置き、Gitへ追加しない。第三者licenseの照合結果と公開時に必要な通知・ソース案内は[配布確認](python-core-distribution.md)を参照する。

## 私有artifactを作る

次のコマンドは開発Docker内で、repository rootを作業directoryとして実行する。

```sh
npm run content:compile
npx tsx scripts/local/preparePythonProof.ts
```

準備コマンドはDocker外の実行を拒否する。出力先は`.release-issue138/local-dist`に固定する。通常5 CourseのCatalogを保持して作者用Python 1 Courseだけを私有Catalogへ追加し、固定core・strict classic Worker・hash metadata・製品HTMLを組み立てる。実行policyを迂回する診断bundleは生成しない。

## 表示する

開発Dockerのportはホストのloopbackだけへbindする。Docker内で次を実行し、`http://127.0.0.1:4173/tsumucode/`を開く。

```sh
npx vite preview --host 0.0.0.0 --port 4173 --strictPort --base /tsumucode/ --outDir .release-issue138/local-dist
```

最小教材は`#/courses/python-basics/lessons/python-basics-ch01-l01/slides/python-basics-ch01-l01-s01`、演習は`#/courses/python-basics/lessons/python-basics-ch01-l01/exercises/python-basics-ch01-l01-e01`へ直接移動する。draftなので通常HomeやLearningPathの教材選択には追加しない。

coreは演習の実行時にだけ取得する。失敗してもSourceを保持し、通常の「判定する」で再試行できる。入力・package追加・任意importはこのLessonの範囲外である。JSON保存・下書きは既存の製品サービスを使用する。

## 通常buildとの区別

通常buildでは`VITE_PYTHON_LOCAL_PROOF`を指定せず、作者用Course・coreをpublicへコピーしない。Python実証の実行器はbuild flagとloopback hostnameの両方を要求する。私有artifactをPagesへ転用しない。

## FirefoxのDocker検証

PlaywrightのFirefoxをrootかつcap-drop ALLで起動すると、この環境ではページ作成前にsandboxのuid_map書き込みがEPERMになり、content processが異常終了した。PID上限到達・OOMの記録はなかった。

同じimageの既存非rootユーザー（uid／gid 1000:1000）と--initを使い、network none・CPU 2・memory 2 GiB・pids 256・cap-drop ALL・no-new-privilegesを維持するとページ作成とPythonの代表実行が成功した。repository／依存を読み取り専用でmountし、検証出力は所有するDocker一時領域へ置く。profileや依存volumeを他作業と共有しない。browser sandboxを無効化せず、host IPCやcapability追加で回避しない。

起動・ページ作成には段階ログとdeadline、検証全体には終了上限を付ける。正常・構文エラー・日本語分割出力・古いsourceの拒否の4代表ケースが成功した。10 Fixtureの一括実行は90秒上限で9件まで進んだため、全件成功とは扱わない。物理Firefoxでの受講確認とは別の証拠である。

ローカル実証だけではIssue #138の実Pages Worker受け入れを満たさない。公開前に、通知・ソース案内を含む配布物、追加の公開判断と公開範囲の検証、実Pagesと物理端末を別に扱う。
