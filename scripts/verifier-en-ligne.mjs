// Vérifie que chaque adresse du sitemap.xml local répond 200 en ligne, sans noindex.
// Usage : npm run check:live (sortie en erreur si une page pose problème).
// CHECK_BASE=https://toairport.vps.olivierlam.fr npm run check:live vérifie une autre adresse que toairport.fr.
// Repère un déploiement qui n'est pas passé : une page présente dans le dépôt mais absente en ligne.
import { readFileSync } from 'node:fs';

const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
const base = process.env.CHECK_BASE?.replace(/\/$/, '');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => (base ? m[1].replace('https://toairport.fr', base) : m[1]));

let erreurs = 0;
for (const url of urls) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const html = res.status === 200 ? await res.text() : '';
    const noindex = /<meta[^>]+name="robots"[^>]+noindex/i.test(html) || /noindex/i.test(res.headers.get('x-robots-tag') ?? '');
    const ok = res.status === 200 && !noindex;
    if (!ok) erreurs++;
    console.log(`${ok ? 'ok ' : 'KO '} ${res.status}${noindex ? ' noindex' : ''}  ${url}`);
  } catch (e) {
    erreurs++;
    console.log(`KO  ${e.message}  ${url}`);
  }
}
console.log(`\n${urls.length - erreurs}/${urls.length} pages en ligne.`);
process.exit(erreurs ? 1 : 0);
