// Tests du serveur de production : npm test (node --test, sans dépendance).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { creerServeur } from './server.mjs';
import { traiterReservation } from './reservation.mjs';
import { emailClient, emailOperateur, trajetLisible } from './emails.mjs';
import { corpsAlerte, envoyerAlerte, libelleDelai, minutesAvantPriseEnCharge } from './whatsapp.mjs';

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

test('/index.html renvoie vers son dossier', async () => {
  for (const [chemin, cible] of [['/index.html', '/'], ['/tarifs/index.html?x=1', '/tarifs/?x=1'], ['/en/orly-airport-taxi/index.html', '/en/orly-airport-taxi/']]) {
    const r = await appel(chemin);
    assert.equal(r.statut, 301, chemin);
    assert.equal(r.entetes.location, cible, chemin);
  }
});

test('noindex sur tout autre domaine que toairport.fr, sauf en local', async () => {
  assert.equal((await appel('/')).entetes['x-robots-tag'], undefined);
  assert.equal((await appel('/', { hote: 'localhost:3000' })).entetes['x-robots-tag'], undefined);
  for (const chemin of ['/', '/tarifs/', '/robots.txt', '/page-qui-n-existe-pas/']) {
    assert.equal((await appel(chemin, { hote: 'toairport.vps.olivierlam.fr' })).entetes['x-robots-tag'], 'noindex', chemin);
  }
});

test('cache de 30 jours sur les images et GSAP, revalidation pour HTML, CSS et JS', async () => {
  const long = 'public, max-age=2592000';
  assert.equal((await appel('/assets/images/paris-nuit.webp')).entetes['cache-control'], long);
  assert.equal((await appel('/favicon.svg')).entetes['cache-control'], long);
  assert.equal((await appel('/assets/vendor/gsap/gsap.min.js')).entetes['cache-control'], long);
  for (const chemin of ['/', '/assets/style.css', '/assets/main.js', '/sitemap.xml']) {
    assert.equal((await appel(chemin)).entetes['cache-control'], 'public, max-age=0, must-revalidate', chemin);
  }
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

// --- Alerte WhatsApp et urgence ---

test('délai avant prise en charge : heure de Paris, été comme hiver, changement d\'heure compris', () => {
  // 10 novembre 08:00 à Paris = 07:00 UTC (hiver) ; 1er juillet 08:00 = 06:00 UTC (été).
  assert.equal(minutesAvantPriseEnCharge('2026-11-10', '08:00', new Date('2026-11-10T06:30:00Z')), 30);
  assert.equal(minutesAvantPriseEnCharge('2026-07-01', '08:00', new Date('2026-07-01T05:00:00Z')), 60);
  // Nuit du 24 au 25 octobre 2026 : 03:00 devient 02:00. 01:30 est en été (UTC+2), 05:00 en hiver (UTC+1).
  const minuit = new Date('2026-10-24T22:00:00Z');
  assert.equal(minutesAvantPriseEnCharge('2026-10-25', '01:30', minuit), 90);
  assert.equal(minutesAvantPriseEnCharge('2026-10-25', '05:00', minuit), 6 * 60);
  // Le cas raté du 28 octobre : demande à 12:04, prise en charge à 12:50.
  assert.equal(minutesAvantPriseEnCharge('2026-10-28', '12:50', new Date('2026-10-28T11:04:00Z')), 46);
  assert.equal(minutesAvantPriseEnCharge('d', 'h'), null);
  assert.equal(minutesAvantPriseEnCharge('2026-10-28', ''), null);
});

test('libellé du délai : URGENT jusqu\'à une heure, passé compris', () => {
  assert.equal(libelleDelai(46), 'URGENT, prise en charge dans 46 min');
  assert.equal(libelleDelai(60), 'URGENT, prise en charge dans 60 min');
  assert.equal(libelleDelai(61), 'prise en charge dans 1 h 01');
  assert.equal(libelleDelai(300), 'prise en charge dans 5 h');
  assert.equal(libelleDelai(-15), 'URGENT, heure de prise en charge passée de 15 min');
  assert.equal(libelleDelai(3 * 24 * 60), 'réservation à l\'avance');
  assert.equal(libelleDelai(null), 'date de prise en charge à vérifier');
});

test('trajet lisible : la page /reservation/ donne « adresse → aéroport »', () => {
  assert.equal(trajetLisible({ trajet: 'Réservation', adresse: 'Gare Montparnasse', airport: 'Orly - Paris Sud' }), 'Gare Montparnasse → Orly');
  assert.equal(trajetLisible({ trajet: 'Accueil', adresse: '1 rue de Rennes', airport: 'CDG - Charles-de-Gaulle' }), '1 rue de Rennes → CDG');
  assert.equal(trajetLisible({ trajet: 'Paris → Orly', adresse: 'x', airport: 'Orly 4' }), 'Paris → Orly');
  assert.equal(trajetLisible({ trajet: '', adresse: 'x' }), 'Trajet non précisé');
});

const ALERTE = {
  ref: 'TA-261028-M1PB', minutes: 46, trajetLisible: 'Gare Montparnasse → Orly',
  priseEnCharge: 'mercredi 28 octobre 2026 à 12:50', adresse: 'Gare\nMontparnasse', passagers: '4',
  prix: 'Forfait 36 € + réservation immédiate 4 € = 40 € au plus', nom: 'Client', telephone: '',
};

test('alerte WhatsApp : modèle complet à 13 variables et bouton carte, modèle court à 9', () => {
  const complet = { ...ALERTE, airport: '', email: 'client@example.test', recuLeLisible: 'mercredi 28 octobre 2026 à 12:04', page: '/reservation/', lang: 'fr' };
  const corps = corpsAlerte(complet, '33600000000');
  assert.equal(corps.type, 'template');
  assert.equal(corps.template.name, 'nouvelle_reservation_complete');
  assert.equal(corps.template.language.code, 'fr');
  const [corpsTexte, bouton] = corps.template.components;
  const textes = corpsTexte.parameters.map((p) => p.text);
  assert.equal(textes.length, 13);
  assert.equal(textes[1], 'URGENT, prise en charge dans 46 min');
  assert.equal(textes[3], 'non précisé');
  assert.equal(textes[5], 'Gare Montparnasse', 'retour à la ligne retiré');
  assert.equal(textes[9], '-', 'valeur vide remplacée');
  assert.equal(textes[10], 'client@example.test');
  assert.equal(textes[11], 'mercredi 28 octobre 2026 à 12:04');
  assert.equal(textes[12], '/reservation/ (fr)');
  assert.deepEqual(bouton, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'Gare%20Montparnasse' }] });

  const court = corpsAlerte(ALERTE, '33600000000', 'court');
  assert.equal(court.template.name, 'nouvelle_reservation');
  assert.equal(court.template.components.length, 1);
  assert.equal(court.template.components[0].parameters.length, 9);
});

function fauxFetch(reponses) {
  const appels = [];
  const f = async (url, options) => {
    appels.push({ url, options, corps: JSON.parse(options.body) });
    const r = reponses.shift() ?? { ok: true, status: 200, json: async () => ({}) };
    if (r instanceof Error) throw r;
    return r;
  };
  f.appels = appels;
  return f;
}

const ENV_WA = { WHATSAPP_TOKEN: 'jeton-test', WHATSAPP_PHONE_ID: '123', WHATSAPP_ALERTE_TO: '+33 6 00 00 00 01, 33600000002' };

test('alerte WhatsApp : un appel par destinataire, jeton en en-tête', async () => {
  const f = fauxFetch([]);
  const r = await envoyerAlerte(ALERTE, { env: ENV_WA, fetch: f });
  assert.deepEqual(r, { statut: 'envoye', destinataires: 2, modele: 'complet' });
  assert.ok(f.appels.every((a) => a.corps.template.name === 'nouvelle_reservation_complete'));
  assert.equal(f.appels.length, 2);
  assert.equal(f.appels[0].url, 'https://graph.facebook.com/v25.0/123/messages');
  assert.equal(f.appels[0].options.headers.Authorization, 'Bearer jeton-test');
  assert.deepEqual(f.appels.map((a) => a.corps.to).sort(), ['33600000001', '33600000002']);
});

test('alerte WhatsApp : sautée sans jeton, échec lisible si Meta refuse ou ne répond pas', async () => {
  assert.deepEqual(await envoyerAlerte(ALERTE, { env: {}, fetch: fauxFetch([]) }), { statut: 'saute' });
  assert.equal((await envoyerAlerte(ALERTE, { env: { WHATSAPP_TOKEN: 'x' } })).statut, 'echec');
  const erreur = console.error;
  console.error = () => {};
  const refus = { ok: false, status: 400, json: async () => ({ error: { message: 'Message undeliverable', code: 131026 } }) };
  const r = await envoyerAlerte(ALERTE, { env: { ...ENV_WA, WHATSAPP_ALERTE_TO: '33600000001' }, fetch: fauxFetch([refus]) });
  const panne = await envoyerAlerte(ALERTE, { env: { ...ENV_WA, WHATSAPP_ALERTE_TO: '33600000001' }, fetch: fauxFetch([new Error('ECONNRESET')]) });
  console.error = erreur;
  assert.equal(r.statut, 'echec');
  assert.match(r.erreur, /Message undeliverable \(code 131026\)/);
  assert.match(panne.erreur, /ECONNRESET/);
});

const MODELE_EN_EXAMEN = { ok: false, status: 404, json: async () => ({ error: { message: '(#132001) Template name does not exist in the translation', code: 132001 } }) };

test('alerte WhatsApp : modèle complet pas encore validé, le modèle court prend le relais', async () => {
  const f = fauxFetch([MODELE_EN_EXAMEN]);
  const r = await envoyerAlerte(ALERTE, { env: { ...ENV_WA, WHATSAPP_ALERTE_TO: '33600000001' }, fetch: f });
  assert.deepEqual(r, { statut: 'envoye', destinataires: 1, modele: 'court' });
  assert.deepEqual(f.appels.map((a) => a.corps.template.name), ['nouvelle_reservation_complete', 'nouvelle_reservation']);
});

test('alerte WhatsApp : pas de repli pour une autre erreur, les deux messages si le repli échoue aussi', async () => {
  const erreur = console.error;
  console.error = () => {};
  const jetonRefuse = { ok: false, status: 401, json: async () => ({ error: { message: 'Invalid OAuth access token', code: 190 } }) };
  const f1 = fauxFetch([jetonRefuse]);
  const r1 = await envoyerAlerte(ALERTE, { env: { ...ENV_WA, WHATSAPP_ALERTE_TO: '33600000001' }, fetch: f1 });
  const f2 = fauxFetch([MODELE_EN_EXAMEN, MODELE_EN_EXAMEN]);
  const r2 = await envoyerAlerte(ALERTE, { env: { ...ENV_WA, WHATSAPP_ALERTE_TO: '33600000001' }, fetch: f2 });
  console.error = erreur;
  assert.equal(f1.appels.length, 1);
  assert.match(r1.erreur, /Invalid OAuth access token \(code 190\)/);
  assert.equal(f2.appels.length, 2);
  assert.match(r2.erreur, /code 132001\), puis modèle court : .*code 132001\)$/);
});

test('réservation dans l\'heure : URGENT partout, échec WhatsApp signalé, réservation acceptée', async () => {
  const envoyes = [];
  const transport = { sendMail: async (m) => { envoyes.push(m); } };
  const env = { ...ENV_WA, WHATSAPP_ALERTE_TO: '33600000001', OVH_EMAIL_USER: 'contact@toairport.fr', RECIPIENT_EMAIL: 'operateur@example.test' };
  const refus = { ok: false, status: 401, json: async () => ({ error: { message: 'Invalid OAuth access token', code: 190 } }) };
  const demande = {
    nom: 'Henniche', email: 'client@example.test', telephone: '0600000000', adresse: 'Gare Montparnasse',
    date: '2026-10-28', heure: '12:50', passagers: '4', airport: 'Orly - Paris Sud', trajet: 'Réservation',
  };
  const erreur = console.error;
  console.error = () => {};
  const r = await traiterReservation(JSON.stringify(demande), { env, transport, fetch: fauxFetch([refus]), maintenant: new Date('2026-10-28T11:04:00Z') });
  console.error = erreur;
  assert.equal(r.statusCode, 200);
  const [operateur, client] = envoyes;
  assert.match(operateur.subject, /^\[Réservation TA-261028-[A-Z0-9]{4}\] URGENT - prise en charge dans 46 min - Gare Montparnasse → Orly - Henniche/);
  assert.match(operateur.html, /Prise en charge/);
  assert.match(operateur.html, />Gare Montparnasse → Orly</);
  assert.match(operateur.html, /Demande envoyée le mercredi 28 octobre 2026 à 12:04/);
  assert.match(operateur.html, /Alerte WhatsApp non envoyée : 33600000001 : Invalid OAuth access token \(code 190\)/);
  assert.match(operateur.text, /^\*\*\* URGENT, prise en charge dans 46 min \*\*\*/);
  assert.match(client.text, /La course n'est pas encore confirmée/);
  assert.match(client.text, /07 61 46 68 23/);
  assert.match(client.text, /Trajet : Gare Montparnasse → Orly/);
});

test('réservation à l\'avance : ni URGENT ni mention d\'alerte quand WhatsApp n\'est pas configuré', async () => {
  const envoyes = [];
  const transport = { sendMail: async (m) => { envoyes.push(m); } };
  const demande = { nom: 'a', email: 'b@c.d', telephone: '1', adresse: 'x', date: '2026-11-10', heure: '08:00', trajet: 'Paris → Orly' };
  await traiterReservation(JSON.stringify(demande), { env: {}, transport, maintenant: new Date('2026-10-28T11:04:00Z') });
  const [operateur, client] = envoyes;
  assert.doesNotMatch(operateur.subject, /URGENT/);
  assert.doesNotMatch(operateur.html, /Alerte WhatsApp/);
  assert.match(operateur.html, /réservation à l&#39;avance/);
  assert.doesNotMatch(client.text, /pas encore confirmée/);
});
