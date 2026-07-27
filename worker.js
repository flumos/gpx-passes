// Passjäger Worker — statische Assets + anonymer Event-Zähler (/e).
// Es wird NICHTS Personenbezogenes gespeichert: keine IP, kein User-Agent,
// keine IDs, keine Cookies — nur Event-Name + grobe Buckets (siehe WHITELIST).
const WHITELIST = new Set(['analyse', 'link_erstellt', 'link_geoeffnet',
  'bericht_kopiert', 'bild_geteilt', 'pwa_installiert']);
const DIM_RE = /^[a-z0-9_+-]{0,24}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/e') {
      try {
        const { n, d1, d2, d3 } = await request.json();
        // Unbekannte Namen/Dimensionen still verwerfen (kein Probing-Feedback)
        if (WHITELIST.has(n)) {
          const dims = [d1, d2, d3].map((d) =>
            (typeof d === 'string' && DIM_RE.test(d)) ? d : '');
          env.EVENTS?.writeDataPoint({ blobs: [n, ...dims], indexes: [n] });
        }
      } catch (e) { /* kaputter Body → egal, trotzdem 204 */ }
      return new Response(null, { status: 204 });
    }
    return env.ASSETS.fetch(request);
  },
};
