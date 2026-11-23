/* Run with: node tests/test.js — no dependencies. */
const assert = require('assert');
const { normaliserDate, versIso } = require('../src/date.js');
const { extraireTicket } = require('../src/ticket.js');
const { lireProfil, lireTexteRaccourci } = require('../src/profil.js');

let echecs = 0;
function cas(nom, fn) {
  try { fn(); console.log('✓', nom); }
  catch (e) { echecs++; console.log('✗', nom, '\n   ', e.message); }
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

/* --- Tickets réels --- */
const TICKET_18_08 = `SUPER U
ST GILLES LES IIAUTS EPERON
Hagasin 99698
NETTOY.VITRES 3EN1 U PIS.750ML 1,33 c 13
TOTAL [4] Articles 16,70 c
SOUS-TOTAL 15,39 c
TOTAL TVA 1,31 c
CB SANS CONTACT 16,70 c
IOTAL 1,31 c 15,39 c 16,70 c
Date Heure Hagasin fpv Utll lick
18/08/26 13:48:35 99698 012 713 25065
A DIENTOT`;

const TICKET_10_10 = `SUPER U
ST GILLES LES HAUTS EPERON
Magasin 99698
STARBUCKS GR SGL ORIGIN COLO 4 9,90 € 0
PIST.A/CALC.ACTI.CAROLIN 650ML 4,99 € 13
PAP.STYL.AQ.TUB.MOLTONEL.3P X6 4,90 € 13
LIQ.VSL.VINAIG.&CIT.PAIC 750ML 3,30 € 13
Nombre de lignes d'article 4
TOTAL [4] Articles 23,09 €
SOUS-TOTAL 22,06 €
TOTAL TVA 1,03 €
Dont articles éligibles TR 9,90 €
CB SANS CONTACT 23,09 €
TVA HT TTC
0 0,00 0,00 € 9,90 € 9,90 €
13 8,50 1,03 € 12,16 € 13,19 €
TOTAL 1,03 € 22,06 € 23,09 €
VOS AVANTAGES CARTE U
CODE MAGASIN : 99698
VOTRE SOLDE € CARTE U PRECEDENT : 0,20 €
TICKET A CONSERVER
0010996981010260050306 09
Date Heure Magasin Tpv Util Tick
10/10/26 18:03:24 99698 005 302 30609`;

cas('ticket réel du 18/08/2026 (scan dégradé)', () => {
  assert.deepStrictEqual(extraireTicket(TICKET_18_08),
    { magasin: '99698', ticket: '25065', date: '18/08/2026', montant: '16,70', caisse: '012' });
});
cas('ticket réel du 10/10/2026 (photo)', () => {
  assert.deepStrictEqual(extraireTicket(TICKET_10_10),
    { magasin: '99698', ticket: '30609', date: '10/10/2026', montant: '23,09', caisse: '005' });
});
cas('une ligne "TOTAL REMISES" après le total ne fausse plus le montant', () => {
  const t = TICKET_10_10.replace('TICKET A CONSERVER', 'TOTAL REMISES CARTE U 1,50 €');
  assert.strictEqual(extraireTicket(t).montant, '23,09');
});
cas('un cumul d\'économies plus grand que le total ne fausse pas le montant', () => {
  const t = TICKET_10_10.replace('TICKET A CONSERVER', 'TOTAL ECONOMIES DEPUIS LE 01/01 152,30 €');
  assert.strictEqual(extraireTicket(t).montant, '23,09');
});
cas('OCR qui met un point au lieu de la virgule', () => {
  assert.strictEqual(extraireTicket(TICKET_10_10.replace('TOTAL [4] Articles 23,09', 'TOTAL [4] Articles 23.09')).montant, '23,09');
});
cas('en-tête de colonnes perdu par l\'OCR', () => {
  const r = extraireTicket('Magasin 29620\nTOTAL 18,59 €\n26/09/24 52:00 29620 103 303 2064');
  assert.strictEqual(r.magasin, '29620'); assert.strictEqual(r.caisse, '103'); assert.strictEqual(r.ticket, '2064');
});
cas('exemple officiel du site Super U (colonne "Ou")', () => {
  const r = extraireTicket(`Magasin 29620\nTOTAL (1) Article 0,25 €\nSOUS-TOTAL 0,25 €\nTOTAL TVA 0,01 €\nDate Heure Magasin Ou Util Tick\n26/09/24 52:00 29620 103 303 2064`);
  assert.deepStrictEqual(r, { magasin: '29620', ticket: '2064', date: '26/09/2024', montant: '0,25', caisse: '103' });
});


/* --- Vrai texte produit par l'OCR d'Apple (Vision, même moteur que l'iPhone) ---
   Il ne garde pas les lignes du ticket : montants et ligne récapitulative arrivent éclatés. */
const OCR_APPLE = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/ticket-2026-10-10-ocr-apple.txt'), 'utf8');

cas('vrai OCR Apple du ticket du 10/10/2026 (texte éclaté en colonnes)', () => {
  assert.deepStrictEqual(extraireTicket(OCR_APPLE),
    { magasin: '99698', ticket: '30609', date: '10/10/2026', montant: '23,09', caisse: '005' });
});
cas('OCR éclaté + cumul d\'économies géant : la vérification arithmétique tient', () => {
  const t = OCR_APPLE.replace('TICKET A CONSERVER', 'TOTAL ECONOMIES 2026\n187,40 €');
  assert.strictEqual(extraireTicket(t).montant, '23,09');
});
cas('OCR éclaté : un ticket CB avec date et heure avant la ligne récapitulative', () => {
  const t = 'CARTE BANCAIRE\n10/10/26 18:03\nMONTANT\n23,09 EUR\n' + OCR_APPLE;
  const r = extraireTicket(t);
  assert.strictEqual(r.ticket, '30609'); assert.strictEqual(r.caisse, '005');
});

/* --- Texte copié par le raccourci iPhone (profil + OCR de la photo) --- */
const PROFIL_TEST = 'Nom: DUPONT\nPrénom: Jeanne\nAdresse: 1 rue des Tests\nComplément:\nCode postal: 97400\nVille: Saint-Denis\nTéléphone:\nE-mail:';

cas('profil : libellés avec accents, valeurs vides ignorées sans planter', () => {
  assert.deepStrictEqual(lireProfil(PROFIL_TEST),
    { nom: 'DUPONT', prenom: 'Jeanne', voie: '1 rue des Tests', complement: '', cp: '97400', ville: 'Saint-Denis', tel: '', email: '' });
});
cas('texte du raccourci (profil + vrai OCR Apple) → 12 données pour le formulaire', () => {
  const d = lireTexteRaccourci('FACTURE-U\n' + PROFIL_TEST + '\n=== TICKET ===\n' + OCR_APPLE);
  assert.strictEqual(d.nom, 'DUPONT'); assert.strictEqual(d.cp, '97400');
  assert.strictEqual(d.magasin, '99698'); assert.strictEqual(d.ticket, '30609');
  assert.strictEqual(d.date, '10/10/2026'); assert.strictEqual(d.montant, '23,09'); assert.strictEqual(d.caisse, '005');
});
cas('le texte du ticket ne pollue pas le profil (ex. "Ville:" absent du ticket)', () => {
  const d = lireTexteRaccourci('FACTURE-U\nNom: X\n=== TICKET ===\nVille: PIEGE\n' + OCR_APPLE);
  assert.strictEqual(d.ville, undefined);
});
cas('un JSON de l\'app n\'est pas pris pour du texte de raccourci', () => {
  assert.strictEqual(lireTexteRaccourci('{"v":1,"magasin":"99698"}'), null);
});

console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les tests passent.');
process.exit(echecs ? 1 : 0);
