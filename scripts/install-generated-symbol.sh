#!/bin/bash
set -euo pipefail

game_root=${1:?Game root is required}
project_source=${2:?Prepared project JSON is required}
master_source=${3:?Master PNG is required}
runtime_source=${4:?Runtime PNG is required}
filename=${5:?Asset filename is required}

project_target="$game_root/project.json"
visual_target="$game_root/assets/visual/$filename"
runtime_target="$game_root/assets/runtime/$filename"
backup_dir=$(mktemp -d /tmp/morpheus-symbol-install.XXXXXX)

cp "$project_target" "$backup_dir/project.json"
mkdir -p "$game_root/assets/visual" "$game_root/assets/runtime"
install -m 0644 "$master_source" "$visual_target"
install -m 0644 "$runtime_source" "$runtime_target"
cp "$project_source" "$project_target.codex-next"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$project_target.codex-next"
mv "$project_target.codex-next" "$project_target"

printf 'Backup: %s\n' "$backup_dir"
