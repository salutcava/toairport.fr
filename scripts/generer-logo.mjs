/**
 * Logo toAirport : le lumineux de taxi parisien, avec « toAirport.fr » en rouge
 * à la place de « TAXI » et « PARIS » dessous, sur ses trois pastilles A, B, C.
 *
 *   npm run logo
 *
 * Le texte est vectorisé (opentype.js, polices Barlow sous licence OFL) : les SVG
 * ne dépendent d'aucune police chargée. Le script se lance à la main, ses sorties
 * se commitent. Rastérisation par `sips` (macOS), montages par `ffmpeg`.
 *
 * Sorties :
 *   assets/logo/lumineux.svg        logo complet, fond transparent (en-tête, pied de page)
 *   assets/logo/icone.svg           icône carrée « tA » (favicon, avatar)
 *   assets/logo/icone-512.png       icône en PNG
 *   assets/logo/lumineux-1200.png   logo complet en PNG, fond transparent
 *   assets/logo/lumineux-carre-1200.png  logo complet centré dans un carré, fond transparent
 *   assets/logo/icone-transparente-512.png  dôme « tA » seul, fond transparent
 *   assets/logo/gmb-logo.png        logo fiche Google, 720×720, lisible dans le rond
 *   assets/logo/gmb-couverture.jpg  couverture fiche Google, 1080×608
 *   assets/og-image.jpg             image de partage, 1200×630
 *   favicon.svg, favicon.ico, apple-touch-icon.png à la racine
 *
 * On ne remet jamais « TAXI PARISIEN » sur le lumineux : c'est l'enseigne
 * réglementée des taxis sous licence, et toAirport est une plateforme de mise en
 * relation, pas un taxi.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import opentype from 'opentype.js'

const RACINE = new URL('..', import.meta.url).pathname
const POLICES = join(RACINE, 'node_modules/@fontsource')
const charger = f => { const b = readFileSync(f); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) }
const titre = charger(join(POLICES, 'barlow-semi-condensed/files/barlow-semi-condensed-latin-800-normal.woff'))
const titreNoir = charger(join(POLICES, 'barlow-semi-condensed/files/barlow-semi-condensed-latin-900-normal.woff'))
const sousTitre = charger(join(POLICES, 'barlow/files/barlow-latin-700-normal.woff'))

const ROUGE = '#d8322b'
const NOIR = '#0a0a0b'
const OR = '#c9a96e'

/** Texte vectorisé, centré sur cx, avec un espacement en unités SVG. */
function texte(police, chaine, cx, y, taille, { espacement = 0, couleur }) {
  const avances = [...chaine].map(c => police.getAdvanceWidth(c, taille))
  const largeur = avances.reduce((a, b) => a + b, 0) + espacement * (chaine.length - 1)
  let x = cx - largeur / 2
  const d = [...chaine].map((c, i) => {
    const p = police.getPath(c, x, y, taille).toPathData(2)
    x += avances[i] + espacement
    return p
  }).join('')
  return `<path d="${d}" fill="${couleur}"/>`
}

/** Taille de police pour qu'une chaîne tienne dans une largeur donnée. */
const tailleAjustee = (police, chaine, largeur) => largeur / police.getAdvanceWidth(chaine, 1)

const defs = `
  <linearGradient id="dome" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbfaf6"/><stop offset=".7" stop-color="#ecebe5"/><stop offset="1" stop-color="#d6d4cc"/>
  </linearGradient>
  <linearGradient id="socle" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c4c2ba"/><stop offset="1" stop-color="#8e8c85"/>
  </linearGradient>
  <linearGradient id="pa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf4"/><stop offset="1" stop-color="#d8d1b9"/></linearGradient>
  <linearGradient id="pb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8aa5a"/><stop offset="1" stop-color="#cf661a"/></linearGradient>
  <linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63adf3"/><stop offset="1" stop-color="#2669bb"/></linearGradient>`

const PASTILLES = [
  { lettre: 'A', fond: 'url(#pa)', encre: '#4a463a' },
  { lettre: 'B', fond: 'url(#pb)', encre: '#5a2a07' },
  { lettre: 'C', fond: 'url(#pc)', encre: '#0b2f57' },
]

/** Le lumineux complet, dans un repère 300×150. */
function lumineux() {
  const tTitre = Math.min(tailleAjustee(titre, 'toAirport.fr', 206), 46)
  const pastilles = PASTILLES.map((p, i) => {
    const cx = 100 + i * 50
    return `<rect x="${cx - 17}" y="117" width="34" height="25" rx="4" fill="${p.fond}"/>` +
      `<rect x="${cx - 17}" y="117" width="34" height="25" rx="4" fill="none" stroke="#000" stroke-opacity=".25"/>` +
      texte(sousTitre, p.lettre, cx, 136, 17, { couleur: p.encre })
  }).join('')
  return `
    <path d="M16 104 L38 26 Q42 10 60 10 L240 10 Q258 10 262 26 L284 104 Z" fill="url(#dome)" stroke="#a9a69e" stroke-width=".8"/>
    <path d="M44 22 Q48 15 60 15 L240 15 Q252 15 256 22" fill="none" stroke="#fff" stroke-width="2" stroke-opacity=".9" stroke-linecap="round"/>
    ${texte(titre, 'toAirport.fr', 150, 63, tTitre, { couleur: ROUGE })}
    ${texte(sousTitre, 'PARIS', 150, 93, 24, { espacement: 7, couleur: '#1d1d1f' })}
    <rect x="8" y="102" width="284" height="12" rx="3" fill="url(#socle)"/>
    ${pastilles}`
}

/** Icône carrée 512 : le dôme seul avec « tA ». */
function icone({ fond = true } = {}) {
  const pastilles = PASTILLES.map((p, i) =>
    `<rect x="${170 + i * 66}" y="388" width="40" height="40" rx="8" fill="${p.fond}"/>`).join('')
  return `
    ${fond ? `<rect width="512" height="512" rx="112" fill="url(#fondIcone)"/>` : ''}
    <path d="M70 340 L126 128 Q134 96 168 96 L344 96 Q378 96 386 128 L442 340 Z" fill="url(#dome)"/>
    <path d="M140 118 Q150 106 170 106 L342 106 Q362 106 372 118" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    ${texte(titreNoir, 'tA', 256, 296, 190, { espacement: -4, couleur: ROUGE })}
    <rect x="52" y="336" width="408" height="30" rx="8" fill="url(#socle)"/>
    ${pastilles}`
}

const fondIcone = `<radialGradient id="fondIcone" cx=".5" cy=".35" r=".75">
    <stop offset="0" stop-color="#25232a"/><stop offset="1" stop-color="${NOIR}"/></radialGradient>`

const svg = (vb, contenu, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><title>toAirport.fr</title><defs>${defs}${extra}</defs>${contenu}</svg>\n`

/** Calque transparent à poser sur une photo : voile, lueur et logo centrés. */
function calque(l, h, largeurLogo, legende) {
  const k = largeurLogo / 300
  const x = (l - largeurLogo) / 2
  const y = h / 2 - (150 * k) / 2 - (legende ? h * 0.05 : 0)
  return svg(`0 0 ${l} ${h}`, `
    <rect width="${l}" height="${h}" fill="url(#voile)"/>
    <ellipse cx="${l / 2}" cy="${y + 128 * k}" rx="${largeurLogo * 0.62}" ry="${46 * k}" fill="url(#lueur)"/>
    <g transform="translate(${x} ${y}) scale(${k})">${lumineux()}</g>
    ${legende ? texte(sousTitre, legende, l / 2, y + 150 * k + h * 0.1, h * 0.042, { espacement: h * 0.006, couleur: OR }) : ''}`,
  `<radialGradient id="voile" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="${NOIR}" stop-opacity=".55"/><stop offset="1" stop-color="${NOIR}" stop-opacity=".9"/></radialGradient>
   <radialGradient id="lueur"><stop offset="0" stop-color="${OR}" stop-opacity=".35"/><stop offset="1" stop-color="${OR}" stop-opacity="0"/></radialGradient>`)
}

const tmp = await mkdtemp(join(tmpdir(), 'logo-'))
const sips = (src, taille, dest) => execFileSync('sips', ['-s', 'format', 'png', '-Z', String(taille), src, '--out', dest], { stdio: 'ignore' })
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
const DOSSIER = join(RACINE, 'assets/logo')
await mkdir(DOSSIER, { recursive: true })

// SVG
const svgLumineux = svg('0 0 300 150', lumineux())
const svgIcone = svg('0 0 512 512', icone(), fondIcone)
await writeFile(join(DOSSIER, 'lumineux.svg'), svgLumineux)
await writeFile(join(DOSSIER, 'icone.svg'), svgIcone)
await copyFile(join(DOSSIER, 'icone.svg'), join(RACINE, 'favicon.svg'))

// PNG à fond transparent
sips(join(DOSSIER, 'lumineux.svg'), 1200, join(DOSSIER, 'lumineux-1200.png'))
await writeFile(join(tmp, 'lumineux-carre.svg'), svg('-10 -85 320 320', lumineux()))
sips(join(tmp, 'lumineux-carre.svg'), 1200, join(DOSSIER, 'lumineux-carre-1200.png'))
await writeFile(join(tmp, 'icone-transparente.svg'), svg('0 0 512 512', icone({ fond: false })))
sips(join(tmp, 'icone-transparente.svg'), 512, join(DOSSIER, 'icone-transparente-512.png'))

// Icônes PNG et favicon.ico
sips(join(DOSSIER, 'icone.svg'), 512, join(DOSSIER, 'icone-512.png'))
const icone180 = svg('0 0 512 512', `<rect width="512" height="512" fill="url(#fondIcone)"/>${icone({ fond: false })}`, fondIcone)
await writeFile(join(tmp, 'apple.svg'), icone180)
sips(join(tmp, 'apple.svg'), 180, join(RACINE, 'apple-touch-icon.png'))
sips(join(DOSSIER, 'icone.svg'), 48, join(tmp, 'ico.png'))
ffmpeg('-i', join(tmp, 'ico.png'), join(RACINE, 'favicon.ico'))

// Logo fiche Google : Google le découpe en rond, le lumineux reste dans le cercle.
await writeFile(join(tmp, 'gmb.svg'), svg('0 0 720 720', `
  <rect width="720" height="720" fill="url(#fondIcone)"/>
  <ellipse cx="360" cy="438" rx="300" ry="60" fill="url(#lueur)"/>
  <g transform="translate(110 238) scale(1.6667)">${lumineux()}</g>`,
`${fondIcone}<radialGradient id="lueur"><stop offset="0" stop-color="${OR}" stop-opacity=".3"/><stop offset="1" stop-color="${OR}" stop-opacity="0"/></radialGradient>`))
sips(join(tmp, 'gmb.svg'), 720, join(DOSSIER, 'gmb-logo.png'))

// Montages sur la photo de nuit du site
const photo = join(RACINE, 'assets/images/paris-nuit.webp')
async function montage(l, h, largeurLogo, legende, dest) {
  await writeFile(join(tmp, 'calque.svg'), calque(l, h, largeurLogo, legende))
  sips(join(tmp, 'calque.svg'), Math.max(l, h), join(tmp, 'calque.png'))
  ffmpeg('-i', photo, '-i', join(tmp, 'calque.png'), '-filter_complex',
    `[0]scale=${l}:${h}:force_original_aspect_ratio=increase,crop=${l}:${h}[f];[1]scale=${l}:${h}[c];[f][c]overlay`,
    '-frames:v', '1', '-q:v', '3', dest)
}
await montage(1080, 608, 520, 'TAXIS PARISIENS · ORLY · CDG', join(DOSSIER, 'gmb-couverture.jpg'))
await montage(1200, 630, 560, 'TAXIS PARISIENS · ORLY · CDG', join(RACINE, 'assets/og-image.jpg'))

console.log('Logo généré dans assets/logo/, favicon à la racine, og-image dans assets/.')
