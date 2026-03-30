#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[recover] stopping Expo/Metro/ngrok processes"
pkill -f "expo start" >/dev/null 2>&1 || true
pkill -f ngrok >/dev/null 2>&1 || true

echo "[recover] freeing ports 8081/8082"
lsof -ti:8081,8082 | xargs kill -9 2>/dev/null || true

echo "[recover] clearing Expo local cache folders"
rm -rf .expo .expo-shared

echo "[recover] resetting Watchman watches"
watchman watch-del "$ROOT_DIR" >/dev/null 2>&1 || true
watchman watch-project "$ROOT_DIR" >/dev/null 2>&1 || true

echo "[recover] resetting iOS Simulator state"
xcrun simctl shutdown all >/dev/null 2>&1 || true
xcrun simctl erase all >/dev/null 2>&1 || true

echo "[recover] starting Expo in stable LAN mode"
EXPO_NO_TELEMETRY=1 npx expo start --lan --clear
