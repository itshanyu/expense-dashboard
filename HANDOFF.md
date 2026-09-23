# 交接筆記 — 個人記帳系統

**最後更新：** 2026-09-23（Phase A 全上線＋Phase B 視覺化已部署，本文件為唯一事實來源）
**狀態：** ✅ 系統已上線運作中。剩餘：使用者對葛斯記帳做最終端到端驗收。

---

## 0. 一句話結論（先讀這個）

**葛斯（Gus）是真實存在且正在運行的系統**——Hermes Agent 的獨立 profile（`~/.hermes/profiles/gus/`），launchd 服務 `ai.hermes.gateway-gus` 常駐，Discord gateway connected。記帳系統已建完成並部署：

- **輸入端（Phase A）**：使用者在 Discord 記帳討論串（thread `1551881517838635018`）打「金額 備註」（例：`400 午餐`）→ 葛斯 AI 分類 → 寫入 Google Sheets。
- **輸出端（Phase B）**：公開儀表板 https://itshanyu.github.io/expense-dashboard/ —— 圖表＋支出/收入/夢想/資產試算器。GitHub Actions 每日同步資料快照。

---

## 1. 系統架構（現況，全部已驗證運作）

```
Discord 記帳討論串 (1551881517838635018)
   ↓ 葛斯 gateway（free_response_channels 已加入此串）
葛斯 skill「記帳」（~/.hermes/profiles/gus/skills/記帳/SKILL.md）
   解析「數字開頭」訊息 → AI 分類（11 分類）→ 呼叫腳本
   ↓
scripts/append_expense.py → Google Sheets「記帳」（Expenses 工作表）
   ↓ GitHub Actions 每天 05:40 台北時間（export-snapshot.yml）
scripts/export_snapshot.py → web/data.json（摘要版：只有統計，無明細無備註）
   ↓ GitHub Actions push 觸發（deploy-pages.yml）
GitHub Pages → https://itshanyu.github.io/expense-dashboard/
```

## 2. 隱私架構（使用者明確選擇的方案 3）

Sheets 試算表維持**完全私有**。網頁讀的 `data.json` 是**摘要版**：只有月總額、月×分類、日總額三種統計，**不含**單筆明細、備註、RecordedAt。`export_snapshot.py` 預設輸出摘要版；`--full` 旗標才會輸出明細（僅限本機，嚴禁推上公開 repo）。試算器使用者的預算/收入/夢想/資產輸入全存瀏覽器 localStorage，不上傳。

## 3. 已確認的決定（含演進）

- 分類 11 個：餐食、飲料、交通、旅遊、娛樂、購物、學習、醫療、保險、稅務、其他
- 分類方式：AI 判斷（葛斯 agent 推理，零新增費用；使用者每週校正一次）
- 非數字開頭訊息：完全忽略
- 反饋：gateway 原生 reactions（👀/✅/❌）
- 不做：編輯/刪除指令（直接改 Sheets）、密碼保護、收入記錄（Discord 端）
- 前端部署：GitHub Pages，repo 公開（`itshanyu/expense-dashboard`），使用者知情並選擇「摘要版快照」方案

## 4. 視覺化網頁功能（全部已部署）

1. 概況卡片：本月支出、日均、月底預估、歷史月均
2. 圖表：本月分類佔比（甜甜圈）、近 30 天趨勢、每月總支出長條
3. 試算區（左支出／右收入平行雙欄，下方資產列，紫色夢想清單，結果分三組）：
   - **支出預估表**：逐項固定花費（預設房租/餐費/交通/訂閱，可增刪）
   - **收入規劃**：逐項收入來源（預設本業/副業），合計套台灣綜所稅五級距算稅後（級距速算不含扣除額）
   - **夢想清單**：一次性目標（總價＋幾年後＋夢想專屬收入），通膨調整後攤提「每月還需存」；夢想收入先扣稅再抵扣
   - **資產現況與假設**：可動用資金、股票市值、通膨率（預設 2%）、看幾年後
   - **結果分三組**：🏦資產（總資產卡＋資產跑道卡）、🔄每月現金流（支出/收入/結餘/夢想需存/扣夢想後結餘，每項附白話小字）、結論（維持這種生活所需稅前月收入＋總結判定）
   - 二分法反推稅前所需收入（級距稅無法直接反解）
   - 所有試算輸入存 localStorage（key：`budget-estimator-v1`、`income-estimator-v1`、`dream-estimator-v1`）

## 5. 檔案地圖

| 檔案 | 內容 |
|---|---|
| `HANDOFF.md`（本檔） | 唯一事實來源 |
| `docs/superpowers/specs/`、`docs/superpowers/plans/` | spec 與 plan（已同步定案版＋Phase B 進度註記） |
| `scripts/append_expense.py` | Sheets 寫入（葛斯呼叫），12 個單元測試全過 |
| `scripts/test_append_expense.py` | 測試（`venv/bin/python scripts/test_append_expense.py`） |
| `scripts/export_snapshot.py` | 快照匯出（預設摘要版、`--full` 明細版） |
| `skills/記帳/SKILL.md` | 葛斯記帳 skill 源碼（已安裝至 gus profile） |
| `web/` | 儀表板（index.html / app.js / style.css / data.json） |
| `.github/workflows/export-snapshot.yml` | 每日 05:40 台北同步快照 |
| `.github/workflows/deploy-pages.yml` | push 自動部署 Pages |
| `secrets/`（.gitignore） | service account JSON：`personal-bookkeeping-509409-b0f8d5717626.json` |
| GitHub repo | `itshanyu/expense-dashboard`（公開）；Actions secrets：`SERVICE_ACCOUNT_JSON`、`EXPENSE_SHEET_ID` |

## 6. 環境與 credentials 位置

- Sheet ID：`1P-8PRqwW2QmSqT9Y9NzfEZA-r6wsSB_Jh8fOs10gx14`（試算表「記帳」，工作表 `Expenses`）
- 葛斯 `.env`（`~/.hermes/profiles/gus/.env`）：DISCORD_BOT_TOKEN、DISCORD_ALLOWED_USERS、GOOGLE_APPLICATION_CREDENTIALS、EXPENSE_SHEET_ID（後兩項 2026-09-22 加入）
- 葛斯 `config.yaml`：`discord.free_response_channels: 956840925689155614,1551881517838635018`（後者為記帳串，2026-09-22 加入）
- 本機 venv：`記帳系統/venv/`（Python 3.11，google-api-python-client + google-auth）

## 7. 剩餘待辦

- [ ] **端到端驗收**：使用者在記帳討論串實際打 `400 午餐`，確認葛斯回 ✅、Sheets 多一列、隔天網頁反映。遲未驗證——唯一未走完的步驟
- [ ] Sheets 裡有一筆測試資料（2026-09-22 金額 1「系統測試」），驗收後由使用者在 Sheets 手動刪除
- [ ] 使用者截圖回報：夢想清單曾出現「每月需存 $220,000」的異常值，疑似單位/年數填錯，待使用者確認（已透過欄位說明改善）
- [ ] Phase B 可再延伸（使用者提出才做）：股票打折扣算跑道、本機 --full 明細列表頁

## 8. 執行注意事項（給接手的 agent）

- 葛斯設定一律 `hermes config set ... --profile gus`，不手改 config.yaml；改完重啟 `launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-gus`，並讀 `gateway_state.json` 確認 discord connected。
- 改 web 後 `node --check app.js`、驗證 index.html 的 id 完整性，push 後等 `deploy-pages.yml` 跑完（約 20-30 秒）再驗收線上版。
- push 若被拒（remote 有 Actions 的快照 commit），先 `git pull --rebase origin main` 再推（發生過兩次）。
- 驗收線上 data.json 是否更新時注意 CDN 快取，加 `?t=<timestamp>` 或比對 `generatedAt` 欄位。
- 本機預覽：`cd web && python3 -m http.server 8934`（瀏覽器自動化截圖曾被 Chrome 遠端除錯授權彈窗擋住，用 curl + node 驗證替代）。
