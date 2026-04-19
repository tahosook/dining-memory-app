# Local AI Provider Spike

## Meta
- Purpose: local AI provider spike の実装判断、runtime blocker、Settings gate の扱いを task note として残す。
- Audience: このスパイクを引き継ぐ実装担当者と、local AI 方針を判断する人。
- Update trigger: runtime 候補、Settings gate、`app_settings`、on-device provider の採否が変わったとき。
- Related docs: [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/domain/database-design.md](../domain/database-design.md), [docs/notes/ai-input-assist-phase1.md](ai-input-assist-phase1.md)

## Summary
このスパイクでは、AI 入力補助を Settings の明示許可にぶら下げ、provider 層を `mock` と `local-runtime-prototype` で切り替えられる形にした。  
ただし current Expo SDK 55 / RN 0.83 の repo には、実際の on-device vision runtime と model asset がまだ入っていないため、`local-runtime-prototype` は現在 `unavailable` を返す。

## Current State
- `app_settings` に `ai_input_assist_enabled` を保存する。
- review 画面の AI 入力補助は、Settings が off の場合は `設定で未許可` として無効化する。
- Settings が on でも、current build では `runtime_unavailable` を返し、review 側は `この build には端末内 AI runtime がまだ組み込まれていません。` を表示する。
- save flow、候補採用、`ai_source` / `ai_confidence` の保存ルールは Phase 1 と同じで維持する。

## Runtime Comparison
- `mock`
  - 既存の review UI を安全に検証できる。
  - 実 AI ではないため、本フェーズの最終 provider にはしない。
- `local-runtime-prototype`
  - 目標の方向性に合う。
  - current repo には runtime integration も bundled model もないため、現時点では blocker を返す。
- 外部 API
  - 今回の local-first / no external send 方針に反するため、このスパイクでは対象外。

## Decisions / Rules
- Settings 許可は「外部送信 consent」ではなく「端末内 AI 入力補助を使う許可」として扱う。
- `local-runtime-prototype` が `ready` でない限り、review から provider を実行しない。
- raw model output や model metadata は保存しない。
- runtime blocker は mock fallback で隠さず、review 上の disabled reason と note に残す。

## Next Steps or Open Questions
- Expo dev build 互換な on-device vision runtime を 1 つ選び、`runtime_unavailable` を `ready` に置き換える。
- runtime 導入時に model asset の配布場所と起動コストを決め、`model_unavailable` の扱いを実装する。
