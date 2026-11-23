/* Run with: node tests/test.js — no dependencies.
   Receipt data below is FICTIONAL (store 10845, etc.): this repository is public. The OCR fixture
   is a real Apple Vision output with its identifying values replaced consistently. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normaliserDate, versIso } = require('../src/date.js');
const { extraireTicket } = require('../src/ticket.js');
const { lireProfil, lireTexteRaccourci } = require('../src/profil.js');

let echecs = 0;
function cas(nom, fn) {
  try { fn(); console.log('✓', nom); }
  catch (e) { echecs++; console.log('✗', nom, '\n   ', e.message); }
}
const CINQ = ['magasin', 'ticket', 'date', 'montant', 'caisse'];
const valeurs = r => Object.fromEntries(CINQ.map(k => [k, r[k]]));
function sur(r, attendu) {          // exact values AND nothing flagged as doubtful
  assert.deepStrictEqual(valeurs(r), attendu);
  assert.deepStrictEqual(r.doutes, [], 'doutes inattendus : ' + r.doutes.join(', '));
}

/* --- Dates --- */
cas('date tapée au clavier numérique iPhone (sans /)', () => {
  assert.strictEqual(normaliserDate('10102026'), '10/10/2026');
  assert.strictEqual(normaliserDate('101026'), '10/10/2026');
});
cas('formats de date usuels', () => {
  for (const v of ['10/10/2026', '10/10/26', '10.10.2026', '10-10-2026', '2026-10-10']) {
    assert.strictEqual(normaliserDate(v), '10/10/2026', v);
  }
});
cas('dates invalides rejetées', () => {
  for (const v of ['32/01/2026', '10/13/2026', 'abc', '', '1010']) assert.strictEqual(normaliserDate(v), '', v);
});
cas('conversion ISO pour le champ date du formulaire U', () => {
  assert.strictEqual(versIso('10102026'), '2026-10-10');
  assert.strictEqual(versIso('18/08/26'), '2026-08-18');
});

/* --- Vrai texte OCR d'Apple (valeurs anonymisées) : il ne garde pas les lignes du ticket --- */
const OCR = fs.readFileSync(path.join(__dirname, 'fixtures/ticket-2026-10-10-ocr-apple.txt'), 'utf8');
const ATTENDU = { magasin: '10845', ticket: '41720', date: '10/10/2026', montant: '23,09', caisse: '007' };
const remplacer = (a, b) => { assert.ok(OCR.includes(a), 'fixture: "' + a + '" introuvable'); return OCR.replace(a, b); };

cas('OCR Apple réel : les 5 valeurs, sans aucun doute', () => sur(extraireTicket(OCR), ATTENDU));

/* Montant : jamais faux en silence */
cas('paiement en espèces (50,00 donnés, 26,91 rendus) → 23,09', () =>
  sur(extraireTicket(remplacer('CB SANS CONTACT', 'ESPECES\n50,00 €\nRENDU MONNAIE\n26,91 €')), ATTENDU));
cas('espèces 25,00 et rendu 1,91 (rendu plausible comme TVA) → 23,09', () =>
  sur(extraireTicket(remplacer('CB SANS CONTACT', 'ESPECES\n25,00 €\nA RENDRE\n1,91 €')), ATTENDU));
cas('solde Carte U égal au double du total → 23,09', () =>
  sur(extraireTicket(remplacer('0,20 €\n0,20 €', '46,18 €\n46,18 €')), ATTENDU));
cas('solde Carte U = total + hors-taxe → 23,09', () =>
  sur(extraireTicket(remplacer('0,20 €\n0,20 €', '45,15 €\n45,15 €')), ATTENDU));
cas('cumul d\'économies géant sur une ligne TOTAL → 23,09', () =>
  sur(extraireTicket(remplacer('TICKET A CONSERVER', 'TOTAL ECONOMIES 2026\n187,40 €')), ATTENDU));
cas('« 23, 09 » (espace parasite après la virgule)', () =>
  sur(extraireTicket(OCR.replace(/23,09/g, '23, 09')), ATTENDU));
cas('« 23,O9 » (lettre O au lieu de zéro)', () =>
  sur(extraireTicket(OCR.replace(/23,09/g, '23,O9')), ATTENDU));
cas('« 23.09 » et « 23,09€ » collé', () => {
  sur(extraireTicket(OCR.replace(/23,09/g, '23.09')), ATTENDU);
  sur(extraireTicket(OCR.replace(/23,09 €/g, '23,09€')), ATTENDU);
});
cas('achat de plus de 1 000 € : « 1 234,56 » et « 1.234,56 »', () => {
  for (const sep of [' ', '.']) {
    const t = OCR.replace(/23,09/g, '1' + sep + '234,56').replace(/22,06/g, '1' + sep + '137,84').replace(/1,03/g, '96,72');
    sur(extraireTicket(t), Object.assign({}, ATTENDU, { montant: '1234,56' }));
  }
});
cas('ticket sans TVA (tout à 0 %) : bon montant, mais signalé à vérifier', () => {
  const t = 'Magasin 10845\nRIZ 5KG\n7,45 EUR\nLAIT\n1,15 EUR\nHUILE\n3,30 EUR\nPAIN\n4,45 EUR\nTOTAL [4] Articles\nSOUS-TOTAL\nTOTAL TUA\nCB SANS CONTACT\n16,35 €\n16,35\n0,00\n16,35\nTVA\n0,00\nHT\n16,35 €\nTTC\n16,35 €\nDate\nHeure\nMagasin Tpu\n10/10/26 17:42:10 10845\n007\nUtil\n118\nTick\n41720';
  const r = extraireTicket(t);
  assert.strictEqual(r.montant, '16,35');
  assert.ok(r.doutes.includes('montant'));
});

/* Ligne du bas éclatée ou abîmée par l'OCR */
cas('n° de ticket rejeté après les horaires : laissé VIDE et signalé, jamais « 118 »', () => {
  const r = extraireTicket(remplacer('Tick\n41720\nOUVERT LE LUNDI\nDE 14h00 A 20h00', 'Tick\nOUVERT LE LUNDI\nDE 14h00 A 20h00\n41720'));
  assert.notStrictEqual(r.ticket, '118');
  assert.strictEqual(r.ticket, '');
  assert.deepStrictEqual(r.doutes, ['ticket']);
  assert.strictEqual(r.caisse, '007');
});
cas('« 41 720 » coupé en deux par l\'OCR : recollé, et signalé', () => {
  const r = extraireTicket(remplacer('\n41720\n', '\n41 720\n'));
  assert.strictEqual(r.ticket, '41720');
  assert.ok(r.doutes.includes('ticket'));
});
cas('lettres prises pour des chiffres (« O07 », « 1O/10/26 ») : réparé, confirmé par le code-barres', () => {
  sur(extraireTicket(remplacer('\n007\n', '\nO07\n')), ATTENDU);
  sur(extraireTicket(remplacer('10/10/26 17:42:10', '1O/10/26 17:42:10')), ATTENDU);
});
cas('réparation NON confirmée (code-barres absent) : signalée à vérifier', () => {
  const sansCodeBarres = remplacer('\n007\n', '\nO07\n').replace(/\n0010\d+\n/, '\n');
  const r = extraireTicket(sansCodeBarres);
  assert.strictEqual(r.caisse, '007'); assert.ok(r.doutes.includes('caisse'));
});
cas('code magasin réparé (« 1O845 ») puis confirmé par l\'en-tête : pas de doute', () =>
  sur(extraireTicket(remplacer('17:42:10 10845', '17:42:10 1O845')), ATTENDU));
cas('heure abîmée : « 17:42.10 », « 17.42.10 », « 17: 42:10 », date+heure collées', () => {
  for (const h of ['10/10/26 17:42.10', '10/10/26 17.42.10', '10/10/26 17: 42:10', '10/10/2617:42:10']) {
    const r = extraireTicket(remplacer('10/10/26 17:42:10', h));
    assert.deepStrictEqual(valeurs(r), ATTENDU, h);
  }
});
cas('ticket de carte bancaire placé avant la ligne du bas (avec un code postal)', () => {
  const t = 'CARTE BANCAIRE\nLE 10/10/26 A 17:42:10\nSUPER U\n97400 VILLE TEST\n1234567\n30004 12345\nMONTANT=\n23,09 EUR\n' + OCR;
  sur(extraireTicket(t), ATTENDU);
});
cas('photo du bas du ticket seulement (sans l\'en-tête « Magasin ») : le code-barres prend le relais', () => {
  const bas = OCR.slice(OCR.indexOf('TOTAL [4] Articles')).replace(/CODE MAGASIN : \d+\n/, '');
  sur(extraireTicket(bas), ATTENDU);
});
cas('date d\'une promo plus haut + ligne du bas illisible : la date n\'est pas celle de la promo', () => {
  const t = remplacer('10/10/26 17:42:10', '10/10/26 l7h42').replace('VOS AVANTAGES CARTE U', "OFFRE VALABLE JUSQU'AU 31/12/2026\nVOS AVANTAGES CARTE U");
  assert.strictEqual(extraireTicket(t).date, '10/10/2026');
});
cas('texte vide ou sans rapport : tout est signalé, rien n\'est inventé', () => {
  for (const t of ['', 'bonjour']) {
    const r = extraireTicket(t);
    assert.deepStrictEqual(valeurs(r), { magasin: '', ticket: '', date: '', montant: '', caisse: '' });
    assert.deepStrictEqual(r.doutes, CINQ);
  }
});

/* --- Tickets reconstitués (texte qui a gardé ses lignes) --- */
cas('ticket du 18/08 (scan dégradé, lignes conservées)', () => {
  const t = 'SUPER U\nMAGASIN DE TEST\nHagasin 10845\nNETTOY.VITRES 3EN1 U PIS.750ML 1,33 c 13\nTOTAL [4] Articles 16,70 c\nSOUS-TOTAL 15,39 c\nTOTAL TVA 1,31 c\nCB SANS CONTACT 16,70 c\nIOTAL 1,31 c 15,39 c 16,70 c\n0010108451808260 09052811\nDate Heure Hagasin fpv Utll lick\n18/08/26 09:15:02 10845 009 201 52811\nA DIENTOT';
  sur(extraireTicket(t), { magasin: '10845', ticket: '52811', date: '18/08/2026', montant: '16,70', caisse: '009' });
});
cas('exemple officiel du site Super U (colonne « Ou »)', () => {
  const r = extraireTicket('Magasin 29620\nTOTAL (1) Article 0,25 €\nSOUS-TOTAL 0,25 €\nTOTAL TVA 0,01 €\nDate Heure Magasin Ou Util Tick\n26/09/24 52:00 29620 103 303 2064');
  assert.deepStrictEqual(valeurs(r), { magasin: '29620', ticket: '2064', date: '26/09/2024', montant: '0,25', caisse: '103' });
});

/* --- Texte copié par le raccourci iPhone (profil + OCR de la photo) --- */
const PROFIL = 'Nom: DUPONT\nPrénom: Jeanne\nAdresse: 1 rue des Tests\nComplément:\nCode postal: 97400\nVille: Saint-Denis\nTéléphone:\nE-mail: jeanne@example.com';
const PROFIL_ATTENDU = { nom: 'DUPONT', prenom: 'Jeanne', voie: '1 rue des Tests', complement: '', cp: '97400', ville: 'Saint-Denis', tel: '', email: 'jeanne@example.com' };

cas('profil : libellés avec accents, valeurs vides ignorées sans planter', () =>
  assert.deepStrictEqual(lireProfil(PROFIL), PROFIL_ATTENDU));
cas('texte du raccourci → 12 données pour le formulaire', () => {
  const d = lireTexteRaccourci('FACTURE-U\n' + PROFIL + '\n=== TICKET ===\n' + OCR);
  assert.deepStrictEqual(Object.assign({}, PROFIL_ATTENDU, ATTENDU, { doutes: [] }), d);
});
cas('texte du raccourci APLATI (collé via la boîte de saisie) : profil et ticket toujours lus', () => {
  const d = lireTexteRaccourci(('FACTURE-U\n' + PROFIL + '\n=== TICKET ===\n' + OCR).replace(/\n/g, ' '));
  assert.deepStrictEqual(Object.assign({}, PROFIL_ATTENDU, ATTENDU, { doutes: [] }), d);
});
cas('le texte du ticket ne pollue pas le profil', () => {
  const d = lireTexteRaccourci('FACTURE-U\nNom: X\n=== TICKET ===\nVille: PIEGE\n' + OCR);
  assert.strictEqual(d.ville, undefined);
});
cas('un JSON de l\'app n\'est pas pris pour du texte de raccourci', () => {
  assert.strictEqual(lireTexteRaccourci('{"v":1,"magasin":"10845"}'), null);
});

console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les tests passent.');
process.exit(echecs ? 1 : 0);
