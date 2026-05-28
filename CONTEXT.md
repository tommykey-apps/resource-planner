# resource-planner

要員計画のコンテキスト。 「誰 (Resource) を・いつ (期間) ・どの案件 (Project) に割り当てるか」 を
組織 (Team) 単位で計画する。

## Language

**Team**:
マルチテナントの単位 (= 利用する会社/組織そのもの)。 全アプリデータの所有・隔離境界。
1 user は複数 Team に所属しうる (TeamMembership)。
_Avoid_: Organization, Org, Tenant, 会社 (どれも Team を指す)

**Department**:
1 つの **Team の中**の組織ツリーのノード (部署/課/本部)。 親 Department を**高々 1 つ**持つ
(親なし = ルート)。 1 Team 内にルートは**複数ありうる** (フォレスト: 「開発本部」「営業本部」が並列)。
**グルーピング専用** — 隔離境界でも権限境界でもない (それは Team の役割)。
_Avoid_: Team (Department は Team ではない), Group, Unit, 組織

**Resource**:
計画対象の人 (被アサイン対象)。 **高々 1 つ**の **Department** に属する (多重所属なし)。
所属先はツリーの **任意ノード** でよい (葉に限らない — 本部直属の人も表現できる)。
どの Department にも属さない **未所属 (Unassigned)** も有効な状態。
_Avoid_: Member, User, Person, Employee (Resource は認証ユーザー = User とは別概念)

**Project**:
割り当て先の案件 (クライアント/仕事)。 Team に属する。

**Assignment**:
ある Resource を、 ある期間 `[startDate, endDateExclusive)`、 ある Project に割り当てた事実。
Team に属する。

**TeamMembership**:
ある **User** が ある **Team** に所属する関係 (role: admin / member)。 認証ユーザーの所属であり、
**Resource の Department 所属とは別物**。
_Avoid_: Resource の所属と混同しないこと

**User**:
認証されたアプリ利用者 (Auth.js が管理)。 TeamMembership を通じて Team に属する。
計画対象の人 (Resource) とは**別概念** (User がログインして Resource を編集する)。

## Flagged ambiguities

- **「人」**: 文脈で 2 つを指しうる → 計画対象なら **Resource**、 ログインする利用者なら **User**。
- **Department ≠ Team**: ADR 0009 は将来拡張として「部署別に Team を分ける」可能性に触れたが、
  本コンテキストでは **部署 = 1 Team 内の Department (グルーピング)** を採る。 Department は
  テナント境界ではない。

## Example dialogue

> **Dev**: 「Alice はどの Team?」
> **Domain**: 「Alice は Resource。 Team は会社単位で、 Alice が所属するのは Team の中の
> *Department* (例: バックエンド課)。」
> **Dev**: 「Resource は複数の Department に入れる?」
> **Domain**: 「いや、 ちょうど 1 つ。 ただし本部直属の部長みたいに、 末端の課じゃなく
> 中間ノードに直接ぶら下げることはできる。」
> **Dev**: 「ログインユーザーの所属は?」
> **Domain**: 「それは User の TeamMembership。 Resource の Department 所属とは別の話。
> User は Team に所属、 Resource は Department に所属。」
