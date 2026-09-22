# 視覺化網頁（Phase B）

純靜態網頁，讀 `data.json` 快照（由 `scripts/export_snapshot.py` 產生）。試算表維持私有，網頁不含任何金鑰。

## 本機預覽

```bash
cd web && python3 -m http.server 8934
# 開 http://localhost:8934
```

## 功能

- 本月支出、日均、月底預估、歷史月均四張卡片
- 分類佔比（本月）、近 30 天趨勢、每月總支出三張圖
- **預估與收入試算器**：理想月支出 × 預估月收入 × 通膨 × 年數
  - 台灣綜所稅級距粗算（不含扣除額）
  - 反推「要過理想生活，稅前月收入需要多少」
  - 判定目前收入撐不撐得起理想情境

## 更新資料

```bash
GOOGLE_APPLICATION_CREDENTIALS=secrets/<金鑰>.json \
EXPENSE_SHEET_ID=<sheet id> \
venv/bin/python scripts/export_snapshot.py
```

## 部署（GitHub Pages）

1. 建 GitHub repo，push 整個專案
2. Settings → Pages → Source 選 GitHub Actions（或 main / web 資料夾）
3. 到 repo Settings → Secrets and variables → Actions，加兩個 secret：
   - `SERVICE_ACCOUNT_JSON`：service account JSON 的完整內容
   - `EXPENSE_SHEET_ID`：試算表 ID
4. `.github/workflows/export-snapshot.yml` 會每天自動重抓資料、commit 新快照，Pages 上的網頁跟著更新
