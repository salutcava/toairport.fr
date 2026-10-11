/*
 * Mouvement du site (GSAP 3.15 + ScrollTrigger + DrawSVG, hébergés dans assets/vendor/gsap).
 *
 * - .hero-media : parallaxe de la photo de fond des hero, plus lente que la page ;
 * - .seine-section : la carte se dessine au défilement (périphérique, Seine, rives,
 *   routes vers CDG et Orly, puis les étiquettes de prix), et la photo du quai
 *   glisse en sens inverse ;
 * - .tarif-price : les montants comptent jusqu'à leur valeur à l'apparition.
 *
 * GSAP n'est pas référencé par les pages : ce fichier le charge après l'événement load.
 *
 * Rien ne bouge si le visiteur a demandé « réduire les animations » : la page
 * s'affiche alors dans son état final.
 */
(function () {
  // Photos sous la ligne de flottaison : chargées à l'approche (classe .is-near).
  const near = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-near'); near.unobserve(e.target); }
  }), { rootMargin: '600px 0px' });
  document.querySelectorAll('.seine-section').forEach(el => near.observe(el));

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // GSAP est chargé après l'affichage de la page : il ne dispute pas la bande
  // passante aux polices du titre, qui font le LCP (mesuré : 2,6 s -> 4,0 s sinon).
  const VENDOR = ['gsap.min.js', 'ScrollTrigger.min.js', 'DrawSVGPlugin.min.js'];
  const load = src => new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = '/assets/vendor/gsap/' + src; s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
  const start = () => VENDOR.reduce((p, f) => p.then(() => load(f)), Promise.resolve()).then(animate).catch(() => {});
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
})();

function animate() {
  gsap.registerPlugin(ScrollTrigger, window.DrawSVGPlugin);

  document.querySelectorAll('.hero-media').forEach(el => {
    gsap.to(el, {
      yPercent: 14, ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top top', end: 'bottom top', scrub: true },
    });
  });

  document.querySelectorAll('.seine-section').forEach(sec => {
    const bg = sec.querySelector('.seine-bg');
    if (bg) gsap.fromTo(bg, { yPercent: -10 }, { yPercent: 10, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true } });

    const map = sec.querySelector('.seine-map');
    if (!map) return;
    const q = s => map.querySelectorAll(s);
    const tl = gsap.timeline({ scrollTrigger: { trigger: map, start: 'top 80%', end: 'center 45%', scrub: 0.6 } });
    tl.from(q('.paris'), { drawSVG: 0, duration: 1 })
      .from(q('.seine'), { drawSVG: 0, duration: 1 }, '-=0.3')
      .from(q('.rive'), { opacity: 0, duration: 0.6, stagger: 0.2 })
      .from(q('.rive-label'), { opacity: 0, y: 10, duration: 0.5, stagger: 0.15 }, '<')
      .from(q('.route'), { drawSVG: 0, duration: 0.9, stagger: 0.25 })
      .from(q('.airport'), { scale: 0, transformOrigin: '50% 50%', duration: 0.4, stagger: 0.2 }, '-=0.4')
      .from(q('.chip'), { opacity: 0, y: 12, duration: 0.5, stagger: 0.2 });
  });

  document.querySelectorAll('.tarif-price').forEach(el => {
    const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent));
    if (!node) return;
    const target = parseInt(node.textContent, 10);
    const o = { v: Math.round(target * 0.6) };
    gsap.to(o, {
      v: target, duration: 1.1, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => { node.textContent = String(Math.round(o.v)); },
    });
  });
}
