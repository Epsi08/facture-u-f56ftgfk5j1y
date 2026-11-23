/* Prefill for the "Ma facture U" form — CLIENT PARTICULIER profile.
   Readable source. build.sh prepends src/date.js, minifies, and writes the installable
   javascript: URL into installer-bookmarklet.html. Never edit the installer by hand.

   Attend dans le presse-papier un JSON produit par l'app de lecture de ticket :
   {"v":1,"magasin":"29620","ticket":"2064","date":"2024-09-26","montant":"18,59",
    "caisse":"103","nom":"","prenom":"","voie":"","complement":"","cp":"","ville":"",
    "tel":"","email":""}
*/
(async function () {
  'use strict';

  var TOAST_MS = 4000;

  function toast(msg, ok) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;'
      + 'background:' + (ok ? '#0b7285' : '#c92a2a') + ';color:#fff;padding:12px 18px;border-radius:10px;'
      + 'font:15px/1.4 -apple-system,system-ui,sans-serif;max-width:88vw;text-align:center;'
      + 'box-shadow:0 4px 18px rgba(0,0,0,.25)';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, TOAST_MS);
  }

  /* React remplace le setter natif : il faut passer par le prototype,
     sinon la valeur est réécrite au prochain rendu. */
  function setField(el, value) {
    if (!el) return false;
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  var byName = function (n) { return document.querySelector('[name="' + n + '"]'); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* Le code magasin est un react-select : écrire dans le champ caché ne suffit pas,
     il faut ouvrir le menu et cliquer l'option. */
  async function pickStore(code) {
    code = String(code || '').trim();
    if (!code) return false;
    var combo = document.getElementById('facture-u-storeCode')
      || document.querySelector('input[role="combobox"]');
    if (!combo) return false;

    combo.focus();
    setField(combo, code);
    await wait(1200);

    /* aria-controls plutôt que l'id en dur : le compteur d'instance peut changer. */
    var listId = combo.getAttribute('aria-controls') || combo.getAttribute('aria-owns');
    var menu = listId ? document.getElementById(listId) : null;
    if (!menu) {
      var menus = document.querySelectorAll('[id*="listbox"]');
      menu = menus[menus.length - 1];
    }
    if (!menu) return false;

    var leaves = [].slice.call(menu.querySelectorAll('*'))
      .filter(function (e) { return e.children.length === 0 && e.textContent.trim(); });
    var opt = leaves.filter(function (e) { return e.textContent.trim() === code; })[0]
      || leaves.filter(function (e) { return e.textContent.trim().indexOf(code) === 0; })[0];
    if (!opt) return false;

    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    opt.click();
    await wait(700);

    var hidden = document.querySelector('input[type=hidden][name="facture-u-storeCode"]');
    return !!(hidden && hidden.value);
  }

  async function getPayload() {
    var raw = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        raw = await navigator.clipboard.readText();
      }
    } catch (e) { /* refusé ou non supporté : on demande à la main */ }
    if (!raw || raw.indexOf('{') === -1) {
      raw = window.prompt('Colle ici les données du ticket (bouton « Copier pour le formulaire » dans l\'app) :') || '';
    }
    var s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    try { return JSON.parse(raw.slice(s, e + 1)); } catch (err) { return null; }
  }

  /* --- Exécution --- */
  if (!/magasins-u\.com/.test(location.hostname)) {
    toast('Ouvre d\'abord la page « Ma facture U » de magasins-u.com', false);
    return;
  }

  var data = await getPayload();
  if (!data) { toast('Données illisibles. Recopie-les depuis l\'app.', false); return; }

  var particulier = document.getElementById('particulier');
  if (particulier && !particulier.checked) { particulier.click(); await wait(900); }

  var address = String(data.voie || '').trim();
  var complement = String(data.complement || '').trim();
  var champComplement = byName('facture-u-addressComplement') || byName('facture-u-complement');
  if (complement && !champComplement) address = (address + ' ' + complement).trim();

  var filled = 0, missing = [];
  var put = function (name, value, label) {
    value = String(value == null ? '' : value).trim();
    if (!value) return;
    if (setField(byName(name), value)) filled++; else missing.push(label || name);
  };

  put('facture-u-ticketNumber', data.ticket, 'numéro de ticket');
  var iso = versIso(data.date);
  if (iso) put('facture-u-ticketDate', iso, 'date'); else if (data.date) missing.push('date (format non reconnu)');
  put('facture-u-ticketAmount', data.montant, 'montant');
  put('facture-u-checkoutCode', data.caisse, 'code caisse');
  put('facture-u-lastname', data.nom, 'nom');
  put('facture-u-firstname', data.prenom, 'prénom');
  put('facture-u-address', address, 'adresse');
  if (complement && champComplement) put(champComplement.name, complement, 'complément');
  put('facture-u-zipCode', data.cp, 'code postal');
  put('facture-u-city', data.ville, 'ville');
  put('facture-u-phoneNumber', data.tel, 'téléphone');
  put('facture-u-email', data.email, 'email');

  var storeOk = await pickStore(data.magasin);
  if (storeOk) filled++; else if (data.magasin) missing.push('code magasin');

  var msg = filled + ' champ' + (filled > 1 ? 's' : '') + ' rempli' + (filled > 1 ? 's' : '');
  msg += missing.length ? ' — à finir à la main : ' + missing.join(', ') : '. Vérifie puis valide.';
  toast(msg, missing.length === 0);
})();
