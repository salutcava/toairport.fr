// Serveur de production de toairport.fr, sur le VPS (Coolify, conteneur du Dockerfile).
// Sert les pages du dépôt telles quelles et reçoit les réservations sur POST /api/reservation.
// Reprend ce que faisait Netlify : en-têtes de sécurité, /tarifs -> /tarifs/, www -> domaine nu,
// fichiers internes jamais servis. La compression est faite par le proxy de Coolify.
// SEO : /index.html -> dossier, X-Robots-Tag noindex hors toairport.fr (adresse d'essai),
// cache de 30 jours sur les images, polices et la bibliothèque GSAP.
// Usage : node server/server.mjs (PORT, 3000 par défaut).
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { traiterReservation } from './reservation.mjs';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Premier segment d'URL jamais servi : code, docs de travail, outillage.
const BLOQUES = new Set([
  'server', 'scripts', 'docs', 'node_modules',
  'README.md', 'package.json', 'package-lock.json', 'Dockerfile',
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf',
};

const ENTETES = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

const TAILLE_MAX_CORPS = 20_000;

// Seul domaine indexable. Les autres (adresse d'essai toairport.vps.olivierlam.fr) reçoivent
// X-Robots-Tag: noindex, sauf en local.
const HOTE_CANONIQUE = 'toairport.fr';
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]']);

// Fichiers qui ne changent presque jamais : 30 jours de cache. Une image régénérée garde son nom,
// le navigateur peut donc garder l'ancienne jusqu'à 30 jours. HTML, CSS et JS restent revalidés
// à chaque visite (ETag, 304) : leurs noms ne changent pas d'un déploiement à l'autre.
const CACHE_LONG = new Set(['.webp', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2']);
const CACHE_LONG_DOSSIERS = ['/assets/vendor/'];
const CACHE_30_JOURS = 'public, max-age=2592000';
const CACHE_REVALIDE = 'public, max-age=0, must-revalidate';

function cachePour(chemin, extension) {
  if (CACHE_LONG.has(extension) || CACHE_LONG_DOSSIERS.some((d) => chemin.startsWith(d))) return CACHE_30_JOURS;
  return CACHE_REVALIDE;
}

function repondre(res, statut, entetes = {}, corps = '') {
  res.writeHead(statut, { ...ENTETES, ...res.entetesHote, ...entetes });
  res.end(corps);
}

function introuvable(res, tete) {
  repondre(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, tete ? '' : 'Page introuvable\n');
}

async function lireCorps(req) {
  let corps = '';
  for await (const morceau of req) {
    corps += morceau;
    if (corps.length > TAILLE_MAX_CORPS) throw new Error('trop gros');
  }
  return corps;
}

async function reservation(req, res) {
  if (req.method !== 'POST') {
    return repondre(res, 405, { 'Content-Type': 'application/json', Allow: 'POST' }, JSON.stringify({ error: 'Method not allowed' }));
  }
  let corps;
  try {
    corps = await lireCorps(req);
  } catch {
    return repondre(res, 413, { 'Content-Type': 'application/json' }, JSON.stringify({ error: 'Requête trop volumineuse' }));
  }
  const { statusCode, body } = await traiterReservation(corps);
  repondre(res, statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body);
}

async function fichier(req, res, url, racine) {
  const tete = req.method === 'HEAD';
  if (req.method !== 'GET' && !tete) return repondre(res, 405, { Allow: 'GET, HEAD' });

  let chemin;
  try {
    chemin = decodeURIComponent(url.pathname);
  } catch {
    return introuvable(res, tete);
  }
  if (chemin.endsWith('/index.html')) {
    return repondre(res, 301, { Location: `${chemin.slice(0, -'index.html'.length)}${url.search}` });
  }
  const segments = chemin.split('/').filter(Boolean);
  if (segments.some((s) => s.startsWith('.')) || BLOQUES.has(segments[0])) return introuvable(res, tete);

  let cible = resolve(join(racine, ...segments));
  if (cible !== racine && !cible.startsWith(racine + sep)) return introuvable(res, tete);

  let infos = await stat(cible).catch(() => null);
  if (infos?.isDirectory()) {
    if (!chemin.endsWith('/')) {
      return repondre(res, 301, { Location: `${url.pathname}/${url.search}` });
    }
    cible = join(cible, 'index.html');
    infos = await stat(cible).catch(() => null);
  }
  if (!infos?.isFile()) return introuvable(res, tete);

  const etag = `"${infos.size.toString(16)}-${Math.floor(infos.mtimeMs).toString(16)}"`;
  const entetes = {
    'Content-Type': TYPES[extname(cible).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cachePour(chemin, extname(cible).toLowerCase()),
    ETag: etag,
    'Last-Modified': infos.mtime.toUTCString(),
  };
  if (req.headers['if-none-match'] === etag) return repondre(res, 304, entetes);
  entetes['Content-Length'] = infos.size;
  if (tete) return repondre(res, 200, entetes);
  res.writeHead(200, { ...ENTETES, ...res.entetesHote, ...entetes });
  createReadStream(cible).pipe(res);
}

export function creerServeur({ racine = RACINE } = {}) {
  return createServer(async (req, res) => {
    try {
      const hote = (req.headers.host ?? '').toLowerCase();
      if (hote.startsWith('www.')) {
        return repondre(res, 301, { Location: `https://${hote.slice(4)}${req.url}` });
      }
      const nomHote = hote.replace(/:\d+$/, '');
      if (nomHote !== HOTE_CANONIQUE && !HOTES_LOCAUX.has(nomHote)) res.entetesHote = { 'X-Robots-Tag': 'noindex' };
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/api/reservation') return await reservation(req, res);
      return await fichier(req, res, url, racine);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) repondre(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Erreur serveur\n');
      else res.destroy();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  creerServeur().listen(port, '0.0.0.0', () => console.log(`toairport.fr sur le port ${port}`));
}
