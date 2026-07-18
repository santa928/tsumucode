# Accessibility Manual Review

- releaseStatus: `draft`
- journeyStatus: `passed`
- voiceOverStatus: `pending`
- unresolvedFindings: `0`
- unperformedChecks: `1`
- reviewedAt: `2026-07-18`
- verifiedSourceCommit: `ed9f1a6997149357ea329bcef6719e3476d31329`
- canonicalDistSha256: `d84d16c571d48e597c6d2f17078f34280742e310af9118e9b9d3d184e36afc78`
- reviewBaseCommit: `ed9f1a6997149357ea329bcef6719e3476d31329`
- environment: `macOS 26.5.1 (25F80)`
- browser: `Google Chrome 150.0.7871.124`
- voiceOver: `操作許可待ち（合格扱いしない）`
- bindingPolicy: 自動・実機完了項目は同一source commitと`/tsumucode/` canonical distへ結合済み。VoiceOverだけ未実施

## 確認方法

- 自動：GitHub Pagesの`/tsumucode/`で生成した同一`dist/`を`vite preview`で配信し、Chromium、Firefox、WebKitの実ブラウザで確認した。
- 実機：macOSのGoogle Chromeで同じ`dist/`を開き、100%から200%、400%へズームし、最後に100%へ戻した。
- axe：`wcag2a`、`wcag2aa`、`wcag21a`、`wcag21aa`、`wcag22aa`の対象違反をimpactにかかわら0件とした。
- Keyboard：直接focusやmouse clickで証明を短絡せず、Tab、Shift+Tab、Enter、Escapeで到達した。

## Course Release Journey

| 確認項目                          | 方法         | 結果 | 根拠                                                                    |
| --------------------------------- | ------------ | ---- | ----------------------------------------------------------------------- |
| Home → Course Map → Slide         | 3 Engine E2E | 合格 | 見出し、現在位置、Slide閲覧IDのIndexedDB保存を確認                      |
| Slide → Exercise                  | 3 Engine E2E | 合格 | 実習CTAとCodeWorkspaceの準備完了を確認                                  |
| incomplete → Hint → Review → 復帰 | 3 Engine E2E | 合格 | 判定結果、ヒント、関連Slide、復帰後Workspaceを確認                      |
| pass → Completion                 | 3 Engine E2E | 合格 | Solutionの実UI入力、完了表示、次のピースを確認                          |
| Export → 空ContextへImport        | 3 Engine E2E | 合格 | 実進捗、Profile、Capstone、現在地の完全一致を確認                       |
| 外部Runtime request               | 3 Engine E2E | 合格 | 主要状態のDocument/Asset/fetch/XHR/WebSocketが同一originのsubpath内のみ |

## Accessibility Checklist

| 確認項目             | 方法                                 | 結果 | 備考                                                                          |
| -------------------- | ------------------------------------ | ---- | ----------------------------------------------------------------------------- |
| WCAG A/AA axe違反    | 3 Engine、主要Route/状態             | 合格 | 違反0件                                                                       |
| Tab正順              | Keyboard-only E2E                    | 合格 | 判定、見直し、復帰まで操作                                                    |
| Shift+Tab逆順        | Keyboard-only E2E                    | 合格 | Homeの教材CTAへ逆順到達しEnterで遷移                                          |
| CodeMirrorからの脱出 | Keyboard-only E2E                    | 合格 | `Escape`後の`Tab`でEditor外へ移動                                             |
| Focus indicator      | Computed Style                       | 合格 | `outline-style != none`かつ幅0px超                                            |
| Focus obscured       | Geometry + hit test                  | 合格 | 対象全体がViewport内で中心点が対象にhit                                       |
| Target size          | Runtime geometry                     | 合格 | 表示中のnative操作要素が24 CSS px以上                                         |
| 4 Viewports          | Runtime geometry                     | 合格 | 1440x900、1280x720、768x1024、390x844で重なり/横はみ出し0件                   |
| 200% Zoom            | Chrome実機 + 640 CSS px E2E          | 合格 | 主要見出し、CTA、進捗、端末データ操作を維持                                   |
| 400% Reflow          | Chrome実機 + 320 CSS px E2E          | 合格 | アクセシビリティツリーを維持し横スクロール0                                   |
| `aria-live`          | Role/status E2E                      | 合格 | Export完了、Import差分未適用の文言更新を確認                                  |
| Reduced Motion       | `prefers-reduced-motion: reduce` E2E | 合格 | animation終了待ちなしでCompletion最終状態を表示                               |
| VoiceOver読上げ      | macOS VoiceOver                      | 保留 | VoiceOverの一時的なオン/オフ操作許可待ち。未実施のためTask 19を完了扱いしない |

## 検出と修正

1. 作業台の補助Textと完了色が背景に対してAA未満だったため、`--color-text-muted`と`--color-complete`を十分なコントラストの色へ変更した。
2. Preview iframeがTab順序を内部Documentへ移し、後続の更新/判定操作へ到達できなかったため、iframe自体を`tabIndex={-1}`とした。Previewの読み上げ専用内容は親Documentに持たせている。
3. 実ブラウザを5ワーカーで同時実行するとIndexedDBとPreview判定が資源競合した。2ワーカーで60件が全通過し、最終構成はCI 1ワーカーで66件が再試行なし全通過したため、Localを2、CIを1へ固定した。
4. 編集後の旧い「保存済み」表示を新しい保存完了と誤認できたため、対象File全文とSlide IDがIndexedDBに一致するまで待つようにした。

- 未修正のアクセシビリティ指摘: `0件`
- 未実施: `VoiceOver読上げ確認 1件`
