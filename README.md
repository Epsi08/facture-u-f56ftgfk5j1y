# Ticket → Facture Super U

Photographie un ticket de caisse Super U, l'app en extrait les 5 références, et un favori
Safari remplit le formulaire `magasins-u.com/ma-facture-u` d'un seul geste.

**Profil retenu : client particulier** (nom + prénom, sans SIRET ni TVA).

## Architecture

```
Téléphone                    GitHub Pages              Cloudflare Worker        Anthropic
[photo] ──────────────────▶ [index.html] ──────────▶ [relais] ─────────────▶ [lecture image]
                             (public)                 (détient la clé)
```

La clé API n'est **jamais** dans la page. Elle vit uniquement dans le relais, chiffrée chez
Cloudflare. Une clé placée dans une page publique serait lisible — et facturable — par n'importe qui.

## Mise en route

### 1. Le site (déjà en ligne)

Publié automatiquement à chaque `git push`.

### 2. Le relais (une seule fois)

Prérequis : une **clé API Anthropic** créée sur [console.anthropic.com](https://console.anthropic.com)
→ *API keys* → *Create key*. ⚠️ C'est un compte **distinct de l'abonnement Claude Pro**, facturé
à l'usage (quelques centimes par ticket lu). Un compte **Cloudflare** gratuit est aussi nécessaire.

Puis, depuis ce dossier :

```bash
bash installer-relais.sh
```

Le script te connecte à Cloudflare, te demande ta clé, déploie le relais et branche le site dessus.
**Ta clé n'est jamais écrite dans ce dossier ni dans le dépôt.**

### 3. Le favori de pré-remplissage

Ouvre `installer-bookmarklet.html` sur l'iPhone et suis les 3 étapes.

## Usage quotidien

1. Photographier le ticket dans l'app → les 5 champs se remplissent.
2. Vérifier (surtout le montant et la date, lus sur une photo).
3. Toucher **Copier pour le formulaire**.
4. Ouvrir `magasins-u.com/ma-facture-u`, toucher le favori **Remplir facture U**.
5. Contrôler, puis valider soi-même.

Sans relais configuré, l'app reste utilisable : les 5 cases se remplissent à la main et le
favori fonctionne quand même.

## Sécurité du relais

- La clé reste côté serveur, jamais exposée au navigateur.
- Le prompt, le modèle et le plafond de jetons sont figés dans le relais : même si l'URL était
  découverte, elle ne permettrait que de faire lire un ticket de caisse.
- Appels limités à l'origine du site (CORS) et à 20 requêtes par IP toutes les 10 minutes.
- Taille d'image plafonnée.

L'adresse du dépôt est volontairement non devinable, comme pour l'app de cartes de fidélité.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | l'app (lecture du ticket + coordonnées) |
| `config.js` | adresse du relais, généré par le script |
| `installer-bookmarklet.html` | installation du favori de pré-remplissage |
| `installer-relais.sh` | déploiement guidé du relais |
| `relais/worker.js` | le relais (aucune clé dedans) |
| `relais/wrangler.toml` | configuration Cloudflare |
