/**
 * Génération des images d'ambiance du site avec fal.ai.
 *
 *   npm run images              tout régénérer
 *   npm run images -- a,b       seulement les images nommées
 *
 * Demande FAL_KEY dans .env.local (jamais commité). Le script se lance à la main :
 * il ne fait partie ni du déploiement ni des tests, et les pages n'appellent jamais
 * fal.ai. Les images sont produites une fois, converties, relues, puis commitées.
 *
 * Après génération, convertir en WebP à la bonne taille (les .jpg bruts ne se
 * commitent pas, ils pèsent près d'un mégaoctet) :
 *
 *   cwebp -q 70 -crop 480 0 2656 1344 -resize 2000 0 assets/images/paris-nuit.jpg -o assets/images/paris-nuit.webp
 *   cwebp -q 68 -crop 480 0 2656 1344 -resize 900 0 assets/images/paris-nuit.jpg -o assets/images/paris-nuit-m.webp
 *   cwebp -q 70 -resize 1600 0 assets/images/route-aeroport.jpg -o assets/images/route-aeroport.webp
 *   cwebp -q 68 -resize 900 0 assets/images/route-aeroport.jpg -o assets/images/route-aeroport-m.webp
 *   cwebp -q 70 -resize 1600 0 assets/images/quai-seine.jpg -o assets/images/quai-seine.webp
 *
 * Le recadrage de paris-nuit retire le bord gauche : le tirage gardé (graine
 * 2049066762) y montre une deuxième tour Eiffel minuscule.
 *
 * La texture de grain suit un autre chemin, en PNG puis carrelée :
 *
 *   npm run images -- texture-grain
 *   python3 scripts/texture-carrelable.py assets/images/texture-grain.png
 *   cwebp -q 75 assets/images/texture-grain.jpg -o assets/images/texture-grain.webp
 *
 * Seuls les .webp se commitent (.jpg et .png bruts ignorés par git).
 *
 * Relire chaque image avant de la commiter : aucun test ne voit un cadrage raté,
 * un logo de compagnie inventé ou du faux texte sur un panneau. toAirport est une
 * plateforme de taxis indépendants, sans flotte : aucune image ne doit laisser
 * croire à « nos véhicules ». Les images sont du décor (la ville, la route, la
 * Seine), jamais une fausse photo du service.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CLE = process.env.FAL_KEY
if (!CLE) throw new Error('FAL_KEY absent de l’environnement (.env.local)')

const SORTIE = process.argv[2] ?? './assets/images'
const MODELE = 'fal-ai/flux-pro/v1.1-ultra'

/*
 * Suffixe de style commun à toutes les photos : sans lui, chaque image arrive avec
 * sa lumière et sa palette, et la page ressemble à un assemblage de banques
 * d'images. Il reprend la charte du site : noir profond et or (#c9a96e).
 * La texture le refuse (styleCommun: false), sinon elle devient une photo.
 *
 * Un modèle de diffusion n'a pas de « ne pas » : nommer un objet le fait
 * apparaître. On décrit donc ce qu'on veut voir plutôt que ce qu'on refuse.
 */
const STYLE = [
  'cinematic night photograph, quiet and elegant, shot on 35mm film',
  'deep blue-black shadows, warm amber and soft gold street lights as the only colour',
  'low saturation, gentle film grain, high dynamic range, crisp but soft highlights',
  'large calm areas of near-black sky or shadow for overlaid text',
  'empty of people, plain unbranded surfaces, blank signage',
].join(', ')

const images = [
  {
    nom: 'paris-nuit',
    ratio: '21:9',
    prompt:
            // Premier tirage : deux tours Eiffel. Une seule tour, placée précisément, à un seul endroit du prompt.
      'High wide view over the zinc rooftops of Paris at the end of blue hour, the Seine curving through the middle of the city, its stone bridges lit in warm gold, Haussmann roofs and chimneys in the foreground. One single landmark on the skyline: the Eiffel Tower, small, at the far right edge. The upper half of the frame is a deep dark sky.',
  },
  {
    nom: 'route-aeroport',
    ratio: '16:9',
    prompt:
      'Long exposure of a wide motorway at night curving towards an airport, smooth streaks of warm white and gold headlights, a distant air traffic control tower silhouette, the landing lights of an aircraft in the dark sky, motorway lamps fading into the distance.',
  },
  {
    nom: 'quai-seine',
    ratio: '16:9',
    prompt:
      'Low view along the stone quay of the Seine in Paris at night, cobblestones wet and glistening, old iron lamp posts reflected in long gold ripples on the dark water, a stone bridge arch in soft focus in the background.',
  },
  {
    nom: 'texture-grain',
    ratio: '1:1',
    format: 'png',
    styleCommun: false,
    prompt:
      'Seamless flat texture of fine analog film grain on an even mid-grey surface, uniform random grain everywhere, evenly lit, no objects, no vignette, no gradient, top-down scan.',
  },
]

async function generer(image) {
  const reponse = await fetch(`https://fal.run/${MODELE}`, {
    method: 'POST',
    headers: { Authorization: `Key ${CLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: image.styleCommun === false ? image.prompt : `${image.prompt} ${STYLE}`,
      aspect_ratio: image.ratio,
      num_images: 1,
      output_format: image.format ?? 'jpeg',
      enable_safety_checker: true,
      // Graine épinglée seulement pour une image relue et gardée : la rend reproductible.
      ...(image.graine === undefined ? {} : { seed: image.graine }),
    }),
  })
  if (!reponse.ok) throw new Error(`${image.nom} : ${reponse.status} ${await reponse.text()}`)

  const resultat = await reponse.json()
  const url = resultat.images?.[0]?.url
  if (!url) throw new Error(`${image.nom} : aucune image dans la réponse`)
  const octets = Buffer.from(await (await fetch(url)).arrayBuffer())

  // Le vérificateur de sécurité rend une image noire au lieu d'une erreur :
  // on la reconnaît à son poids (dépôt rappl, une image sur quatorze).
  if (octets.length < 50 * 1024) {
    throw new Error(`${image.nom} : ${Math.round(octets.length / 1024)} ko, probablement caviardée, à relancer`)
  }

  const chemin = join(SORTIE, `${image.nom}.${image.format ?? 'jpg'}`)
  await writeFile(chemin, octets)
  return { nom: image.nom, poids: Math.round(octets.length / 1024), graine: resultat.seed }
}

await mkdir(SORTIE, { recursive: true })
const demandees = process.argv[3] ? process.argv[3].split(',') : null
const aFaire = demandees ? images.filter((i) => demandees.includes(i.nom)) : images
const resultats = await Promise.allSettled(aFaire.map(generer))
for (const [i, r] of resultats.entries()) {
  if (r.status === 'fulfilled') console.log(`ok  ${r.value.nom}  ${r.value.poids} ko  graine ${r.value.graine}`)
  else console.error(`ÉCHEC  ${aFaire[i].nom}  ${r.reason.message}`)
}
