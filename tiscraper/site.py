"""Build the static calendar website (GitHub Pages) from reports_by_date/.

Output layout:
    <out>/index.html, app.js, style.css    copied from site/
    <out>/data/manifest.json               {"total", "first", "last", "generated_at", "days": {date: {"n", "high"}}}
    <out>/data/days/<date>.json            the day's file, unchanged
    <out>/detections/<date>/<id>.yml       Sigma rules the reports point to (if any)
"""
from __future__ import annotations

import hashlib
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

    # AI-written behavior rules (Sigma), referenced from reports as "detections/<date>/<id>.yml"
    if (repo_dir / "detections").is_dir():
        shutil.copytree(repo_dir / "detections", out_dir / "detections")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": total,
        "first": min(days) if days else None,
        "last": max(days) if days else None,
        "days": days,
    }
    (out_dir / "data" / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")

    # Cache busting: GitHub Pages lets browsers cache files for 10 minutes, so a new
    # deploy could show old JS/CSS. Versioned URLs force the new files.
    version = hashlib.sha1(json.dumps(manifest["days"], sort_keys=True).encode()
                           + (src / "app.js").read_bytes() + (src / "style.css").read_bytes()).hexdigest()[:10]
    index = out_dir / "index.html"
    html = index.read_text(encoding="utf-8")
    html = html.replace('href="style.css"', f'href="style.css?v={version}"').replace(
        'src="app.js"', f'src="app.js?v={version}"')
    index.write_text(html, encoding="utf-8")
    (out_dir / ".nojekyll").write_text("")
    return manifest
