/* Bookmarklet glue. Reads the clipboard, which holds either:
   - the JSON copied by the app ("Copier pour le formulaire"), or
   - the text copied by the iPhone Shortcut "Facture U" (profile + OCR text of the photo),
   and hands the data to remplirFormulaireU(). build.sh prepends src/date.js, src/ticket.js,
   src/profil.js and src/remplir.js, minifies, and writes the installable javascript: URL into
   installer-bookmarklet.html. Never edit the installer by hand. */
(async function () {
  'use strict';

  async function getPayload() {
    var raw = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        raw = await navigator.clipboard.readText();
      }
    } catch (e) { /* refusé ou non supporté : on demande à la main */ }
    if (!raw || (raw.indexOf('{') === -1 && raw.indexOf(MARQUEUR_RACCOURCI) === -1)) {
      raw = window.prompt('Colle ici les données du ticket (bouton « Copier pour le formulaire » dans l\'app) :') || '';
    }
    var duRaccourci = lireTexteRaccourci(raw);
    if (duRaccourci) return duRaccourci;
    var s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    try { return JSON.parse(raw.slice(s, e + 1)); } catch (err) { return null; }
  }

  /* --- Exécution --- */
  if (!estPageFactureU()) {
    toast('Ouvre d\'abord la page « Ma facture U » de magasins-u.com', false);
    return;
  }

  var data = await getPayload();
  if (!data) { toast('Données illisibles. Recopie-les depuis l\'app.', false); return; }

  await remplirFormulaireU(data);
})();
