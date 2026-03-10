# ClawHelper — CLAUDE.md

## 專案簡介
**在地民生服務媒合平台**：連結在地居民的日常需求（水電、家教、家事、運送）與服務提供者，並提供 NPS 評價機制供民眾參考。

## 技術架構
- **前端**：純 HTML + CSS + JS（無框架），跑在 `http://localhost:3000/`
- **後端/DB**：Supabase（Auth + PostgreSQL）—— 同 next-chapter 的遠端 project
- **Auth**：Magic Link 無密碼登入（Phase 1）
  > ⚠️ Auth 邏輯封裝於 `authModule`，未來可替換為 OTP/密碼/OAuth 不影響其他模組
- **AI**：Phase 2 起導入（Gemini Flash 媒合排序、Claude Sonnet Agent 語音發單）
- **啟動方式**：`bash start.sh`（python3 http.server port 3000）

## Supabase 設定
- Project URL: `https://rjezzptqympyragmhijg.supabase.co`
- 與 next-chapter 共用同一個 Supabase project（不衝突，使用不同表名）

## GitHub
- Repo: `https://github.com/496Claw/ClawHelper`
- Branch: `main`

## 服務類別
1. 🔧 水電修繕
2. 📚 家教與教學
3. 🏠 家事服務
4. 🚗 短途運送與小型任務

## 資料庫表
| 表名 | 用途 |
|------|------|
| `user_profiles` | 使用者擴充資料（角色、地區、顯示名稱） |
| `services` | 供給方服務上架清單 |
| `task_requests` | 需求方發布的任務單 |
| `reviews` | NPS 評價（0–10 分）+ 文字留言 |
| `conversations` | 平台私訊對話（Phase 2） |
| `messages` | 私訊內容（Phase 2） |

## 評價機制
- 採用 **NPS（Net Promoter Score）**：0–10 分
  - 推薦者 9–10 / 被動者 7–8 / 批評者 0–6
- 前端顯示換算為 ★ 圖示

## 目前完成的功能（Phase 1 MVP）
- [ ] Navbar + 平滑滾動 + ScrollSpy
- [ ] Hero 4 類別卡片入口
- [ ] Magic Link Auth + upsert user_profiles
- [ ] 瀏覽服務：讀取/渲染/篩選/排序 service cards
- [ ] 服務詳情 Modal + 評價列表
- [ ] 張貼任務：登入後發單 + open 任務列表
- [ ] 服務上架：登入後填表 → 寫入 services
- [ ] NPS 評分 + 文字 → trigger 自動更新 avg_nps
- [ ] showToast 取代所有 alert()
- [ ] 完整 RWD

## Phase 2 規劃
- AI 智能媒合（Gemini Flash）：發單後推薦 Top 3 服務方
- 平台私訊（Supabase Realtime）：需求方與服務方即時對話
- 語音 Agent 發單（OpenClaw + Claude Sonnet）
- AI 服務描述優化（Gemini Flash）

## Phase 3 規劃
- AI 評論分析（自動過濾惡意留言、產生 AI 推薦摘要）
- NPS 趨勢儀表板
