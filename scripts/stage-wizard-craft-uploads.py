#!/usr/bin/env python3
"""Stage deterministic, separate WIZARD CRAFT frontend and math archives."""

from __future__ import annotations

import hashlib
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / "dist/wizard-craft-stake-release"
OUTPUT = ROOT / "dist/wizard-craft-upload"
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def archive(source: Path, output: Path) -> None:
    with zipfile.ZipFile(output, "w", allowZip64=True) as bundle:
        for path in sorted(item for item in source.rglob("*") if item.is_file()):
            relative = path.relative_to(source).as_posix()
            info = zipfile.ZipInfo(relative, FIXED_TIME)
            info.create_system = 3
            info.external_attr = 0o644 << 16
            # Zstandard books are already compressed; storing them avoids a
            # slow second compression pass and preserves deterministic bytes.
            compression = zipfile.ZIP_STORED if path.suffix == ".zst" else zipfile.ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes(), compress_type=compression, compresslevel=9)


def verify_archive(output: Path, expected_files: set[str]) -> None:
    """Reject corrupt, nested, missing, or unexpected upload contents."""
    with zipfile.ZipFile(output) as bundle:
        corrupt = bundle.testzip()
        if corrupt is not None:
            raise RuntimeError(f"{output.name}: corrupt member {corrupt}")
        names = set(bundle.namelist())
    if names != expected_files:
        missing = sorted(expected_files - names)
        unexpected = sorted(names - expected_files)
        raise RuntimeError(
            f"{output.name}: archive layout mismatch; "
            f"missing={missing}, unexpected={unexpected}"
        )


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    frontend = OUTPUT / "wizard-craft-frontend.zip"
    math = OUTPUT / "wizard-craft-math.zip"
    frontend_source = RELEASE / "frontend"
    math_source = RELEASE / "math"
    archive(frontend_source, frontend)
    archive(math_source, math)
    verify_archive(
        frontend,
        {
            path.relative_to(frontend_source).as_posix()
            for path in frontend_source.rglob("*")
            if path.is_file()
        },
    )
    verify_archive(
        math,
        {
            "index.json",
            "books_baseBattle.jsonl.zst",
            "books_runeSpark.jsonl.zst",
            "books_siegeSigns.jsonl.zst",
            "books_openGrimoire.jsonl.zst",
            "lookUpTable_baseBattle_0.csv",
            "lookUpTable_runeSpark_0.csv",
            "lookUpTable_siegeSigns_0.csv",
            "lookUpTable_openGrimoire_0.csv",
        },
    )

    checksum_lines = [
        f"{sha256(frontend)}  {frontend.name}",
        f"{sha256(math)}  {math.name}",
    ]
    (OUTPUT / "checksums.sha256").write_text(
        "\n".join(checksum_lines) + "\n",
        encoding="utf-8",
    )
    (OUTPUT / "UPLOAD-README.md").write_text(
        """# WIZARD CRAFT upload handoff

Status: locally verified release candidate; not uploaded or externally approved.

- `wizard-craft-frontend.zip` contains the static frontend with `index.html` at its root.
- `wizard-craft-math.zip` contains only `index.json`, four compressed books, and four lookup tables at its root.
- `checksums.sha256` identifies the exact staged archives.
- Backend/frontend configuration and force records remain in the checksummed internal release evidence at `../wizard-craft-stake-release/configuration/`.

Before external upload, confirm the current Stake Engine portal workflow and team/provider identifiers. Do not alter math books, lookup weights, event contracts, displayed RTP, mode costs, or the 25,000x cap without invalidating this candidate and rerunning the complete verification pipeline.
""",
        encoding="utf-8",
    )
    print(frontend)
    print(math)
    print(OUTPUT / "checksums.sha256")


if __name__ == "__main__":
    main()
