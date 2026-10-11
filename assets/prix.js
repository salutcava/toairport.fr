/*
 * Calculateur de prix des formulaires de réservation.
 *
 * TARIFS est la seule source de vérité des montants côté navigateur : à la parution
 * de l'arrêté annuel, mettre à jour ce bloc en même temps que les textes des pages
 * (voir README, « Tarifs de référence »).
 *
 * Le calculateur s'attache à #booking-form, sauf si le formulaire porte data-calc="off"
 * (pages VTC et Orly ↔ CDG, sans forfait). L'aéroport est déduit du champ trajet et du
 * champ airport ; l'arrondissement du code postal de l'adresse, saisi ou trouvé par
 * l'API Géoplateforme (data.geopf.fr, gratuite, sans clé).
 */
(function () {
  const TARIFS = {
    annee: 2026,
    forfaits: { CDG: { droite: 56, gauche: 65 }, ORLY: { droite: 45, gauche: 36 } },
    rivesGauche: [5, 6, 7, 13, 14, 15],
    supplements: { immediate: 4, avance: 7, parPassagerDes5: 5.5 },
    // Délai sous lequel une réservation est « immédiate » (4 €) plutôt qu'« à l'avance » (7 €).
    delaiImmediateMin: 60,
  };
  window.TOAIRPORT_TARIFS = TARIFS;

  const API = 'https://data.geopf.fr/geocodage/search';
  const en = document.documentElement.lang === 'en';
  const T = en ? {
    label: 'Your fare', hint: 'Enter your Paris address to see the fare.', searching: 'Looking up the address…',
    notFound: 'Address not found. Add the postcode (e.g. 75015).',
    outside: 'Outside Paris: no flat fare, the taxi runs on the meter. We give you an estimate when confirming.',
    noFlat: 'No flat fare for this airport: estimate given when confirming.',
    rive: { droite: 'Right Bank', gauche: 'Left Bank' }, flat: 'Official flat fare',
    arr: n => n === 1 ? '1st arr.' : n === 2 ? '2nd arr.' : n === 3 ? '3rd arr.' : `${n}th arr.`,
    booking: { immediate: 'immediate booking', avance: 'advance booking' },
    extra: (b, s) => `Regulated supplement for ${b}: +${s}`, max: t => `at most ${t}`,
    pax: s => `+${s} per passenger from the 5th`,
  } : {
    label: 'Votre prix', hint: 'Saisissez votre adresse à Paris pour voir le prix.', searching: 'Recherche de l\'adresse…',
    notFound: 'Adresse introuvable. Ajoutez le code postal (ex. 75015).',
    outside: 'Hors de Paris : pas de forfait, la course est au compteur. Une estimation vous est donnée à la confirmation.',
    noFlat: 'Pas de forfait pour cet aéroport : estimation donnée à la confirmation.',
    rive: { droite: 'rive droite', gauche: 'rive gauche' }, flat: 'Forfait officiel',
    arr: n => n === 1 ? '1er arr.' : `${n}e arr.`,
    booking: { immediate: 'réservation immédiate', avance: 'réservation à l\'avance' },
    extra: (b, s) => `Supplément réglementé de ${b} : +${s}`, max: t => `soit ${t} au plus`,
    pax: s => `+${s} par passager à partir du 5e`,
  };
  const eur = v => (en ? '€' + String(v).replace(',', '.') : String(v).replace('.', ',') + ' €');

  // 75001-75020 et 75116 (16e nord). Renvoie l'arrondissement ou null.
  function arrFromPostcode(cp) {
    const m = String(cp || '').match(/^75(0(0[1-9]|1\d|20)|116)$/);
    if (!m) return null;
    return cp === '75116' ? 16 : parseInt(cp.slice(3), 10);
  }
  function postcodeInText(text) {
    const m = String(text || '').match(/\b(75(?:0(?:0[1-9]|1\d|20)|116))\b/);
    return m ? m[1] : null;
  }

  function airportOf(form) {
    const pick = sel => { const el = form.querySelector(sel); if (!el) return ''; return el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text || '' : el.value; };
    const txt = pick('[name="trajet"]') + ' ' + pick('[name="airport"]');
    if (/orly/i.test(txt)) return 'ORLY';
    if (/cdg|charles|roissy|terminal\s*[123]/i.test(txt)) return 'CDG';
    return null;
  }

  function paxExtra(form) {
    const el = form.querySelector('[name="passagers"]');
    if (!el) return { amount: 0, open: false };
    const v = el.options[el.selectedIndex].text;
    if (/5/.test(v) && /7|van/i.test(v)) return { amount: 0, open: true };
    const n = parseInt(v, 10) || 1;
    return { amount: Math.max(0, n - 4) * TARIFS.supplements.parPassagerDes5, open: false };
  }

  function bookingKind(form) {
    const d = form.querySelector('[name="date"]'), h = form.querySelector('[name="heure"]');
    if (!d || !d.value || !h || !h.value) return 'avance';
    const when = new Date(`${d.value}T${h.value}`);
    return (when - Date.now()) / 60000 <= TARIFS.delaiImmediateMin ? 'immediate' : 'avance';
  }

  function attach(form) {
    if (form.dataset.calc === 'off') return;
    const input = form.querySelector('[name="adresse"]');
    if (!input) return;

    const box = document.createElement('div');
    box.className = 'price-estimate';
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = `<div class="pe-head"><span class="pe-label">${T.label}</span><span class="pe-price"></span></div><p class="pe-detail"></p><p class="pe-extra"></p>`;
    input.closest('.form-group').after(box);
    const hidden = document.createElement('input');
    hidden.type = 'hidden'; hidden.name = 'prix';
    form.appendChild(hidden);

    const list = document.createElement('datalist');
    list.id = 'adresse-suggestions';
    form.appendChild(list);
    input.setAttribute('list', list.id);
    input.setAttribute('autocomplete', 'off');

    const known = new Map(); // libellé -> code postal
    let postcode = null, state = 'idle', timer = null, seq = 0;

    function render() {
      const price = box.querySelector('.pe-price'), detail = box.querySelector('.pe-detail'), extra = box.querySelector('.pe-extra');
      box.dataset.state = state;
      price.textContent = ''; extra.textContent = ''; hidden.value = '';
      const airport = airportOf(form);
      if (state === 'searching') { detail.textContent = T.searching; return; }
      if (state === 'notfound') { detail.textContent = T.notFound; return; }
      if (state !== 'found') { detail.textContent = T.hint; return; }
      const arr = arrFromPostcode(postcode);
      if (!arr) { detail.textContent = T.outside; hidden.value = 'Hors Paris, au compteur'; return; }
      if (!airport) { detail.textContent = T.noFlat; hidden.value = 'Aéroport sans forfait'; return; }
      const rive = TARIFS.rivesGauche.includes(arr) ? 'gauche' : 'droite';
      const base = TARIFS.forfaits[airport][rive];
      const kind = bookingKind(form);
      const sup = TARIFS.supplements[kind];
      const pax = paxExtra(form);
      const total = base + sup + pax.amount;
      price.textContent = eur(base);
      detail.textContent = `${T.flat} ${airport === 'CDG' ? 'CDG' : 'Orly'}, ${T.rive[rive]} (${T.arr(arr)})`;
      extra.textContent = `${T.extra(T.booking[kind], eur(sup))}${pax.amount ? ', ' + eur(pax.amount) : ''}, ${T.max(eur(total))}${pax.open ? '. ' + T.pax(eur(TARIFS.supplements.parPassagerDes5)) : ''}.`;
      hidden.value = `Forfait ${base} € (${airport}, rive ${rive}, ${arr}e) + ${kind === 'avance' ? 'réservation à l\'avance' : 'réservation immédiate'} ${sup} €${pax.amount ? ` + passagers ${pax.amount} €` : ''} = ${total} € au plus${pax.open ? ' (5-7 passagers : +5,50 € par passager à partir du 5e)' : ''}`;
    }

    async function geocode(q, limit) {
      const url = `${API}?q=${encodeURIComponent(q)}&limit=${limit}&autocomplete=1&lat=48.8566&lon=2.3522`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('geocode');
      return (await res.json()).features || [];
    }

    function resolve(final) {
      const v = input.value.trim();
      const direct = postcodeInText(v) || known.get(v);
      if (direct) { postcode = direct; state = 'found'; render(); return; }
      if (v.length < 4) { postcode = null; state = 'idle'; render(); return; }
      const my = ++seq;
      if (final) { state = 'searching'; render(); }
      geocode(v, final ? 1 : 5).then(features => {
        if (my !== seq) return;
        list.innerHTML = '';
        features.forEach(f => {
          known.set(f.properties.label, f.properties.postcode);
          const o = document.createElement('option'); o.value = f.properties.label; list.appendChild(o);
        });
        if (known.has(input.value.trim())) { postcode = known.get(input.value.trim()); state = 'found'; }
        else if (final) {
          if (features.length) { postcode = features[0].properties.postcode; state = 'found'; }
          else { postcode = null; state = 'notfound'; }
        }
        render();
      }).catch(() => { if (my === seq && final) { state = 'idle'; render(); } });
    }

    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => resolve(false), 250); });
    input.addEventListener('change', () => { clearTimeout(timer); resolve(true); });
    form.addEventListener('change', e => { if (e.target !== input) render(); });
    form.addEventListener('reset', () => setTimeout(() => resolve(true), 0));
    if (input.value.trim()) resolve(true); else render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('booking-form');
    if (form) attach(form);
  });
})();
