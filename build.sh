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
# es2017: no `??` nor optional catch binding, so older iPhones run it too
npx --yes esbuild@0.28.2 "$TMP/entree.js" --minify --target=es2017 --log-level=warning > "$TMP/min.js"
node --check "$TMP/min.js"

python3 -I - "$TMP/min.js" << 'FIN'
import io, json, sys
code = io.open(sys.argv[1], encoding='utf-8').read().strip()
assert all(ord(c) < 128 for c in code), 'bookmarklet must stay pure ASCII'
# Browsers strip raw tabs and line breaks from URLs. In esbuild's minified output they only occur
# inside template literals, where the escaped form is equivalent.
code = code.replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')
assert not any(c in code for c in '\t\n\r'), 'raw line break left in the bookmarklet'
# javascript: URLs are percent-decoded before running: escape every literal "%"
url = 'javascript:' + code.replace('%', '%25')
modele = io.open('installer.modele.html', encoding='utf-8').read()
assert modele.count('__FAVORI__') == 1, 'placeholder __FAVORI__ missing in installer.modele.html'
page = modele.replace('__FAVORI__', json.dumps(url, ensure_ascii=True))
page = page.replace('<!-- MODELE : build.sh produit installer-bookmarklet.html a partir de ce fichier. Modifier ici, jamais la page generee. -->',
                    '<!-- FICHIER GENERE par build.sh depuis installer.modele.html : ne pas modifier a la main. -->')
io.open('installer-bookmarklet.html', 'w', encoding='utf-8').write(page)
print('Favori reconstruit : %d caracteres' % len(url))
FIN
