/* Editor de cartón 5x5 reutilizable (revisión de lectura IA e ingreso manual). */
(function () {
  'use strict';
  const C = window.Carton;

  function el(tag, attrs, hijos) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else e.setAttribute(k, v);
      }
    }
    (hijos || []).forEach((h) => e.appendChild(h));
    return e;
  }

  /**
   * @param {{contenedor:HTMLElement, carton?:object, dudosas?:string[], serieDudosa?:boolean,
   *          folioDudoso?:boolean, orden?:'columnas'|'filas', alCambiar?:Function, alTerminar?:Function}} op
   */
  function crearEditor(op) {
    const dudosas = new Set(op.dudosas || []);
    const orden = C.ordenCeldas(op.orden || 'columnas');
    const celdas = {};
    let ultimoFoco = null;

    const inpSerie = el('input', { class: 'inp-id', placeholder: 'Serie', spellcheck: 'false', autocomplete: 'off' });
    const inpFolio = el('input', { class: 'inp-id', placeholder: 'Folio *', spellcheck: 'false', autocomplete: 'off' });
    if (op.serieDudosa) inpSerie.classList.add('dudosa');
    if (op.folioDudoso) inpFolio.classList.add('dudosa');

    const tabla = el('table', { class: 'grilla' });
    const thead = el('tr');
    C.COLUMNAS.forEach((c) => thead.appendChild(el('th', { text: c })));
    tabla.appendChild(el('thead', null, [thead]));
    const tbody = el('tbody');
    for (let f = 0; f < C.FILAS; f++) {
      const tr = el('tr');
      for (const c of C.COLUMNAS) {
        const td = el('td');
        if (C.esCentro(c, f)) {
          td.className = 'free';
          td.textContent = 'FREE';
        } else {
          const inp = el('input', {
            inputmode: 'numeric', maxlength: '2', autocomplete: 'off',
            'data-col': c, 'data-fila': String(f), title: c + ' ' + C.RANGOS[c].join('–'),
          });
          const k = C.claveCelda(c, f);
          if (dudosas.has(k)) inp.classList.add('dudosa');
          celdas[k] = inp;
          td.appendChild(inp);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tabla.appendChild(tbody);

    const errores = el('div', { class: 'errores' });
    op.contenedor.innerHTML = '';
    op.contenedor.appendChild(el('div', { class: 'ids' }, [
      el('label', null, [document.createTextNode('Serie '), inpSerie]),
      el('label', null, [document.createTextNode('Folio '), inpFolio]),
    ]));
    op.contenedor.appendChild(tabla);
    op.contenedor.appendChild(errores);

    function poner(carton) {
      const n = C.normalizar(carton);
      inpSerie.value = n.serie;
      inpFolio.value = n.folio;
      for (const { col, fila } of orden) {
        const v = n.columnas[col][fila];
        celdas[C.claveCelda(col, fila)].value = v === null ? '' : String(v);
      }
      refrescar();
    }

    function obtener() {
      const out = C.vacio();
      out.serie = inpSerie.value.trim();
      out.folio = inpFolio.value.trim();
      for (const { col, fila } of orden) {
        const t = celdas[C.claveCelda(col, fila)].value.trim();
        out.columnas[col][fila] = /^\d{1,2}$/.test(t) ? parseInt(t, 10) : (t === '' ? null : NaN);
      }
      return out;
    }

    function validar() {
      const carton = obtener();
      // NaN (texto no numérico) se reporta como inválido.
      return C.validar(carton);
    }

    function refrescar() {
      const v = validar();
      for (const [k, inp] of Object.entries(celdas)) {
        inp.classList.toggle('error', !!v.celdas[k] && inp.value !== '');
        inp.classList.toggle('vacia', inp.value === '');
        inp.title = v.celdas[k] || (inp.dataset.col + ' ' + C.RANGOS[inp.dataset.col].join('–'));
      }
      inpFolio.classList.toggle('error', !inpFolio.value.trim());
      errores.textContent = v.ok ? '' : v.errores.join(' · ');
      if (op.alCambiar) op.alCambiar(v);
      return v;
    }

    function indice(inp) {
      return orden.findIndex((o) => celdas[C.claveCelda(o.col, o.fila)] === inp);
    }

    function irA(i) {
      if (i < 0) { inpFolio.focus(); inpFolio.select(); return; }
      if (i >= orden.length) { if (op.alTerminar) op.alTerminar(); return; }
      const inp = celdas[C.claveCelda(orden[i].col, orden[i].fila)];
      inp.focus();
      inp.select();
    }

    function marcarRevisada(inp) {
      inp.classList.remove('dudosa');
    }

    for (const inp of Object.values(celdas)) {
      inp.addEventListener('focus', () => { ultimoFoco = inp; });
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 2);
        marcarRevisada(inp);
        refrescar();
        if (C.celdaCompleta(inp.dataset.col, inp.value)) irA(indice(inp) + 1);
      });
      inp.addEventListener('keydown', (e) => {
        const i = indice(inp);
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); marcarRevisada(inp); irA(i + 1); }
        else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); irA(i - 1); }
        else if (e.key === 'Backspace' && inp.value === '') { e.preventDefault(); irA(i - 1); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          moverFlecha(inp, e.key);
        }
      });
    }

    function moverFlecha(inp, tecla) {
      let ci = C.COLUMNAS.indexOf(inp.dataset.col);
      let f = parseInt(inp.dataset.fila, 10);
      for (let n = 0; n < 2; n++) { // como mucho saltar el centro
        if (tecla === 'ArrowDown') f = Math.min(4, f + 1);
        if (tecla === 'ArrowUp') f = Math.max(0, f - 1);
        if (tecla === 'ArrowRight') ci = Math.min(4, ci + 1);
        if (tecla === 'ArrowLeft') ci = Math.max(0, ci - 1);
        const destino = celdas[C.claveCelda(C.COLUMNAS[ci], f)];
        if (destino) { destino.focus(); destino.select(); return; }
      }
    }

    [inpSerie, inpFolio].forEach((inp) => {
      inp.addEventListener('focus', () => { ultimoFoco = inp; });
      inp.addEventListener('input', () => { inp.classList.remove('dudosa'); refrescar(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (inp === inpSerie) { inpFolio.focus(); inpFolio.select(); } else irA(0);
        }
      });
    });

    /** Para el teclado en pantalla. */
    function tecla(t) {
      const inp = ultimoFoco || inpSerie;
      if (t === 'borrar') {
        if (inp.value === '' && inp.dataset.col) { irA(indice(inp) - 1); return; }
        inp.value = inp.value.slice(0, -1);
        inp.dispatchEvent(new Event('input'));
        inp.focus();
      } else if (t === 'siguiente') {
        inp.focus();
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      } else {
        inp.value += t;
        inp.dispatchEvent(new Event('input'));
        if (!op.contenedor.contains(document.activeElement)) inp.focus();
      }
    }

    function hayDudosas() {
      return !!op.contenedor.querySelector('.dudosa');
    }

    function enfocar() { inpSerie.focus(); inpSerie.select(); }

    poner(op.carton || C.vacio());
    return { poner, obtener, validar, refrescar, enfocar, tecla, hayDudosas };
  }

  window.crearEditor = crearEditor;
})();
