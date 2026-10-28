// Demande de réservation : une alerte WhatsApp et un email à l'opérateur, un accusé de réception au client.
// Appelé par server/server.mjs sur POST /api/reservation, avec le corps JSON déjà lu.
// Variables d'environnement : OVH_SMTP_HOST, OVH_SMTP_PORT, OVH_EMAIL_USER, OVH_EMAIL_PASS, RECIPIENT_EMAIL,
// et celles de l'alerte WhatsApp (voir server/whatsapp.mjs).
import nodemailer from 'nodemailer';
import { emailClient, emailOperateur, priseEnChargeLisible, trajetLisible } from './emails.mjs';
import { envoyerAlerte, minutesAvantPriseEnCharge } from './whatsapp.mjs';

// Renvoie { statusCode, body }. Pour les tests, qui n'envoient rien : `transport` (emails),
// `fetch` (API WhatsApp) et `maintenant` (calcul du délai avant la prise en charge).
export async function traiterReservation(corps, { env = process.env, transport, fetch, maintenant = new Date() } = {}) {
  let data;
  try {
    data = JSON.parse(corps);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) };
  }
  if (!data || typeof data !== 'object') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) };
  }

  // Champs du formulaire, en texte et bornés : ils finissent dans des emails.
  const champ = (nom, max = 200) => String(data[nom] ?? '').trim().slice(0, max);
  const [nom, email, telephone, adresse, date, heure, passagers, airport, trajet] =
    ['nom', 'email', 'telephone', 'adresse', 'date', 'heure', 'passagers', 'airport', 'trajet'].map((c) => champ(c));
  // Page d'origine et langue envoyées par assets/main.js : servent à savoir quelles pages convertissent.
  const page = String(data.page || '').slice(0, 120) || 'inconnue';
  const lang = data.lang === 'en' ? 'en' : 'fr';
  // Prix calculé par assets/prix.js au moment de la demande (vide si le calculateur n'a pas trouvé l'adresse).
  const prix = String(data.prix || '').slice(0, 240) || 'non calculé';
  // Référence lisible, reprise dans l'objet des deux emails : une réservation = un email « [Réservation TA-...] ».
  const ref = `TA-${maintenant.toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  if (!nom || !email || !telephone || !adresse || !date || !heure) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Champs obligatoires manquants' }) };
  }

  const transporter = transport ?? nodemailer.createTransport({
    host: env.OVH_SMTP_HOST,
    port: parseInt(env.OVH_SMTP_PORT, 10),
    secure: true,
    auth: {
      user: env.OVH_EMAIL_USER,
      pass: env.OVH_EMAIL_PASS,
    },
  });

  const demande = { ref, nom, email, telephone, adresse, date, heure, passagers, airport, trajet, prix, page, lang };
  // Délai avant la prise en charge (minutes, null si illisible) : décide de la mention URGENT.
  demande.minutes = minutesAvantPriseEnCharge(date, heure, maintenant);
  demande.recuLe = maintenant;
  demande.trajetLisible = trajetLisible(demande);
  demande.priseEnCharge = priseEnChargeLisible(demande);
  // L'alerte part avant les emails et son résultat est écrit dans l'email opérateur.
  // Un échec WhatsApp ne bloque jamais la réservation.
  demande.alerte = await envoyerAlerte(demande, { env, fetch });

  const pourOperateur = emailOperateur(demande);
  const pourClient = emailClient(demande);
  const expediteur = `toAirport.fr <${env.OVH_EMAIL_USER}>`;

  try {
    await transporter.sendMail({
      from: expediteur,
      to: env.RECIPIENT_EMAIL,
      replyTo: email,
      ...pourOperateur,
    });

    await transporter.sendMail({
      from: expediteur,
      to: email,
      ...pourClient,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('SMTP error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erreur lors de l\'envoi de l\'email' }),
    };
  }
}
