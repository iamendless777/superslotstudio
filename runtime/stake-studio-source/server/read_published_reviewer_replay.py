#!/usr/bin/env python3
"""Read one provenance-bound reviewer replay from final Stake publish files."""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys

import zstandard


FORMAT = "stake-studio-published-reviewer-replay-v1"


def fail(message: str) -> None:
    raise ValueError(message)


def read_json(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_file(root: str, name: object, label: str) -> str:
    filename = str(name or "")
    if not filename or os.path.basename(filename) != filename or filename in {".", ".."}:
        fail(f"{label} must be a filename, got {filename!r}.")
    path = os.path.join(root, filename)
    if not os.path.isfile(path):
        fail(f"Missing {label}: {filename}.")
    return path


def read_book(path: str, book_id: int) -> dict:
    decompressor = zstandard.ZstdDecompressor()
    with open(path, "rb") as compressed:
        with decompressor.stream_reader(compressed) as stream:
            with io.TextIOWrapper(stream, encoding="utf-8") as text:
                for line in text:
                    if not line.strip():
                        continue
                    book = json.loads(line)
                    if int(book.get("id", -1)) == book_id:
                        return book
    fail(f"Published events file does not contain book {book_id}.")


def load_replay(root: str, mode_name: str, category: str) -> dict:
    library = os.path.abspath(root)
    catalog = read_json(os.path.join(library, "reviewer-replay-event-catalog.json"))
    if catalog.get("format") != "stake-studio-reviewer-replay-event-catalog-v1" or not catalog.get("complete"):
        fail("Reviewer replay catalog is missing, incomplete, or unsupported.")
    mode = next((item for item in catalog.get("modes") or [] if item.get("name") == mode_name), None)
    if mode is None:
        fail(f"Reviewer replay catalog has no mode {mode_name!r}.")
    proof = (mode.get("entries") or {}).get(category)
    if not proof or proof.get("status") != "selected":
        fail(f"Reviewer replay {mode_name}/{category} is not available in the final LUT catalog.")

    publish = os.path.join(library, "publish_files")
    index = read_json(os.path.join(publish, "index.json"))
    index_mode = next((item for item in index.get("modes") or [] if item.get("name") == mode_name), None)
    if index_mode is None:
        fail(f"Published index has no mode {mode_name!r}.")
    events_path = safe_file(publish, index_mode.get("events"), f"{mode_name} events file")
    actual_events_sha = sha256_file(events_path)
    if actual_events_sha != proof.get("eventsFileSha256"):
        fail("Published events SHA-256 no longer matches the reviewer catalog.")

    book = read_book(events_path, int(proof["bookId"]))
    book_proof = hashlib.sha256(
        json.dumps(book, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    if book_proof != proof.get("bookProofSha256"):
        fail("Published book content no longer matches the reviewer catalog proof.")
    if int(book.get("payoutMultiplier", -1)) != round(float(proof["payoutMultiplier"]) * 100):
        fail("Published book payout no longer matches the final LUT selection.")
    events = book.get("events") or []
    if any(int(event.get("index", -1)) != index for index, event in enumerate(events)):
        fail("Published book event indices are not sequential from zero.")

    return {
        "format": FORMAT,
        "gameId": catalog.get("gameId"),
        "mode": mode_name,
        "category": category,
        "catalogSha256": catalog.get("catalogSha256"),
        "eventsFileSha256": actual_events_sha,
        "bookProofSha256": book_proof,
        "book": book,
    }


def main() -> None:
    if len(sys.argv) != 4:
        fail("Usage: read_published_reviewer_replay.py <math-publish-root> <mode> <category>.")
    print(json.dumps(load_replay(sys.argv[1], sys.argv[2], sys.argv[3]), separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"valid": False, "error": str(error)}))
        sys.exit(1)
