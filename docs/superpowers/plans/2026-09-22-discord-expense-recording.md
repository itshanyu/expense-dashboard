# 葛斯記帳功能 Implementation Plan（Phase A：輸入管線 / Phase B：視覺化）

> **For agentic workers:** 本 plan 取代 2026-09-22 舊版（Vercel/TypeScript/Slash Command 路線，已淘汰）。技術路線為「擴充葛斯（Hermes profile `gus`）」，規格見 `docs/superpowers/specs/2026-09-22-personal-finance-tracker.md`。步驟用 checkbox 追蹤。

**Goal:** 使用者在 Discord 記帳討論串（thread `1551881517838635018`）打「金額 備註」，葛斯 AI 分類後寫入 Google Sheets，訊息上出現 ✅/❌ 反應。

**Architecture:** 葛斯 Hermes gateway（常駐，launchd `ai.hermes.gateway-gus`）收到討論串訊息 → 記帳 skill 指引葛斯解析與分類 → 呼叫 Python 腳本寫入 Google Sheets（service account）。反饋用 gateway 原生 reactions。

**Tech Stack:** Hermes skill（markdown 指引）、Python 3 + `google-api-python-client`（Sheets API）、GitHub Pages（Phase B 前端）。

**Spec:** `docs/superpowers/specs/2026-09-22-personal-finance-tracker.md`

## Global Constraints

- 分類固定 11 個：`餐食、飲料、交通、旅遊、娛樂、購物、學習、醫療、保險、稅務、其他`
- 非數字開頭的訊息：不記帳、不回應。
- 不做編輯/刪除指令；不做密碼保護；不做收入記錄。
- 葛斯設定一律用 `hermes config set ... --profile gus`，不手改 config.yaml。
- secrets 不入 git：service account 金鑰 JSON 放 `記帳系統/secrets/`（.gitignore）。
- Sheets 欄位順序固定：`Date | Amount | Category | Note | RecordedAt`。

---

## Phase A — Discord 輸入管線

### Task 0: 使用者一次性設定（Claude 引導，Google Cloud 部分）

- [ ] **Step 1:** 引導使用者建立 Google Cloud 專案、啟用 Google Sheets API
- [ ] **Step 2:** 建立 service account、下載金鑰 JSON，存到 `記帳系統/secrets/service-account.json`
- [ ] **Step 3:** 建立 Google Sheet「記帳」，第一列放入標題 `Date | Amount | Category | Note | RecordedAt`，工作表命名 `Expenses`；把試算表分享給 service account email（編輯者）
- [ ] **Step 4:** 把 Sheet ID 記到 plan 執行記錄（不需入 git）

### Task 1: 專案骨架

**Files:**
- Create: `記帳系統/.gitignore`、`README.md`、`scripts/requirements.txt`
- 執行: `git init`

- [ ] **Step 1:** `git init` 於 `/Users/apple/isis/wiki/投資理財/記帳系統/`
- [ ] **Step 2:** `.gitignore` 內容：`secrets/`、`__pycache__/`、`.env`、`*.pyc`
- [ ] **Step 3:** `scripts/requirements.txt`：`google-api-python-client`、`google-auth`
- [ ] **Step 4:** 安裝：`pip install -r scripts/requirements.txt`（裝到系統 python3 或 venv，葛斯呼叫時用同一個 python）
- [ ] **Step 5:** Commit

### Task 2: Sheets 寫入腳本（TDD）

**Files:**
- Create: `scripts/append_expense.py`（主程式）、`scripts/test_append_expense.py`（單元測試，mock Google API）

**Interfaces:**
- `python3 scripts/append_expense.py --amount 400 --category 餐食 --note 午餐 --date 2026-09-22`
- 環境變數：`GOOGLE_APPLICATION_CREDENTIALS=secrets/service-account.json`、`EXPENSE_SHEET_ID=<sheet id>`
- 成功：exit 0；失敗：exit 1 + stderr 錯誤訊息

- [ ] **Step 1:** 寫失敗的測試：驗證參數解析（金額必須 > 0、分類必須在 11 個清單內）、寫入列的欄位順序與格式（Date YYYY-MM-DD、RecordedAt 台北時區 ISO 8601）
- [ ] **Step 2:** 執行測試確認 FAIL
- [ ] **Step 3:** 實作 `append_expense.py`（argparse + google-auth + sheets values.append，range `Expenses!A:E`，valueInputOption `USER_ENTERED`）
- [ ] **Step 4:** 測試 PASS 後 commit
- [ ] **Step 5:** 冒煙測試：對真實試算表寫入一筆測試資料（金額 1、分類 其他、備註 test），讓使用者確認 Sheets 上有出現，之後在 Sheets 手動刪除

### Task 3: 葛斯記帳 skill

**Files:**
- Create: `skills/記帳/SKILL.md`（本專案內維護源碼）
- Install: 複製到 `~/.hermes/profiles/gus/skills/記帳/`

**SKILL.md 必須寫明（給葛斯的行為準則）：**
1. 觸發條件：訊息來自記帳討論串 `1551881517838635018`（或該串的 session），格式為「數字開頭」
2. 解析：第一個數字=金額（>0），其餘=備註；解析失敗（金額 ≤ 0 或非數字）→ 不動作
3. 分類：依備註語意對應 11 分類；無法判斷→`其他`。常見對照範例表（早餐/午餐/晚餐→餐食；手搖/咖啡/飲料→飲料；計程車/公車/捷運/高鐵→交通…）
4. 動作：呼叫 `python3 <絕對路徑>/scripts/append_expense.py --amount N --category C --note "..." --date 今天`（date 用台北時區）
5. 成功後：簡短確認（例：`✅ 400｜餐食｜午餐`）；失敗：回報錯誤訊息
6. 非記帳訊息（非數字開頭）：完全忽略，不回應
7. 葛斯的日常對話人格與其他功能不受此 skill 影響（skill 只在記帳討論串生效）

- [ ] **Step 1:** 寫 SKILL.md（含上述 7 點與 frontmatter：name、description）
- [ ] **Step 2:** 複製到 `~/.hermes/profiles/gus/skills/記帳/`
- [ ] **Step 3:** Commit

### Task 4: 葛斯設定與重啟

- [ ] **Step 1:** 確認 `~/.hermes/profiles/gus/.env` 的 `DISCORD_ALLOWED_USERS=726789604459544599` 已涵蓋 Hann（已存在，僅確認）
- [ ] **Step 2:** 確認 Message Content Intent 在 Discord Developer Portal 已開（葛斯目前能讀訊息，應已開啟，僅確認）
- [ ] **Step 3:** 討論串權限：確認 thread `1551881517838635018` 的訊息能到達葛斯——thread 內 bot 回過話或 thread 設為 free-response。做法：把 thread ID 加入 `hermes config set discord.free_response_channels '956840925689155614,1551881517838635018' --profile gus`（沿用既有值再附加）
  - 注意：`free_response_channels` 會讓該串所有訊息都進葛斯的 agent 流程（即 skill 中的「忽略」規則負責過濾非記帳訊息）
- [ ] **Step 4:** 確認 `DISCORD_REACTIONS` 維持預設 true（✅/❌ 反饋）
- [ ] **Step 5:** 重啟：`launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-gus`
- [ ] **Step 6:** 驗證 gateway 回連：讀 `~/.hermes/profiles/gus/gateway_state.json` 確認 `platforms/discord/state = connected`

### Task 5: 端到端驗收（使用者執行，Claude 在旁確認）

- [ ] **Step 1:** 使用者在記帳討論串打 `400 午餐` → 期望：訊息出現 👀→✅，葛斯簡短確認，Sheets 出現一列
- [ ] **Step 2:** 使用者打非記帳訊息（如 `今天好累`）→ 期望：不記帳、無異常回覆（gateway reactions 仍會出現，屬已知可接受）
- [ ] **Step 3:** 使用者打 `350 大稻埕咖啡廳` → 期望：分類為`餐食`或`飲料`（AI 判斷，使用者認可即可）
- [ ] **Step 4:** 使用者打開 Sheets 核對三筆欄位格式
- [ ] **Step 5:** 全部通過後：Phase A 完成，更新 HANDOFF.md 狀態

---

## Phase B — GitHub Pages 視覺化（等 Phase A 累積真實資料後執行）

### Task 6: 前端骨架

**Files:**
- Create: `web/index.html`、`web/app.js`、`web/style.css`

- [ ] **Step 1:** 純靜態頁面，瀏覽器端用唯讀 API key 呼叫 Sheets API 讀 `Expenses` 資料
- [ ] **Step 2:** 圖表：本月支出總額、分類佔比（圓餅）、近 30 天趨勢（折線）；UI 風格配合靈境暖粉玫瑰漸層
- [ ] **Step 3:** 不做密碼保護；網址不公開分享

### Task 7: 財務目標估算器

- [ ] **Step 1:** 「現況基準」= Sheets 實際資料的月平均；「理想情境」= 使用者在前端輸入的月支出假設
- [ ] **Step 2:** 台灣綜所稅級距速算（不含扣除額）；通膨固定可調，預設 2%
- [ ] **Step 3:** 使用者輸入預估月收入 → 顯示「賺多少才能維持理想生活」試算

### Task 8: 部署

- [ ] **Step 1:** 建 GitHub repo（帳號 `itshanyu`），push `web/`
- [ ] **Step 2:** 啟用 GitHub Pages（使用者熟悉的流程，如 sleep-dashboard）
- [ ] **Step 3:** 使用者開頁面驗收圖表與試算
