#!/bin/sh
# OpenInference CLI — install globally and start oi (Linux / macOS)
# Usage: curl -fsSL https://openinference.tech/install-cli.sh | sh
set -e

echo ""
echo "  OpenInference — local open-source AI"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is required. Install Node 18+ from https://nodejs.org"
  echo "  Then run:"
  echo "    npm install -g @openinference/cli"
  echo "    oi"
  echo ""
  exit 1
fi

echo "  Installing @openinference/cli globally..."
npm install -g @openinference/cli@latest

echo ""
echo "  Starting oi..."
echo ""

exec oi
