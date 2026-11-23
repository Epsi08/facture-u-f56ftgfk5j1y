/* Extracts the five Super U receipt references from raw receipt text.
 *
 * Built for real OCR output, which does NOT keep the receipt's lines: Apple's text recognition
 * reads in column blocks, so "TOTAL [4] Articles" and its amount can be 30 lines apart, and the
 * summary line "10/10/26 18:03:24 99698 005 302 30609" comes out split over several lines.
 * Everything below therefore works on the token SEQUENCE, never on lines or column names
 * (names are mangled by OCR and differ between stores: "Ou", "Tpv", read "Tpu"...). */

var normaliserDateTicket = (typeof window === 'undefined')   // Node (tests) vs browser
  ? require('./date.js').normaliserDate
  : function (v) { return normaliserDate(v); };

var RE_DATE = /^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}$/;
var RE_HEURE = /^\d{1,2}[:h]\d{2}(:\d{2})?$/;
var RE_MONTANT = /\d{1,4}[.,]\d{2}(?!\d)/g;

function enCentimes(x) { return Math.round(parseFloat(String(x).replace(',', '.')) * 100); }
function versTexte(c) { return Math.floor(c / 100) + ',' + ('0' + (c % 100)).slice(-2); }

/* Summary line: <date> <time> <store> <checkout> <user> <ticket>. After the time, collect the
   plain numbers, skipping header words the OCR may have interleaved ("Util", "Tick"), and stop
   at the first token mixing digits and letters (e.g. the opening hours "14h00"). */
function lireLigneRecap(tokens) {
  var meilleure = null;
  for (var i = 0; i < tokens.length; i++) {
    if (!RE_DATE.test(tokens[i])) continue;
    var j = i + 1;
    if (!RE_HEURE.test(tokens[j] || '') && RE_HEURE.test(tokens[j + 1] || '')) j++;
    if (!RE_HEURE.test(tokens[j] || '')) continue;
    var nombres = [];
    for (var k = j + 1; k < tokens.length && k <= j + 10 && nombres.length < 4; k++) {
      var t = tokens[k];
      if (/^\d+$/.test(t)) nombres.push(t);
      else if (/\d/.test(t)) break;
    }
    if (nombres.length < 2) continue;
    var candidat = { date: tokens[i], magasin: nombres[0], caisse: nombres[1], ticket: nombres[nombres.length - 1] };
    // A store code has 5 digits: that is what tells the summary line from a card-payment slip
    if (/^\d{5}$/.test(candidat.magasin)) return candidat;
    if (!meilleure) meilleure = candidat;
  }
  return meilleure;
}

/* Total incl. VAT, most reliable evidence first:
 *  1. an amount printed on the same line as "TOTAL [4] Articles" (text that kept its lines);
 *  2. arithmetic: the largest amount C such that two other amounts A + B = C exist on the
 *     receipt — the receipt always prints subtotal + VAT = total. A "cumulative savings" line
 *     or a discount never satisfies that, whatever its size or position;
 *  3. the largest amount on a TOTAL line, then the largest amount on the receipt. */
function lireMontant(lignes) {
  for (var i = 0; i < lignes.length; i++) {
    if (!/t[o0]tal\s*[\[(]?\s*\d+\s*[\])]?\s*article/i.test(lignes[i])) continue;
    var surLaLigne = lignes[i].match(RE_MONTANT);
    if (surLaLigne) return surLaLigne[surLaLigne.length - 1].replace('.', ',');
  }

  var tous = [];
  lignes.forEach(function (l) { (l.match(RE_MONTANT) || []).forEach(function (m) { tous.push(enCentimes(m)); }); });
  var distincts = tous.filter(function (v, idx) { return tous.indexOf(v) === idx; }).sort(function (a, b) { return b - a; });
  for (var c = 0; c < distincts.length; c++) {
    var C = distincts[c];
    for (var a = 0; a < distincts.length; a++) {
      var A = distincts[a], B = C - A;
      if (A >= C || B <= 0 || B > A) continue;     // B is the VAT: positive and smaller than A
      if (distincts.indexOf(B) !== -1) return versTexte(C);
    }
  }

  var totaux = [];
  lignes.forEach(function (l) {
    if (!/\bt[o0]tal\b/i.test(l) || /tva|tua|sous-?total/i.test(l)) return;
    var m = l.match(RE_MONTANT);
    if (m) totaux.push(enCentimes(m[m.length - 1]));
  });
  var liste = totaux.length ? totaux : tous;
  return liste.length ? versTexte(Math.max.apply(null, liste)) : '';
}

function extraireTicket(texte) {
  var brut = String(texte || '');
  var lignes = brut.split(/\r?\n/).map(function (l) { return l.trim(); });
  var tokens = brut.split(/\s+/).filter(Boolean);
  var out = { magasin: '', ticket: '', date: '', montant: '', caisse: '' };

  var recap = lireLigneRecap(tokens);
  if (recap) { out.date = recap.date; out.magasin = recap.magasin; out.caisse = recap.caisse; out.ticket = recap.ticket; }

  if (!/^\d{5}$/.test(out.magasin)) {
    // "Magasin 99698" / "CODE MAGASIN : 99698", tolerating OCR errors on the first letter
    var mm = brut.match(/agasin\s*:?\s*(\d{5})\b/i);
    if (mm) out.magasin = mm[1];
  }
  if (!out.date) {
    var dm = brut.match(/\b(\d{2}[\/.]\d{2}[\/.]\d{2,4})\b/);
    if (dm) out.date = dm[1];
  }
  out.date = out.date ? (normaliserDateTicket(out.date) || out.date) : '';
  out.montant = lireMontant(lignes);
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extraireTicket: extraireTicket };
}
