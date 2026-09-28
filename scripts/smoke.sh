#!/usr/bin/env bash
# 冒烟测试：无头启动 Electron 桌宠，校验启动链路
#
# 判定标准（比只看 SMOKE_OK 更严格）：
#   1) 必须输出 SMOKE_OK
#   2) 不得出现渲染层加载失败 / 未捕获异常（路径搬错时 PET_SMOKE 仍会打印 SMOKE_OK，必须挡住）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP="$ROOT/desktop"
cd "$DESKTOP"

# 环境坑：外层环境可能注入 ELECTRON_RUN_AS_NODE=1，会让 electron 以 Node 方式执行 main.js
unset ELECTRON_RUN_AS_NODE

if [ -f "node_modules/electron/dist/electron.exe" ]; then
  ELECTRON_BIN="node_modules/electron/dist/electron.exe"
elif [ -f "node_modules/electron/dist/electron" ]; then
  ELECTRON_BIN="node_modules/electron/dist/electron"
else
  echo "[smoke] 未找到 electron 二进制，请先执行: cd desktop && npm install" >&2
  exit 1
fi

LOG="$(mktemp)"
echo "[smoke] 启动中（约 6 秒）..."
PET_SMOKE=1 "$ELECTRON_BIN" . 2>&1 | tee "$LOG"

if ! grep -q "SMOKE_OK" "$LOG"; then
  echo "[smoke] FAIL: 未输出 SMOKE_OK" >&2
  exit 1
fi

if grep -qE "加载失败|ERR_FILE_NOT_FOUND|Uncaught|uncaught" "$LOG"; then
  echo "[smoke] FAIL: 检测到加载/运行时错误（SMOKE_OK 但页面加载失败）" >&2
  exit 1
fi

echo "[smoke] PASS: SMOKE_OK，且无加载失败 / 未捕获异常"
