/* Extracts the five Super U receipt references from raw receipt text (OCR included).
   The summary line is read by POSITION, never by column name: OCR mangles headers
   ("Magasin"→"Hagasin", "Tick"→"lick") and stores name the checkout column differently
   ("Ou" in the Super U guide, "Tpv" on real receipts). */

var normaliserDateTicket = (typeof require !== 'undefined')
  ? require('./date.js').normaliserDate
  : function (v) { return normaliserDate(v); };

function versMontant(x) { return parseFloat(String(x).replace(',', '.')); }

function extraireTicket(texte) {
  var lignes = String(texte || '').split(/\r?\n/).map(function (l) { return l.trim(); });
  var out = { magasin: '', ticket: '', date: '', montant: '', caisse: '' };

  // Summary line: <date> <time> <store> <checkout> <user> <ticket>
  for (var i = 0; i < lignes.length; i++) {
    var t = lignes[i].split(/\s+/).filter(Boolean);
    if (t.length < 4) continue;
    if (!/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}$/.test(t[0])) continue;
    if (!/^\d{1,2}[:h]\d{2}/.test(t[1] || '')) continue;
    var nums = t.slice(2).filter(function (x) { return /^\d+$/.test(x); });
    if (nums.length < 2) continue;
    out.date = t[0];
    out.magasin = nums[0] || '';
    out.caisse = nums[1] || '';
    out.ticket = nums[nums.length - 1] || '';   // the ticket number is always the last column
    break;
  }

  // Fallbacks when the summary line was not readable
  if (!out.magasin) {
    for (var n = 0; n < lignes.length; n++) {
      var mm = lignes[n].match(/[a-zà-ÿ]{6,8}\s*:?\s*(\d{5})\b/i);
      if (mm && /agasin/i.test(lignes[n])) { out.magasin = mm[1]; break; }
    }
  }
  if (!out.date) {
    for (var d = 0; d < lignes.length; d++) {
      var dm = lignes[d].match(/\b(\d{2}[\/.]\d{2}[\/.]\d{2,4})\b/);
      if (dm) { out.date = dm[1]; break; }
    }
  }
  out.date = out.date ? (normaliserDateTicket(out.date) || out.date) : '';

  // Total incl. VAT, most reliable source first:
  //  1. the "TOTAL [4] Articles" line — the receipt's own main total;
  //  2. otherwise the largest amount on a "TOTAL" line (taking the LAST one would let a later
  //     "TOTAL REMISES" line overwrite it);
  //  3. otherwise the largest amount on the receipt.
  // VAT and subtotal lines are never candidates.
  var montants = [], totaux = [], totalArticles = '';
  lignes.forEach(function (l) {
    var trouves = (l.match(/\d{1,4}[.,]\d{2}/g) || []).map(function (x) { return x.replace('.', ','); });
    montants = montants.concat(trouves);
    if (!/\bt[o0]tal\b/i.test(l) || /tva|sous-?total/i.test(l) || !trouves.length) return;
    var dernier = trouves[trouves.length - 1];
    if (!totalArticles && /t[o0]tal\s*[\[(]?\s*\d+\s*[\])]?\s*article/i.test(l)) totalArticles = dernier;
    totaux.push(dernier);
  });
  var plusGrand = function (liste) {
    return liste.slice().sort(function (a, b) { return versMontant(b) - versMontant(a); })[0] || '';
  };
  out.montant = totalArticles || plusGrand(totaux) || plusGrand(montants);

  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extraireTicket: extraireTicket };
}
