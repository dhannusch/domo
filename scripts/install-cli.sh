#!/bin/sh
# Puts a `domo` command on your PATH that runs this checkout:
#   domo init | doctor | serve | pair | ask
# It's a two-line wrapper, so `git pull` updates it. Remove it by deleting the file it prints.
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)" || { echo "Install Node 24 first."; exit 1; }

# The first of these that is on your PATH and writable; ~/.local/bin otherwise.
for dir in "$HOME/.bun/bin" "$HOME/.local/bin" "$(npm prefix -g 2>/dev/null)/bin" /opt/homebrew/bin /usr/local/bin; do
  case ":$PATH:" in *":$dir:"*) [ -d "$dir" ] && [ -w "$dir" ] && TARGET="$dir" && break ;; esac
done
TARGET="${TARGET:-$HOME/.local/bin}"
mkdir -p "$TARGET"

cat > "$TARGET/domo" <<WRAPPER
#!/bin/sh
exec "$NODE" --no-warnings "$REPO/apps/daemon/src/bin/domo.ts" "\$@"
WRAPPER
chmod +x "$TARGET/domo"

echo "Installed $TARGET/domo"
case ":$PATH:" in
  *":$TARGET:"*) ;;
  *) echo "Add $TARGET to your PATH, for example: echo 'export PATH=\"$TARGET:\$PATH\"' >> ~/.zshrc" ;;
esac
