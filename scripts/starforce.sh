#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
NODE_VERSION=${STARFORCE_NODE_VERSION:-22.18.0}
RUNTIME_ROOT="$REPOSITORY_ROOT/.starforce-runtime"

OS_NAME=$(uname -s)
ARCH_NAME=$(uname -m)

case "$OS_NAME" in
  Darwin) NODE_OS="darwin" ;;
  Linux) NODE_OS="linux" ;;
  *) echo "Unsupported OS: $OS_NAME" >&2; exit 1 ;;
esac

case "$ARCH_NAME" in
  arm64|aarch64) NODE_ARCH="arm64" ;;
  x86_64|amd64) NODE_ARCH="x64" ;;
  *) echo "Unsupported architecture: $ARCH_NAME" >&2; exit 1 ;;
esac

NODE_DIRECTORY_NAME="node-v$NODE_VERSION-$NODE_OS-$NODE_ARCH"
NODE_DIRECTORY="$RUNTIME_ROOT/$NODE_DIRECTORY_NAME"
NODE_EXECUTABLE="$NODE_DIRECTORY/bin/node"
NPM_COMMAND="$NODE_DIRECTORY/bin/npm"

if [ ! -x "$NODE_EXECUTABLE" ]; then
  mkdir -p "$RUNTIME_ROOT"
  ARCHIVE_PATH="$RUNTIME_ROOT/$NODE_DIRECTORY_NAME.tar.gz"
  DOWNLOAD_URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_DIRECTORY_NAME.tar.gz"

  echo "Downloading Node.js v$NODE_VERSION for $NODE_OS-$NODE_ARCH..."
  curl -fL "$DOWNLOAD_URL" -o "$ARCHIVE_PATH"

  echo "Extracting Node.js runtime..."
  tar -xzf "$ARCHIVE_PATH" -C "$RUNTIME_ROOT"
  rm -f "$ARCHIVE_PATH"
fi

PATH="$NODE_DIRECTORY/bin:$PATH"
export PATH

if [ ! -x "$REPOSITORY_ROOT/node_modules/.bin/tsx" ]; then
  echo "Installing project dependencies with bundled npm..."
  "$NPM_COMMAND" --prefix "$REPOSITORY_ROOT" ci --include=dev
fi

exec "$NPM_COMMAND" --prefix "$REPOSITORY_ROOT" run start -- "$@"
