#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[recover-ios] stopping Expo/Metro/ngrok processes"
pkill -f "expo start" >/dev/null 2>&1 || true
pkill -f ngrok >/dev/null 2>&1 || true

echo "[recover-ios] freeing ports 8081/8082"
lsof -ti:8081,8082 | xargs kill -9 2>/dev/null || true

echo "[recover-ios] clearing Expo local cache folders"
rm -rf .expo .expo-shared

echo "[recover-ios] resetting Watchman watches"
watchman watch-del "$ROOT_DIR" >/dev/null 2>&1 || true
watchman watch-project "$ROOT_DIR" >/dev/null 2>&1 || true

echo "[recover-ios] ensuring simulator is booted"
xcrun simctl bootstatus booted -b >/dev/null 2>&1 || true
open -a Simulator

echo "[recover-ios] starting Expo on localhost (non-interactive)"
CI=1 EXPO_NO_TELEMETRY=1 npx expo start --localhost --clear
