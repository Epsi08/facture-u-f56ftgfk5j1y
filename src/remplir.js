/* Fills the "Ma facture U" form (CLIENT PARTICULIER profile) from a data object.
   Shared by the bookmarklet and the iPhone Shortcut — both builds concatenate it after src/date.js
   (it needs versIso). Field names come from REFERENCE-formulaire-super-u.md: target the `name`
   attributes, never the ids, which are random UUIDs regenerated on every page load.

   data = { magasin, ticket, date, montant, caisse, nom, prenom, voie, complement, cp, ville, tel, email } */

var TOAST_MS = 4000;

function estPageFactureU() { return /magasins-u\.com/.test(location.hostname); }

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

  var message = filled + ' champ' + (filled > 1 ? 's' : '') + ' rempli' + (filled > 1 ? 's' : '');
  message += missing.length ? ' — à finir à la main : ' + missing.join(', ') : '. Vérifie puis valide.';
  toast(message, missing.length === 0);
  return { remplis: filled, manquants: missing, message: message };
}
