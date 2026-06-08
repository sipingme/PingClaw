#!/bin/bash
# PingClaw Portable launcher (macOS)
# Double-click this file on your USB drive to start PingClaw with data stored locally.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="$ROOT/data"
PINGCLAW_DATA="$DATA/pingclaw"
OPENCLAW_DATA="$DATA/openclaw"
HOME_DIR="$DATA/home"
APP="$ROOT/PingClaw.app/Contents/MacOS/PingClaw"

mkdir -p "$PINGCLAW_DATA" "$OPENCLAW_DATA" "$HOME_DIR"

if [[ ! -x "$APP" ]]; then
  osascript -e 'display alert "PingClaw 未找到" message "请将 PingClaw.app 放在与本脚本同一目录下。\n\nSee README.txt"' as critical 2>/dev/null || {
    echo "Error: PingClaw.app not found in $ROOT" >&2
    echo "Copy PingClaw.app next to this script." >&2
  }
  exit 1
fi

export PINGCLAW_PORTABLE=1
export PINGCLAW_PORTABLE_ROOT="$ROOT"
export CLAWX_USER_DATA_DIR="$PINGCLAW_DATA"
export OPENCLAW_STATE_DIR="$OPENCLAW_DATA"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_DATA/openclaw.json"
export PINGCLAW_GATEWAY_PORT=18889
export CLAWX_PORT_CLAWX_HOST_API=13211
export HOME="$HOME_DIR"

exec "$APP" --user-data-dir="$PINGCLAW_DATA" "$@"
