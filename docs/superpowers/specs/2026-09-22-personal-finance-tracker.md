# 個人記帳系統 — 規格文件

**日期：** 2026-09-22（同日修訂：輸入方式改純文字、分類改 AI 判斷、技術路線改為擴充葛斯 Hermes profile）
**狀態：** ✅ 已定案（本版為唯一有效版本，取代所有舊版討論）

## 目的與範圍

- **動機：** 同時滿足三件事——(1) 自我覺察支出流向、(2) 之後做每月預算控管、(3) 累積現金流數據餵給理財決策。
- **範圍：** 純個人（不含家庭/共同帳戶）。第一階段只做**支出**記錄，收入之後再擴充。
- **無既有資料來源：** 全部由使用者手動輸入，不做匯入。
- **不做編輯/刪除功能：** 要修正資料，使用者直接打開 Google Sheets 手動修改。
- **不做密碼保護。**

## 記錄方式（輸入）

- **唯一輸入入口：Discord 記帳討論串**（thread ID：`1551881517838635018`，位於靈境 Liminal 伺服器）。
- 使用者打**純文字訊息**，格式「金額 備註」，例如：

  ```
  400 午餐
  ```

- 解析規則：第一個數字（整數或小數，必須 > 0）當金額；其後所有文字當備註。
- **不是數字開頭的訊息直接忽略**：葛斯不回應、不記帳、不反應。
- 不使用 Slash Command。

### 分類

- **由葛斯以 AI 判斷**（葛斯本身是 Hermes agent，分類是其訊息處理推理的一部分，無逐次計費問題）。使用者**每週開 Google Sheets 校正一次**即可，不要求完全正確。
- 分類清單固定 11 個：**餐食、飲料、交通、旅遊、娛樂、購物、學習、醫療、保險、稅務、其他**
- 無法判斷時歸「其他」。

### 反饋機制

- 沿用 Hermes gateway 原生 Discord reactions（預設行為）：訊息處理中 👀、成功 ✅、失敗 ❌。
- 已知副作用：被忽略的非記帳訊息也會出現 👀/✅（gateway 層行為），屬可接受的外觀問題，不另行修正。

### 記錄欄位（Google Sheets 一列 = 一筆支出）

| 欄位 | 說明 |
|---|---|
| Date | 記帳當天日期（`YYYY-MM-DD`，台北時區） |
| Amount | 金額（正數，新台幣） |
| Category | 分類（上述 11 選 1） |
| Note | 備註（金額後的其餘文字） |
| RecordedAt | 系統寫入時的 ISO 8601 時間戳，用於除錯/稽核 |

## 技術架構

- **核心路線：擴充葛斯。** 葛斯是 Hermes Agent 的獨立 profile（`~/.hermes/profiles/gus/`），由 launchd 服務 `ai.hermes.gateway-gus` 常駐執行，Discord gateway 已連線。記帳功能 = 葛斯的一個 skill（記帳解析與分類規則）+ Google Sheets 寫入腳本 + 討論串 free-response 設定。不需要另外寫 discord.py bot，不需要 Vercel。
- **模型：** 葛斯使用 GLM / Z.AI（Hann 男友的 coding-plan key，已同意）。分類與解析不產生新增費用。
- **程式碼位置：** `/Users/apple/isis/wiki/投資理財/記帳系統/`，獨立 git repo（與 wiki 分開版控）。
  - `skills/` — 葛斯用的記帳 skill（安裝到 `~/.hermes/profiles/gus/skills/`）
  - `scripts/` — Sheets 寫入/讀取腳本（Python，供葛斯以 terminal 工具呼叫）
  - `web/` — 第二階段的 GitHub Pages 視覺化前端
- **資料儲存：Google Sheets**，透過 Sheets API 讀寫。寫入用 service account（金鑰 JSON 存 `記帳系統/secrets/`，入 .gitignore）；前端視覺化用唯讀 API key。使用者可隨時打開試算表肉眼核對/手動修改。
- **葛斯設定變更：** 一律用 `hermes config set ... --profile gus`；改完重啟 `launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-gus`。

## 網頁前端（輸出/視覺化，第二階段）

- **純視覺化用途，不做記帳表單。**
- 內容：支出總覽（本月/歷史趨勢、分類佔比）、「現況基準 vs 理想情境」對比、財務目標估算器。
- **部署：GitHub Pages**（沿用使用者熟悉的方式，如 sleep-dashboard repo）。瀏覽器端直接呼叫 Google Sheets API 讀資料（唯讀 API key）。
- 等 第一階段跑一段時間、有真實資料後再做 UI 細節。

## 財務目標估算邏輯（第二階段）

- 用實際記錄支出算「現況基準」（每月平均花費），使用者手動設「理想情境」月支出假設，兩者對比。
- 稅務試算：台灣綜所稅級距速算，不含扣除額/扶養細節。
- 通膨：固定可調年增率，預設 2%。
- 收入數字由使用者在前端手動輸入（系統不記收入）。

## 分階段交付

1. **第一階段（本次）：Discord → 葛斯 → Google Sheets 記帳管線。** 對應 plan：`docs/superpowers/plans/2026-09-22-discord-expense-recording.md` 的 Phase A。
2. **第二階段（之後）：GitHub Pages 視覺化 + 財務目標估算器。** 對應同 plan 的 Phase B。

## 使用者需要另外完成的設定（一次性，Claude 會引導）

- Google Cloud：建立專案、啟用 Sheets API、建立 service account 並下載金鑰 JSON、建立記帳試算表並分享給 service account email。
- （Discord 端零設定——葛斯的 bot token 已存在且 gateway 已連線，只需把討論串 ID 加進設定。）
