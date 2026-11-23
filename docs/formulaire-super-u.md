# Référence technique — formulaire « Ma facture U »

**URL** : https://www.magasins-u.com/ma-facture-u
**Relevé le** : 30 août 2026, depuis le vrai Chrome (le site est protégé par Cloudflare :
les fetchs automatisés reçoivent un 403, seul un navigateur réel passe).

## Constats décisifs

1. **Cibler par `name`, JAMAIS par `id`.** Les `id` sont des UUID aléatoires régénérés à chaque
   chargement (`4f8f96a5-1f85-...`). Les `name` sont stables et lisibles (`facture-u-lastname`).
2. **Le code magasin n'est PAS un `<select>`** (le brief le supposait). C'est un **react-select** :
   un `input[role=combobox]` visible (id `facture-u-storeCode`, sans `name`) + un
   `input[type=hidden][name=facture-u-storeCode]` qui porte la vraie valeur.
   → Écrire dans le champ caché ne suffit pas : React ignore la valeur. Il faut **taper puis
   cliquer l'option** du menu. Testé et validé : le champ caché reçoit bien le code.
3. **🔴 Piège de la date.** Le champ est un `input[type=date]` alors que le label affiche
   « JJ/MM/AAAA ». Injecter `26/09/2024` donne une **valeur vide, silencieusement**.
   Il faut le format ISO **`2024-09-26`**.
4. **Le type de client change le formulaire** (voir tableau plus bas).
5. `facture-u-country` est un champ caché prérempli à `FR` — ne pas y toucher.

## Champs selon le type de client

Le choix se fait via 3 radios `name="client-type"` : `#particulier` (coché par défaut),
`#moral-assujetti`, `#moral-non-assujetti`.

**Commun aux 3** (bloc ticket) :

| `name` | Type | Format |
|---|---|---|
| `facture-u-storeCode` | react-select (+ hidden) | 5 chiffres, via clic sur l'option |
| `facture-u-ticketNumber` * | text | colonne « Tick » |
| `facture-u-ticketDate` * | **date** | **AAAA-MM-JJ** (ISO, pas JJ/MM/AAAA) |
| `facture-u-ticketAmount` * | text | virgule décimale, ex. `18,59` |
| `facture-u-checkoutCode` * | text | code caisse |

**Puis, selon le type :**

| Particulier | Moral assujetti TVA | Moral non assujetti TVA |
|---|---|---|
| `facture-u-lastname` * | `facture-u-companyName` * | `facture-u-companyName` * |
| `facture-u-firstname` * | `facture-u-clientName` | `facture-u-clientName` |
| | `facture-u-siret` * | `facture-u-siret-non-assujetti` * |
| | `facture-u-tva` * | `facture-u-tva-non-assujetti` * |
| `facture-u-email` | `facture-u-email-required` * | (email requis aussi) |
| | `facture-u-email-confirmation` * | |

**Commun (adresse)** : `facture-u-address` *, `facture-u-zipCode` *, `facture-u-city` *,
`facture-u-country` (hidden = `FR`), `facture-u-phoneNumber`.

`*` = obligatoire.

⚠️ **À trancher avec le comptable** : en tant qu'infirmier libéral, « particulier » ou
« client moral non assujetti à la TVA » ? Les actes infirmiers sont exonérés de TVA, et le
mode « moral » fait apparaître SIRET + n° TVA sur la facture — sans doute ce qu'il faut pour
passer l'achat sur l'entreprise. Le choix change les champs à remplir.

## Méthode de remplissage validée

Pour les champs texte/date, le setter natif est nécessaire (React écrase une simple
affectation `.value`) :

```js
function setField(el, value) {
  const proto = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

Pour le code magasin (react-select) : focus → `setField` sur le combobox → attendre ~1 s →
retrouver l'option dont le texte vaut exactement le code dans `#react-select-2-listbox` →
`mousedown` + `mouseup` + `click` dessus. Vérifier ensuite que le hidden porte la valeur.

⚠️ L'id `react-select-2-listbox` contient un compteur d'instance qui **peut changer** si le
nombre de composants react-select de la page évolue. Plus robuste : lire `aria-controls`
sur le combobox plutôt que coder l'id en dur.

## Ce qui n'a pas été fait

Aucun formulaire n'a été soumis. Les valeurs saisies étaient des tests (magasin 29687,
ticket 2064, 18,59 €, caisse 103) et le formulaire a été remis sur « Client particulier ».
La liste complète des codes magasin n'a pas été extraite : inutile, le code est sur le ticket
et le combobox filtre tout seul.
