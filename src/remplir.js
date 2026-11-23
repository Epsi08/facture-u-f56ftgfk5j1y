/* Fills the "Ma facture U" form (CLIENT PARTICULIER profile) from a data object.
   Shared by the bookmarklet and the iPhone Shortcut — both builds concatenate it after src/date.js
   (it needs versIso). Field names come from docs/formulaire-super-u.md: target the `name`
   attributes, never the ids, which are random UUIDs regenerated on every page load.

   data = { magasin, ticket, date, montant, caisse, nom, prenom, voie, complement, cp, ville, tel, email } */

var TOAST_MS = 12000;

function estPageFactureU() { return /(^|\.)magasins-u\.com$/.test(location.hostname); }

// niveau: 'ok' (green), 'attention' (orange: check these fields), 'erreur' (red: fill by hand).
// Stays until tapped, or TOAST_MS: the user reads it while looking at the form.
function toast(msg, niveau) {
  var ancien = document.getElementById('facture-u-toast');
  if (ancien) ancien.remove();
  var couleurs = { ok: '#0b7285', attention: '#b35c00', erreur: '#c92a2a' };
  var d = document.createElement('div');
  d.id = 'facture-u-toast';
  d.setAttribute('role', 'status');
  d.textContent = msg;
  d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;'
    + 'background:' + (couleurs[niveau] || couleurs.erreur) + ';color:#fff;padding:14px 18px;border-radius:12px;'
    + 'font:16px/1.45 -apple-system,system-ui,sans-serif;max-width:90vw;text-align:left;white-space:pre-line;'
    + 'box-shadow:0 4px 18px rgba(0,0,0,.3)';
  d.addEventListener('click', function () { d.remove(); });
  document.body.appendChild(d);
  setTimeout(function () { d.remove(); }, TOAST_MS);
}

/* React overrides the value setter: go through the prototype's, or React rewrites the
   value on its next render. */
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

/* The store code is a react-select: writing the hidden input is not enough, the menu has to
   be opened and the option clicked. */
async function pickStore(code) {
  code = String(code || '').trim();
  if (!code) return false;
  var combo = document.getElementById('facture-u-storeCode')
    || document.querySelector('input[role="combobox"]');
  if (!combo) return false;

  combo.focus();
  setField(combo, code);
  await wait(1200);

  /* aria-controls rather than a hard-coded id: the instance counter in the id can change. */
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


// Resolves to { remplis, manquants, message } and shows the outcome on the page.
async function remplirFormulaireU(data) {
  // The page may still be loading (or showing Cloudflare's check): wait up to 10 s for the form
  for (var essai = 0; essai < 20 && !byName('facture-u-ticketNumber'); essai++) await wait(500);
  if (!byName('facture-u-ticketNumber')) {
    toast('Formulaire pas encore affiché.\nAttends qu\'il apparaisse, puis relance le favori.', 'erreur');
    return { remplis: 0, manquants: ['formulaire'], message: 'formulaire absent' };
  }

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

  // Ticket values the reader could not find, or is unsure about, are named explicitly: a green
  // "all filled" while the ticket number is empty is what the audit caught.
  var NOMS = { magasin: 'code magasin', ticket: 'n° de ticket', date: 'date', montant: 'montant', caisse: 'code caisse' };
  var absents = ['magasin', 'ticket', 'date', 'montant', 'caisse'].filter(function (k) { return !String(data[k] || '').trim(); })
    .map(function (k) { return NOMS[k]; });
  missing.forEach(function (m) { if (absents.indexOf(m) === -1) absents.push(m); });
  var douteux = (data.doutes || []).filter(function (k) { return String(data[k] || '').trim(); })
    .map(function (k) { return NOMS[k] || k; });

  var lignes = [], niveau = 'ok';
  if (absents.length) { lignes.push('À remplir à la main : ' + absents.join(', ')); niveau = 'erreur'; }
  if (douteux.length) { lignes.push('À vérifier : ' + douteux.join(', ')); if (niveau === 'ok') niveau = 'attention'; }
  if (!lignes.length) lignes.push(filled + ' champs remplis. Vérifie puis envoie.');
  var message = lignes.join('\n');
  toast(message, niveau);
  return { remplis: filled, manquants: missing, message: message };
}
