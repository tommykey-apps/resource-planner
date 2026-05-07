# Architecture Decision Records (ADR)

resource-planner の設計判断を Michael Nygard 形式で記録するディレクトリ。

## 目的

- **「なぜ」を残す**: コードと PR からは「何をしたか」しか分からない。**なぜそう決めたか / なぜ別案を採らなかったか** を後から追える形で残す
- **引き継ぎ性**: 過去の判断の制約条件 (Azure 不可、社内ツール、TS 単一言語等) が時間とともに変わっても、当時の前提を読み返せる
- **議論の打ち切り**: 一度決めた話題を毎回再議論しないための参照点

## 命名規則

- ファイル名: `NNNN-kebab-case-title.md` (例: `0001-typescript-types-as-api-spec.md`)
- 番号は連番、欠番禁止 (Superseded されても番号は維持)
- 1 判断 = 1 ファイル

## ステータス遷移

```
Proposed → Accepted → (Deprecated | Superseded by NNNN)
```

- **Proposed**: PR レビュー中、合意前
- **Accepted**: main にマージ済、現行の判断
- **Deprecated**: もう従わないが、置き換え判断はまだ無い (例: 関連機能を削除)
- **Superseded by 00NN**: 別 ADR で上書きされた。元 ADR は削除せず status だけ書き換え、新 ADR の Context で経緯を引用

## 書き方

[`template.md`](template.md) をコピーして使う。Nygard 形式 (Title / Status / Context / Decision / Consequences)。

**重要**: Decision は「**何をしたか**」、Consequences は「**良い面・悪い面・後で困るかもしれない面**」を率直に書く。

## いつ書くか

- 新機能 issue の AC に「ADR 追加」が入っているとき (型駆動 docs 戦略 #31 参照)
- コード単体では理解困難な判断をしたとき (制約・前提・トレードオフが背景にある選択)
- 過去の判断を覆すとき (新 ADR + 旧 ADR の Status を Superseded by NNNN に更新)

書かなくて良い:
- ライブラリの bug fix、依存更新、リファクタ
- 「明らかな選択肢が 1 つしかない」もの
