#!/bin/bash
# dev.sh — client + server 同時起動スクリプト
# Usage: bash scripts/dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "Starting Battle Tetris development servers..."
echo "  Client: http://localhost:3000"
echo "  Server: http://localhost:4000"
echo ""

npm run dev
