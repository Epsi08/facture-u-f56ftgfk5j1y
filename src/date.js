/* Date handling shared by the app and the bookmarklet (concatenated into it by build.sh).
   The iPhone numeric keypad has no "/" key, so a date typed by hand arrives as "10102026". */

// Returns "JJ/MM/AAAA", or '' when the input is not a plausible date.
function normaliserDate(valeur) {
  var s = String(valeur || '').trim();
  var j, m, a, r;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { a = r[1]; m = r[2]; j = r[3]; }
  else if ((r = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/))) { j = r[1]; m = r[2]; a = r[3]; }
  else if ((r = s.match(/^(\d{2})(\d{2})(\d{4}|\d{2})$/))) { j = r[1]; m = r[2]; a = r[3]; }
  else return '';
  if (a.length === 2) a = '20' + a;
  var jj = +j, mm = +m;
  if (mm < 1 || mm > 12 || jj < 1 || jj > 31) return '';
  return ('0' + jj).slice(-2) + '/' + ('0' + mm).slice(-2) + '/' + a;
}

// The Super U form uses <input type="date">, which only accepts ISO "AAAA-MM-JJ".
function versIso(valeur) {
  var d = normaliserDate(valeur);
  if (!d) return '';
  var p = d.split('/');
  return p[2] + '-' + p[1] + '-' + p[0];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normaliserDate: normaliserDate, versIso: versIso };
}
