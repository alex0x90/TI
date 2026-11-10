"""Build the static calendar website (GitHub Pages) from reports_by_date/.

Output layout:
    <out>/index.html, app.js, style.css    copied from site/
    <out>/data/manifest.json               {"total", "first", "last", "generated_at", "days": {date: {"n", "high"}}}
    <out>/data/days/<date>.json            the day's file, unchanged
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


def build_site(repo_dir: Path, out_dir: Path) -> dict:
    src = repo_dir / "site"
    reports = repo_dir / "reports_by_date"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    shutil.copytree(src, out_dir)
    days_dir = out_dir / "data" / "days"
    days_dir.mkdir(parents=True)

    days: dict[str, dict] = {}
    total = 0
    for f in sorted(reports.glob("*.json")):
        entries = json.loads(f.read_text(encoding="utf-8"))
        if not entries:
            continue
        shutil.copyfile(f, days_dir / f.name)
        n = len(entries)
        days[f.stem] = {"n": n, "high": sum(e["parsed"].get("completeness") == "High" for e in entries)}
        total += n

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": total,
        "first": min(days) if days else None,
        "last": max(days) if days else None,
        "days": days,
    }
    (out_dir / "data" / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    (out_dir / ".nojekyll").write_text("")
    return manifest
