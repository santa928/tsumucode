# Accessibility Manual Review

- releaseStatus: `approved`
- journeyStatus: `passed`
- voiceOverStatus: `not-required`
- unresolvedFindings: `0`
- unperformedChecks: `0`
- reviewedAt: `2026-07-19`
- verifiedSourceCommit: `d402188d5708ad287f294be7c33e0d44bfa4e2d7`
- canonicalDistSha256: `952053ed146ff6b28f7e1deae9b0161600aa57c17a42c5811894bfcebb1a2062`
- reviewBaseCommit: `d402188d5708ad287f294be7c33e0d44bfa4e2d7`
- environment: `macOS 26.5.1 (25F80)`
- browser: `Codex In-app Browser（Chromium系、macOS）`
- voiceOver: `初回Release対象外（CR-REV-003。合格・対応済みとは主張しない）`
- bindingPolicy: 必須の自動・実機完了項目は同一source commitと`/tsumucode/` canonical distへ結合済み。VoiceOverは要件差分台帳により対象外

## 確認方法

- 自動：GitHub Pagesの`/tsumucode/`で生成した同一`dist/`を`vite preview`で配信し、Chromium、Firefox、WebKitの実ブラウザで確認した。
- 手動：Codex In-app Browserで同じ`dist/`を開き、200%相当の640x360と400%相当の320x800を確認した。640x360ではSlide Stage末尾まで実際にscrollできること、1280x360のExercise error状態ではPager下端とSite Footer上端に4pxの安全余白があることを確認した。
- Reflow：Chromium、Firefox、WebKitのE2Eで200%相当と400%相当を確認し、手動確認と相互検証した。
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

| 確認項目             | 方法                                 | 結果   | 備考                                                                          |
| -------------------- | ------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| WCAG A/AA axe違反    | 3 Engine、主要Route/状態             | 合格   | 違反0件                                                                       |
| Tab正順              | Keyboard-only E2E                    | 合格   | 判定、見直し、復帰まで操作                                                    |
| Shift+Tab逆順        | Keyboard-only E2E                    | 合格   | Homeの教材CTAへ逆順到達しEnterで遷移                                          |
| CodeMirrorからの脱出 | Keyboard-only E2E                    | 合格   | `Escape`後の`Tab`でEditor外へ移動                                             |
| Focus indicator      | Computed Style                       | 合格   | `outline-style != none`かつ幅0px超                                            |
| Focus obscured       | Geometry + hit test                  | 合格   | 対象全体がViewport内で中心点が対象にhit                                       |
| Target size          | Runtime geometry                     | 合格   | 表示中のnative操作要素が24 CSS px以上                                         |
| 4 Viewports          | Runtime geometry                     | 合格   | 1440x900、1280x720、768x1024、390x844で重なり/横はみ出し0件                   |
| 200% Zoom            | 3 Engine E2E + 640x360手動確認       | 合格   | 主要見出し、CTA、進捗、Stage内救済Scrollを維持                                |
| 400% Reflow          | 3 Engine E2E + 320x800手動確認       | 合格   | アクセシビリティツリーを維持し横スクロール0                                   |
| `aria-live`          | Role/status E2E                      | 合格   | Export完了、Import差分未適用の文言更新を確認                                  |
| Reduced Motion       | `prefers-reduced-motion: reduce` E2E | 合格   | animation終了待ちなしでCompletion最終状態を表示                               |
| VoiceOver読上げ      | —                                    | 対象外 | `CR-REV-003`により初回Releaseの必須Gateから除外。合格・対応済みとは主張しない |

## Slide Library追加証跡

- 確認日: `2026-07-26`
- 対象source: `0c9df90e998323a158e807decdd141b81075f7eb`
- 配信条件: `BASE_PATH=/tsumucode/`のProduction build
- 自動結果: `responsive-layout.spec.ts`、`accessibility.spec.ts`、`slide-library.spec.ts`をChromium／Firefox／WebKit、retry 0で実行し、`135/135`合格
- axe: 閲覧目次、閲覧Viewer、用語Drawerを含むWCAG A/AA対象違反0件
- Keyboard: 本文スキップ、最初のLesson、用語Drawer、`Escape`で閉じてTriggerへFocus復帰、左右矢印による前後Slide、Course最終Slideから目次復帰までKeyboardだけで完了
- Reflow: 390x844、412x915、768x1024で意図しない横Scroll、重なり、操作阻害0件。1280x720、1440x900ではDocument Scrollなし
- 200%相当: 640x360ではTool RailとPagerを固定し、Slide Stage内だけに救済Scrollを残して本文末尾へ到達
- Target size: 閲覧ViewerのTool RailとPagerは44 CSS px以上
- VoiceOver: 従来どおり初回Release対象外。読み上げ順、発音、Rotor操作の合格は主張しない

## LearningPath追加証跡

- 確認日: `2026-07-31`
- 対象source: `6195f13a0be4b29cceced94d2ed59c6ab80e1e9b`
- 配信条件: `BASE_PATH=/tsumucode/`のProduction build
- 全E2E結果: Chromium／Firefox／WebKit、retry 0で`318 passed / 90 skipped / 0 failed / 0 flaky`
- LearningPath Journey: Home主導線、Pathの順序と必須表示、既存Courseへのロックなし遷移、CourseProgress再利用、Path専用record非作成、既存direct URL維持を3 Engineで`12/12`合格
- axe: Home、LearningPath、Course Map、Slide、Library、Exerciseを含むWCAG A/AA対象違反0件
- Keyboard: HomeのSkip Linkから本文へ移動し、LearningPathのCourse CTAへTabで到達してEnterだけで最初のSlideへ遷移
- Responsive: 390x844と1280x720でHome主CTA、PathのH1・必須進捗・主要CTAが初期Viewport内へ到達可能。Badgeと全CTAの境界がCourse Card内へ収まり、意図しない横Scroll、重なり、操作阻害0件
- VoiceOver: 従来どおり初回Release対象外。読み上げ順、発音、Rotor操作の合格は主張しない

## VoiceOverの対象外記録

- 理由: 本人・身内向けの初回Releaseでは、VoiceOver手動実機確認までを必須にしないと利用者が決定した。
- 維持する代替Gate: WCAG A/AA axe違反0、Keyboard-only全journey、意味構造、accessible name、Focus、`aria-live`、CodeMirror脱出、Chromium／Firefox／WebKit。
- 影響: VoiceOver固有の読み上げ順・発音・Rotor操作は未検証であり、保証しない。
- 復帰条件: 対象者拡大、スクリーンリーダー利用者の参加、関連不具合、または利用者による再必須化。

## 検出と修正

1. 作業台の補助Textと完了色が背景に対してAA未満だったため、`--color-text-muted`と`--color-complete`を十分なコントラストの色へ変更した。
2. Preview iframeがTab順序を内部Documentへ移し、後続の更新/判定操作へ到達できなかったため、iframe自体を`tabIndex={-1}`とした。Previewの読み上げ専用内容は親Documentに持たせている。
3. 実ブラウザを5ワーカーで同時実行するとIndexedDBとPreview判定が資源競合した。2ワーカーで60件が全通過し、最終構成はCI 1ワーカーで66件が再試行なし全通過したため、Localを2、CIを1へ固定した。
4. 編集後の旧い「保存済み」表示を新しい保存完了と誤認できたため、対象File全文とSlide IDがIndexedDBに一致するまで待つようにした。
5. 低い画面で固定Header、Stage、Pagerが利用可能領域を超える問題を、学習Route専用のcompact配置とStage内救済Scrollで解消した。640x360のSlide末尾到達、320x800の横Scrollなし、1280x360のExercise Footer非重複を確認した。

- 未修正のアクセシビリティ指摘: `0件`
- 未実施の必須確認: `0件`
