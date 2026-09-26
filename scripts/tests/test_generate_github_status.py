import datetime
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from scripts.generate_github_status import (
    DocIssue,
    GitHubCliError,
    TasksIndex,
    fetch_issues,
    fetch_prs,
    format_criteria_progress,
    generate_status_markdown,
    is_later_issue,
    parse_docs_issues,
    parse_tasks_md,
    run_gh_command,
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

        # Issue 80 は doc_map にて "将来トリガー待ち" のため Later
        self.assertTrue(is_later_issue(80, [], doc_map))
        # later ラベル付きは Later
        self.assertTrue(is_later_issue(999, ["later"], {}))
        # future-triggered ラベル付きは Later
        self.assertTrue(is_later_issue(998, ["future-triggered"], {}))
        # 通常の Issue は Active (False)
        self.assertFalse(is_later_issue(73, ["test"], doc_map))
        self.assertFalse(is_later_issue(100, ["enhancement"], {}))

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

    @patch("subprocess.run")
    def test_run_gh_command_failure_raises_github_cli_error(self, mock_run: MagicMock) -> None:
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1, cmd=["gh", "issue", "list"], stderr="HTTP 401: Requires authentication"
        )
        with self.assertRaises(GitHubCliError) as ctx:
            run_gh_command(["issue", "list"], self.repo_root)
        self.assertIn("exit code 1", str(ctx.exception))
        self.assertIn("HTTP 401", str(ctx.exception))

    @patch("subprocess.run")
    def test_run_gh_command_file_not_found_raises_github_cli_error(self, mock_run: MagicMock) -> None:
        mock_run.side_effect = FileNotFoundError("No such file or directory: 'gh'")
        with self.assertRaises(GitHubCliError) as ctx:
            run_gh_command(["pr", "list"], self.repo_root)
        self.assertIn("not installed or not in PATH", str(ctx.exception))

    @patch("subprocess.run")
    def test_generate_status_markdown_fails_on_gh_error_without_outputting_zero_status(
        self, mock_run: MagicMock
    ) -> None:
        # GitHub CLI 呼び出しが失敗したとき、0件メッセージで成功完了せず GitHubCliError が送出されること
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1, cmd=["gh", "pr", "list"], stderr="API rate limit exceeded"
        )
        with self.assertRaises(GitHubCliError):
            generate_status_markdown(self.repo_root, local_only=False)

    @patch("subprocess.run")
    def test_generate_status_markdown_success_with_zero_items_produces_empty_message(
        self, mock_run: MagicMock
    ) -> None:
        # GitHub CLI 呼び出しが成功して 0 件（[]）の場合は正常に「ありません」と表示されること
        mock_run.return_value = MagicMock(stdout="[]", returncode=0)
        fixed_time = datetime.datetime(2026, 9, 25, 12, 0, 0, tzinfo=datetime.timezone.utc)
        md = generate_status_markdown(self.repo_root, local_only=False, now=fixed_time)

        self.assertIn("オープン中の PR はありません。", md)
        self.assertIn("現在アクティブなオープン Issue はありません。", md)

    @patch("scripts.generate_github_status.run_gh_command")
    def test_fetch_prs_default_and_custom_limit(self, mock_run_gh: MagicMock) -> None:
        mock_run_gh.return_value = []
        # default limit: 100
        fetch_prs(self.repo_root, local_only=False)
        mock_run_gh.assert_called_once()
        args = mock_run_gh.call_args[0][0]
        self.assertIn("--limit", args)
        self.assertEqual(args[args.index("--limit") + 1], "100")

        # custom limit: 50
        mock_run_gh.reset_mock()
        fetch_prs(self.repo_root, local_only=False, limit=50)
        mock_run_gh.assert_called_once()
        args = mock_run_gh.call_args[0][0]
        self.assertIn("--limit", args)
        self.assertEqual(args[args.index("--limit") + 1], "50")

        # local_only: True
        mock_run_gh.reset_mock()
        res = fetch_prs(self.repo_root, local_only=True)
        self.assertEqual(res, [])
        mock_run_gh.assert_not_called()

    @patch("scripts.generate_github_status.run_gh_command")
    def test_fetch_issues_default_and_custom_limit(self, mock_run_gh: MagicMock) -> None:
        mock_run_gh.return_value = []
        # default limit: 100
        fetch_issues(self.repo_root, local_only=False)
        mock_run_gh.assert_called_once()
        args = mock_run_gh.call_args[0][0]
        self.assertIn("--limit", args)
        self.assertEqual(args[args.index("--limit") + 1], "100")

        # custom limit: 30
        mock_run_gh.reset_mock()
        fetch_issues(self.repo_root, local_only=False, limit=30)
        mock_run_gh.assert_called_once()
        args = mock_run_gh.call_args[0][0]
        self.assertIn("--limit", args)
        self.assertEqual(args[args.index("--limit") + 1], "30")

        # local_only: True
        mock_run_gh.reset_mock()
        res = fetch_issues(self.repo_root, local_only=True)
        self.assertEqual(res, [])
        mock_run_gh.assert_not_called()

    @patch("scripts.generate_github_status.fetch_issues")
    @patch("scripts.generate_github_status.fetch_prs")
    def test_generate_status_markdown_passes_custom_limits(
        self, mock_fetch_prs: MagicMock, mock_fetch_issues: MagicMock
    ) -> None:
        mock_fetch_prs.return_value = []
        mock_fetch_issues.return_value = []
        generate_status_markdown(
            self.repo_root,
            local_only=False,
            pr_limit=42,
            issue_limit=84,
        )
        mock_fetch_prs.assert_called_once_with(self.repo_root, False, limit=42)
        mock_fetch_issues.assert_called_once_with(self.repo_root, False, limit=84)

    def test_parse_docs_issues_safe_doc_id_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            issues_dir = tmp_root / "docs" / "issues"
            issues_dir.mkdir(parents=True)

            # ハイフンが1つしかないファイル名（内部ドキュメントIDヘッダーなし）
            single_dash_file = issues_dir / "issue-single.md"
            single_dash_file.write_text("# [Test] Single dash\n", encoding="utf-8")

            # 通常の2ハイフンファイル名
            normal_file = issues_dir / "issue-99-feature.md"
            normal_file.write_text("# [Test] Normal\n", encoding="utf-8")

            parsed = parse_docs_issues(tmp_root)
            self.assertEqual(len(parsed), 2)

            by_stem = {p.title: p.doc_id for p in parsed}
            self.assertEqual(by_stem["[Test] Single dash"], "issue-single")
            self.assertEqual(by_stem["[Test] Normal"], "issue-99")

    def test_parse_docs_issues_checkboxes_limited_to_acceptance_criteria(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            issues_dir = tmp_root / "docs" / "issues"
            issues_dir.mkdir(parents=True)

            sample_issue = issues_dir / "issue-98-sample.md"
            sample_content = """# [Test] Scoped Checkboxes
- **内部ドキュメントID**: issue-98
- **対応 GitHub Issue**: GitHub Issue #98
- **ステータス**: 進行中

## 検討メモ（受入基準外）
- [ ] 検討事項A（カウントされないべき）
- [x] 検討事項B（カウントされないべき）

## 受入基準
- [x] 正式な受入基準1
- [ ] 正式な受入基準2

## その他のメモ
- [ ] 追加メモ（カウントされないべき）
"""
            sample_issue.write_text(sample_content, encoding="utf-8")

            parsed = parse_docs_issues(tmp_root)
            self.assertEqual(len(parsed), 1)
            doc = parsed[0]
            # 受入基準内の2件のみがカウントされるべき（完了1, 総数2）
            self.assertEqual(doc.total_criteria, 2)
            self.assertEqual(doc.completed_criteria, 1)


if __name__ == "__main__":
    unittest.main()
