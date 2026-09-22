# 個人記帳系統

Discord 記帳討論串 → 葛斯（Hermes profile `gus`）AI 分類 → Google Sheets。

- 規格：`docs/superpowers/specs/2026-09-22-personal-finance-tracker.md`
- 實作計畫：`docs/superpowers/plans/2026-09-22-discord-expense-recording.md`
- 交接/狀態：`HANDOFF.md`

## 元件

| 路徑 | 內容 |
|---|---|
| `scripts/append_expense.py` | Sheets 寫入腳本（葛斯呼叫） |
| `skills/記帳/` | 葛斯的記帳 skill（安裝於 `~/.hermes/profiles/gus/skills/`） |
| `web/` | Phase B：GitHub Pages 視覺化 |
| `secrets/` | service account 金鑰（不入 git） |

## 環境變數

- `GOOGLE_APPLICATION_CREDENTIALS` — service account JSON 絕對路徑
- `EXPENSE_SHEET_ID` — 記帳試算表 ID

## 分類（11 個，固定）

餐食、飲料、交通、旅遊、娛樂、購物、學習、醫療、保險、稅務、其他
