#!/bin/bash
# Déploie le relais Cloudflare qui détient la clé API, puis branche le site dessus.
# À lancer depuis ce dossier :  bash installer-relais.sh
set -e

CE_DOSSIER="$(cd "$(dirname "$0")" && pwd)"
cd "$CE_DOSSIER/relais"

echo
echo "=== 1/4 — Connexion à Cloudflare ==="
echo "Une page va s'ouvrir dans ton navigateur. Connecte-toi (ou crée un compte, c'est gratuit)."
echo "Appuie sur Entrée pour continuer."
read -r _
npx --yes wrangler login

echo
echo "=== 2/4 — Enregistrement de ta clé API ==="
echo "Colle ta clé API Anthropic (elle commence par sk-ant-...) puis Entrée."
echo "Elle est envoyée chiffrée chez Cloudflare : elle n'apparaîtra JAMAIS dans le site,"
echo "ni dans le dépôt GitHub, ni dans ce dossier."
npx --yes wrangler secret put ANTHROPIC_API_KEY

echo
echo "=== 3/4 — Mise en ligne du relais ==="
npx --yes wrangler deploy | tee /tmp/facture-u-deploy.log

URL=$(grep -oE 'https://[a-z0-9.-]*workers\.dev' /tmp/facture-u-deploy.log | head -1)
if [ -z "$URL" ]; then
  echo
  echo "!! Adresse du relais introuvable dans la sortie ci-dessus."
  echo "   Repère la ligne qui finit par .workers.dev et colle-la ici :"
  read -r URL
fi

echo
echo "=== 4/4 — Branchement du site sur le relais ==="
cat > "$CE_DOSSIER/config.js" <<CFG
/* Adresse du relais qui détient la clé API. Généré par installer-relais.sh. */
window.FACTURE_U_CONFIG = {
  relaisUrl: '$URL'
};
CFG

cd "$CE_DOSSIER"
git add config.js
git commit -q -m "Point the app at the deployed relay" || true
git push -q origin main || echo "(pense à faire 'git push' pour publier)"

echo
echo "✅ Terminé."
echo "   Relais : $URL"
echo "   Recharge l'app sur ton téléphone, la lecture automatique est active."
