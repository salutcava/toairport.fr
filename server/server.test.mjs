// Tests du serveur de production : npm test (node --test, sans dépendance).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { creerServeur } from './server.mjs';
import { traiterReservation } from './reservation.mjs';
import { emailClient, emailOperateur } from './emails.mjs';

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
  assert.equal(envoyes[0].replyTo, 'client@example.test');
  assert.equal(envoyes[1].to, 'client@example.test');
  assert.match(envoyes[1].subject, /^Your booking request TA-/);
  for (const m of envoyes) {
    assert.ok(m.text.length > 0, 'version texte');
    assert.match(m.html, /^<!doctype html>/);
  }
});

const DEMANDE = {
  ref: 'TA-261028-ABCD', nom: 'Client Test', email: 'client@example.test', telephone: '06 00 00 00 00',
  adresse: '1 rue de Rennes, Paris', date: '2026-10-28', heure: '08:00', passagers: '2',
  airport: 'Orly 4', trajet: 'Paris → Orly', page: '/taxi-paris-orly/', lang: 'fr',
  prix: 'Forfait 36 € (Orly, rive gauche, 6e) + réservation à l\'avance 7 € = 43 € au plus',
};

test('email client : prix estimé, date lisible, contacts', () => {
  const fr = emailClient(DEMANDE);
  assert.match(fr.html, /43 € au plus/);
  assert.match(fr.text, /Prix estimé : 43 € au plus/);
  assert.match(fr.html, /mercredi 28 octobre 2026/);
  assert.match(fr.html, /href="tel:\+33761466823"/);
  assert.match(fr.html, /href="https:\/\/wa\.me\/33761466823"/);
  assert.doesNotMatch(fr.html, /Forfait 36 €/, 'le détail du calcul reste pour l\'opérateur');
  const en = emailClient({ ...DEMANDE, lang: 'en' });
  assert.match(en.html, /€43 maximum/);
  assert.match(en.html, /Wednesday, 28 October 2026/);
  assert.match(en.html, /<html lang="en">/);
});

test('email client : pas de ligne prix quand le calculateur n\'a rien trouvé', () => {
  const m = emailClient({ ...DEMANDE, prix: 'non calculé' });
  assert.doesNotMatch(m.html, /Prix estimé/);
  assert.match(emailClient({ ...DEMANDE, prix: 'Hors Paris, au compteur', lang: 'en' }).html, /Outside Paris, metered fare/);
});

test('email opérateur : détail du prix, liens d\'appel et de carte', () => {
  const m = emailOperateur(DEMANDE);
  assert.match(m.subject, /^\[Réservation TA-261028-ABCD\] Paris → Orly - Client Test - 2026-10-28 08:00$/);
  assert.match(m.html, /Forfait 36 €/);
  assert.match(m.html, /href="tel:0600000000"/);
  assert.match(m.html, /href="mailto:client@example\.test"/);
  assert.match(m.html, /google\.com\/maps\/search\/\?api=1&amp;query=1%20rue%20de%20Rennes%2C%20Paris/);
});

test('emails : saisie du visiteur neutralisée dans le HTML', () => {
  const piege = { ...DEMANDE, nom: '<script>alert(1)</script>', adresse: '"><img src=x onerror=alert(1)>', email: 'a"b@example.test' };
  for (const m of [emailClient(piege), emailOperateur(piege)]) {
    assert.doesNotMatch(m.html, /<script>alert/);
    assert.doesNotMatch(m.html, /<img src=x/);
    assert.match(m.html, /&lt;script&gt;/);
  }
  assert.match(emailOperateur(piege).html, /mailto:a&quot;b@example\.test/);
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
