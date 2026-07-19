#!/bin/sh
# OpenInference CLI — install from GitHub and start oi (Linux / macOS)
# Usage: curl -fsSL https://openinference.tech/install-cli.sh | sh
set -e

REPO="${OI_REPO:-https://github.com/Souravrajvi0/OPENINFER.git}"
BRANCH="${OI_BRANCH:-main}"

echo ""
echo "  OpenInference — local open-source AI"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is required. Install Node 18+ from https://nodejs.org"
  echo ""
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "  git is required to install the CLI from GitHub."
  echo ""
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "  npm is required (comes with Node.js)."
  echo ""
  exit 1
fi

WORKDIR="${TMPDIR:-/tmp}/openinference-cli-install-$$"
cleanup() { rm -rf "$WORKDIR" 2>/dev/null || true; }
trap cleanup EXIT

echo "  Cloning OpenInference CLI from GitHub..."
git clone --depth 1 --branch "$BRANCH" "$REPO" "$WORKDIR"

echo "  Building packages/cli..."
cd "$WORKDIR/packages/cli"
npm install
npm run build
npm link

echo ""
echo "  Starting oi..."
echo ""

exec oi
