#!/bin/bash
set -euo pipefail

studio_root=${1:?Studio root is required}
game_root=${2:?Game root is required}
project_source=${3:?Prepared project JSON is required}
preview_source=${4:?Prepared PreviewPanel.js is required}
styles_source=${5:?Prepared styles.css is required}
orb_master=${6:?Orb master is required}
mode_master=${7:?Mode master is required}
verdict_master=${8:?Verdict master is required}
orb_runtime=${9:?Orb runtime is required}
mode_runtime=${10:?Mode runtime is required}
verdict_runtime=${11:?Verdict runtime is required}
bridge_source=${12:-}
visual_effect_source=${13:-}

project_target="$game_root/project.json"
preview_target="$studio_root/src/editor/preview/PreviewPanel.js"
styles_target="$studio_root/src/styles.css"
bridge_target="$studio_root/src/bridge/StudioBridge.js"
visual_effect_target="$studio_root/src/engines/animation/VisualEffectRuntime.js"
backup_dir=$(mktemp -d /tmp/dreamfall-presentation-install.XXXXXX)

cp "$project_target" "$backup_dir/project.json"
cp "$preview_target" "$backup_dir/PreviewPanel.js"
cp "$styles_target" "$backup_dir/styles.css"
if [ -n "$bridge_source" ]; then cp "$bridge_target" "$backup_dir/StudioBridge.js"; fi
if [ -n "$visual_effect_source" ]; then cp "$visual_effect_target" "$backup_dir/VisualEffectRuntime.js"; fi

mkdir -p "$game_root/assets/visual" "$game_root/assets/runtime"
if [ -f "$game_root/assets/visual/dreamfall-connection-orb-v1.png" ]; then mv "$game_root/assets/visual/dreamfall-connection-orb-v1.png" "$backup_dir/"; fi
if [ -f "$game_root/assets/runtime/dreamfall-connection-orb-v1.webp" ]; then mv "$game_root/assets/runtime/dreamfall-connection-orb-v1.webp" "$backup_dir/"; fi
if [ -f "$game_root/assets/runtime/dreamfall-connection-orb-runtime-v1.webp" ]; then mv "$game_root/assets/runtime/dreamfall-connection-orb-runtime-v1.webp" "$backup_dir/"; fi
install -m 0644 "$mode_master" "$game_root/assets/visual/dreamfall-mode-portal-v1.png"
install -m 0644 "$verdict_master" "$game_root/assets/visual/dreamfall-verdict-plate-v1.png"
install -m 0644 "$mode_runtime" "$game_root/assets/runtime/dreamfall-mode-portal-v1.webp"
install -m 0644 "$verdict_runtime" "$game_root/assets/runtime/dreamfall-verdict-plate-v1.webp"

preview_next="${preview_target%.js}.codex-next.js"
cp "$preview_source" "$preview_next"
node --check "$preview_next"
mv "$preview_next" "$preview_target"

cp "$styles_source" "$styles_target.codex-next"
mv "$styles_target.codex-next" "$styles_target"

cp "$project_source" "$project_target.codex-next"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$project_target.codex-next"
mv "$project_target.codex-next" "$project_target"

if [ -n "$bridge_source" ]; then
  bridge_next="${bridge_target%.js}.codex-next.js"
  cp "$bridge_source" "$bridge_next"
  node --check "$bridge_next"
  mv "$bridge_next" "$bridge_target"
fi

if [ -n "$visual_effect_source" ]; then
  visual_effect_next="${visual_effect_target%.js}.codex-next.js"
  cp "$visual_effect_source" "$visual_effect_next"
  node --check "$visual_effect_next"
  mv "$visual_effect_next" "$visual_effect_target"
fi

printf 'Backup: %s\n' "$backup_dir"
