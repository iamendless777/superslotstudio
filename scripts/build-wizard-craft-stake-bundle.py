"""Build and verify the WIZARD CRAFT Stake Engine release directories."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "reference/math-sdk/games/wizard_craft/library"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_copy(source, destination, expected_hash):
    actual = digest(source)
    if actual != expected_hash:
        raise RuntimeError(
            f"Hash mismatch for {source.name}: expected {expected_hash}, got {actual}"
        )
    shutil.copyfile(source, destination)
    return actual


UNFINISHED_ASSET_MARKERS = (
    "candidate",
    "review",
    "reconstructed",
    "transparent-registered",
)


def assert_production_asset_urls(asset_urls):
    unfinished = [
        url for url in asset_urls
        if any(marker in url.lower() for marker in UNFINISHED_ASSET_MARKERS)
    ]
    if unfinished:
        formatted = "\n".join(f"  - {url}" for url in unfinished)
        raise RuntimeError(
            "WIZARD CRAFT release contains unfinished review assets:\n"
            f"{formatted}\n"
            "Replace every candidate, review, reconstructed, and transparent "
            "placeholder before building an upload bundle."
        )


def runtime_dependency_closure(entry):
    """Collect only relative ESM imports reachable from the release entry."""
    root = ROOT / "dist/src"
    pending = [entry.resolve()]
    found = set()
    pattern = re.compile(r'(?:from\s+|import\s*)["\'](\.[^"\']+)["\']')
    while pending:
        source = pending.pop()
        if source in found:
            continue
        if not source.is_file() or root.resolve() not in source.parents:
            raise RuntimeError(f"Invalid WIZARD CRAFT runtime dependency: {source}")
        found.add(source)
        text = source.read_text(encoding="utf-8")
        for specifier in pattern.findall(text):
            dependency = (source.parent / specifier).resolve()
            if dependency.suffix == "":
                dependency = dependency.with_suffix(".js")
            pending.append(dependency)
    return tuple(sorted(found))


def build(output, allow_review_build=False, provider_number=None):
    config_path = LIBRARY / "configs/config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config["gameID"] != "wizard_craft" or config["workingName"] != "WIZARD CRAFT":
        raise RuntimeError("WIZARD CRAFT production identity is not finalized")
    if config["rtp"] != 96.5:
        raise RuntimeError("WIZARD CRAFT backend RTP must be 96.5")
    if provider_number is None:
        if not allow_review_build:
            raise RuntimeError(
                "STAKE_PROVIDER_NUMBER is required for a production bundle. "
                "Provider number 1 is an SDK placeholder and will not be guessed."
            )
    elif provider_number <= 0:
        raise RuntimeError("STAKE_PROVIDER_NUMBER must be a positive assigned value")
    else:
        config["providerNumber"] = provider_number

    frontend_entry = (ROOT / "frontend/wizard-craft/app.js").read_text(
        encoding="utf-8"
    )
    if not allow_review_build and (
        "createWizardCraftReviewBrowserProductionApp" in frontend_entry
        or "reviewAssetBasePath" in frontend_entry
    ):
        raise RuntimeError(
            "WIZARD CRAFT production entry still boots the review harness. "
            "Replace it with the final production asset manifest before upload."
        )

    # Preflight the complete visual manifest before touching an existing build.
    # A failed production gate must leave the last review package intact.
    asset_script = """
      import { wizardCraftProductionBrowserEntries } from './dist/src/index.js';
      console.log(JSON.stringify([...new Set(
        wizardCraftProductionBrowserEntries('art-src/wizard-craft').map(({url}) => url)
      )].sort()));
    """
    asset_urls = json.loads(subprocess.run(
        ["node", "--input-type=module", "-e", asset_script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout)
    if not allow_review_build:
        assert_production_asset_urls(asset_urls)

    math_output = output / "math"
    config_output = output / "configuration"
    frontend_output = output / "frontend"
    for directory in (math_output, config_output, frontend_output):
        if directory.exists():
            shutil.rmtree(directory)
    math_output.mkdir(parents=True, exist_ok=True)
    config_output.mkdir(parents=True, exist_ok=True)
    frontend_output.mkdir(parents=True, exist_ok=True)
    files = {}

    def add(source, directory, upload_name, expected_hash=None):
        destination = directory / upload_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        value = digest(source) if expected_hash is None else checked_copy(
            source, destination, expected_hash
        )
        if expected_hash is None:
            shutil.copyfile(source, destination)
        files[str(destination.relative_to(output))] = value

    rendered_config = config_output / "config.json"
    rendered_config.write_text(json.dumps(config, indent=4) + "\n", encoding="utf-8")
    files[str(rendered_config.relative_to(output))] = digest(rendered_config)
    frontend = config["frontendConfig"]
    add(
        LIBRARY / "configs/config_fe_wizard_craft.json",
        config_output,
        frontend["file"],
        frontend["sha256"],
    )
    force = config["standardForceFile"]
    add(
        LIBRARY / "forces" / force["file"],
        config_output,
        force["file"],
        force["sha256"],
    )

    declared_modes = []
    for mode in config["bookShelfConfig"]:
        declared_modes.append(mode["name"])
        for table in mode["tables"]:
            add(
                LIBRARY / "publish_files" / table["file"],
                math_output,
                table["file"],
                table["sha256"],
            )
        book = mode["booksFile"]
        add(
            LIBRARY / "publish_files" / book["file"],
            math_output,
            book["file"],
            book["sha256"],
        )
        force_record = mode["forceFile"]
        add(
            LIBRARY / "forces" / force_record["file"],
            config_output,
            force_record["file"],
            force_record["sha256"],
        )

    index = json.loads(
        (LIBRARY / "publish_files/index.json").read_text(encoding="utf-8")
    )
    if [mode["name"] for mode in index["modes"]] != declared_modes:
        raise RuntimeError("Publish index modes do not match backend configuration")
    add(LIBRARY / "publish_files/index.json", math_output, "index.json")

    frontend_source = ROOT / "frontend/wizard-craft"
    for name in ("index.html", "app.js", "styles.css"):
        add(frontend_source / name, frontend_output, name)
    add(
        ROOT / "node_modules/pixi.js/dist/pixi.min.mjs",
        frontend_output / "vendor",
        "pixi.min.mjs",
    )
    runtime_entry = ROOT / "dist/src/games/wizard-craft/browser-entry.js"
    runtime_sources = runtime_dependency_closure(runtime_entry)
    unrelated_runtime = [
        str(source.relative_to(ROOT / "dist/src"))
        for source in runtime_sources
        if "games/classic-nine/" in str(source)
        or "/testing/" in str(source)
    ]
    if unrelated_runtime:
        raise RuntimeError(
            "WIZARD CRAFT release includes unrelated/test runtime modules:\n  - "
            + "\n  - ".join(unrelated_runtime)
        )
    for source in runtime_sources:
        relative = source.relative_to(ROOT / "dist")
        add(source, frontend_output / "runtime" / relative.parent, relative.name)
    add(
        ROOT / "src/games/wizard-craft/control-surface.css",
        frontend_output / "runtime/src/games/wizard-craft",
        "control-surface.css",
    )

    prefix = "art-src/wizard-craft/"
    for url in asset_urls:
        if not url.startswith(prefix):
            raise RuntimeError(f"Unexpected production asset URL: {url}")
        relative = Path(url.removeprefix(prefix))
        add(
            ROOT / url,
            frontend_output / "assets" / relative.parent,
            relative.name,
        )

    manifest = {
        "schemaVersion": 1,
        "gameID": "wizard_craft",
        "providerNumber": config["providerNumber"],
        "providerIdentityExplicit": provider_number is not None,
        "rtp": 0.965,
        "maxWin": 25_000,
        "modes": declared_modes,
        "frontendEntry": "frontend/index.html",
        "frontendAssets": len(asset_urls),
        "runtimeModules": len(runtime_sources),
        "files": dict(sorted(files.items())),
    }
    manifest_path = output / "release-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dist/wizard-craft-stake-release",
    )
    parser.add_argument(
        "--allow-review-build",
        action="store_true",
        help="Build a local visual-review package that is not uploadable.",
    )
    parser.add_argument(
        "--provider-number",
        type=int,
        default=(
            int(os.environ["STAKE_PROVIDER_NUMBER"])
            if os.environ.get("STAKE_PROVIDER_NUMBER")
            else None
        ),
        help="Stake-assigned provider number; required for production bundles.",
    )
    args = parser.parse_args()
    print(build(
        args.output.resolve(),
        allow_review_build=args.allow_review_build,
        provider_number=args.provider_number,
    ))


if __name__ == "__main__":
    main()
