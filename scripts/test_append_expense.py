#!/usr/bin/env python3
"""append_expense.py 的單元測試（不碰網路）。

跑法：venv/bin/python scripts/test_append_expense.py
"""

import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("append_expense", HERE / "append_expense.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class BuildRowTests(unittest.TestCase):
    def test_row_field_order(self):
        row = mod.build_row(400, "餐食", "午餐", "2026-09-22",
                            recorded_at="2026-09-22T12:30:00+08:00")
        self.assertEqual(row, ["2026-09-22", 400, "餐食", "午餐",
                               "2026-09-22T12:30:00+08:00"])

    def test_zero_amount_rejected(self):
        with self.assertRaises(ValueError):
            mod.build_row(0, "餐食", "", "2026-09-22")

    def test_negative_amount_rejected(self):
        with self.assertRaises(ValueError):
            mod.build_row(-5, "餐食", "", "2026-09-22")

    def test_unknown_category_rejected(self):
        with self.assertRaises(ValueError):
            mod.build_row(100, "訂閱", "", "2026-09-22")

    def test_categories_list(self):
        self.assertEqual(mod.CATEGORIES, [
            "餐食", "飲料", "交通", "旅遊", "娛樂", "購物",
            "學習", "醫療", "保險", "稅務", "其他",
        ])

    def test_recorded_at_defaults_to_taipei_time(self):
        row = mod.build_row(50, "飲料", "手搖", "2026-09-22")
        # 台北時區 +08:00
        self.assertTrue(row[4].endswith("+08:00"), row[4])


class CliValidationTests(unittest.TestCase):
    def _parse(self, *argv):
        parser = self._make_parser()
        return parser.parse_args(list(argv))

    def _make_parser(self):
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--amount", type=mod.validate_amount)
        parser.add_argument("--category", type=mod.validate_category)
        parser.add_argument("--date", type=mod.validate_date)
        return parser

    def test_amount_must_be_number(self):
        with self.assertRaises(SystemExit):
            self._parse("--amount", "abc", "--category", "餐食", "--date", "2026-09-22")

    def test_amount_must_be_positive(self):
        with self.assertRaises(SystemExit):
            self._parse("--amount", "0", "--category", "餐食", "--date", "2026-09-22")

    def test_category_must_in_list(self):
        with self.assertRaises(SystemExit):
            self._parse("--amount", "400", "--category", "雜費", "--date", "2026-09-22")

    def test_bad_date_rejected(self):
        with self.assertRaises(SystemExit):
            self._parse("--amount", "400", "--category", "餐食", "--date", "09/22")


class AppendRowEnvTests(unittest.TestCase):
    def test_missing_sheet_id_raises(self):
        env = {"GOOGLE_APPLICATION_CREDENTIALS": "/tmp/x.json"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError):
                mod.append_row(["2026-09-22", 1, "其他", "t", "ts"])

    def test_missing_credentials_raises(self):
        env = {"EXPENSE_SHEET_ID": "abc"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError):
                mod.append_row(["2026-09-22", 1, "其他", "t", "ts"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
