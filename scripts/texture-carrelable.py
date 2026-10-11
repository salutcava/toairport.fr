"""
Rend carrelable la texture de grain sortie de fal.ai, et la met au format servi.

Outil manuel, lancé une fois après `npm run images -- texture-grain` ; il ne fait
partie ni de la construction ni des tests. Demande Python et Pillow.

    python3 scripts/texture-carrelable.py assets/images/texture-grain.png

Repris du dépôt rappl, où chaque étape corrige un défaut mesuré :

- champ plat : le modèle éclaire toujours un peu la scène, et la pente devient un
  damier une fois carrelée ; on soustrait une version très floue ;
- périodisation : fondu triangulaire avec l'image décalée d'une demi-tuile, exact
  par construction sur une texture stochastique ;
- contraste : mesuré puis corrigé vers CIBLE, avec un gain plafonné (une source
  sans matière se régénère, elle ne s'étire pas).

Différence avec rappl : la tuile sort en gris neutre centré sur 128, parce qu'elle
se pose en `mix-blend-mode: overlay` sur le fond noir (voir `body::before` dans
assets/style.css). Un gris 128 en overlay ne change pas la couleur du fond, seules
les variations du grain se voient.

Le script imprime ses mesures : l'écart-type doit rester au-dessus de huit, et
l'excès au raccord autour de un.
"""

import statistics
import sys

from PIL import Image, ImageFilter, ImageStat

COTE = 512
QUALITE = 92

# L'écart-type visé, en niveaux sur 255.
#
# Réduire l'image et la périodiser coûtent tous les deux du contraste : la
# première sortie tombait de 15,6 à 7,9. Plutôt qu'un facteur écrit à la main,
# qui vaudrait pour cette génération-là seulement, le script mesure et corrige.
# Onze est ce qui laisse un grain de trois niveaux et demi une fois posé sous le
# voile de la page, ce qui est le seuil où il se voit sans se remarquer.
#
# Le gain est plafonné : au-delà, c'est que la source n'a pas de matière et
# qu'il faut la regénérer, pas l'étirer. Étirer une source pauvre remonte ses
# défauts de compression avec, ce qui a coûté six mois de page sans grain.
CIBLE = 11.0
GAIN_MAXIMUM = 2.0


def champ_plat(image):
    """Retire l'éclairage macro et garde la fibre."""
    fond = image.filter(ImageFilter.GaussianBlur(image.size[0] / 16))
    moyennes = ImageStat.Stat(image).mean
    source, flou = image.load(), fond.load()
    sortie = Image.new('RGB', image.size)
    cible = sortie.load()
    for y in range(image.size[1]):
        for x in range(image.size[0]):
            cible[x, y] = tuple(
                max(0, min(255, source[x, y][c] - flou[x, y][c] + int(moyennes[c])))
                for c in range(3)
            )
    return sortie


def periodiser(image):
    """Rend la tuile exactement périodique, sans raccord visible."""
    largeur, hauteur = image.size
    source = image.load()
    sortie = Image.new('RGB', image.size)
    cible = sortie.load()
    for y in range(hauteur):
        ty = abs(2 * y / hauteur - 1)
        for x in range(largeur):
            poids = max(abs(2 * x / largeur - 1), ty)
            decale = source[(x + largeur // 2) % largeur, (y + hauteur // 2) % hauteur]
            ici = source[x, y]
            cible[x, y] = tuple(
                int(ici[c] * (1 - poids) + decale[c] * poids) for c in range(3)
            )
    return sortie


def mesurer(image):
    """Les deux nombres qui décident si la tuile est bonne."""
    gris = image.convert('L')
    largeur, hauteur = gris.size
    px = gris.load()
    raccord = statistics.mean(
        abs(px[largeur - 1, y] - px[0, y]) for y in range(hauteur)
    )
    voisine = statistics.mean(abs(px[1, y] - px[0, y]) for y in range(hauteur))
    return ImageStat.Stat(gris).stddev[0], raccord / voisine


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage : texture-carrelable.py <source.png>')

    source = sys.argv[1]
    depart = Image.open(source).convert('RGB')
    ecart_depart, raccord_depart = mesurer(depart)
    print(f'source     {depart.size[0]}x{depart.size[1]}  '
          f'écart {ecart_depart:.2f}  raccord {raccord_depart:.2f} x')

    # Découpe au centre à pleine résolution plutôt que réduction : réduire 2048 -> 512
    # moyennait le grain fin et faisait tomber l'écart-type brut à 2,3 (mesuré).
    gauche = (depart.size[0] - COTE) // 2
    haut = (depart.size[1] - COTE) // 2
    tuile = periodiser(champ_plat(depart.crop((gauche, haut, gauche + COTE, haut + COTE))))

    brut, _ = mesurer(tuile)
    gain = min(CIBLE / brut, GAIN_MAXIMUM)
    moyennes = ImageStat.Stat(tuile).mean
    tuile = Image.merge(
        'RGB',
        [
            canal.point(
                lambda v, m=moyennes[c]: max(0, min(255, int((v - m) * gain + m)))
            )
            for c, canal in enumerate(tuile.split())
        ],
    )
    print(f'gain       x{gain:.2f}  (écart brut {brut:.2f})')

    tuile = tuile.convert('L')
    decalage = 128 - ImageStat.Stat(tuile).mean[0]
    tuile = tuile.point(lambda v: max(0, min(255, int(v + decalage)))).convert('RGB')

    ecart, raccord = mesurer(tuile)

    sortie = source.rsplit('.', 1)[0] + '.jpg'
    tuile.save(sortie, quality=QUALITE, subsampling=0, optimize=True)

    poids = len(open(sortie, 'rb').read()) // 1024
    print(f'tuile      {COTE}x{COTE}  écart {ecart:.2f}  raccord {raccord:.2f} x  '
          f'{poids} ko')
    if ecart < 8:
        print('  ATTENTION : sous huit d’écart-type, il n’y a pas de matière.')
    if raccord > 1.2:
        print('  ATTENTION : le raccord se verra une fois carrelé.')


if __name__ == '__main__':
    main()
