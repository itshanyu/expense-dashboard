#!/usr/bin/env python3
"""把 Google Sheets 的記帳資料匯出成 web/data.json 快照。

公開版（privacy 模式）：data.json 只含「統計摘要」，不含任何單筆明細、
備註或確切日期——安全放到 GitHub Pages 上給公眾瀏覽。

  --full  本機模式：含完整單筆明細（絕對不要把 --full 的輸出 push 上公開 repo）

用法：
  GOOGLE_APPLICATION_CREDENTIALS=... EXPENSE_SHEET_ID=... \
    venv/bin/python scripts/export_snapshot.py            # 公開摘要版（預設）
  venv/bin/python scripts/export_snapshot.py --full       # 完整版（僅本機）
"""

import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

TAIPEI = timezone(timedelta(hours=8))
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "web" / "data.json"


def fetch_records() -> list:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    sheet_id = os.environ.get("EXPENSE_SHEET_ID")
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not sheet_id or not creds_path:
        raise RuntimeError("需要 EXPENSE_SHEET_ID 與 GOOGLE_APPLICATION_CREDENTIALS")

    creds = service_account.Credentials.from_service_account_file(
        creds_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    svc = build("sheets", "v4", credentials=creds)
    rows = svc.spreadsheets().values().get(
        spreadsheetId=sheet_id, range="Expenses!A:E").execute().get("values", [])

    records = []
    for row in rows[1:]:  # 跳過標題列
        if len(row) < 3:
            continue
        try:
            amount = float(row[1])
        except (ValueError, TypeError):
            continue
        records.append({
            "date": str(row[0]),
            "amount": amount,
            "category": row[2],
            "note": row[3] if len(row) > 3 else "",
        })
    return records


def build_summary(records: list) -> dict:
    """統計摘要：只有月總額、月×分類、日總額。無備註、無單筆、無 RecordedAt。"""
    by_month = defaultdict(float)
    by_month_cat = defaultdict(lambda: defaultdict(float))
    by_day = defaultdict(float)  # YYYY-MM-DD → 當日總額（趨勢圖用，不含明細）

    for r in records:
        if not len(r["date"]) >= 7:
            continue
        m = r["date"][:7]
        by_month[m] += r["amount"]
        by_month_cat[m][r["category"]] += r["amount"]
        by_day[r["date"][:10]] += r["amount"]

    return {
        "mode": "summary",
        "byMonth": {m: round(v, 2) for m, v in sorted(by_month.items())},
        "byMonthCategory": {m: {c: round(v, 2) for c, v in sorted(cats.items())}
                            for m, cats in sorted(by_month_cat.items())},
        "byDay": {d: round(v, 2) for d, v in sorted(by_day.items())},
    }


def build_full(records: list) -> dict:
    """完整版：含單筆明細與備註，只供本機使用。"""
    return {
        "mode": "full",
        "records": [
            {"date": r["date"], "amount": r["amount"], "category": r["category"], "note": r["note"]}
            for r in records
        ],
    }


def fetch_assets() -> list:
    """讀 Assets 頁籤（資產日快照）。頁籤不存在視為沒有資料。"""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    sheet_id = os.environ.get("EXPENSE_SHEET_ID")
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not sheet_id or not creds_path:
        return []
    creds = service_account.Credentials.from_service_account_file(
        creds_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    svc = build("sheets", "v4", credentials=creds)
    meta = svc.spreadsheets().get(spreadsheetId=sheet_id).execute()
    if not any(s["properties"]["title"] == "Assets" for s in meta["sheets"]):
        return []
    rows = svc.spreadsheets().values().get(
        spreadsheetId=sheet_id, range="Assets!A:F").execute().get("values", [])
    out = []
    for row in rows[1:]:
        if len(row) < 3:
            continue
        try:
            out.append({
                "date": str(row[0]),
                "time": str(row[1]) if len(row) > 1 else "",
                "marketValue": float(row[2]),
                "cost": float(row[3]) if len(row) > 3 else None,
                "totalPnl": float(row[4]) if len(row) > 4 else None,
                "todayPnl": float(row[5]) if len(row) > 5 else None,
            })
        except (ValueError, TypeError):
            continue
    return out


def build_asset_index(assets: list) -> dict:
    """指數化資產曲線：第一天＝100。公開版不含任何實際金額。

    同日多筆取最後一筆；base 取第一天。
    """
    if not assets:
        return {}
    by_day = {}
    for a in assets:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", a["date"]):
            continue
        by_day[a["date"]] = a["marketValue"]
    days = sorted(by_day)
    base = by_day[days[0]]
    if not base:
        return {}
    return {
        "base": days[0],
        "index": {d: round(v / base * 100, 2) for d, v in by_day.items()},
    }


def build_asset_return(assets: list) -> dict:
    """方舟持股報酬率。公開版只放「比例與日期」，不含任何金額（隱私設計）。

    - cumulative：最新一筆的累積損益 ÷ 總成本（方舟「全部庫存」頁口徑，台股）
    - annualizedIndex：由指數化市值序列年化；含後續加碼資金進出，會高估，僅供參考
    """
    valid = [a for a in assets if re.match(r"^\d{4}-\d{2}-\d{2}$", a["date"])]
    if not valid:
        return {}
    valid.sort(key=lambda a: a["date"])
    last = valid[-1]
    out = {"asOf": last["date"]}
    if last.get("totalPnl") is not None and last.get("cost"):
        out["cumulative"] = round(last["totalPnl"] / last["cost"], 4)

    by_day = {}
    for a in valid:
        by_day[a["date"]] = a["marketValue"]
    days = sorted(by_day)
    span = (date.fromisoformat(days[-1]) - date.fromisoformat(days[0])).days
    if span >= 60 and by_day[days[0]]:
        out["annualizedIndex"] = round(
            (by_day[days[-1]] / by_day[days[0]]) ** (365 / span) - 1, 4)
        out["indexDays"] = span
    return out


def main() -> int:
    full = "--full" in sys.argv
    try:
        records = fetch_records()
        assets = fetch_assets()
    except Exception as exc:  # noqa: BLE001
        print(f"匯出失敗：{exc}", file=sys.stderr)
        return 1

    snapshot = {
        "generatedAt": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "count": len(records),
        **(build_full(records) if full else build_summary(records)),
    }
    idx = build_asset_index(assets)
    if idx:
        snapshot["assetIndex"] = idx  # 曲線一律指數化：公開版與本機版都不含實際金額
    ret = build_asset_return(assets)
    if ret:
        snapshot["assetReturn"] = ret  # 只有比例與日期，無金額
    OUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
    mode = "完整版（本機）" if full else "摘要版（公開安全）"
    print(f"已匯出 {len(records)} 筆（{mode}）→ {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
