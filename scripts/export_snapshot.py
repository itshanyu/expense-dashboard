#!/usr/bin/env python3
"""把 Google Sheets 的記帳資料匯出成 web/data.json 快照。

用法：
  GOOGLE_APPLICATION_CREDENTIALS=... EXPENSE_SHEET_ID=... \
    venv/bin/python scripts/export_snapshot.py

讀 Expenses!A:E，輸出 web/data.json（含 generatedAt 台北時間）。
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

TAIPEI = timezone(timedelta(hours=8))
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "web" / "data.json"

HEADERS = ["Date", "Amount", "Category", "Note", "RecordedAt"]


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
        records.append({
            "date": row[0],
            "amount": row[1],
            "category": row[2],
            "note": row[3] if len(row) > 3 else "",
            "recordedAt": row[4] if len(row) > 4 else "",
        })
    return records


def main() -> int:
    try:
        records = fetch_records()
    except Exception as exc:  # noqa: BLE001
        print(f"匯出失敗：{exc}", file=sys.stderr)
        return 1

    snapshot = {
        "generatedAt": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "count": len(records),
        "records": records,
    }
    OUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"已匯出 {len(records)} 筆 → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
