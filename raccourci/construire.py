#!/usr/bin/env python3
"""Builds and signs the iPhone Shortcut "Facture U".

  python3 raccourci/construire.py                      # template, placeholder profile
  python3 raccourci/construire.py --profil FICHIER --sortie "Facture U.shortcut"

The Shortcut: takes a photo of the receipt, extracts its text with Apple's on-device OCR,
copies "FACTURE-U / profile / === TICKET === / OCR text" to the clipboard, and opens the Super U
form in Safari. The "Remplir facture U" bookmarklet then reads that text (src/profil.js) and
fills the form. The camera is deliberately NOT run from Safari's share sheet: shortcuts run
there in a restricted extension environment.

Never commit a personalised .shortcut: this repository is public.
"""
import argparse
import os
import plistlib
import subprocess
import sys
import tempfile
import uuid

FORM_URL = 'https://www.magasins-u.com/ma-facture-u'
OBJ = '￼'   # Shortcuts' placeholder character for an inline variable

PROFIL_MODELE = """Nom: À REMPLIR
Prénom: À REMPLIR
Adresse: À REMPLIR
Complément:
Code postal: À REMPLIR
Ville: À REMPLIR
Téléphone:
E-mail:"""


def nouvel_uuid():
    return str(uuid.uuid4()).upper()


def sortie(uuid_action, nom):
    return {'OutputUUID': uuid_action, 'Type': 'ActionOutput', 'OutputName': nom}


def variable(attachement):
    return {'Value': attachement, 'WFSerializationType': 'WFTextTokenAttachment'}


def texte(gabarit, variables=()):
    """gabarit uses OBJ where each variable goes; ranges are counted in UTF-16 units."""
    plages, curseur, i = {}, 0, 0
    for car in gabarit:
        if car == OBJ:
            plages['{%d, 1}' % curseur] = variables[i]
            i += 1
        curseur += len(car.encode('utf-16-le')) // 2
    assert i == len(variables), 'one variable per placeholder'
    return {'Value': {'string': gabarit, 'attachmentsByRange': plages}, 'WFSerializationType': 'WFTextTokenString'}


def action(identifiant, **params):
    return {'WFWorkflowActionIdentifier': 'is.workflow.actions.' + identifiant, 'WFWorkflowActionParameters': params}


def construire(profil):
    u_profil, u_photo, u_ocr, u_tout = (nouvel_uuid() for _ in range(4))
    actions = [
        action('comment', WFCommentActionText=
               'Tes coordonnées pour la facture (profil « client particulier »). '
               'Modifie le texte ci-dessous si elles changent ; garde le format « Libellé: valeur ».'),
        action('gettext', UUID=u_profil, WFTextActionText=texte(profil)),
        action('takephoto', UUID=u_photo, WFCameraCaptureShowPreview=True, WFPhotoCount=1),
        action('extracttextfromimage', UUID=u_ocr, WFImage=variable(sortie(u_photo, 'Photo'))),
        action('gettext', UUID=u_tout, WFTextActionText=texte(
            'FACTURE-U\n' + OBJ + '\n=== TICKET ===\n' + OBJ,
            [sortie(u_profil, 'Texte'), sortie(u_ocr, 'Texte de l’image')])),
        # Local only: the clipboard holds the address, keep it off Universal Clipboard
        action('setclipboard', WFInput=variable(sortie(u_tout, 'Texte')), WFLocalOnly=True),
        action('notification', WFNotificationActionTitle='Ticket lu',
               WFNotificationActionBody='Dans Safari, touche le favori « Remplir facture U ».',
               WFNotificationActionSound=False),
        action('openurl', WFInput=texte(FORM_URL)),
    ]
    return {
        'WFWorkflowClientVersion': '2607.0.2',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 463140863, 'WFWorkflowIconGlyphNumber': 59511},
        'WFWorkflowImportQuestions': [],
        'WFWorkflowTypes': [],
        'WFWorkflowInputContentItemClasses': [],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowHasOutputFallback': False,
        'WFQuickActionSurfaces': [],
        'WFWorkflowActions': actions,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--profil', help='text file with the "Nom: …" lines (default: placeholders)')
    p.add_argument('--sortie', default='Facture U (modèle).shortcut')
    a = p.parse_args()

    profil = open(a.profil, encoding='utf-8').read().strip() if a.profil else PROFIL_MODELE
    with tempfile.TemporaryDirectory() as tmp:
        brut = os.path.join(tmp, 'non-signe.shortcut')
        with open(brut, 'wb') as f:
            plistlib.dump(construire(profil), f, fmt=plistlib.FMT_BINARY)
        r = subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', brut, '--output', a.sortie],
                           capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(a.sortie):
            sys.exit('Signature refusée : ' + (r.stderr or r.stdout).strip())
    print('Raccourci signé :', a.sortie, '(%d octets)' % os.path.getsize(a.sortie))


if __name__ == '__main__':
    main()
