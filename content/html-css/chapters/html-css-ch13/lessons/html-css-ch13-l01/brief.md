## STACK DAY — Capstone Brief

## Purpose

個人制作展「STACK DAY」の開催内容と参加方法を伝え、来場予約へつなげるLanding Pageを制作します。

## Audience

Web制作や小さなものづくりに興味があり、初めて個人制作展を訪れる人です。会場、日時、展示内容、予約方法を短時間で理解できる必要があります。

## 必須Content

- Event名と短いTagline
- 開催日、会場、入場条件
- 展示Themeを紹介する3件以上のCard
- Event Poster（`asset:stack-day-poster`を`img`の`src`へ指定）
- 来場予約へ進むPrimary Action
- AccessまたはContact
- 主催者情報

## この演習の開催設定

Posterに記載された次の設定へ、本文の開催案内も揃えてください。

- 開催日: 7月26日（Posterの`JUL 26`）
- 開催時間: 11:00–18:00
- 会場: NORTH HALL
- 入場条件: 入場無料（Posterの`FREE ENTRY`）

これは演習用の架空Eventです。年、会場の住所や交通案内、主催者名、予約方法は指定していません。必要な情報を補う場合は演習用の仮設定と分かるように書き、上の開催設定と矛盾させないでください。

## 予約とContactをプレビューで確認する

この演習のプレビューでは`mailto:`のLinkを使えません。予約方法や連絡先を説明するSectionを自分で用意し、そのSectionの`id`に対応するページ内Linkで案内できます。たとえば予約案内の`id="reserve"`に`href="#reserve"`で対応させます。`id`の名前や配置は自分で選びます。個人のメールアドレスを書く必要はありません。

プレビューではLinkの移動も停止します。主要ActionへKeyboardでFocusできることと、`href`の`#`より後の値が案内先の`id`と一致することを確認してください。実際の予約やメール送信は不要です。

## Color Token

- Paper: `#f5efe3`
- Ink: `#172a3a`
- Accent: `#ef7d4f`
- Support: `#2d7c82`
- Surface: `#fffdf8`

Tokenの役割は保ちつつ、十分なContrastを満たす調整は可能です。

## Viewport要件

390px、768px、1280px、1440pxで内容が切れず、横Scrollを発生させないでください。各Event Cardの実測幅は4幅すべてで360px以下にします。狭い幅では読み順を優先し、広い幅ではCard間の関係を見せます。

## Keyboardとa11y要件

Navigationの目的、Posterの説明、Heading階層、主要ActionのKeyboard操作、本文Contrast 4.5対1以上を満たします。

## 評価用の目印

自分で選んだDOMとClassはそのまま使えます。判定が対象を見つけられるよう、次の`data-*`だけを担当要素へ追加してください。

- Page全体の境界: `data-capstone-page`
- Event Poster画像: `data-event-poster`
- Event Cardの親: `data-event-grid`
- 3件以上の各Event Card: `data-event-card`
- 来場予約と問い合わせの主要Action: `data-capstone-action`

これらは採点対象を示す目印で、要素の種類、入れ子、Class名、GridとFlexの選択を固定する正解コードではありません。

## 提出前の手動Content確認

自動判定は文字の事実関係までは判断しません。判定前に、Event名とTagline、開催日・時間・会場・入場条件、AccessまたはContact、主催者情報が画面上に揃い、Posterと本文の開催設定が一致することを自分で読み上げて確認してください。自動判定の合格だけで、この内容確認が済んだことにはなりません。

完成DOM、Class名、Layout手法、CSS Propertyは指定しません。Briefと評価基準から自分の設計を選んでください。
