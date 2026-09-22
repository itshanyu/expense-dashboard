# 交接筆記 — 個人記帳系統

**最後更新：** 2026-09-22（Hermes 接手後已查證並定案，本文件為唯一事實來源）
**狀態：** ✅ 技術路線已定案，spec 與 plan 已同步更新，可直接依照 plan 執行開發。

---

## 0. 一句話結論（先讀這個）

**葛斯（Gus）是真實存在且正在運行的系統**——它是 Hermes Agent 的獨立 profile（`~/.hermes/profiles/gus/`），由 launchd 服務 `ai.hermes.gateway-gus` 常駐執行，Discord gateway 狀態為 connected。記帳系統的路線是「**擴充葛斯**」：在葛斯的 Discord 設定中加入記帳討論串的 free-response 監聽，配一個記帳 skill + Google Sheets 寫入腳本。分類方式採用 **AI 判斷**（葛斯本身就是 LLM，分類不需要額外 API 呼叫，零新增成本）。

---

## 1. 舊版 HANDOFF 的「未解決關鍵問題」— 已於 2026-09-22 查證解決

前一個 agent 發現 `/Users/apple/isis/Gus-bot/` 只有 README 沒有程式碼，因而卡在「葛斯是否存在」。查證結果：

| 查證項目 | 結果 |
|---|---|
| `/Users/apple/isis/Gus-bot/` | 只是歷史規劃文件（README + 一張圖），與現行系統無關。舊 `yt_discord_bot.py` 已刪除 |
| 葛斯本體 | Hermes Agent profile，位於 `~/.hermes/profiles/gus/` |
| 常駐方式 | launchd 服務 `ai.hermes.gateway-gus`（plist 在 `~/Library/LaunchAgents/`），重啟：`launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-gus` |
| Discord 連線 | gateway_state.json 顯示 `platforms/discord/state = connected` |
| 模型 | GLM / Z.AI（`auth.json` base_url `api.z.ai`；Hann 男友的 coding-plan key，已同意使用） |
| Discord 權限 | `.env` 設 `DISCORD_ALLOWED_USERS=726789604459544599`（Hann 本人）；`config.yaml` 已有 `discord.free_response_channels: '956840925689155614'`，加入新討論串 ID 即可讓葛斯免 @mention 回應 |
| 表情反饋 | Hermes gateway 原生支援 `DISCORD_REACTIONS`（預設開啟）：處理中 👀、成功 ✅、失敗 ❌——與 spec 的反應機制需求天然吻合，不需自己實作 |

**重要更正：** 舊版 HANDOFF 說葛斯有「GEMINI_API_KEY 可重用」——已過時。葛斯現在走 GLM/Z.AI，沒有 Gemini key。但這反而讓分類決策變簡單：葛斯本身就是 LLM agent，訊息進來時分類是 agent 推理的一部分，**沒有逐次計費問題**，所以使用者原初偏好的「AI 判斷分類」直接採用，不需要關鍵字比對。

---

## 2. 最終技術決定（覆蓋所有舊版文件中的「方案 A/B」討論）

1. **技術路線：方案 B（擴充葛斯）。** Hermes gateway 本來就是常駐 Discord 連線，直接監聽討論串訊息即時處理。方案 A（Vercel Cron 輪詢）與「從零寫 Python discord.py bot」皆淘汰，不再考慮。
2. **輸入方式：** 使用者在固定討論串（thread ID `1551881517838635018`）打純文字訊息「金額 備註」，例如 `400 午餐`。第一個數字當金額，其餘文字當備註。不是數字開頭的訊息：葛斯不回應、不記帳。
3. **分類：AI 判斷**，由葛斯在收到訊息時直接判斷（這是 agent 推理，不是額外 API 呼叫）。分類清單共 11 個（注意：舊 HANDOFF 寫「10 個」是筆誤，實列 11 項，以清單為準）：
   **餐食、飲料、交通、旅遊、娛樂、購物、學習、醫療、保險、稅務、其他**
4. **反饋機制：** 沿用 Hermes gateway 原生 reactions（✅ 成功 / ❌ 失敗），不自製。已知副作用：被忽略的非記帳訊息也會出現 👀/✅，屬可接受的外觀問題。
5. **資料儲存：Google Sheets**（service account 寫入；前端用唯讀 API key 讀取）。欄位：`Date | Amount | Category | Note | RecordedAt`。
6. **不做的事：** 編輯/刪除指令（直接改 Sheets）、密碼保護、收入記錄、資料匯入。
7. **分階段交付：**
   - 第一階段：Discord 輸入 → Sheets 管線（`docs/superpowers/plans/` 內的 plan，Phase A）
   - 第二階段：GitHub Pages 視覺化 + 財務目標估算器（同 plan 的 Phase B，等有真實資料後執行 UI 細節）

---

## 3. 已確認的需求背景（來自 /grill-me 訪談，仍有效）

- 動機：(1) 自我覺察支出流向、(2) 每月預算控管、(3) 累積現金流數據餵理財決策
- 純個人記帳，不含家庭/共同帳戶；第一階段只記支出
- 沒有既有資料，全部手動輸入
- 使用者每週開 Sheets 校正一次分類，不要求 AI 分類完全正確
- 財務目標估算：實際支出算「現況基準」vs 使用者手動設「理想情境」，兩者對比
- 稅務試算：台灣綜所稅級距速算（不含扣除額細節）；通膨假設固定可調，預設 2%
- 使用者 GitHub 帳號 `itshanyu`（gh 已登入）；只用過 GitHub Pages（sleep-dashboard），沒用過 Vercel → 前端走 GitHub Pages

---

## 4. 檔案地圖

| 檔案 | 狀態 |
|---|---|
| `HANDOFF.md`（本檔） | ✅ 已更新為定案版 |
| `docs/superpowers/specs/2026-09-22-personal-finance-tracker.md` | ✅ 已重寫，反映中途變更與最終決定 |
| `docs/superpowers/plans/2026-09-22-discord-expense-recording.md` | ✅ 已重寫（舊 Vercel/TypeScript plan 已由葛斯路線取代） |
| 專案資料夾 | `/Users/apple/isis/wiki/投資理財/記帳系統/`，尚未 `git init`（plan 的 Task 1 會做） |

---

## 5. 執行時的環境注意事項（給任何接手的 agent）

- 葛斯的 config 修改一律用 `hermes config set ... --profile gus`，不要手改 `config.yaml`。
- 改完葛斯設定後需重啟 gateway：`launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-gus`。
- 葛斯 profile 的 secrets 在 `~/.hermes/profiles/gus/.env`（現有 DISCORD_BOT_TOKEN、DISCORD_ALLOWED_USERS 兩項）。
- Google Sheets service account 的金鑰 JSON 放 `記帳系統/secrets/`（加入 .gitignore），路徑用環境變數 `GOOGLE_APPLICATION_CREDENTIALS` 指定。
- 驗收方式：使用者在記帳討論串打 `400 午餐`，葛斯應出現 ✅ 且 Sheets 多一列；打非數字開頭訊息，葛斯不應回應。
