// Emails de réservation : un pour l'opérateur, un accusé de réception pour le client (fr ou en).
// Chaque email a une version texte et une version HTML aux couleurs du site (noir, doré).
// HTML d'email : tableaux, styles en ligne, polices système (Georgia, Helvetica), couleurs de fond
// posées en attribut bgcolor pour que le mode sombre des messageries ne les inverse pas.
// Le logo est chargé depuis toairport.fr : /assets/logo/lumineux-1200.png doit rester en ligne.

const SITE = 'https://toairport.fr';
const LOGO = `${SITE}/assets/logo/lumineux-1200.png`;
const TEL = '+33761466823';
const TEL_LISIBLE = { fr: '07 61 46 68 23', en: '+33 7 61 46 68 23' };
const WHATSAPP = 'https://wa.me/33761466823';

const NOIR = '#0a0a0b';
const CARTE = '#141418';
const BORDURE = '#2a2a30';
const OR = '#c9a96e';
const BLANC = '#f5f4f0';
const GRIS = '#9a9aa2';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Helvetica, Arial, sans-serif";

const TEXTES = {
  fr: {
    objet: (ref) => `Votre demande de réservation ${ref} - toAirport.fr`,
    apercu: (ref) => `Demande ${ref} reçue. Nous vous recontactons pour confirmer la course.`,
    titre: 'Demande reçue',
    bonjour: (nom) => `Bonjour ${nom},`,
    intro: 'Nous avons bien reçu votre demande de réservation. Nous vous recontactons rapidement pour confirmer la course.',
    recap: 'Récapitulatif',
    reference: 'Référence', trajet: 'Trajet', terminal: 'Aéroport / terminal', adresse: 'Adresse de départ',
    date: 'Date', heure: 'Heure', passagers: 'Passagers', prix: 'Prix estimé',
    notePrix: 'Montant maximum calculé au moment de la demande, suppléments compris.',
    besoin: 'En cas de besoin, contactez-nous directement.',
    appeler: 'Appeler', signature: "À bientôt,\nL'équipe toAirport.fr",
    pied: 'Taxis parisiens sous licence, transferts CDG et Orly.',
    nonPrecise: 'Non précisé',
  },
  en: {
    objet: (ref) => `Your booking request ${ref} - toAirport.fr`,
    apercu: (ref) => `Request ${ref} received. We will contact you to confirm your ride.`,
    titre: 'Request received',
    bonjour: (nom) => `Hello ${nom},`,
    intro: 'We have received your booking request and will contact you shortly to confirm your ride.',
    recap: 'Summary',
    reference: 'Reference', trajet: 'Route', terminal: 'Airport / terminal', adresse: 'Paris address',
    date: 'Date', heure: 'Time', passagers: 'Passengers', prix: 'Estimated price',
    notePrix: 'Maximum amount calculated at the time of the request, surcharges included.',
    besoin: 'If needed, contact us directly.',
    appeler: 'Call', signature: 'Best regards,\nThe toAirport.fr team',
    pied: 'Licensed Paris taxis, CDG and Orly transfers.',
    nonPrecise: 'Not specified',
  },
};

export function echapper(valeur) {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// « 2026-10-28 » -> « mercredi 28 octobre 2026 » ; toute autre valeur est rendue telle quelle.
function dateLisible(date, lang) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d);
}

// Le calculateur (assets/prix.js) envoie un détail en français ; le client n'en reçoit que le total.
const PRIX_CONNUS = {
  'Hors Paris, au compteur': { fr: 'Hors Paris, au compteur', en: 'Outside Paris, metered fare' },
  'Aéroport sans forfait': { fr: 'Au compteur (pas de forfait pour cet aéroport)', en: 'Metered fare (no flat rate for this airport)' },
};
function prixClient(prix, lang) {
  const total = /= (\d+(?:,\d+)?) € au plus/.exec(prix ?? '');
  if (total) return lang === 'en' ? `€${total[1].replace(',', '.')} maximum` : `${total[1]} € au plus`;
  return PRIX_CONNUS[prix]?.[lang] ?? null;
}

const telLien = (tel) => `tel:${String(tel).replace(/[^\d+]/g, '')}`;

function ligne(libelle, valeurHtml) {
  return `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${BORDURE};font-family:${SANS};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${GRIS};width:42%;vertical-align:top;">${echapper(libelle)}</td>
<td style="padding:10px 0;border-bottom:1px solid ${BORDURE};font-family:${SANS};font-size:15px;color:${BLANC};vertical-align:top;">${valeurHtml}</td>
</tr>`;
}

function bouton(libelle, href, plein) {
  const fond = plein ? OR : CARTE;
  const texte = plein ? NOIR : OR;
  return `<td bgcolor="${fond}" style="background:${fond};border:1px solid ${OR};border-radius:2px;">
<a href="${echapper(href)}" style="display:inline-block;padding:13px 22px;font-family:${SANS};font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${texte};text-decoration:none;">${echapper(libelle)}</a>
</td>`;
}

function page({ lang, apercu, contenu }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>toAirport.fr</title>
</head>
<body style="margin:0;padding:0;background:${NOIR};" bgcolor="${NOIR}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${echapper(apercu)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${NOIR}" style="background:${NOIR};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td align="center" style="padding:0 0 24px;">
<a href="${SITE}" style="text-decoration:none;"><img src="${LOGO}" width="160" height="80" alt="toAirport.fr" style="display:block;border:0;width:160px;height:80px;font-family:${SERIF};font-size:24px;color:${OR};"></a>
</td></tr>
<tr><td bgcolor="${CARTE}" style="background:${CARTE};border:1px solid ${BORDURE};border-top:2px solid ${OR};border-radius:4px;padding:36px 32px;">
${contenu}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function emailClient(d) {
  const lang = d.lang === 'en' ? 'en' : 'fr';
  const t = TEXTES[lang];
  const prix = prixClient(d.prix, lang);
  const lignes = [
    ligne(t.reference, `<span style="color:${OR};font-weight:bold;">${echapper(d.ref)}</span>`),
    ligne(t.trajet, echapper(d.trajet || t.nonPrecise)),
    d.airport ? ligne(t.terminal, echapper(d.airport)) : '',
    ligne(t.adresse, echapper(d.adresse)),
    ligne(t.date, echapper(dateLisible(d.date, lang))),
    ligne(t.heure, echapper(d.heure)),
    ligne(t.passagers, echapper(d.passagers || '1')),
    prix ? ligne(t.prix, `<span style="font-family:${SERIF};font-size:20px;color:${OR};">${echapper(prix)}</span>`) : '',
  ].join('\n');

  const contenu = `<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:30px;font-weight:normal;color:${BLANC};">${echapper(t.titre)}</h1>
<p style="margin:0 0 8px;font-family:${SANS};font-size:15px;line-height:1.6;color:${BLANC};">${echapper(t.bonjour(d.nom))}</p>
<p style="margin:0 0 28px;font-family:${SANS};font-size:15px;line-height:1.6;color:${BLANC};">${echapper(t.intro)}</p>
<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${OR};">${echapper(t.recap)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${lignes}
</table>
${prix ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${GRIS};">${echapper(t.notePrix)}</p>` : ''}
<p style="margin:28px 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${BLANC};">${echapper(t.besoin)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${bouton(`${t.appeler} ${TEL_LISIBLE[lang]}`, `tel:${TEL}`, true)}
<td style="width:10px;"></td>
${bouton('WhatsApp', WHATSAPP, false)}
</tr></table>
<p style="margin:28px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${BLANC};">${echapper(t.signature).replace('\n', '<br>')}</p>
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${BORDURE};font-family:${SANS};font-size:12px;line-height:1.6;color:${GRIS};">${echapper(t.pied)} <a href="${SITE}" style="color:${OR};text-decoration:none;">toairport.fr</a></p>`;

  const texte = [
    t.bonjour(d.nom), '', t.intro, '',
    `${t.recap} (${t.reference.toLowerCase()} ${d.ref})`, '-------------',
    `${t.trajet} : ${d.trajet || t.nonPrecise}`,
    d.airport ? `${t.terminal} : ${d.airport}` : null,
    `${t.adresse} : ${d.adresse}`,
    `${t.date} : ${dateLisible(d.date, lang)}`,
    `${t.heure} : ${d.heure}`,
    `${t.passagers} : ${d.passagers || '1'}`,
    prix ? `${t.prix} : ${prix} (${t.notePrix})` : null,
    '', `${t.besoin} ${TEL_LISIBLE[lang]} / WhatsApp ${WHATSAPP}`,
    '', t.signature,
  ].filter((l) => l !== null).join('\n');

  return { subject: t.objet(d.ref), text: texte, html: page({ lang, apercu: t.apercu(d.ref), contenu }) };
}

export function emailOperateur(d) {
  const trajet = d.trajet || 'Non précisé';
  const carte = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.adresse)}`;
  const lien = (href, texte) => `<a href="${echapper(href)}" style="color:${OR};text-decoration:none;">${echapper(texte)}</a>`;

  const contenu = `<p style="margin:0 0 6px;font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${OR};">Nouvelle demande ${echapper(d.ref)}</p>
<h1 style="margin:0 0 6px;font-family:${SERIF};font-size:28px;font-weight:normal;color:${BLANC};">${echapper(trajet)}</h1>
<p style="margin:0 0 26px;font-family:${SERIF};font-size:20px;color:${OR};">${echapper(dateLisible(d.date, 'fr'))} à ${echapper(d.heure)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${d.airport ? ligne('Aéroport / terminal', echapper(d.airport)) : ''}
${ligne('Adresse de départ', `${echapper(d.adresse)}<br>${lien(carte, 'Voir sur la carte')}`)}
${ligne('Passagers', echapper(d.passagers || '1'))}
${ligne('Prix affiché', echapper(d.prix))}
</table>
<p style="margin:26px 0 4px;font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${OR};">Client</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${ligne('Nom', echapper(d.nom))}
${ligne('Téléphone', lien(telLien(d.telephone), d.telephone))}
${ligne('Email', lien(`mailto:${d.email}`, d.email))}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
${bouton('Appeler le client', telLien(d.telephone), true)}
</tr></table>
<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid ${BORDURE};font-family:${SANS};font-size:12px;line-height:1.6;color:${GRIS};">Page d'origine : ${echapper(d.page)} · Langue : ${echapper(d.lang)} · Répondre à cet email écrit au client.</p>`;

  const texte = `
Nouvelle demande de réservation ${d.ref} - toAirport.fr

Trajet : ${trajet}${d.airport ? `\nAéroport / Terminal : ${d.airport}` : ''}
Adresse de départ : ${d.adresse}
Date : ${d.date}
Heure : ${d.heure}
Passagers : ${d.passagers || '1'}
Prix affiché : ${d.prix}

Contact
-------
Nom : ${d.nom}
Email : ${d.email}
Téléphone : ${d.telephone}

Suivi
-----
Page d'origine : ${d.page}
Langue : ${d.lang}
`.trim();

  return {
    subject: `[Réservation ${d.ref}] ${trajet} - ${d.nom} - ${d.date} ${d.heure}`,
    text: texte,
    html: page({ lang: 'fr', apercu: `${trajet}, ${d.date} ${d.heure}, ${d.nom}`, contenu }),
  };
}
