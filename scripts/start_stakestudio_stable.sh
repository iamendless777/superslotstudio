#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
studio_source="${STAKE_STUDIO_SOURCE:-$script_dir/../runtime/stake-studio-source}"
studio_home="${STAKE_STUDIO_HOME:?Set STAKE_STUDIO_HOME to the directory containing the games folder}"
node_binary="${STAKE_STUDIO_NODE:-$(command -v node)}"

cd "$studio_source"
export STAKE_STUDIO_HOME="$studio_home"

exec "$node_binary" scripts/start-stake-studio.mjs
