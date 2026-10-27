// Tests du serveur de production : npm test (node --test, sans dépendance).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { creerServeur } from './server.mjs';
import { traiterReservation } from './reservation.mjs';

let serveur;
let port;

before(async () => {
  serveur = creerServeur();
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  port = serveur.address().port;
});

after(() => serveur.close());

// http.request plutôt que fetch : fetch normalise les chemins (/../) et impose son en-tête Host.
function appel(chemin, { methode = 'GET', hote = 'toairport.fr', corps, entetes = {} } = {}) {
  return new Promise((ok, ko) => {
    const req = request({ host: '127.0.0.1', port, path: chemin, method: methode, headers: { Host: hote, ...entetes } }, (res) => {
      let texte = '';
      res.setEncoding('utf8');
      res.on('data', (m) => { texte += m; });
      res.on('end', () => ok({ statut: res.statusCode, entetes: res.headers, texte }));
    });
    req.on('error', ko);
    if (corps !== undefined) req.write(corps);
    req.end();
  });
}

test('sert l\'accueil avec les en-têtes de sécurité', async () => {
  const r = await appel('/');
  assert.equal(r.statut, 200);
  assert.match(r.entetes['content-type'], /text\/html/);
  assert.equal(r.entetes['x-frame-options'], 'DENY');
  assert.equal(r.entetes['x-content-type-options'], 'nosniff');
  assert.equal(r.entetes['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(r.entetes['permissions-policy'], /geolocation=\(\)/);
  assert.match(r.texte, /<title>/);
});

test('ajoute la barre finale à un dossier, en gardant la requête', async () => {
  const r = await appel('/tarifs?x=1');
  assert.equal(r.statut, 301);
  assert.equal(r.entetes.location, '/tarifs/?x=1');
  assert.equal((await appel('/tarifs/')).statut, 200);
  assert.equal((await appel('/en/orly-airport-taxi/')).statut, 200);
});

test('sert les fichiers avec leur type', async () => {
  assert.match((await appel('/assets/style.css')).entetes['content-type'], /text\/css/);
  assert.match((await appel('/sitemap.xml')).entetes['content-type'], /xml/);
  assert.match((await appel('/robots.txt')).entetes['content-type'], /text\/plain/);
});

test('répond 304 quand le fichier n\'a pas changé', async () => {
  const { entetes } = await appel('/robots.txt');
  const r = await appel('/robots.txt', { entetes: { 'If-None-Match': entetes.etag } });
  assert.equal(r.statut, 304);
});

test('ne sert jamais les fichiers internes', async () => {
  for (const chemin of [
    '/README.md', '/package.json', '/package-lock.json', '/Dockerfile',
    '/docs/', '/scripts/verifier-en-ligne.mjs', '/server/server.mjs', '/server/reservation.mjs',
    '/.env.example', '/.git/config', '/.claude/', '/%2e%2e/%2e%2e/etc/passwd', '/../etc/passwd',
  ]) {
    assert.equal((await appel(chemin)).statut, 404, chemin);
  }
});

test('404 sur une page absente', async () => {
  assert.equal((await appel('/page-qui-n-existe-pas/')).statut, 404);
});

test('www renvoie vers le domaine nu', async () => {
  const r = await appel('/tarifs/', { hote: 'www.toairport.fr' });
  assert.equal(r.statut, 301);
  assert.equal(r.entetes.location, 'https://toairport.fr/tarifs/');
});

test('réservation : GET refusé, corps invalide ou incomplet refusé', async () => {
  assert.equal((await appel('/api/reservation')).statut, 405);
  assert.equal((await appel('/api/reservation', { methode: 'POST', corps: 'pas du json' })).statut, 400);
  const r = await appel('/api/reservation', { methode: 'POST', corps: JSON.stringify({ nom: 'Test' }) });
  assert.equal(r.statut, 400);
  assert.equal(r.entetes['cache-control'], 'no-store');
  assert.equal((await appel('/api/reservation', { methode: 'POST', corps: 'x'.repeat(30_000) })).statut, 413);
});

test('réservation complète : un email opérateur, un email client dans sa langue', async () => {
  const envoyes = [];
  const transport = { sendMail: async (m) => { envoyes.push(m); } };
  const env = { OVH_EMAIL_USER: 'contact@toairport.fr', RECIPIENT_EMAIL: 'operateur@example.test' };
  const demande = {
    nom: 'Client Test', email: 'client@example.test', telephone: '0600000000',
    adresse: '1 rue de Rennes', date: '2026-11-10', heure: '08:00', trajet: 'Paris → Orly', lang: 'en',
  };
  const r = await traiterReservation(JSON.stringify(demande), { env, transport });
  assert.equal(r.statusCode, 200);
  assert.equal(envoyes.length, 2);
  assert.equal(envoyes[0].to, 'operateur@example.test');
  assert.match(envoyes[0].subject, /^\[Réservation TA-\d{6}-[A-Z0-9]{4}\] Paris → Orly - Client Test/);
  assert.equal(envoyes[1].to, 'client@example.test');
  assert.match(envoyes[1].subject, /^Your booking request TA-/);
});

test('réservation : erreur SMTP renvoyée en 500', async () => {
  const transport = { sendMail: async () => { throw new Error('smtp en panne'); } };
  const demande = { nom: 'a', email: 'b@c.d', telephone: '1', adresse: 'x', date: 'd', heure: 'h' };
  const erreur = console.error;
  console.error = () => {};
  const r = await traiterReservation(JSON.stringify(demande), { env: {}, transport });
  console.error = erreur;
  assert.equal(r.statusCode, 500);
});
