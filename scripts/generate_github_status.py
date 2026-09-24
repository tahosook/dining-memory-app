#!/usr/bin/env python3
"""Generate status Markdown by synthesizing repository docs and GitHub CLI state.

This script implements the Three-Tier Issue & Task Tracking Model defined in
docs/engineering/development-workflow.md:
1. Candidate Index: TASKS.md (Now, Next, Later)
2. Specification & Acceptance Criteria: docs/issues/issue-*.md
3. Ticket Lifecycle & Automation: GitHub Issues (Active vs Later / Future-triggered)
"""

from __future__ import annotations

import argparse
import datetime
import glob
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class DocIssue:
    doc_id: str
    github_issue_str: str
    github_issue_num: int | None
    status: str
    title: str
    rel_path: str
    total_criteria: int = 0
    completed_criteria: int = 0
    overview: str = ""


@dataclass
class TasksIndex:
    now_items: list[str] = field(default_factory=list)
    next_items: list[str] = field(default_factory=list)
    later_items: list[str] = field(default_factory=list)


def parse_tasks_md(repo_root: Path) -> TasksIndex:
    tasks_file = repo_root / "TASKS.md"
    if not tasks_file.is_file():
        return TasksIndex()

    content = tasks_file.read_text(encoding="utf-8")
    index = TasksIndex()

    current_section = None
    for line in content.splitlines():
        line_stripped = line.strip()
        if line_stripped.startswith("## Now"):
            current_section = "now"
            continue
        elif line_stripped.startswith("## Next"):
            current_section = "next"
            continue
        elif line_stripped.startswith("## Later"):
            current_section = "later"
            continue
        elif line_stripped.startswith("## Done"):
            current_section = "done"
            continue
        elif line_stripped.startswith("## "):
            current_section = None
            continue

        if current_section and line_stripped.startswith("- "):
            item = line_stripped[2:].strip()
            if current_section == "now":
                index.now_items.append(item)
            elif current_section == "next":
                index.next_items.append(item)
            elif current_section == "later":
                index.later_items.append(item)

    return index


def parse_docs_issues(repo_root: Path) -> list[DocIssue]:
    issues_dir = repo_root / "docs" / "issues"
    if not issues_dir.is_dir():
        return []

    issue_files = sorted(glob.glob(str(issues_dir / "issue-*.md")))
    results: list[DocIssue] = []

    for file_path_str in issue_files:
        path = Path(file_path_str)
        content = path.read_text(encoding="utf-8")

        # 内部ドキュメントID
        doc_id_match = re.search(r"-\s+\*\*内部ドキュメントID\*\*:\s*([^\n]+)", content)
        doc_id = doc_id_match.group(1).strip() if doc_id_match else path.stem.split("-", 2)[0] + "-" + path.stem.split("-", 2)[1]

        # 対応 GitHub Issue
        gh_match = re.search(r"-\s+\*\*対応 GitHub Issue\*\*:\s*([^\n]+)", content)
        gh_str = gh_match.group(1).strip() if gh_match else "未起票"

        gh_num = None
        gh_num_match = re.search(r"#(\d+)", gh_str)
        if gh_num_match:
            gh_num = int(gh_num_match.group(1))

        # ステータス
        status_match = re.search(r"-\s+\*\*ステータス\*\*:\s*([^\n]+)", content)
        status = status_match.group(1).strip() if status_match else "未設定"

        # タイトル (H1)
        title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else path.stem

        # 受入基準チェックボックスの集計
        completed = len(re.findall(r"-\s+\[x\]", content, re.IGNORECASE))
        uncompleted = len(re.findall(r"-\s+\[\s\]", content))
        total = completed + uncompleted

        # 概要または目的
        overview = ""
        overview_match = re.search(r"## (?:概要|目的)\n(.*?)(?=\n## |\Z)", content, re.DOTALL)
        if overview_match:
            first_line = overview_match.group(1).strip().splitlines()[0].strip()
            overview = first_line

        rel_path = f"docs/issues/{path.name}"
        results.append(
            DocIssue(
                doc_id=doc_id,
                github_issue_str=gh_str,
                github_issue_num=gh_num,
                status=status,
                title=title,
                rel_path=rel_path,
                total_criteria=total,
                completed_criteria=completed,
                overview=overview,
            )
        )

    return results


class GitHubCliError(RuntimeError):
    """Raised when GitHub CLI execution fails or returns invalid output."""


def run_gh_command(args: list[str], repo_root: Path) -> list[dict[str, Any]]:
    repo_env = os.environ.get("GITHUB_REPOSITORY")
    cmd = ["gh"] + args
    if repo_env and "--repo" not in args:
        cmd.extend(["--repo", repo_env])

    try:
        result = subprocess.run(
            cmd,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise GitHubCliError(f"GitHub CLI ('gh') is not installed or not in PATH: {exc}") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else "(no stderr output)"
        raise GitHubCliError(
            f"GitHub CLI command failed with exit code {exc.returncode}: {' '.join(cmd)}\nStderr: {stderr}"
        ) from exc

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise GitHubCliError(f"Failed to parse JSON from GitHub CLI output: {exc}") from exc

    if not isinstance(data, list):
        raise GitHubCliError(f"Expected JSON list from GitHub CLI, got {type(data).__name__}")

    return data


def fetch_prs(repo_root: Path, local_only: bool) -> list[dict[str, Any]]:
    if local_only:
        return []
    return run_gh_command(
        ["pr", "list", "--state", "open", "--limit", "20", "--json", "number,title,author,headRefName,updatedAt"],
        repo_root,
    )


def fetch_issues(repo_root: Path, local_only: bool) -> list[dict[str, Any]]:
    if local_only:
        return []
    return run_gh_command(
        ["issue", "list", "--state", "open", "--limit", "30", "--json", "number,title,labels,body"],
        repo_root,
    )


def is_later_issue(issue_num: int, title: str, labels: list[str], doc_map: dict[int, DocIssue]) -> bool:
    # 1. labels に later / future-triggered があるか
    lower_labels = [l.lower() for l in labels]
    if any(k in lower_labels for k in ["later", "future-triggered", "future"]):
        return True

    # 2. 内部仕様ドキュメントのステータスが Later / 将来トリガー待ち か
    doc = doc_map.get(issue_num)
    if doc and ("将来トリガー待ち" in doc.status or "Later" in doc.status):
        return True

    # 3. タイトルに Later / 将来トリガー があるか
    if "将来トリガー" in title or "Later" in title:
        return True

    # 4. Issue #80, #81 は既知の Later イシュー
    if issue_num in (80, 81):
        return True

    return False


def format_criteria_progress(doc: DocIssue) -> str:
    if doc.total_criteria == 0:
        return "-"
    pct = int((doc.completed_criteria / doc.total_criteria) * 100)
    return f"{doc.completed_criteria}/{doc.total_criteria} ({pct}%)"


def generate_status_markdown(
    repo_root: Path,
    local_only: bool = False,
    now: datetime.datetime | None = None,
) -> str:
    if now is None:
        # JST (UTC+9)
        jst = datetime.timezone(datetime.timedelta(hours=9))
        now = datetime.datetime.now(jst)
    time_str = now.strftime("%Y-%m-%d %H:%M:%S JST")

    tasks = parse_tasks_md(repo_root)
    doc_issues = parse_docs_issues(repo_root)
    doc_map: dict[int, DocIssue] = {
        d.github_issue_num: d for d in doc_issues if d.github_issue_num is not None
    }

    prs = fetch_prs(repo_root, local_only)
    gh_issues = fetch_issues(repo_root, local_only)

    lines: list[str] = []
    lines.append("# Dining Memory App - Project & GitHub Status")
    lines.append(f"最終更新日時: {time_str}")
    lines.append("")

    # 1. TASKS.md 優先度インデックス
    lines.append("## 🎯 直近の開発優先度 (TASKS.md)")
    lines.append("### Now（直近の調査・評価候補）")
    if tasks.now_items:
        for item in tasks.now_items:
            lines.append(f"- {item}")
    else:
        lines.append("- （現在指定された Now 項目はありません）")
    lines.append("")

    lines.append("### Next（次期検討候補）")
    if tasks.next_items:
        for item in tasks.next_items:
            lines.append(f"- {item}")
    else:
        lines.append("- （現在指定された Next 項目はありません）")
    lines.append("")

    # 2. オープン中の PR
    lines.append("## 📌 オープン中の Pull Requests")
    if prs:
        for pr in prs:
            pr_num = pr.get("number")
            pr_title = pr.get("title", "")
            author = pr.get("author", {}).get("login", "unknown")
            branch = pr.get("headRefName", "")
            lines.append(f"- [PR #{pr_num}] {pr_title} (by @{author}, branch: `{branch}`)")
    else:
        lines.append("オープン中の PR はありません。")
    lines.append("")

    # 3. オープン中の GitHub Issues（Active vs Later）
    lines.append("## 📋 オープン中の GitHub Issues")

    active_issues: list[dict[str, Any]] = []
    later_issues: list[dict[str, Any]] = []

    if gh_issues:
        for issue in gh_issues:
            num = issue.get("number", 0)
            title = issue.get("title", "")
            label_names = [l.get("name", "") for l in issue.get("labels", [])]
            if is_later_issue(num, title, label_names, doc_map):
                later_issues.append(issue)
            else:
                active_issues.append(issue)
    elif local_only:
        # ローカルのみの場合は docs/issues からオープン・将来トリガー待ちのものを展開
        for doc in doc_issues:
            mock_issue = {
                "number": doc.github_issue_num or 0,
                "title": doc.title,
                "labels": [{"name": doc.status}],
                "body": doc.overview,
                "_doc": doc,
            }
            if "将来トリガー待ち" in doc.status or "Later" in doc.status:
                later_issues.append(mock_issue)
            elif "完了" not in doc.status and "Closed" not in doc.status:
                active_issues.append(mock_issue)

    lines.append("### 🚀 Active Issues")
    if active_issues:
        for issue in active_issues:
            num = issue.get("number", 0)
            title = issue.get("title", "")
            labels = [l.get("name", "") for l in issue.get("labels", [])]
            label_str = " ".join([f"`[{lbl}]`" for lbl in labels]) if labels else "`[no label]`"
            doc = doc_map.get(num) or issue.get("_doc")

            lines.append(f"#### [Issue #{num}] {title}")
            lines.append(f"- ラベル: {label_str}")
            if doc:
                progress = format_criteria_progress(doc)
                lines.append(f"- 内部仕様書: [`{doc.doc_id}`]({doc.rel_path}) | 受入基準進捗: **{progress}**")
                if doc.overview:
                    lines.append(f"- 概要: {doc.overview}")
            body = issue.get("body", "").strip()
            # Thin Issue でない場合の補足（最初の2行まで）
            if body and not doc:
                first_lines = "\n".join(body.splitlines()[:2])
                lines.append(f"- 本文抜粋: {first_lines}")
            lines.append("")
    else:
        lines.append("現在アクティブなオープン Issue はありません。")
        lines.append("")

    lines.append("### ⏳ Later / Future-triggered（将来トリガー待ち）")
    if later_issues:
        for issue in later_issues:
            num = issue.get("number", 0)
            title = issue.get("title", "")
            labels = [l.get("name", "") for l in issue.get("labels", [])]
            label_str = " ".join([f"`[{lbl}]`" for lbl in labels]) if labels else "`[later]`"
            doc = doc_map.get(num) or issue.get("_doc")

            lines.append(f"#### [Issue #{num}] {title}")
            lines.append(f"- ラベル: {label_str}")
            if doc:
                lines.append(f"- 内部仕様書: [`{doc.doc_id}`]({doc.rel_path}) (ステータス: {doc.status})")
                if doc.overview:
                    lines.append(f"- トリガー / 概要: {doc.overview}")
            lines.append("")
    else:
        lines.append("将来トリガー待ちの Issue はありません。")
        lines.append("")

    # 4. docs/issues/ 進捗サマリーテーブル
    lines.append("## 📑 仕様・受入基準ドキュメント (docs/issues/) 一覧")
    lines.append("| 内部ID | 対応 GitHub Issue | ステータス | 受入基準進捗 | タイトル |")
    lines.append("| :--- | :--- | :--- | :--- | :--- |")
    for doc in doc_issues:
        gh_display = f"#{doc.github_issue_num}" if doc.github_issue_num else doc.github_issue_str
        progress = format_criteria_progress(doc)
        # Markdown 表内のパイプ文字をエスケープ
        safe_title = doc.title.replace("|", "\\|")
        lines.append(
            f"| [`{doc.doc_id}`]({doc.rel_path}) | {gh_display} | {doc.status} | {progress} | {safe_title} |"
        )
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate status Markdown reflecting Three-Tier Tracking Model."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Path to repository root (defaults to parent of scripts/)",
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Generate status using only repository docs without calling GitHub CLI",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output file path (prints to stdout if not specified)",
    )

    args = parser.parse_args()
    try:
        md_content = generate_status_markdown(args.repo_root, local_only=args.local_only)
    except GitHubCliError as err:
        print(f"[ERROR] Failed to generate status from GitHub CLI:\n{err}", file=sys.stderr)
        return 1

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(md_content, encoding="utf-8")
        print(f"Status markdown written to {args.output}", file=sys.stderr)
    else:
        print(md_content)

    return 0


if __name__ == "__main__":
    sys.exit(main())
