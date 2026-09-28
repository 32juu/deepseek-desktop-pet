#!/usr/bin/env bash
# 开发启动入口：cd desktop && npm start
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/desktop"

# 环境坑：见 CLAUDE.md 第 10 节 - 必须清掉 ELECTRON_RUN_AS_NODE
unset ELECTRON_RUN_AS_NODE

exec npm start
