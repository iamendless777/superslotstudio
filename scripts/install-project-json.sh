#!/bin/bash
set -euo pipefail

project_source=${1:?Prepared project JSON is required}
project_target=${2:?Target project JSON is required}

backup_dir=$(mktemp -d /tmp/stake-studio-project-install.XXXXXX)
cp "$project_target" "$backup_dir/project.json"
cp "$project_source" "$project_target.codex-next"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$project_target.codex-next"
mv "$project_target.codex-next" "$project_target"

printf 'Backup: %s\n' "$backup_dir"
