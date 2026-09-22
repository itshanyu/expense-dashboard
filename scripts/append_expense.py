#!/usr/bin/env python3
"""記帳：寫入一筆支出到 Google Sheets。

用法：
  append_expense.py --amount 400 --category 餐食 --note "午餐" --date 2026-09-22

環境變數：
  GOOGLE_APPLICATION_CREDENTIALS  service account JSON 絕對路徑
  EXPENSE_SHEET_ID                記帳試算表 ID

成功 exit 0；失敗 exit 1 並輸出錯誤到 stderr。
"""

import argparse
import sys
from datetime import datetime, timezone, timedelta

CATEGORIES = [
    "餐食", "飲料", "交通", "旅遊", "娛樂", "購物",
    "學習", "醫療", "保險", "稅務", "其他",
]

TAIPEI = timezone(timedelta(hours=8))

SHEET_RANGE = "Expenses!A:E"


def validate_amount(value: str) -> float:
    """金額必須是 > 0 的數字，否則 raises argparse.ArgumentTypeError。"""
    try:
        amount = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"金額必須是數字，收到：{value!r}")
    if amount <= 0:
        raise argparse.ArgumentTypeError(f"金額必須 > 0，收到：{amount}")
    return amount


def validate_category(value: str) -> str:
    if value not in CATEGORIES:
        raise argparse.ArgumentTypeError(
            f"分類必須是 {CATEGORIES} 其中之一，收到：{value!r}"
        )
    return value


def validate_date(value: str) -> str:
    """日期必須是 YYYY-MM-DD，否則 raises。"""
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise argparse.ArgumentTypeError(f"日期格式必須是 YYYY-MM-DD，收到：{value!r}")
    return value


def build_row(amount: float, category: str, note: str, date: str,
              recorded_at: str | None = None) -> list:
    """組出一列資料，欄位順序固定：Date | Amount | Category | Note | RecordedAt"""
    if amount <= 0:
        raise ValueError(f"金額必須 > 0，收到：{amount}")
    if category not in CATEGORIES:
        raise ValueError(f"分類不在清單中：{category!r}")
    if recorded_at is None:
        recorded_at = datetime.now(TAIPEI).isoformat(timespec="seconds")
    return [date, amount, category, note, recorded_at]


def append_row(row: list) -> None:
    """呼叫 Google Sheets API 寫入一列。缺環境變數或 API 失敗都會 raise。"""
    import os

    sheet_id = os.environ.get("EXPENSE_SHEET_ID")
    if not sheet_id:
        raise RuntimeError("EXPENSE_SHEET_ID 環境變數未設定")
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS 環境變數未設定")

    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds = service_account.Credentials.from_service_account_file(
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"],
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    service = build("sheets", "v4", credentials=creds)
    service.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=SHEET_RANGE,
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute()


def main() -> int:
    parser = argparse.ArgumentParser(description="寫入一筆支出到 Google Sheets")
    parser.add_argument("--amount", required=True, type=validate_amount, help="金額（>0）")
    parser.add_argument("--category", required=True, type=validate_category, help="分類（11 選 1）")
    parser.add_argument("--note", default="", help="備註")
    parser.add_argument("--date", required=True, type=validate_date, help="日期 YYYY-MM-DD")
    parser.add_argument("--recorded-at", default=None, help=argparse.SUPPRESS)  # 測試用
    args = parser.parse_args()

    try:
        row = build_row(args.amount, args.category, args.note, args.date, args.recorded_at)
        append_row(row)
    except Exception as exc:  # noqa: BLE001 — 腳本頂層統一錯誤出口
        print(f"記帳失敗：{exc}", file=sys.stderr)
        return 1
    print(f"已寫入：{row[0]}｜{row[1]}｜{row[2]}｜{row[3]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
