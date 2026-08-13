#!/bin/bash
set -euo pipefail

studio_root=${1:?Studio root is required}
game_root=${2:?Game root is required}
work_root=${3:?Prepared work directory is required}

preview_target="$studio_root/src/editor/preview/PreviewPanel.js"
vfx_target="$studio_root/src/engines/animation/VisualEffectRuntime.js"
bridge_target="$studio_root/src/bridge/StudioBridge.js"
styles_target="$studio_root/src/styles.css"
project_target="$game_root/project.json"
runtime_target="$game_root/assets/runtime"

backup_dir=$(mktemp -d /tmp/morpheus-runtime-hardening.XXXXXX)
cp "$preview_target" "$backup_dir/PreviewPanel.js"
cp "$vfx_target" "$backup_dir/VisualEffectRuntime.js"
cp "$bridge_target" "$backup_dir/StudioBridge.js"
cp "$styles_target" "$backup_dir/styles.css"
cp "$project_target" "$backup_dir/project.json"

install -m 0644 "$work_root/PreviewPanel.js" "$preview_target"
install -m 0644 "$work_root/VisualEffectRuntime.js" "$vfx_target"
install -m 0644 "$work_root/StudioBridge.js" "$bridge_target"
install -m 0644 "$work_root/styles.css" "$styles_target"
mkdir -p "$runtime_target"
cp "$work_root/runtime-symbols/"*.png "$runtime_target/"

cp "$work_root/project.optimized.json" "$project_target.codex-next"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$project_target.codex-next"
mv "$project_target.codex-next" "$project_target"

printf 'Backup: %s\n' "$backup_dir"
