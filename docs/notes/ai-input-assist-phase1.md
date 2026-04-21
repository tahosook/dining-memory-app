# AI Input Assist Phase 1

## Meta
- Purpose: このタスクで導入する AI 入力補助 Phase 1 の前提と非目標を、canonical docs を補完する task note として残す。
- Audience: 今回の実装担当者と、この差分を後から引き継ぐ人。
- Update trigger: Phase 1 のスコープ、review UI、AI 保存方針、source of truth の扱いが変わったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/ux/user-flows.md](../ux/user-flows.md), [docs/domain/database-design.md](../domain/database-design.md)

## Summary
このメモは canonical docs より下位の task-local memo です。  
判断に迷った場合は、まず `AGENTS.md` と `docs/index.md` から辿る canonical docs、その次に現在の `src/` 実装を優先します。

## Current State
- review 画面に、ユーザー起点で実行する `AIで候補を提案` セクションを追加する。
- Phase 1 では外部 AI 送信を行わず、差し替え可能な local mock provider を使う。
- `src/database/models/schema.ts` は現状 repo に存在しない。
- active schema source は `src/database/services/localDatabase.ts` とする。

## Decisions / Rules
- AI は補助のみで、自動確定・自動保存・保存導線のブロックは行わない。
- 候補は `料理名` `料理ジャンル` の 2 系統を扱う。
- 候補はタップ時に対応フィールドへだけ反映し、既存入力を自動上書きしない。
- save 時に保存してよい AI 関連情報は `ai_source` と `ai_confidence` のみとし、候補一覧や生レスポンスは保存しない。
- `AI無効` の理由表示は review 画面だけに出し、Settings 画面は Phase 1 では増やさない。

## Next Steps or Open Questions
- 実 AI 接続時は provider と policy を差し替え、外部送信の明示的 consent gate を追加する。
- tag 候補、保存後 enrichment、検索強化は次フェーズで再検討する。
