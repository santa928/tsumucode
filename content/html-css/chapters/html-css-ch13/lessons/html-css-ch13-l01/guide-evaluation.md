## Evaluation Guide

## Semantic Structure

Eventの導入、中心内容、補足がLandmarkで区別でき、Page題名とSection見出しの関係が読めることを確認します。これは見た目を外しても情報の位置を理解するために必要です。

## Accessible Names

NavigationとEvent Posterの目的が支援技術へ伝わることを確認します。見える装飾だけでは操作範囲や画像内容を判断できないためです。

## Measurement Hooks

`data-capstone-page`、`data-event-poster`、`data-event-grid`、`data-event-card`、`data-capstone-action`は、評価Engineが対象を見つけるための目印です。見た目を決めるClassではないため、配置、Element、Class名、Layout手法はBriefに合わせて自分で選びます。

## Layout Method

展示CardはGridまたはFlexのどちらでも合格します。評価するのは特定Class名ではなく、3件以上のCardがLayout Systemで並び、内容に応じて変化できることです。

## Responsive Boundaries

390px、768px、1280px、1440pxでCard件数と幅を確認し、同じ4 ViewportでDocumentの横Overflowを確認します。1枚のScreenshotだけでは境界付近の問題を発見できないためです。

## Manual Content Review

自動判定の前に、Event名とTagline、開催日・会場・入場条件、AccessまたはContact、主催者情報を読み上げます。これらの事実関係と相互の矛盾は自動判定へ任せず、Briefに対する提出前チェックとして自分で確認します。

## Keyboard and Contrast

Primary ActionへKeyboardで到達でき、TextとBackgroundが4.5対1以上であることを確認します。Pointerや色の見え方に依存せず内容を利用できるためです。
