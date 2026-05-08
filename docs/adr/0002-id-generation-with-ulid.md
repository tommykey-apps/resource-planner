# 0002. ID 生成戦略を ULID に統一する

- **Status**: Accepted
- **Date**: 2026-05-08
- **Deciders**: @tommykey0925

## Context

resource-planner の domain entity (Resource / Project / Assignment) は DynamoDB Single Table Design で管理する。各 entity に一意の `id` が必要だが、選択肢はいくつかある:

- UUIDv4 (16 byte ランダム、辞書順 ≠ 時系列順)
- ULID (16 byte: 48 bit timestamp + 80 bit ランダム、辞書順 = 時系列順)
- nanoid (任意長 URL-safe ランダム、デフォルト 21 文字 = 126 bit エントロピー)

検討事項:
- Assignment SK は `ASN#{startDate}#{id}` で startDate を SK 先頭に置くため、id 自体の sortable 性は不要
- Resource SK / Project SK は `RES#{id}` / `PRJ#{id}` で **id がそのまま辞書順で並ぶ** → sortable id だと List 時に作成順、debug 時に時刻情報が即わかる
- TS 単一言語、依存サイズの差は小さい

## Decision

**全 entity の id 生成に ULID (`ulid` npm package) を使う。** `web/src/lib/id.ts` で `newId()` を export し、repository 層から呼び出す。

## Consequences

### Positive

- Resource / Project の SK が **辞書順 = 作成時刻順** になり、debug / 管理画面でデータを眺めるときに直感的
- Crockford Base32 で URL-safe、case-insensitive 衝突なし
- 衝突確率は UUIDv4 同等 (80 bit ランダム部、誕生日攻撃まで 2^40 ≒ 10^12 件で 50%)
- 26 文字固定長で sk のフォーマット幅が予測可能

### Negative

- nanoid (21 文字) より 5 文字長い → アイテムサイズが微増 (DynamoDB の RCU/WCU は 1KB / 4KB 単位なので実質影響なし)
- 「タイムスタンプを id に含む」をプライバシー側面で問題にするユースケースがある (社内ツールなので非該当)

### Neutral

- ulid 生成は monotonic ではない (同一 ms 内で並び順が保証されない場合あり)。今回 SK で startDate / 作成時刻順を厳密に必要とする query は無いため OK

## Alternatives considered

- **UUIDv4**: 最も普及しているが時系列順で並ばない。debug 時の利便性が落ちる
- **nanoid**: より短くシンプルだが時系列情報なし。Assignment は startDate が SK 先頭にあるため利点が活きない
- **DynamoDB の autoincrement (counter item パターン)**: マルチテナント環境で counter がボトルネックになる、衝突なしのために strong consistent read が必要、複雑性に見合わない

## References

- [ulid spec](https://github.com/ulid/spec)
- [ADR 0001](0001-typescript-types-as-api-spec.md) — 本リポジトリの ADR 初号
- 関連 issue: [#35](https://github.com/tommykey-apps/resource-planner/issues/35)
