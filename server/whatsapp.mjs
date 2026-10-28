// Alerte WhatsApp à chaque réservation, envoyée par l'API Cloud officielle de Meta.
// Appelé par server/reservation.mjs avant les emails ; le résultat est repris dans l'email opérateur,
// pour qu'une alerte qui ne part pas se voie.
// Variables d'environnement : WHATSAPP_TOKEN (jeton permanent d'un utilisateur système Meta),
// WHATSAPP_PHONE_ID (identifiant du numéro qui envoie), WHATSAPP_ALERTE_TO (numéros qui reçoivent,
// séparés par des virgules, format international sans « + »), WHATSAPP_TEMPLATE (facultatif,
// « nouvelle_reservation » par défaut). Sans WHATSAPP_TOKEN, l'alerte est sautée.
//
// Le message est un modèle validé par Meta (nécessaire hors fenêtre de 24 h), en français, à 9 variables :
// « Nouvelle demande {{1}} : {{2}}. Trajet : {{3}} / Prise en charge : {{4}} / Adresse : {{5}} /
// Passagers : {{6}} - Prix : {{7}} / Client : {{8}}, {{9}} / Rappelez le client pour confirmer la course. »
// Changer l'ordre ou le nombre des variables demande un nouveau modèle chez Meta.

const API = 'https://graph.facebook.com/v25.0';
const DELAI_URGENT_MIN = 60;
const DELAI_RESEAU_MS = 8000;

// Décalage de Paris par rapport à UTC (en minutes) à un instant donné.
function decalageParis(instant) {
  const morceaux = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  const commeUtc = Date.UTC(+morceaux.year, +morceaux.month - 1, +morceaux.day, +morceaux.hour, +morceaux.minute);
  return Math.round((commeUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

// Minutes entre maintenant et la prise en charge saisie (date « AAAA-MM-JJ », heure « HH:MM », heure de Paris).
// null si la date ou l'heure ne sont pas lisibles. Le serveur tourne en UTC : sans ce calcul, on se tromperait
// d'une ou deux heures.
export function minutesAvantPriseEnCharge(date, heure, maintenant = new Date()) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  const h = /^(\d{1,2}):(\d{2})$/.exec(heure ?? '');
  if (!d || !h) return null;
  const commeUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2]);
  if (Number.isNaN(commeUtc)) return null;
  // Deux passes : le décalage dépend de l'instant cherché (heure d'été ou d'hiver).
  let instant = commeUtc - decalageParis(new Date(commeUtc)) * 60000;
  instant = commeUtc - decalageParis(new Date(instant)) * 60000;
  return Math.round((instant - maintenant.getTime()) / 60000);
}

export const estUrgent = (minutes) => minutes !== null && minutes !== undefined && minutes <= DELAI_URGENT_MIN;

// « URGENT, prise en charge dans 35 min », « prise en charge dans 5 h 10 », « réservation à l'avance ».
export function libelleDelai(minutes) {
  if (minutes === null || minutes === undefined) return 'date de prise en charge à vérifier';
  if (minutes < 0) return `URGENT, heure de prise en charge passée de ${-minutes} min`;
  if (estUrgent(minutes)) return `URGENT, prise en charge dans ${minutes} min`;
  if (minutes < 24 * 60) {
    const reste = minutes % 60;
    return `prise en charge dans ${Math.floor(minutes / 60)} h${reste ? ` ${String(reste).padStart(2, '0')}` : ''}`;
  }
  return 'réservation à l\'avance';
}

// Meta refuse les variables vides, les retours à la ligne et les tabulations.
const variable = (valeur) => String(valeur ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || '-';

export function corpsAlerte(d, destinataire, modele) {
  const valeurs = [
    d.ref, libelleDelai(d.minutes), d.trajetLisible, d.priseEnCharge, d.adresse,
    d.passagers || '1', d.prix, d.nom, d.telephone,
  ];
  return {
    messaging_product: 'whatsapp',
    to: destinataire,
    type: 'template',
    template: {
      name: modele,
      language: { code: 'fr' },
      components: [{ type: 'body', parameters: valeurs.map((v) => ({ type: 'text', text: variable(v) })) }],
    },
  };
}

// Envoie l'alerte à chaque numéro de WHATSAPP_ALERTE_TO.
// Renvoie { statut: 'saute' } sans configuration, { statut: 'envoye', destinataires } si tout est parti,
// { statut: 'echec', erreur } sinon (premier message d'erreur de Meta ou du réseau). Ne lève jamais.
export async function envoyerAlerte(d, { env = process.env, fetch: envoyer = globalThis.fetch } = {}) {
  const jeton = env.WHATSAPP_TOKEN;
  if (!jeton) return { statut: 'saute' };
  const destinataires = String(env.WHATSAPP_ALERTE_TO ?? '').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean);
  if (!env.WHATSAPP_PHONE_ID || destinataires.length === 0) {
    return { statut: 'echec', erreur: 'WHATSAPP_PHONE_ID ou WHATSAPP_ALERTE_TO manquant' };
  }
  const modele = env.WHATSAPP_TEMPLATE || 'nouvelle_reservation';

  const erreurs = [];
  await Promise.all(destinataires.map(async (numero) => {
    try {
      const reponse = await envoyer(`${API}/${env.WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsAlerte(d, numero, modele)),
        signal: AbortSignal.timeout(DELAI_RESEAU_MS),
      });
      if (!reponse.ok) {
        const detail = await reponse.json().catch(() => ({}));
        const e = detail.error ?? {};
        erreurs.push(`${numero} : ${e.message || `HTTP ${reponse.status}`}${e.code ? ` (code ${e.code})` : ''}`);
      }
    } catch (err) {
      erreurs.push(`${numero} : ${err.name === 'TimeoutError' ? 'pas de réponse de Meta' : err.message}`);
    }
  }));

  if (erreurs.length) {
    console.error('WhatsApp error:', erreurs.join(' ; '));
    return { statut: 'echec', erreur: erreurs.join(' ; ') };
  }
  return { statut: 'envoye', destinataires: destinataires.length };
}
