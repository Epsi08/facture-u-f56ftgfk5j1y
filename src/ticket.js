/* Extracts the five Super U receipt references from raw receipt text, and says which ones it
 * is unsure about instead of guessing silently.
 *
 * Built for real OCR output, which does NOT keep the receipt's lines: Apple's text recognition
 * reads in column blocks, so "TOTAL [4] Articles" and its amount can be 30 lines apart, and the
 * summary line "10/10/26 17:42:10 10845 007 118 41720" comes out split over several lines.
 * Everything therefore works on the token SEQUENCE, never on lines or column names (names are
 * mangled by OCR and differ between stores: "Ou", "Tpv", read "Tpu"...).
 *
 * Three independent sources are cross-checked:
 *  - the summary line   <date> <time> <store> <checkout> <user> <ticket>
 *  - the number printed under the barcode, e.g. 0010 10845 101026 007 041720
 *    = ? + store + date (DDMMYY) + checkout + ticket (seen identical on two receipts)
 *  - the "Magasin 10845" / "CODE MAGASIN : 10845" header lines.
 *
 * Returns { magasin, ticket, date, montant, caisse, doutes } where doutes lists the fields
 * that need a human look (OCR repair, sources disagreeing, value guessed by a fallback). */

var normaliserDateTicket = (typeof window === 'undefined')   // Node (tests) vs browser
  ? require('./date.js').normaliserDate
  : function (v) { return normaliserDate(v); };

var RE_DATE = /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/;
var RE_HEURE = /^\d{1,2}[:h.]\d{2}([:.]\d{2})?$/;
var RE_MONTANT = /(^|[^\d])(\d{1,6}[.,]\d{2})(?!\d)/g;
var CHAMPS = ['magasin', 'ticket', 'date', 'montant', 'caisse'];

function enCentimes(x) { return Math.round(parseFloat(String(x).replace(',', '.')) * 100); }
function versTexte(c) { return Math.floor(c / 100) + ',' + ('0' + (c % 100)).slice(-2); }

/* Text-level OCR repairs that cannot be done token by token. */
function nettoyerTexte(brut) {
  return String(brut || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/(\d)[.,]\s+(\d{2})(?!\d)/g, '$1,$2')                // "23, 09"   → "23,09"
    .replace(/(^|[^\d])(\d{1,3})[ .](\d{3})[.,](\d{2})(?!\d)/g, '$1$2$3,$4')  // "1 234,56" → "1234,56"
    .replace(/(\d[.,]\d{2})\u20ac/g, '$1 \u20ac')                           // "23,09€"   → "23,09 €"
    .replace(/(^|[^\w:.])([\dOo]{1,6})([.,])([\dOo]{2})(?![\w:.])/g, function (m, avant, e, sep, d) {
      // only amounts actually containing a letter O; never touch times such as 18.03.24
      return /[Oo]/.test(e + d) && /\d/.test(e + d) ? avant + (e + sep + d).replace(/[Oo]/g, '0') : m;
    });                                                            // "23,O9"    → "23,09"
}

/* Token-level repairs. Returns [{ t: text, repare: bool }]. Letters are only turned into digits
   inside tokens that are already mostly digits, and every repair is remembered. */
function preparerJetons(texte) {
  var bruts = texte.split(/\s+/).filter(Boolean);
  var jetons = bruts.map(function (t) {
    var chiffres = (t.match(/\d/g) || []).length;
    var lettres = (t.match(/[OoBSlIZ]/g) || []).length;
    if (chiffres >= 1 && lettres >= 1 && chiffres >= lettres * 2 && /^[\dOoBSlIZ\/:.\-]+$/.test(t)) {
      var corrige = t.replace(/[Oo]/g, '0').replace(/B/g, '8').replace(/S/g, '5').replace(/[lI]/g, '1').replace(/Z/g, '2');
      return { t: corrige, repare: true };
    }
    return { t: t, repare: false };
  });

  var sortie = [];
  for (var i = 0; i < jetons.length; i++) {
    var j = jetons[i], suivant = jetons[i + 1];
    // "10/10/2618:03:24": date and time glued together
    var colle = j.t.match(/^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2})(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)$/);
    if (colle) {
      sortie.push({ t: colle[1], repare: true }, { t: colle[2], repare: true });
      continue;
    }
    // "18: 03:24", "18:03: 24", "10/ 10/26": a stray space inside a time or a date
    if (suivant && (/^\d{1,2}[:.]$/.test(j.t) || /^\d{1,2}[:.]\d{2}[:.]$/.test(j.t) || /^\d{1,2}[\/.-]$/.test(j.t))
        && /^\d{1,2}/.test(suivant.t)) {
      var fusion = j.t + suivant.t;
      if (RE_HEURE.test(fusion) || RE_DATE.test(fusion)) {
        sortie.push({ t: fusion, repare: true });
        i++;
        continue;
      }
    }
    sortie.push(j);
  }
  return sortie;
}

/* Summary line candidates. After the time, collect plain numbers, skipping words without digits
   (header words such as "Util", "Tick", opening-hours text) and stopping at the first token that
   mixes digits with other characters (e.g. "14h00"). */
function candidatsRecap(jetons) {
  var candidats = [];
  for (var i = 0; i < jetons.length; i++) {
    if (!RE_DATE.test(jetons[i].t)) continue;
    var h = i + 1;
    if (!RE_HEURE.test((jetons[h] || {}).t || '') && RE_HEURE.test((jetons[h + 1] || {}).t || '')) h++;
    if (!RE_HEURE.test((jetons[h] || {}).t || '')) continue;

    var nombres = [], repare = jetons[i].repare || jetons[h].repare;
    for (var k = h + 1; k < jetons.length && k <= h + 14 && nombres.length < 6; k++) {
      var t = jetons[k].t;
      if (/^\d+$/.test(t)) nombres.push(jetons[k]);
      else if (/\d/.test(t)) break;
    }
    if (nombres.length < 2) continue;
    candidats.push({ date: jetons[i].t, nombres: nombres, repare: repare, index: i });
  }
  return candidats;
}

/* The digits under the barcode: 4 + store(5) + date DDMMYY(6) + checkout(3) + ticket(6) = 24. */
function lireCodeBarres(texte) {
  // Never swallow the integer part of a neighbouring amount ("…503060 0,20" in flattened text)
  var re = /(^|[^\d.,])(\d[\d ]{18,34}\d)(?![\d.,])/g, m, trouves = [];
  while ((m = re.exec(texte))) trouves.push(m[2]);
  for (var i = 0; i < trouves.length; i++) {
    var c = trouves[i].replace(/ /g, '');
    if (c.length < 18 || c.length > 26) continue;
    var jj = c.substr(9, 2), mm = c.substr(11, 2), aa = c.substr(13, 2);
    var date = normaliserDateTicket(jj + '/' + mm + '/' + aa);
    if (!date) continue;
    return {
      magasin: c.substr(4, 5),
      date: date,
      caisse: c.substr(15, 3),
      ticket: c.length === 24 ? String(parseInt(c.substr(18, 6), 10)) : '',
      complet: c.length === 24
    };
  }
  return null;
}

/* Total incl. VAT, most reliable evidence first:
 *  1. an amount on the same line as "TOTAL [4] Articles" (text that kept its lines);
 *  2. arithmetic: the largest amount C with A + B = C where B (the VAT) is at most 25 % of A,
 *     and C, A and B each appear at least twice — a receipt always prints subtotal, VAT and
 *     total more than once, whereas cash given, change or a loyalty balance appear once or
 *     don't satisfy the VAT ratio;
 *  3. fallbacks (marked as doubtful): largest amount on a TOTAL line, then the largest amount
 *     printed at least three times, then the largest amount. */
function lireMontant(texte) {
  var lignes = texte.split('\n');
  // The amount must directly follow "TOTAL [4] Articles", not merely share a (flattened) line
  var direct = texte.match(/t[o0]tal\s*[\[(]?\s*\d+\s*[\])]?\s*articles?\s*:?\s*(\d{1,6}[.,]\d{2})(?!\d)/i);
  if (direct) return { valeur: versTexte(enCentimes(direct[1])), sur: true };

  var tous = montantsDe(texte), nb = {};
  tous.forEach(function (v) { nb[v] = (nb[v] || 0) + 1; });
  var distincts = Object.keys(nb).map(Number).sort(function (a, b) { return b - a; });
  for (var c = 0; c < distincts.length; c++) {
    var C = distincts[c];
    if (nb[C] < 2) continue;
    for (var a = 0; a < distincts.length; a++) {
      var A = distincts[a], B = C - A;
      if (A >= C || B <= 0 || B * 4 > A || nb[A] < 2 || !(nb[B] >= 2)) continue;
      return { valeur: versTexte(C), sur: true };
    }
  }

  var totaux = [];
  lignes.forEach(function (l) {
    if (!/\bt[o0]tal\b/i.test(l) || /tva|tua|sous-?total/i.test(l)) return;
    var m = montantsDe(l);
    if (m.length) totaux.push(m[m.length - 1]);
  });
  var frequents = distincts.filter(function (v) { return nb[v] >= 3; });
  var liste = totaux.length ? totaux : (frequents.length ? frequents : tous);
  return liste.length ? { valeur: versTexte(Math.max.apply(null, liste)), sur: false } : { valeur: '', sur: false };
}

function montantsDe(texte) {
  var res = [], m;
  RE_MONTANT.lastIndex = 0;
  while ((m = RE_MONTANT.exec(texte))) res.push(enCentimes(m[2]));
  return res;
}

function extraireTicket(texteBrut) {
  var texte = nettoyerTexte(texteBrut);
  var out = { magasin: '', ticket: '', date: '', montant: '', caisse: '', doutes: [] };
  var doute = function (champ) { if (out.doutes.indexOf(champ) === -1) out.doutes.push(champ); };

  var entete = (texte.match(/agasin\s*:?\s*(\d{5})\b/i) || [])[1] || '';
  var cb = lireCodeBarres(texte);
  var magasinRef = entete || (cb && cb.magasin) || '';

  // Pick the summary line: the store must match the header/barcode when one is known;
  // otherwise prefer the most complete candidate, then the last one (it sits at the bottom).
  var candidats = candidatsRecap(preparerJetons(texte));
  var choix = null, meilleurScore = -1;
  candidats.forEach(function (c) {
    var score = (c.nombres[0].t === magasinRef ? 100 : 0)
      + (/^\d{5}$/.test(c.nombres[0].t) ? 10 : 0)
      + Math.min(c.nombres.length, 4);
    if (score >= meilleurScore) { meilleurScore = score; choix = c; }
  });

  if (choix) {
    var n = choix.nombres;
    out.date = normaliserDateTicket(choix.date) || choix.date;
    out.magasin = n[0].t;
    out.caisse = n[1].t;
    if (choix.repare) doute('date');
    if (n[0].repare) doute('magasin');
    if (n[1].repare) doute('caisse');
    if (n.length >= 4) {
      out.ticket = n[3].t;
      if (n[3].repare) doute('ticket');
      // "30 609": the OCR split the ticket number in two
      if (n.length > 4 && n[3].t.length < 5 && (n[3].t + n[4].t).length <= 6) {
        out.ticket = n[3].t + n[4].t;
        doute('ticket');
      }
    }
    // With fewer than 4 numbers we cannot tell the ticket from the "Util" column: leave it empty.
  }

  // Cross-check with the barcode digits and the header
  if (cb) {
    [['magasin', cb.magasin], ['date', cb.date], ['caisse', cb.caisse]].forEach(function (p) {
      if (!out[p[0]]) out[p[0]] = p[1];
      else if (out[p[0]] !== p[1]) doute(p[0]);
      else out.doutes = out.doutes.filter(function (d) { return d !== p[0]; });   // repair confirmed
    });
    if (cb.complet) {
      if (!out.ticket) out.ticket = cb.ticket;
      else if (String(parseInt(out.ticket, 10)) !== cb.ticket) { out.ticket = cb.ticket; doute('ticket'); }
    }
  }
  if (entete) {
    if (!out.magasin) out.magasin = entete;
    else if (out.magasin !== entete) doute('magasin');
    else out.doutes = out.doutes.filter(function (d) { return d !== 'magasin'; });   // repaired value confirmed
  }
  if (!out.date) {
    var dates = texte.match(/\b\d{2}[\/.-]\d{2}[\/.-]\d{2,4}\b/g);
    if (dates) { out.date = normaliserDateTicket(dates[dates.length - 1]) || ''; doute('date'); }
  }

  var montant = lireMontant(texte);
  out.montant = montant.valeur;
  if (out.montant && !montant.sur) doute('montant');

  CHAMPS.forEach(function (c) { if (!out[c]) doute(c); });
  out.doutes.sort(function (a, b) { return CHAMPS.indexOf(a) - CHAMPS.indexOf(b); });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extraireTicket: extraireTicket };
}
