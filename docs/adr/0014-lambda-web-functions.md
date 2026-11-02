# 0014. アプリの実行基盤を Lambda Web Functions にする

- **Status**: Accepted
- **Date**: 2026-11-03
- **Deciders**: tommykey0925

## Context

これまでの構成は次のとおりだった。

```
CloudFront → API Gateway (HTTP API) → Lambda (コンテナ) ── Lambda Web Adapter ── node build/index.js
```

SvelteKit (adapter-node) は普通の HTTP サーバーとして動く。それを Lambda のイベント形式に合わせるため、
API Gateway・ECR・Dockerfile・Lambda Web Adapter の4つを挟んでいた。

2026-10-12 に AWS が Lambda Web Functions を公開した。HTTP サーバーをそのまま動かす Lambda の新しい種類で、
CloudFront の origin に直接置ける (OAC で署名)。Lambda Web Adapter の README も、新しい Node.js アプリには
Web Functions を勧めている。

移行前に試験用の関数・テーブル・CloudFront を東京に作り、ログイン (メール送信まで)、全画面の表示、
フォームの送信、JSON の API、楽観ロックの競合、DynamoDB のトランザクションを本番と同じ設定で確かめた。

## Decision

**アプリ本体を Lambda Web Function (nodejs24.x、arm64) で動かし、CloudFront から OAC で直接呼ぶ。
API Gateway・ECR・Dockerfile・Lambda Web Adapter はやめる。**

```
CloudFront ──(OAC, SigV4)──▶ Lambda Web Function ── index.js ── build/index.js (adapter-node)
```

- 配布物は `web/scripts/package-web-function.mjs` が作る `web/dist/web-function/` (zip にして S3 経由で配置)。
- 入口の `index.js` (`src/lambda/web-function-entry.ts`) が `AWS_LAMBDA_HTTP_ENDPOINT` を `HOST` / `PORT` に分けてから
  adapter-node の出力を読み込む。
- 関数本体・revision・endpoint・resource policy は、aws provider v6.72.0 で `aws_lambdaweb_*` が出るまで
  CD の `aws lambda-web deploy` が作る。それ以外 (コード置き場の S3、ログ群、OAC、設定値) は Terraform が持つ。
  provider が出たら4つとも `import` ブロックで取り込む。

移行で分かった制約と、その対処:

| 制約 | 対処 |
|---|---|
| Lambda の Node は CommonJS から ES モジュールを require できない (`--no-experimental-require-module`)。jsdom 27 以降が起動時に失敗する | isomorphic-dompurify が使う jsdom だけ 26.1.0 に固定 (`web/pnpm-workspace.yaml`)。CI で Lambda と同じ起動オプションで配布物を立ち上げて確かめる |
| CloudFront の OAC は `signing_behavior = "always-amz-auth"` だけを受け付け、aws provider 5.x は値を弾く | aws provider を v6 に上げた (本番への差分なし) |
| Web Function は `AWS_LAMBDA_FUNCTION_NAME` と `LAMBDA_TASK_ROOT` を設定しない | `detectLambda` に Web Function 用の判定を足した |
| CLI はシンボリックリンクとドットで始まるディレクトリを zip に入れない | `node-linker=hoisted` で実体のある `node_modules` を作る |
| S3 の古い版を消すと、それを参照する revision が恒久的に Failed になる | コード置き場には lifecycle 規則を付けない |
| revision が Active になってもサーバーの起動は保証されない | CD で署名付きの疎通確認をする |

## Consequences

### Positive

- 経路から API Gateway・ECR・Dockerfile・Lambda Web Adapter の4つが消える。
- 起動時間が平均 2.3 秒 (コンテナ) から 1 秒弱になった (試験環境の実測)。
- 1つの実行環境が複数のリクエストを並行して処理する (既定 64)。
- コンテナイメージのビルドがなくなり、CD が Node の手順だけで完結する。

### Negative

- jsdom を 26.1.0 に留めている。jsdom はこの版を保守対象外としている。Lambda が require(esm) を有効にするか、
  jsdom が ES モジュールに移るまでの措置で、CI のスモークテストが外す時期の判断材料になる。
- Web Functions は公開から間もなく、Terraform の対応が未リリース。それまで関数本体は Terraform の管理外にある。
- 待機中の実行環境にもメモリ課金がかかる (最後のリクエストから約6分で停止するのを実測)。
  今の利用量では月 $0.1 前後で、従来とほぼ変わらない。

### Neutral

- 実行環境のメモリは 2 GB 固定で、設定項目がない。
- 開発環境 (flox) の Node は 22 のまま。flox のパッケージ解決に FloxHub へのログインが要るため、別途 24 に上げる。

## Alternatives considered

- **Lambda Web Adapter (コンテナ) を続ける**: 動いてはいるが、Web Functions が同じことを部品なしでできるため。
- **`NODE_OPTIONS=--experimental-require-module` で require(esm) を有効にする**: AWS は文書化しているが、
  使うと Lambda の SLA と AWS サポートの対象外になるため。
- **jsdom を bundle して ES モジュールに変換する**: jsdom は自分のファイルを `__dirname` から読むため、bundle すると起動しない。
- **API Gateway を残し、Web Function を API Gateway の裏に置く**: 部品を減らすという移行の目的に反するため。
- **CloudFront からの認証を ApplicationManaged + 秘密ヘッダーにする**: endpoint が公開のままになる。AWS は OAC を
  「CloudFront 経由でしか届かない」形として案内している。

## References

- [Lambda Web Functions (開発者ガイド)](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html)
- [CloudFront から Web Function への OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda-web.html)
- [Lambda が無効にしている Node.js の実験的機能](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [jsdom 27.0.1 のリリースノート (ERR_REQUIRE_ESM の環境では 26.1.0 に留める)](https://github.com/jsdom/jsdom/releases/tag/27.0.1)
- [isomorphic-dompurify の既知の問題 #394](https://github.com/kkomelin/isomorphic-dompurify/issues/394)
- [terraform-provider-aws #50452 (`aws_lambdaweb_*`)](https://github.com/hashicorp/terraform-provider-aws/pull/50452)
- [terraform-provider-aws #50431 (OAC の always-amz-auth)](https://github.com/hashicorp/terraform-provider-aws/issues/50431)
