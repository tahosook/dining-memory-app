# Local AI Provider Spike

## Meta
- Purpose: local AI provider spike の実装判断、runtime blocker、Settings gate の扱いを task note として残す。
- Audience: このスパイクを引き継ぐ実装担当者と、local AI 方針を判断する人。
- Update trigger: runtime 候補、Settings gate、`app_settings`、on-device provider の採否が変わったとき。
- Related docs: [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/domain/database-design.md](../domain/database-design.md), [docs/notes/ai-input-assist-phase1.md](ai-input-assist-phase1.md)

## Summary
このスパイクでは、AI 入力補助を Settings の明示許可にぶら下げ、provider 層を `mock` と `local-runtime-prototype` で切り替えられる形にした。  
current Expo SDK 55 / RN 0.83 の repo では、`llama.rn` を使う meal input assist の real on-device vision path まで接続した。
ただし `local-runtime-prototype` は supported device/runtime と app-local model / projector が揃ったときだけ `ready` を返し、それ以外は `unavailable` を返す。
この note には text-first / semantic search の探索内容も含まれるが、current feature path では semantic search / rerank は有効化していない。

## Current State
- `app_settings` に `ai_input_assist_enabled` を保存する。
- review 画面の AI 入力補助は、Settings が off の場合は `設定で未許可` として無効化する。
- Settings が on でも、supported device/runtime と app-local model / projector が揃わない build では `runtime_unavailable` / `model_unavailable` / `unsupported_architecture` を返す。
- Settings は `Local AI Runtime Status` で meal input assist の ready / unavailable、reason、expected path を表示する。
- save flow、候補採用、`ai_source` / `ai_confidence` の保存ルールは Phase 1 と同じで維持する。
- `llama.rn` は dependency と minimal native config に加えて、meal input assist 向けの multimodal provider まで接続した。
- meal input assist の fixed path は `documentDirectory/ai-models/meal-input-assist.gguf` と `documentDirectory/ai-models/meal-input-assist.mmproj` を使う。
- semantic search / rerank は historical / optional exploration として扱い、current app behavior では `search_vectors` を actively read / write しない。
- meal input assist model asset は developer が app-local path に置くか Settings から明示ダウンロードする前提で、path 上書き UI は current scope に入れない。

## Runtime Comparison
- `mock`
  - 既存の review UI を安全に検証できる。
  - 実 AI ではないため、本フェーズの最終 provider にはしない。
- `local-runtime-prototype`
  - 目標の方向性に合う。
  - historical exploration として text-first embeddings / rerank の narrow path も検討した。
  - vision input assist としても real provider を持つが、multimodal model / projector を app-local に置かない限り review 向けには blocker を返す。
- 外部 API
  - 今回の local-first / no external send 方針に反するため、このスパイクでは対象外。

## Decisions / Rules
- Settings 許可は「外部送信 consent」ではなく「端末内 AI 入力補助を使う許可」として扱う。
- `local-runtime-prototype` が `ready` でない限り、review から provider を実行しない。
- raw model output や model metadata は保存しない。
- runtime blocker は mock fallback で隠さず、review 上の disabled reason と note に残す。
- Android 実機での運用確認は、まず Settings の status 表示で expected path と blocker を確認してから行う。

## Next Steps or Open Questions
- rerank は hybrid search の品質不足が確認されるまで optional path に留める。
- meal input assist 用 multimodal model / projector の配布・導入手順を repo 外でどう扱うかを決める。
