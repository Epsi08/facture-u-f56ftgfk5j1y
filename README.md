# Facture Super U

Super U n'édite plus de facture pour les achats professionnels : il faut remplir un formulaire
en ligne à partir du ticket de caisse. Cette app supprime la partie pénible — le va-et-vient
entre le ticket et le formulaire.

**En ligne : https://epsi08.github.io/facture-u-f56ftgfk5j1y/**

**Profil retenu : client particulier** (nom + prénom, sans SIRET ni TVA).

## Le plus rapide : le raccourci iPhone « Facture U »

1. Toucher **Facture U** sur l'écran d'accueil → l'appareil photo s'ouvre → photographier le ticket.
2. Le raccourci lit le ticket (OCR d'Apple, gratuit, sur le téléphone), copie tout et ouvre le
   formulaire Super U dans Safari.
3. Toucher la barre d'adresse → favori **Remplir facture U** → les 12 champs se remplissent.
4. Vérifier, puis **Envoyer**. Le lien de la facture n'est valable que **5 minutes**.

⏱️ Super U ne publie un ticket qu'**une heure après l'achat** : avant, le formulaire le refuse.

Le raccourci se génère avec `python3 raccourci/construire.py --profil FICHIER --sortie CHEMIN`
(signature Apple incluse). La version personnelle contient l'adresse : **ne jamais la mettre dans
ce dépôt public** (`*.shortcut` est ignoré par git).

## Sans le raccourci, depuis l'app

1. Récupérer les 5 valeurs du ticket, au choix :
   - **Photo + texte Apple (recommandé)** : photographier le ticket, l'ouvrir dans Photos,
     toucher l'icône *texte en direct*, **Tout sélectionner**, **Copier** — puis dans l'app,
     **Coller le texte du ticket**. Les 5 champs se remplissent seuls.
   - **À la main** : taper les 5 valeurs (claviers numériques automatiques).
2. Toucher **Copier pour le formulaire**.
3. Ouvrir `magasins-u.com/ma-facture-u` dans Safari.
4. Toucher le favori **Remplir facture U** : les **12 champs** se remplissent d'un coup,
   coordonnées personnelles comprises.
5. Vérifier, puis valider soi-même.

Les coordonnées personnelles ne sont saisies qu'une fois : elles restent enregistrées dans le
navigateur du téléphone. Seules les 5 références du ticket changent d'un achat à l'autre.

## Installer

**L'app** : ouvrir l'adresse ci-dessus dans **Safari** → Partager → *Sur l'écran d'accueil*.

**Le favori de pré-remplissage** : ouvrir `installer-bookmarklet.html` sur l'iPhone et suivre
les 3 étapes. C'est lui qui fait l'essentiel du gain de temps.

## Ce que le favori fait — et ne fait pas

Il remplit les champs, gère le menu déroulant du code magasin et convertit la date au format
attendu. **Il ne valide jamais le formulaire** : le dernier mot reste à toi.

## Choix assumés

- **Pas d'envoi de la photo à un service payant.** La lecture par API Anthropic a été
  construite puis retirée : elle imposait une clé facturée à l'usage, distincte de l'abonnement
  Claude Pro. À la place, l'OCR est celui d'Apple, déjà présent sur l'iPhone : gratuit,
  hors-ligne, et plus fiable sur le papier thermique que les OCR gratuits embarquables.
  L'app ne fait que **découper le texte** obtenu, avec un extracteur couvert par des tests
  (dont un cas d'OCR dégradé).
  Le code de la lecture auto et du relais Cloudflare reste dans l'historique Git
  (commit `0b91a25`) si l'envie revient un jour.
- **Aucun serveur, aucun compte, aucune donnée qui sort du téléphone.**

## Références techniques

Les pièges du formulaire Super U (Cloudflare, react-select, format de date, id aléatoires) sont
documentés dans `../REFERENCE-formulaire-super-u.md` — à lire avant toute modification du favori.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | l'app : collage du texte du ticket, saisie, coordonnées enregistrées |
| `src/date.js` | normalisation des dates (app + favori) |
| `src/ticket.js` | extraction des 5 références — conçue pour l'OCR réel, qui ne garde pas les lignes |
| `src/profil.js` | lecture du texte copié par le raccourci (profil + OCR) |
| `src/remplir.js` | remplissage du formulaire Super U |
| `src/bookmarklet.js` | colle du favori (presse-papier → remplissage) |
| `installer-bookmarklet.html` | page d'installation du favori — **générée**, ne pas modifier à la main |
| `raccourci/construire.py` | génère et signe le raccourci iPhone |
| `tests/test.js` | 18 tests, dont un vrai texte OCR Apple : `node tests/test.js` |
| `build.sh` | lance les tests puis régénère le favori |

## Modifier le favori

Éditer `src/bookmarklet.js` ou `src/date.js`, puis :

```bash
bash build.sh
```

Après une régénération, le favori déjà installé sur l'iPhone doit être **remplacé** (étape 3 de
la page d'installation) pour profiter de la correction.
