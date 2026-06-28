#!/bin/sh
# OpenInference CLI — one-command install (Linux / macOS)
# Usage: curl -fsSL https://openinference.tech/install-cli.sh | sh
set -e

echo ""
echo "  OpenInference — local open-source AI"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is required. Install Node 18+ from https://nodejs.org"
  echo "  Then run:  npx @openinference/cli"
  echo ""
  exit 1
fi

echo "  Starting setup (this may take a few minutes)..."
echo ""

exec npx -y @openinference/cli@latest
