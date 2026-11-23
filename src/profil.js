/* Reads the text copied by the iPhone Shortcut "Facture U":
 *
 *   FACTURE-U
 *   Nom: DUPONT
 *   Prénom: …            ← editable profile block inside the Shortcut
 *   === TICKET ===
 *   <text extracted from the receipt photo by Apple's OCR>
 *
 * Shared by the bookmarklet build and the tests. */

var MARQUEUR_RACCOURCI = 'FACTURE-U';
var SEPARATEUR_TICKET = '=== TICKET ===';

var extraireTicketProfil = (typeof window === 'undefined')   // Node (tests) vs browser
  ? require('./ticket.js').extraireTicket
  : function (t) { return extraireTicket(t); };

// Built from a string so the minified bookmarklet stays pure ASCII (no raw combining marks)
var DIACRITIQUES = new RegExp('[\\u0300-\\u036f]', 'g');

var CLES_PROFIL = {
  'nom': 'nom', 'prenom': 'prenom', 'adresse': 'voie', 'voie': 'voie', 'complement': 'complement',
  'code postal': 'cp', 'cp': 'cp', 'ville': 'ville', 'telephone': 'tel', 'tel': 'tel',
  'email': 'email', 'e-mail': 'email', 'mail': 'email'
};

// Labels the profile block may use. Also used to cut a profile that lost its line breaks
// (clipboard pasted through a prompt arrives as one line).
var RE_LIBELLES = /\s+(?=(?:nom|pr[e\u00e9]nom|adresse|voie|compl[e\u00e9]ment|code postal|cp|ville|t[e\u00e9]l[e\u00e9]phone|t[e\u00e9]l\.?|e-?mail|mail)\s*:)/gi;

// "Nom: DUPONT" lines → { nom: 'DUPONT' }. Accents, case and a trailing dot in labels are ignored.
function lireProfil(texte) {
  var profil = {};
  String(texte || '').replace(/\r\n?/g, '\n').replace(RE_LIBELLES, '\n').split('\n').forEach(function (ligne) {
    var i = ligne.indexOf(':');
    if (i === -1) return;
    var cle = ligne.slice(0, i).trim().toLowerCase().normalize('NFD').replace(DIACRITIQUES, '').replace(/\.$/, '');
    if (CLES_PROFIL[cle]) profil[CLES_PROFIL[cle]] = ligne.slice(i + 1).trim();
  });
  return profil;
}

// Returns the data object expected by remplirFormulaireU(), or null if this is not Shortcut text.
function lireTexteRaccourci(texte) {
  var s = String(texte || '');
  var sep = s.indexOf(SEPARATEUR_TICKET);
  if (s.indexOf(MARQUEUR_RACCOURCI) === -1 || sep === -1) return null;
  return Object.assign({}, lireProfil(s.slice(0, sep)), extraireTicketProfil(s.slice(sep + SEPARATEUR_TICKET.length)));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { lireProfil: lireProfil, lireTexteRaccourci: lireTexteRaccourci };
}
