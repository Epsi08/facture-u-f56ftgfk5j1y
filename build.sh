#!/bin/bash
# Rebuilds the bookmarklet inside installer-bookmarklet.html from src/, after running the tests.
# Usage: bash build.sh
set -e
cd "$(dirname "$0")"

node tests/test.js

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# One IIFE so date helpers do not leak into the Super U page's globals
{ echo '(function(){'; cat src/date.js src/ticket.js src/profil.js src/remplir.js src/bookmarklet.js; echo '})();'; } > "$TMP/entree.js"
npx --yes esbuild@0.28.2 "$TMP/entree.js" --minify --log-level=warning > "$TMP/min.js"
node --check "$TMP/min.js"

python3 -I - "$TMP/min.js" << 'PY'
import io, json, re, sys
code = io.open(sys.argv[1], encoding='utf-8').read().strip()
# javascript: URLs are percent-decoded before running: escape every literal "%"
url = 'javascript:' + code.replace('%', '%25')
page = io.open('installer-bookmarklet.html', encoding='utf-8').read()
page, n = re.subn(r'var BM = .*?;\n', lambda m: 'var BM = ' + json.dumps(url, ensure_ascii=False) + ';\n', page, count=1, flags=re.S)
assert n == 1, 'BM placeholder not found in installer-bookmarklet.html'
io.open('installer-bookmarklet.html', 'w', encoding='utf-8').write(page)
print(f'Favori reconstruit : {len(url)} caractères')
PY
