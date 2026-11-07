(function () {
  'use strict';
  const api = window.api;
  const C = window.Carton;
  const $ = (s) => document.querySelector(s);
  const MAX_LADO = 2000; // px del lado mayor de la imagen enviada a la API

  let ajustes = {};
  let stream = null;
  let revision = null; // { imagen:{dataUrl, base64, mediaType}, claveArchivo, items:[{estado, editor, ...}] }
  let editorManual = null;

  // ---------- utilidades ----------
  function aviso(texto, tipo) {
    const a = $('#aviso');
    a.textContent = texto;
    a.className = 'aviso ' + (tipo || '');
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => a.classList.add('oculto'), 6000);
  }

  function irTab(nombre) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('oculto', t.id !== 'tab-' + nombre));
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('activo', b.dataset.tab === nombre));
    if (nombre === 'lista') cargarLista();
    if (nombre === 'manual' && editorManual) editorManual.enfocar();
    if (nombre !== 'captura') apagarCamara();
  }

  function cargarImagen(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('No se pudo abrir la imagen'));
      img.src = src;
    });
  }

  /** Reduce y convierte a JPEG para mandar a la API y para guardar. */
  function aJpeg(fuente, ancho, alto) {
    const k = Math.min(1, MAX_LADO / Math.max(ancho, alto));
    const cv = document.createElement('canvas');
    cv.width = Math.round(ancho * k);
    cv.height = Math.round(alto * k);
    cv.getContext('2d').drawImage(fuente, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL('image/jpeg', 0.9);
    return { dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
  }

  async function prepararDesdeUrl(url) {
    const img = await cargarImagen(url);
    return aJpeg(img, img.naturalWidth, img.naturalHeight);
  }

  function leerArchivo(file) {
    return new Promise((res, rej) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { rej(new Error('Formato no soportado: use JPG, PNG o WEBP')); return; }
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('No se pudo leer el archivo'));
      r.readAsDataURL(file);
    });
  }

  // ---------- eventos ----------
  async function cargarEventos() {
    const evs = await api.eventos.listar();
    const sel = $('#selEvento');
    sel.innerHTML = '';
    if (evs.length === 0) sel.appendChild(new Option('— cree un evento —', ''));
    evs.forEach((e) => sel.appendChild(new Option(e.nombre, e.id)));
    sel.value = ajustes.eventoActivo || '';
    if (!sel.value && evs[0]) {
      sel.value = evs[0].id;
      ajustes = await api.ajustes.actualizar({ eventoActivo: evs[0].id });
    }
  }

  $('#selEvento').addEventListener('change', async (e) => {
    ajustes = await api.ajustes.actualizar({ eventoActivo: e.target.value });
    cargarLista();
  });
  $('#btnNuevoEvento').addEventListener('click', async () => {
    const nombre = await pedirTexto('Nombre del evento');
    if (!nombre) return;
    const r = await api.eventos.crear(nombre);
    if (!r.ok) { aviso(r.mensaje, 'alerta'); return; }
    ajustes = await api.ajustes.obtener();
    await cargarEventos();
    aviso('Evento creado: ' + r.evento.nombre, 'ok');
  });

  /** prompt() no existe en Electron: mini diálogo propio. */
  function pedirTexto(titulo) {
    return new Promise((res) => {
      const d = document.createElement('dialog');
      d.innerHTML = '<form method="dialog"><p></p><input required><div class="fila"><button value="ok">Aceptar</button><button value="no" class="sec" formnovalidate>Cancelar</button></div></form>';
      d.querySelector('p').textContent = titulo;
      document.body.appendChild(d);
      d.addEventListener('close', () => {
        const v = d.returnValue === 'ok' ? d.querySelector('input').value.trim() : '';
        d.remove();
        res(v);
      });
      d.showModal();
    });
  }

  function hayEvento() {
    if (!ajustes.eventoActivo) { aviso('Primero cree o seleccione un evento.', 'alerta'); return false; }
    return true;
  }

  // ---------- cámara ----------
  async function listarCamaras() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const sel = $('#selCamara');
      const previo = sel.value;
      sel.innerHTML = '';
      devs.forEach((d, i) => sel.appendChild(new Option(d.label || 'Cámara ' + (i + 1), d.deviceId)));
      if (previo) sel.value = previo;
    } catch (_) { /* sin cámaras */ }
  }

  async function encenderCamara() {
    apagarCamara();
    try {
      const id = $('#selCamara').value;
      stream = await navigator.mediaDevices.getUserMedia({
        video: Object.assign({ width: { ideal: 1920 }, height: { ideal: 1080 } }, id ? { deviceId: { exact: id } } : {}),
        audio: false,
      });
      $('#video').srcObject = stream;
      $('#btnFoto').disabled = false;
      $('#btnCamara').textContent = 'Apagar cámara';
      listarCamaras();
    } catch (e) {
      aviso('No se pudo abrir la cámara: ' + e.message, 'alerta');
    }
  }

  function apagarCamara() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    $('#video').srcObject = null;
    $('#btnFoto').disabled = true;
    $('#btnCamara').textContent = 'Encender cámara';
  }

  $('#btnCamara').addEventListener('click', () => (stream ? apagarCamara() : encenderCamara()));
  $('#selCamara').addEventListener('change', () => { if (stream) encenderCamara(); });
  $('#btnFoto').addEventListener('click', () => {
    const v = $('#video');
    if (!v.videoWidth) return;
    const img = aJpeg(v, v.videoWidth, v.videoHeight);
    apagarCamara();
    procesarImagen(img, null);
  });

  // ---------- archivo / arrastrar ----------
  async function desdeArchivo(file) {
    try {
      const img = await prepararDesdeUrl(await leerArchivo(file));
      procesarImagen(img, null);
    } catch (e) { aviso(e.message, 'alerta'); }
  }
  $('#inpArchivo').addEventListener('change', (e) => { if (e.target.files[0]) desdeArchivo(e.target.files[0]); e.target.value = ''; });
  const drop = $('#zonaDrop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('sobre')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) desdeArchivo(f);
  });
  // Evitar que soltar una imagen fuera de la zona navegue la ventana.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // ---------- carpeta compartida ----------
  async function cargarCarpeta() {
    const r = await api.carpeta.listar();
    const ul = $('#listaCarpeta');
    ul.innerHTML = '';
    if (!r.ok) { $('#lblCarpeta').textContent = r.mensaje; return; }
    $('#lblCarpeta').textContent = r.carpeta || 'Sin carpeta (elíjala en Ajustes)';
    const ocultar = $('#chkOcultarProcesadas').checked;
    r.archivos.filter((a) => !(ocultar && a.procesada)).slice(0, 50).forEach((a) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'sec';
      b.textContent = 'Usar';
      b.addEventListener('click', async () => {
        const f = await api.carpeta.leer(a.nombre);
        if (!f.ok) { aviso(f.mensaje, 'alerta'); return; }
        try {
          const img = await prepararDesdeUrl('data:' + f.mediaType + ';base64,' + f.base64);
          procesarImagen(img, f.clave);
        } catch (e) { aviso(e.message, 'alerta'); }
      });
      const s = document.createElement('span');
      s.textContent = a.nombre + (a.procesada ? ' ✓' : '');
      li.append(s, b);
      ul.appendChild(li);
    });
    if (!ul.children.length && r.carpeta) ul.innerHTML = '<li class="muted">No hay imágenes pendientes</li>';
  }
  $('#btnRefrescarCarpeta').addEventListener('click', cargarCarpeta);
  $('#chkOcultarProcesadas').addEventListener('change', cargarCarpeta);
  api.carpeta.alCambiar(cargarCarpeta);

  // ---------- lectura con IA ----------
  function estado(texto, tipo) {
    const e = $('#estadoLectura');
    e.className = 'estado ' + (tipo || '');
    e.innerHTML = '';
    if (texto) e.append(texto);
    e.classList.toggle('oculto', !texto);
    return e;
  }

  async function procesarImagen(img, claveArchivo) {
    if (!hayEvento()) return;
    if (revision && revision.items.some((i) => i.estado === 'pendiente')) {
      aviso('Termine o descarte la revisión pendiente antes de importar otra foto.', 'alerta');
      irTab('revision');
      return;
    }
    const cantidad = parseInt($('#selCantidad').value, 10) || null;
    if (!ajustes.apiKeyConfigurada) {
      abrirRevision(img, claveArchivo, vaciosManual(cantidad || 1), 'manual');
      aviso('Sin API key: transcriba los cartones a mano mirando la foto.', 'alerta');
      return;
    }
    estado('Leyendo cartones con IA' + (ajustes.dobleLectura ? ' (doble lectura)' : '') + '…', 'cargando');
    const r = await api.vision.leer({ imagenBase64: img.base64, mediaType: img.mediaType, cantidadEsperada: cantidad });
    if (!r.ok) {
      const e = estado(r.mensaje + ' ', 'alerta');
      const b = document.createElement('button');
      b.textContent = 'Transcribir a mano con la foto al lado';
      b.addEventListener('click', () => { estado(''); abrirRevision(img, claveArchivo, vaciosManual(cantidad || 1), 'manual'); });
      e.appendChild(b);
      return;
    }
    estado('');
    (r.avisos || []).forEach((a) => aviso(a, 'alerta'));
    abrirRevision(img, claveArchivo, r.cartones, 'vision', r.dobleLectura);
  }

  function vaciosManual(n) {
    return Array.from({ length: n }, () => ({
      carton: C.vacio(), dudosas: [], serieDudosa: false, folioDudoso: false, dudoso: false, motivos: [],
    }));
  }

  // ---------- revisión / confirmación ----------
  let zoom = 1;
  function abrirRevision(img, claveArchivo, lecturas, metodo, doble) {
    revision = { imagen: img, claveArchivo, metodo, items: [] };
    zoom = 1;
    $('#imgRevision').src = img.dataUrl;
    $('#imgRevision').style.width = '100%';
    const cont = $('#listaLecturas');
    cont.innerHTML = '';
    lecturas.forEach((l, i) => {
      const caja = document.createElement('div');
      caja.className = 'lectura' + (l.dudoso ? ' es-dudoso' : '');
      const titulo = document.createElement('h3');
      titulo.textContent = 'Cartón ' + (i + 1) + ' de ' + lecturas.length +
        (metodo === 'vision' ? (l.dudoso ? ' — DUDOSO' : ' — lectura sin observaciones') : ' — transcripción manual');
      caja.appendChild(titulo);
      if (metodo === 'vision' && doble) {
        const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Doble lectura: celdas distintas entre ambas lecturas marcadas en amarillo.';
        caja.appendChild(p);
      }
      if (l.motivos && l.motivos.length) {
        const ul = document.createElement('ul'); ul.className = 'motivos';
        l.motivos.forEach((m) => { const li = document.createElement('li'); li.textContent = m; ul.appendChild(li); });
        caja.appendChild(ul);
      }
      const zona = document.createElement('div');
      caja.appendChild(zona);

      const lblRev = document.createElement('label');
      lblRev.className = 'chk';
      const chkRev = document.createElement('input'); chkRev.type = 'checkbox';
      lblRev.append(chkRev, ' Comparé este cartón con la foto, celda por celda');
      caja.appendChild(lblRev);

      const dup = document.createElement('div'); dup.className = 'aviso alerta oculto';
      caja.appendChild(dup);

      const fila = document.createElement('div'); fila.className = 'fila';
      const btnOk = document.createElement('button'); btnOk.textContent = 'Confirmar y guardar';
      const btnNo = document.createElement('button'); btnNo.className = 'sec'; btnNo.textContent = 'Descartar este cartón';
      fila.append(btnOk, btnNo);
      caja.appendChild(fila);
      cont.appendChild(caja);

      const item = { estado: 'pendiente', caja, forzar: false };
      const actualizarBoton = (v) => {
        btnOk.disabled = !(v.ok && chkRev.checked) || item.estado !== 'pendiente';
      };
      item.editor = crearEditor({
        contenedor: zona, carton: l.carton, dudosas: l.dudosas, serieDudosa: l.serieDudosa,
        folioDudoso: l.folioDudoso, orden: ajustes.ordenIngreso,
        alCambiar: (v) => { item.forzar = false; dup.classList.add('oculto'); btnOk.textContent = 'Confirmar y guardar'; actualizarBoton(v); },
      });
      chkRev.addEventListener('change', () => actualizarBoton(item.editor.validar()));
      actualizarBoton(item.editor.validar());

      btnOk.addEventListener('click', async () => {
        const carton = item.editor.obtener();
        if (!item.forzar) {
          const existente = await api.cartones.duplicado({ serie: carton.serie, folio: carton.folio });
          if (existente) {
            dup.textContent = 'Atención: ya existe en este evento un cartón con serie "' + existente.serie +
              '" y folio "' + existente.folio + '" (guardado ' + new Date(existente.creadoEn).toLocaleString() +
              '). Revise si es el mismo cartón. Si de verdad es otro, pulse de nuevo para guardarlo igual.';
            dup.classList.remove('oculto');
            item.forzar = true;
            btnOk.textContent = 'Guardar de todas formas';
            return;
          }
        }
        const r = await api.cartones.guardar({
          carton, confirmado: true, origen: 'externo', metodo: revision.metodo,
          imagen: { base64: revision.imagen.base64, mediaType: revision.imagen.mediaType },
          forzarDuplicado: item.forzar,
          claveArchivo: revision.claveArchivo,
        });
        if (!r.ok) { aviso(r.mensaje, 'alerta'); return; }
        item.estado = 'guardado';
        caja.classList.add('guardado');
        caja.querySelectorAll('input,button').forEach((x) => { x.disabled = true; });
        titulo.textContent += ' — GUARDADO (folio ' + r.carton.folio + ')';
        aviso('Cartón guardado: folio ' + r.carton.folio, 'ok');
        cerrarRevisionSiTermino();
      });
      btnNo.addEventListener('click', () => {
        item.estado = 'descartado';
        caja.classList.add('descartado');
        caja.querySelectorAll('input,button').forEach((x) => { x.disabled = true; });
        cerrarRevisionSiTermino();
      });
      revision.items.push(item);
    });
    $('#navRevision').classList.remove('oculto');
    irTab('revision');
  }

  function cerrarRevisionSiTermino() {
    if (!revision || revision.items.some((i) => i.estado === 'pendiente')) return;
    const n = revision.items.filter((i) => i.estado === 'guardado').length;
    revision = null;
    $('#navRevision').classList.add('oculto');
    aviso('Revisión terminada: ' + n + ' cartón(es) guardado(s).', 'ok');
    irTab('captura');
    cargarCarpeta();
  }

  $('#btnDescartar').addEventListener('click', () => {
    if (!revision) return;
    revision.items.forEach((i) => { if (i.estado === 'pendiente') { i.estado = 'descartado'; i.caja.classList.add('descartado'); } });
    cerrarRevisionSiTermino();
  });
  $('#btnZoomMas').addEventListener('click', () => { zoom = Math.min(4, zoom * 1.25); $('#imgRevision').style.width = (zoom * 100) + '%'; });
  $('#btnZoomMenos').addEventListener('click', () => { zoom = Math.max(0.5, zoom / 1.25); $('#imgRevision').style.width = (zoom * 100) + '%'; });

  // ---------- ingreso manual ----------
  function montarManual() {
    $('#lblOrden').textContent = ajustes.ordenIngreso === 'filas' ? 'por filas' : 'por columnas';
    editorManual = crearEditor({
      contenedor: $('#editorManual'), orden: ajustes.ordenIngreso,
      alCambiar: (v) => { manualForzar = false; $('#dupManual').classList.add('oculto'); $('#btnGuardarManual').disabled = !v.ok; },
      alTerminar: () => $('#btnGuardarManual').focus(),
    });
  }
  let manualForzar = false;

  async function guardarManual() {
    if (!hayEvento()) return;
    const v = editorManual.validar();
    if (!v.ok) { aviso(v.errores.join('. '), 'alerta'); return; }
    const carton = editorManual.obtener();
    if (!manualForzar) {
      const existente = await api.cartones.duplicado({ serie: carton.serie, folio: carton.folio });
      if (existente) {
        $('#dupManual').textContent = 'Ya existe un cartón con serie "' + existente.serie + '" y folio "' + existente.folio +
          '" en este evento. Pulse guardar de nuevo solo si es otro cartón.';
        $('#dupManual').classList.remove('oculto');
        manualForzar = true;
        return;
      }
    }
    const r = await api.cartones.guardar({ carton, confirmado: true, origen: 'externo', metodo: 'manual', forzarDuplicado: manualForzar });
    if (!r.ok) { aviso(r.mensaje, 'alerta'); return; }
    aviso('Guardado folio ' + r.carton.folio, 'ok');
    const siguiente = C.vacio();
    if ($('#chkMantenerSerie').checked) siguiente.serie = carton.serie;
    editorManual.poner(siguiente);
    manualForzar = false;
    // Con la serie mantenida, el cursor salta directo al folio.
    const ids = $('#editorManual').querySelectorAll('.inp-id');
    const destino = siguiente.serie ? ids[1] : ids[0];
    destino.focus();
  }
  $('#btnGuardarManual').addEventListener('click', guardarManual);
  $('#btnLimpiarManual').addEventListener('click', () => { editorManual.poner(C.vacio()); editorManual.enfocar(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !$('#tab-manual').classList.contains('oculto')) {
      e.preventDefault();
      guardarManual();
    }
  });

  function montarTeclado() {
    const t = $('#teclado');
    ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'borrar', '0', 'siguiente'].forEach((k) => {
      const b = document.createElement('button');
      b.className = 'tecla';
      b.textContent = k === 'borrar' ? '⌫' : k === 'siguiente' ? '↵' : k;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // no robar el foco
      b.addEventListener('click', () => editorManual.tecla(k));
      t.appendChild(b);
    });
  }

  // ---------- lista y validación por folio ----------
  function filaCarton(c) {
    const tr = document.createElement('tr');
    [c.serie || '—', c.folio, c.origen, c.metodo, new Date(c.creadoEn).toLocaleString()].forEach((v) => {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    const td = document.createElement('td');
    if (c.duplicadoForzado) td.textContent = '⚠ serie+folio repetido';
    tr.appendChild(td);
    return tr;
  }

  function miniGrilla(c) {
    const t = document.createElement('table');
    t.className = 'grilla mini';
    t.innerHTML = '<thead><tr>' + C.COLUMNAS.map((x) => '<th>' + x + '</th>').join('') + '</tr></thead>';
    const tb = document.createElement('tbody');
    for (let f = 0; f < 5; f++) {
      const tr = document.createElement('tr');
      C.COLUMNAS.forEach((col) => {
        const td = document.createElement('td');
        td.textContent = C.esCentro(col, f) ? 'FREE' : String(c.columnas[col][f]);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    return t;
  }

  async function cargarLista() {
    const lista = await api.cartones.listar();
    const tb = $('#tbodyCartones');
    tb.innerHTML = '';
    lista.slice().reverse().forEach((c) => tb.appendChild(filaCarton(c)));
    const ext = lista.filter((c) => c.origen === 'externo').length;
    $('#lblTotal').textContent = lista.length + ' cartones en el evento (' + ext + ' externos)';
  }

  $('#btnBuscarFolio').addEventListener('click', buscarFolio);
  $('#inpBuscarFolio').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarFolio(); });
  async function buscarFolio() {
    const folio = $('#inpBuscarFolio').value.trim();
    const out = $('#resultadoFolio');
    out.innerHTML = '';
    if (!folio) return;
    const r = await api.cartones.buscarFolio(folio);
    if (!r.length) { out.textContent = 'No hay cartones con folio ' + folio + ' en este evento.'; out.className = 'aviso alerta'; return; }
    out.className = '';
    r.forEach((c) => {
      const d = document.createElement('div');
      d.className = 'resultado';
      const h = document.createElement('p');
      h.textContent = 'Serie ' + (c.serie || '—') + ' · Folio ' + c.folio + ' · origen ' + c.origen;
      d.append(h, miniGrilla(c));
      out.appendChild(d);
    });
    if (r.length > 1) {
      const w = document.createElement('p'); w.className = 'aviso alerta';
      w.textContent = 'Hay ' + r.length + ' cartones con este folio (distinta serie). Verifique la serie.';
      out.prepend(w);
    }
  }

  // ---------- ajustes ----------
  function pintarAjustes() {
    $('#lblApiKey').textContent = ajustes.apiKeyConfigurada ? 'API key configurada (cifrada).' : 'Sin API key: solo ingreso manual.';
    let cif = ajustes.cifradoDisponible ? 'Cifrado del sistema disponible.' : 'El sistema no ofrece cifrado seguro: no se puede guardar la API key.';
    if (ajustes.backendCifrado === 'basic_text') cif += ' Atención: en este Linux no hay llavero (backend basic_text); el cifrado es débil.';
    $('#lblCifrado').textContent = cif;
    $('#inpModelo').value = ajustes.modelo || '';
    $('#chkDoble').checked = !!ajustes.dobleLectura;
    $('#selOrden').value = ajustes.ordenIngreso || 'columnas';
    $('#lblCarpetaAjustes').textContent = ajustes.carpetaCompartida || 'Sin carpeta';
    $('#sinApi').classList.toggle('oculto', !!ajustes.apiKeyConfigurada);
  }

  $('#btnGuardarKey').addEventListener('click', async () => {
    const r = await api.ajustes.guardarApiKey($('#inpApiKey').value);
    $('#inpApiKey').value = '';
    if (!r.ok) { aviso(r.mensaje, 'alerta'); return; }
    ajustes = r.ajustes; pintarAjustes(); aviso('API key guardada cifrada.', 'ok');
  });
  $('#btnBorrarKey').addEventListener('click', async () => { ajustes = await api.ajustes.borrarApiKey(); pintarAjustes(); });
  $('#inpModelo').addEventListener('change', async (e) => { ajustes = await api.ajustes.actualizar({ modelo: e.target.value }); pintarAjustes(); });
  $('#chkDoble').addEventListener('change', async (e) => { ajustes = await api.ajustes.actualizar({ dobleLectura: e.target.checked }); });
  $('#selOrden').addEventListener('change', async (e) => { ajustes = await api.ajustes.actualizar({ ordenIngreso: e.target.value }); montarManual(); });
  $('#btnElegirCarpeta').addEventListener('click', async () => { ajustes = await api.carpeta.elegir(); pintarAjustes(); cargarCarpeta(); });
  $('#btnQuitarCarpeta').addEventListener('click', async () => { ajustes = await api.ajustes.actualizar({ carpetaCompartida: '' }); pintarAjustes(); cargarCarpeta(); });

  // ---------- navegación ----------
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => irTab(b.dataset.tab)));
  document.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); irTab(a.dataset.ir); }));

  // ---------- inicio ----------
  (async function iniciar() {
    ajustes = await api.ajustes.obtener();
    await cargarEventos();
    pintarAjustes();
    montarManual();
    montarTeclado();
    listarCamaras();
    cargarCarpeta();
  })();
})();
