#!/usr/bin/env python3
"""資產快照寫入 Google Sheets「Assets」頁籤（冪等：同一天覆寫）。

用法：
  put_asset_snapshot.py --market-value 503278 --cost 230544 \
      --total-pnl 272735 --today-pnl -4579 [--date 2026-10-08] [--time "14:00"]

欄位：Date | Time | MarketValue | Cost | TotalPnL | TodayPnL
環境變數：GOOGLE_APPLICATION_CREDENTIALS、EXPENSE_SHEET_ID（同記帳系統）

成功 exit 0；失敗 exit 1 並輸出錯誤到 stderr。
"""
import argparse
import sys
from datetime import datetime, timezone, timedelta

TAIPEI = timezone(timedelta(hours=8))
SHEET_RANGE = "Assets!A:F"
HEADER = ["Date", "Time", "MarketValue", "Cost", "TotalPnL", "TodayPnL"]


def validate_date(value: str) -> str:
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise argparse.ArgumentTypeError(f"日期格式必須是 YYYY-MM-DD，收到：{value!r}")
    return value


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market-value", type=float, required=True)
    ap.add_argument("--cost", type=float, required=True)
    ap.add_argument("--total-pnl", type=float, required=True)
    ap.add_argument("--today-pnl", type=float, required=True)
    ap.add_argument("--date", type=validate_date,
                    default=datetime.now(TAIPEI).strftime("%Y-%m-%d"))
    ap.add_argument("--time", default=datetime.now(TAIPEI).strftime("%H:%M"))
    args = ap.parse_args()

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as exc:
        print(f"缺少套件：{exc}", file=sys.stderr)
        return 1

    sheet_id = os.environ.get("EXPENSE_SHEET_ID")
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not sheet_id or not creds_path:
        print("需要 EXPENSE_SHEET_ID 與 GOOGLE_APPLICATION_CREDENTIALS", file=sys.stderr)
        return 1

    try:
        creds = service_account.Credentials.from_service_account_file(
            creds_path, scopes=["https://www.googleapis.com/auth/spreadsheets"])
        svc = build("sheets", "v4", credentials=creds)

        # Assets 頁籤存在嗎？不存在就建（含標題列）
        meta = svc.spreadsheets().get(spreadsheetId=sheet_id).execute()
        titles = [s["properties"]["title"] for s in meta["sheets"]]
        if "Assets" not in titles:
            svc.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body={
                "requests": [{"addSheet": {"properties": {"title": "Assets"}}}]
            }).execute()
            svc.spreadsheets().values().update(
                spreadsheetId=sheet_id, range="Assets!A1",
                valueInputOption="USER_ENTERED",
                body={"values": [HEADER]}).execute()

        existing = svc.spreadsheets().values().get(
            spreadsheetId=sheet_id, range="Assets!A:F").execute().get("values", [])

        row = [args.date, args.time, args.market_value, args.cost,
               args.total_pnl, args.today_pnl]

        # 找同日列（跳過標題）
        target_idx = None
        for i, r in enumerate(existing[1:], start=2):
            if r and str(r[0]) == args.date:
                target_idx = i
                break

        if target_idx:
            svc.spreadsheets().values().update(
                spreadsheetId=sheet_id, range=f"Assets!A{target_idx}",
                valueInputOption="USER_ENTERED", body={"values": [row]}).execute()
            action = f"覆寫第 {target_idx} 列（{args.date} 已有資料）"
        else:
            svc.spreadsheets().values().append(
                spreadsheetId=sheet_id, range="Assets!A:F",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": [row]}).execute()
            action = "新增一列"

        print(f"✅ Assets {action}：{args.date} {args.time} 市值 {args.market_value:,.0f}")
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"寫入失敗：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import os
    sys.exit(main())
