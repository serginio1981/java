/* Cliente PWA: graba en el navegador y delega todo al servidor. */
(() => {
  const $ = (id) => document.getElementById(id);
  const LS_TOKEN = "vka.token", LS_BACKUP = "vka.backup", LS_BACKUP_AT = "vka.backupAt";
  let status = null, recorder = null, chunks = [], mime = "";
  let enrollSamples = [], enrollIdx = 0;

  // ---------- utilidades ----------
  const token = () => localStorage.getItem(LS_TOKEN) || "";
  const headers = () => ({ "X-Auth-Token": token() });

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
    if (res.status === 401) throw new Error("Token inválido. Revísalo en Ajustes.");
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).detail || msg; } catch (_) {}
      throw new Error(msg);
    }
    return res;
  }

  function pickMime() {
    if (!window.MediaRecorder) return null;
    for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", ""]) {
      if (m === "" || MediaRecorder.isTypeSupported(m)) return m;
    }
    return null;
  }
  const extFor = (m) => (m.includes("mp4") ? "m4a" : m.includes("webm") ? "webm" : m.includes("ogg") ? "ogg" : "bin");

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mime = pickMime();
    if (mime === null) throw new Error("Este navegador no soporta grabación (MediaRecorder).");
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start();
  }

  function stopRecording() {
    return new Promise((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || mime || "application/octet-stream";
        resolve(new Blob(chunks, { type }));
      };
      recorder.stop();
    });
  }

  function speakFallback(text) {
    if (!("speechSynthesis" in window) || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    speechSynthesis.speak(u);
  }

  function playResponse(data) {
    const player = $("player");
    if (data.audio_b64) {
      player.src = `data:${data.audio_mime || "audio/mpeg"};base64,${data.audio_b64}`;
      player.play().catch(() => speakFallback(data.response));
    } else {
      speakFallback(data.response);
    }
  }

  // ---------- estado ----------
  async function refreshStatus() {
    try {
      status = await (await api("/api/status")).json();
      const n = status.profiles.length;
      $("status").textContent = n
        ? `Perfiles: ${status.profiles.map((p) => `${p} (${status.roles[p] || "sin rol"})`).join(", ")} · umbral ${status.threshold}`
        : "Sin perfiles enrolados. Ve a Enrolar.";
      $("status-raw").textContent = JSON.stringify(status, null, 2);
      if (!n && localStorage.getItem(LS_BACKUP)) {
        $("status").textContent += " Restaurando copia local…";
        await restoreBackup();
        return refreshStatus();
      }
    } catch (e) {
      $("status").textContent = `⚠️ ${e.message}`;
      if (!token()) showTab("settings");
    }
    updateBackupInfo();
  }

  // ---------- hablar ----------
  let talking = false;
  $("talk").onclick = async () => {
    const btn = $("talk");
    try {
      if (!talking) {
        await startRecording();
        talking = true; btn.classList.add("rec"); btn.textContent = "Escuchando… toca para enviar";
        return;
      }
      btn.disabled = true; btn.textContent = "Procesando…"; btn.classList.remove("rec"); talking = false;
      $("player").play().catch(() => {}); // desbloquea el audio en iOS dentro del gesto del usuario
      const blob = await stopRecording();
      const fd = new FormData();
      fd.append("audio", blob, `cmd.${extFor(blob.type)}`);
      const data = await (await api("/api/command", { method: "POST", body: fd })).json();
      showResult(data);
      playResponse(data);
    } catch (e) {
      showResult({ outcome: "error", error: e.message });
      talking = false; btn.classList.remove("rec");
    } finally {
      btn.disabled = false; btn.textContent = "Toca para hablar";
    }
  };

  function showResult(d) {
    const box = $("result");
    box.classList.remove("hidden");
    const labels = {
      accepted: ["ok", "Voz reconocida"], guest_answered: ["warn", "Voz no reconocida · modo invitado"],
      ignored: ["bad", "Voz no reconocida · ignorado"], invalid_audio: ["bad", "Audio inválido"],
      empty_transcript: ["warn", "No se entendió nada"], error: ["bad", "Error"],
    };
    const [cls, label] = labels[d.outcome] || ["warn", d.outcome];
    const score = d.score != null ? ` · similitud ${d.score.toFixed(3)} (umbral ${d.threshold})` : "";
    box.innerHTML = `
      <div class="${cls}"><strong>${label}</strong></div>
      <div class="muted">${d.speaker ? `Hablante: ${d.speaker} · rol ${d.role}` : d.role ? `Rol: ${d.role}` : ""}${score}${d.adapted ? " · perfil adaptado" : ""}</div>
      ${d.transcript ? `<p class="big">🗣 ${d.transcript}</p>` : ""}
      ${d.response ? `<p class="big">🤖 ${d.response}</p>` : ""}
      ${d.error ? `<p class="bad">${d.error}</p>` : ""}`;
  }

  // ---------- enrolar ----------
  $("en-start").onclick = () => {
    if (!status) return alert("Sin conexión con el servidor.");
    enrollSamples = []; enrollIdx = 0;
    $("en-start").classList.add("hidden"); $("en-send").classList.add("hidden");
    $("en-step").classList.remove("hidden"); $("en-out").textContent = "";
    showPrompt();
  };

  function showPrompt() {
    const total = status.enroll_samples;
    if (enrollIdx >= total) {
      $("en-step").classList.add("hidden"); $("en-send").classList.remove("hidden");
      $("en-out").textContent = `${total} muestras grabadas. Pulsa "Enviar muestras".`;
      return;
    }
    $("en-prompt").textContent = `[${enrollIdx + 1}/${total}] Lee en voz alta:\n“${status.prompts[enrollIdx]}”`;
    $("en-rec").textContent = "Grabar";
  }

  let enrolRecording = false;
  $("en-rec").onclick = async () => {
    try {
      if (!enrolRecording) {
        await startRecording(); enrolRecording = true;
        $("en-rec").textContent = "Grabando… toca al terminar"; $("en-rec").classList.add("danger");
      } else {
        const blob = await stopRecording(); enrolRecording = false;
        $("en-rec").classList.remove("danger");
        enrollSamples[enrollIdx] = blob; enrollIdx++;
        showPrompt();
      }
    } catch (e) { alert(e.message); }
  };
  $("en-redo").onclick = () => { if (!enrolRecording && enrollIdx > 0) { enrollIdx--; showPrompt(); } };

  $("en-send").onclick = async () => {
    const fd = new FormData();
    fd.append("name", $("en-name").value); fd.append("role", $("en-role").value);
    enrollSamples.forEach((b, i) => fd.append("files", b, `s${i}.${extFor(b.type)}`));
    $("en-send").disabled = true; $("en-out").textContent = "Procesando muestras…";
    try {
      const r = await (await api("/api/enroll", { method: "POST", body: fd })).json();
      $("en-out").textContent = `Perfil "${r.name}" (${r.role}) guardado.\nConsistencia por muestra: ${r.scores.map((s) => s.toFixed(2)).join(", ")}\n(valores bajos = ruido u otra voz; repite el enrolamiento si uno destaca por debajo)`;
      await saveBackup();
      await refreshStatus();
    } catch (e) {
      $("en-out").textContent = `Error: ${e.message}`;
    } finally {
      $("en-send").disabled = false; $("en-start").classList.remove("hidden"); $("en-send").classList.add("hidden");
    }
  };

  // ---------- copia de seguridad ----------
  async function saveBackup() {
    const blob = await (await api("/api/profiles/export")).blob();
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(blob); });
    localStorage.setItem(LS_BACKUP, b64); localStorage.setItem(LS_BACKUP_AT, new Date().toISOString());
    updateBackupInfo();
  }
  async function restoreBackup() {
    const b64 = localStorage.getItem(LS_BACKUP);
    if (!b64) return alert("No hay copia local.");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fd = new FormData(); fd.append("file", new Blob([bytes], { type: "application/zip" }), "vka-profiles.zip");
    await api("/api/profiles/import", { method: "POST", body: fd });
  }
  function updateBackupInfo() {
    const at = localStorage.getItem(LS_BACKUP_AT);
    $("backup-info").textContent = at ? `Copia local guardada el ${new Date(at).toLocaleString()}` : "No hay copia local.";
  }
  $("backup-now").onclick = () => saveBackup().catch((e) => alert(e.message));
  $("restore-now").onclick = () => restoreBackup().then(refreshStatus).catch((e) => alert(e.message));
  $("backup-forget").onclick = () => { if (confirm("¿Borrar la copia local de los perfiles?")) { localStorage.removeItem(LS_BACKUP); localStorage.removeItem(LS_BACKUP_AT); updateBackupInfo(); } };

  // ---------- ajustes / pestañas ----------
  $("token").value = token();
  $("save-token").onclick = () => { localStorage.setItem(LS_TOKEN, $("token").value.trim()); refreshStatus(); showTab("talk"); };
  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    ["talk", "enroll", "settings"].forEach((t) => $(`tab-${t}`).classList.toggle("hidden", t !== name));
  }
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  if (!navigator.mediaDevices?.getUserMedia) $("talk-hint").textContent = "⚠️ Este navegador no permite usar el micrófono. Abre la app en Safari.";
  refreshStatus();
})();
