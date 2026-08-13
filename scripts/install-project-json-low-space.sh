#!/bin/bash
set -euo pipefail

project_source=${1:?Prepared project JSON is required}
project_target=${2:?Target project JSON is required}

node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$project_source"

backup_dir=$(mktemp -d /tmp/stake-studio-project-install-low-space.XXXXXX)
backup_target="$backup_dir/project.json"

mv "$project_target" "$backup_target"
restore_on_error() {
  if [[ ! -f "$project_target" && -f "$backup_target" ]]; then
    mv "$backup_target" "$project_target"
  fi
}
trap restore_on_error ERR INT TERM

mv "$project_source" "$project_target"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$project_target"
trap - ERR INT TERM

printf 'Backup: %s\n' "$backup_dir"
