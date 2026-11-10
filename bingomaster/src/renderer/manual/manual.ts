/** Manual: búsqueda, resaltado de la sección visible e impresión. */
const secciones = [...document.querySelectorAll<HTMLElement>('main section')];
const enlaces = [...document.querySelectorAll<HTMLAnchorElement>('.toc nav a')];
const buscar = document.getElementById('buscar') as HTMLInputElement;
const sinResultados = document.getElementById('sin-resultados') as HTMLElement;

const normalizar = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const textos = new Map(secciones.map((s) => [s.id, normalizar(s.textContent ?? '')]));

function quitarMarcas(): void {
  document.querySelectorAll('main mark').forEach((m) => m.replaceWith(document.createTextNode(m.textContent ?? '')));
  secciones.forEach((s) => s.normalize());
}

function marcar(raiz: HTMLElement, q: string): void {
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const nodos: Text[] = [];
  while (walker.nextNode()) nodos.push(walker.currentNode as Text);
  for (const n of nodos) {
    const t = n.data;
    const i = normalizar(t).indexOf(q);
    if (i < 0 || !n.parentElement || n.parentElement.closest('script,style')) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + q.length);
    const m = document.createElement('mark');
    r.surroundContents(m);
  }
}

buscar.addEventListener('input', () => {
  quitarMarcas();
  const q = normalizar(buscar.value.trim());
  let visibles = 0;
  for (const s of secciones) {
    const ok = !q || (textos.get(s.id) ?? '').includes(q);
    s.hidden = !ok;
    enlaces.find((a) => a.hash === '#' + s.id)?.classList.toggle('oculto', !ok);
    if (ok) { visibles++; if (q.length >= 3) marcar(s, q); }
  }
  sinResultados.hidden = visibles > 0;
});

const obs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) enlaces.forEach((a) => a.classList.toggle('activo', a.hash === '#' + e.target.id));
  }
}, { rootMargin: '0px 0px -70% 0px' });
secciones.forEach((s) => obs.observe(s));

document.getElementById('imprimir')?.addEventListener('click', () => window.print());

// Abrir en una sección concreta: manual.html#bingo
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
