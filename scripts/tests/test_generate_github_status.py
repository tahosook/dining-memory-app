from __future__ import annotations

import datetime
import unittest
from pathlib import Path

from scripts.generate_github_status import (
    DocIssue,
    TasksIndex,
    format_criteria_progress,
    generate_status_markdown,
    is_later_issue,
    parse_docs_issues,
    parse_tasks_md,
)


class GenerateGitHubStatusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo_root = Path(__file__).resolve().parent.parent.parent

    def test_parse_tasks_md(self) -> None:
        tasks = parse_tasks_md(self.repo_root)
        self.assertIsInstance(tasks, TasksIndex)
        self.assertGreater(len(tasks.now_items), 0)
        self.assertGreater(len(tasks.next_items), 0)
        self.assertGreater(len(tasks.later_items), 0)
        self.assertTrue(any("AI" in item for item in tasks.now_items))

    def test_parse_docs_issues(self) -> None:
        issues = parse_docs_issues(self.repo_root)
        self.assertGreater(len(issues), 0)

        issue_01 = next((i for i in issues if i.doc_id == "issue-01"), None)
        self.assertIsNotNone(issue_01)
        assert issue_01 is not None
        self.assertEqual(issue_01.github_issue_num, 73)
        self.assertIn("完了", issue_01.status)
        self.assertEqual(issue_01.total_criteria, 4)
        self.assertEqual(issue_01.completed_criteria, 4)

        issue_08 = next((i for i in issues if i.doc_id == "issue-08"), None)
        self.assertIsNotNone(issue_08)
        assert issue_08 is not None
        self.assertEqual(issue_08.github_issue_num, 80)
        self.assertIn("将来トリガー待ち", issue_08.status)
        self.assertEqual(issue_08.completed_criteria, 0)
        self.assertGreater(issue_08.total_criteria, 0)

    def test_is_later_issue(self) -> None:
        doc_map = {
            80: DocIssue(
                doc_id="issue-08",
                github_issue_str="GitHub Issue #80",
                github_issue_num=80,
                status="将来トリガー待ち評価 (Later / Future-triggered)",
                title="Keyset pagination",
                rel_path="docs/issues/issue-08-keyset-cursor-pagination.md",
            ),
            73: DocIssue(
                doc_id="issue-01",
                github_issue_str="GitHub Issue #73",
                github_issue_num=73,
                status="完了 (Closed)",
                title="Jest config",
                rel_path="docs/issues/issue-01-jest-config-cleanup.md",
            ),
        }

        # Issue 80 は Later
        self.assertTrue(is_later_issue(80, "Keyset pagination", [], doc_map))
        # later ラベル付きは Later
        self.assertTrue(is_later_issue(999, "Some task", ["later"], {}))
        # future-triggered ラベル付きは Later
        self.assertTrue(is_later_issue(998, "Another task", ["future-triggered"], {}))
        # 通常の Issue は Active (False)
        self.assertFalse(is_later_issue(73, "Jest config", ["test"], doc_map))
        self.assertFalse(is_later_issue(100, "Normal feature", ["enhancement"], {}))

    def test_format_criteria_progress(self) -> None:
        doc_done = DocIssue(
            doc_id="test",
            github_issue_str="#1",
            github_issue_num=1,
            status="done",
            title="t",
            rel_path="p",
            total_criteria=4,
            completed_criteria=3,
        )
        self.assertEqual(format_criteria_progress(doc_done), "3/4 (75%)")

        doc_empty = DocIssue(
            doc_id="test",
            github_issue_str="#1",
            github_issue_num=1,
            status="done",
            title="t",
            rel_path="p",
            total_criteria=0,
            completed_criteria=0,
        )
        self.assertEqual(format_criteria_progress(doc_empty), "-")

    def test_generate_status_markdown_structure(self) -> None:
        fixed_time = datetime.datetime(2026, 9, 25, 12, 0, 0, tzinfo=datetime.timezone.utc)
        md = generate_status_markdown(self.repo_root, local_only=True, now=fixed_time)

        self.assertIn("# Dining Memory App - Project & GitHub Status", md)
        self.assertIn("## 🎯 直近の開発優先度 (TASKS.md)", md)
        self.assertIn("### Now（直近の調査・評価候補）", md)
        self.assertIn("### Next（次期検討候補）", md)
        self.assertIn("## 📌 オープン中の Pull Requests", md)
        self.assertIn("## 📋 オープン中の GitHub Issues", md)
        self.assertIn("### 🚀 Active Issues", md)
        self.assertIn("### ⏳ Later / Future-triggered（将来トリガー待ち）", md)
        self.assertIn("## 📑 仕様・受入基準ドキュメント (docs/issues/) 一覧", md)
        self.assertIn("| [`issue-01`](docs/issues/issue-01-jest-config-cleanup.md) | #73 |", md)
        self.assertIn("| [`issue-08`](docs/issues/issue-08-keyset-cursor-pagination.md) | #80 |", md)


if __name__ == "__main__":
    unittest.main()
