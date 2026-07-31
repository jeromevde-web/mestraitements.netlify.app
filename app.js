// ---------- Config ----------
// 1. Crée un compte gratuit sur https://dashboard.stripe.com/register
// 2. Produits → Créer un lien de paiement (Payment Link), ex. "Premium — 3,99€/mois"
// 3. Dans les réglages du lien, mets l'URL de redirection après paiement sur :
//    https://TON-DOMAINE/index.html?premium=success
// 4. Colle le lien généré ci-dessous.
const CONFIG = {
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/00w28qaBE7m48dv6JR7EQ00",
  FREE_TREATMENT_LIMIT: 2,
  VAPID_PUBLIC_KEY: "BNWd5u10_VhkGVkwyQO2Ny_9fQwBdkwBuiDxrENsRCdV-HYdDsm2BB5cjk-YdLk0AgujbzxHX2OTFDKp6bFilwQ",
};

const PREMIUM_KEY = "mestraitements-premium";

function isPremium() {
  return localStorage.getItem(PREMIUM_KEY) === "true";
}

function checkPremiumRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("premium") === "success") {
    localStorage.setItem(PREMIUM_KEY, "true");
    window.history.replaceState({}, "", window.location.pathname);
    showToast("Bienvenue dans MesTraitements Premium ✨", "success");
  }
}

// ---------- State ----------
const STORAGE_KEY = "mestraitements-state";
const ONBOARD_KEY = "mestraitements-onboarded";

let state = { treatments: [], doseLog: {} };
let currentTab = "today";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {
    console.error("Erreur de lecture des données", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    showToast("Impossible d'enregistrer. L'espace de stockage est peut-être plein.");
  }
}

// ---------- Helpers ----------
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function timeNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dayLabel(key) {
  const d = new Date(key + "T00:00:00");
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function computeStreak() {
  const byDate = {};
  Object.values(state.doseLog).forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = { taken: 0, missed: 0 };
    if (e.status === "pris") byDate[e.date].taken += 1;
    if (e.status === "manque") byDate[e.date].missed += 1;
  });
  let streak = 0;
  let cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = todayKey(cursor);
    const day = byDate[key];
    if (i === 0 && !day) { cursor.setDate(cursor.getDate() - 1); continue; }
    if (!day) break;
    if (day.missed > 0) break;
    if (day.taken > 0) streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------- Toast ----------
function showToast(msg, type = "error") {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast toast-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { root.innerHTML = ""; }, 3500);
}

// ---------- Rendering ----------
function render() {
  const titles = { today: "Aujourd'hui", treatments: "Mes traitements", history: "Historique", stats: "Statistiques" };
  document.getElementById("header-title").textContent = titles[currentTab] || "Aujourd'hui";

  document.querySelectorAll(".navitem").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === currentTab);
  });

  const main = document.getElementById("main-content");
  if (currentTab === "today") main.innerHTML = renderToday();
  else if (currentTab === "treatments") main.innerHTML = renderTreatments();
  else if (currentTab === "stats") main.innerHTML = renderStats();
  else main.innerHTML = renderHistory();

  attachContentListeners();
}

const MISSED_GRACE_MINUTES = 30;

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function doseVisualState(status, time) {
  if (status === "pris") return "done";
  const diff = minutesNow() - timeToMinutes(time);
  if (diff < 0) return "upcoming";
  if (diff <= MISSED_GRACE_MINUTES) return "soon";
  return "missed";
}

function renderToday() {
  const key = todayKey();
  const doses = [];
  state.treatments.forEach((t) => {
    (t.times || []).forEach((time) => {
      const logKey = `${key}__${t.id}__${time}`;
      doses.push({ treatment: t, time, status: state.doseLog[logKey]?.status || "attente" });
    });
  });
  doses.sort((a, b) => a.time.localeCompare(b.time));

  if (state.treatments.length === 0) return renderEmpty();

  const takenCount = doses.filter((d) => d.status === "pris").length;
  const lowStock = state.treatments.filter((t) => t.stock <= t.alertThreshold);
  const streak = computeStreak();
  const nowT = timeNow();
  const pct = doses.length > 0 ? Math.round((takenCount / doses.length) * 100) : 0;
  const nextDose = doses.find((d) => d.status !== "pris" && timeToMinutes(d.time) >= minutesNow());

  let html = `<div class="row" style="margin-bottom:16px;">
      <div class="daylabel">${dayLabel(key)}</div>
      ${streak > 0 ? `<div class="streak">✦ ${streak} jour${streak > 1 ? "s" : ""} sans oubli</div>` : ""}
    </div>`;

  // Dashboard stats
  html += `
    <div class="dashboard-grid">
      <div class="dash-stat">
        <div class="dash-value">${takenCount}/${doses.length}</div>
        <div class="dash-label">Prises aujourd'hui</div>
      </div>
      <div class="dash-stat">
        <div class="dash-value">${pct}%</div>
        <div class="dash-label">Réalisé</div>
      </div>
      <div class="dash-stat">
        <div class="dash-value">${nextDose ? nextDose.time : "—"}</div>
        <div class="dash-label">${nextDose ? "Prochaine prise" : "Journée terminée"}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-value">${state.treatments.length}</div>
        <div class="dash-label">Traitement${state.treatments.length > 1 ? "s" : ""} actif${state.treatments.length > 1 ? "s" : ""}</div>
      </div>
    </div>`;

  html += `
    <div class="progress">
      ${doses.map((d) => `<div class="dot dot-${doseVisualState(d.status, d.time)}"></div>`).join("")}
    </div>`;

  if (lowStock.length > 0) {
    html += `<div class="banner">⚠️<div class="banner-text">Stock bas pour ${escapeHtml(lowStock.map((t) => t.name).join(", "))}. Pense à renouveler.</div></div>`;
  }

  doses.forEach((d) => {
    const vstate = doseVisualState(d.status, d.time);
    const tagText = vstate === "soon" ? "⏳ Bientôt en retard" : vstate === "missed" ? "⚠ Non prise" : "";
    html += `
      <div class="card card-${vstate}">
        <div class="time">${d.time}</div>
        <div style="flex:1; min-width:0;">
          <div class="med-name">${escapeHtml(d.treatment.name)}</div>
          <div class="med-dose">${escapeHtml(d.treatment.dosage)}</div>
          ${tagText ? `<div class="status-tag status-tag-${vstate}">${tagText}</div>` : ""}
        </div>
        <button class="check ${vstate === "done" ? "done" : ""} check-${vstate}" data-action="toggle-dose" data-tid="${d.treatment.id}" data-time="${d.time}" data-status="${d.status}" aria-label="Marquer comme pris" style="color:${vstate === "done" ? "white" : "#6B8079"}">
          ${vstate === "done" ? CHECK_SVG : ""}
        </button>
      </div>`;
  });

  html += `<button class="add-btn" data-action="open-add">＋ Ajouter un traitement</button>`;
  return html;
}

function renderEmpty() {
  return `
    <div class="empty">
      <div class="empty-icon">💊</div>
      <div class="empty-title font-display">Rien à suivre pour l'instant</div>
      <div class="empty-body">Ajoute un traitement pour commencer tes rappels.</div>
      <button class="primary-btn" data-action="open-add" style="width:auto; padding:12px 24px;">＋ Ajouter un traitement</button>
    </div>`;
}

function renderTreatments() {
  if (state.treatments.length === 0) return renderEmpty();
  let html = "";
  state.treatments.forEach((t) => {
    const low = t.stock <= t.alertThreshold;
    const ref = t.initialStock && t.initialStock > 0 ? t.initialStock : Math.max(t.stock, t.alertThreshold * 3, 1);
    const stockPct = Math.max(0, Math.min(100, Math.round((t.stock / ref) * 100)));
    html += `
      <div class="treat-card">
        <div class="treat-top">
          <div>
            <div class="treat-name">${escapeHtml(t.name)} ${low ? `<span class="renew-badge">Bientôt à renouveler</span>` : ""}</div>
            <div class="treat-sub">${escapeHtml(t.dosage)} · ${t.times.join(", ")}</div>
          </div>
          <button class="del-btn" data-action="delete-treatment" data-tid="${t.id}" aria-label="Supprimer">✕</button>
        </div>
        <div class="stock-bar-track"><div class="stock-bar-fill ${low ? "low" : ""}" style="width:${stockPct}%"></div></div>
        <div class="stockrow">
          <div class="stocktext ${low ? "low" : ""}">📦 ${t.stock} restant${t.stock > 1 ? "s" : ""}</div>
          <button class="pill-btn" data-action="open-restock" data-tid="${t.id}">Renouveler</button>
        </div>
      </div>`;
  });
  html += `<button class="add-btn" data-action="open-add">＋ Ajouter un traitement</button>`;
  html += isPremium()
    ? `<div style="text-align:center; margin-top:16px;"><span class="streak">✨ Premium actif</span></div>`
    : `<div style="text-align:center; margin-top:16px; font-size:13px; color:#6B8079;">Version gratuite · ${state.treatments.length}/${CONFIG.FREE_TREATMENT_LIMIT} traitements</div>`;

  if (state.treatments.length > 0) {
    html += `
      <div style="margin-top:24px; padding-top:20px; border-top:1.5px solid #EEF2ED;">
        <p style="font-size:12px; color:#6B8079; text-align:center; margin-bottom:12px;">
          Vos données sont stockées uniquement sur cet appareil. Sauvegardez-les régulièrement.
        </p>
        <div style="display:flex; gap:10px;">
          <button class="pill-btn" style="flex:1;" data-action="export-backup">⬇ Sauvegarder</button>
          <button class="pill-btn" style="flex:1;" data-action="import-backup">⬆ Restaurer</button>
        </div>
      </div>`;
  }
  return html;
}

function computeAdherence(days) {
  let taken = 0;
  let expected = 0;
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateKey = todayKey(d);
    state.treatments.forEach((t) => {
      (t.times || []).forEach((time) => {
        expected++;
        const logKey = `${dateKey}__${t.id}__${time}`;
        if (state.doseLog[logKey]?.status === "pris") taken++;
      });
    });
  }
  const pct = expected > 0 ? Math.round((taken / expected) * 100) : 0;
  return { taken, expected, missed: expected - taken, pct };
}

function computeDailyBreakdown(days) {
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateKey = todayKey(d);
    let taken = 0;
    let expected = 0;
    state.treatments.forEach((t) => {
      (t.times || []).forEach((time) => {
        expected++;
        const logKey = `${dateKey}__${t.id}__${time}`;
        if (state.doseLog[logKey]?.status === "pris") taken++;
      });
    });
    const pct = expected > 0 ? Math.round((taken / expected) * 100) : 0;
    out.push({ dateKey, pct, label: d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "") });
  }
  return out;
}

function renderStats() {
  if (state.treatments.length === 0) {
    return `<p style="text-align:center; color:#4E655C; font-size:14px; padding:60px 20px;">Ajoute un traitement pour voir tes statistiques.</p>`;
  }

  const week = computeAdherence(7);
  const month = computeAdherence(30);
  const daily = computeDailyBreakdown(7);
  const maxBar = 100;

  return `
    <div class="dash-stat" style="margin-bottom:14px;">
      <div class="dash-value" style="font-size:32px;">${week.pct}%</div>
      <div class="dash-label">Taux d'observance (7 derniers jours)</div>
    </div>

    <div class="dashboard-grid" style="margin-bottom:20px;">
      <div class="dash-stat">
        <div class="dash-value">${week.taken}</div>
        <div class="dash-label">Prises cette semaine</div>
      </div>
      <div class="dash-stat">
        <div class="dash-value">${week.missed}</div>
        <div class="dash-label">Oubliées cette semaine</div>
      </div>
      <div class="dash-stat">
        <div class="dash-value">${month.taken}</div>
        <div class="dash-label">Prises ce mois-ci</div>
      </div>
      <div class="dash-stat">
        <div class="dash-value">${month.pct}%</div>
        <div class="dash-label">Observance sur 30 jours</div>
      </div>
    </div>

    <p style="font-size:12px; color:#6B8079; margin-bottom:10px; font-weight:600;">7 derniers jours</p>
    <div class="bar-chart">
      ${daily
        .map(
          (d) => `
        <div class="bar-col">
          <div class="bar-track">
            <div class="bar-fill" style="height:${Math.max(4, (d.pct / maxBar) * 100)}%"></div>
          </div>
          <div class="bar-label">${escapeHtml(d.label)}</div>
        </div>`
        )
        .join("")}
    </div>

    <p style="font-size:11.5px; color:#6B8079; text-align:center; margin-top:18px; line-height:1.5;">
      Calculé à partir des traitements actifs et des prises enregistrées dans l'app.
    </p>
  `;
}

function renderHistory() {
  const byDate = {};
  Object.values(state.doseLog).forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) {
    return `<p style="text-align:center; color:#4E655C; font-size:14px; padding:60px 20px;">Pas encore d'historique.</p>`;
  }
  const nameFor = (id) => state.treatments.find((t) => t.id === id)?.name || "Traitement supprimé";
  let html = "";
  dates.forEach((date) => {
    html += `<div class="hist-group"><div class="hist-daylabel">${dayLabel(date)}</div><div class="hist-list">`;
    byDate[date].sort((a, b) => a.time.localeCompare(b.time)).forEach((entry) => {
      html += `
        <div class="hist-row">
          <div class="hist-time">${entry.time}</div>
          <div class="hist-name">${escapeHtml(nameFor(entry.treatmentId))}</div>
          <div class="hist-badge ${entry.status === "pris" ? "ok" : "miss"}">${entry.status === "pris" ? "Pris" : "Manqué"}</div>
        </div>`;
    });
    html += `</div></div>`;
  });
  return html;
}

// ---------- Actions ----------
function toggleDose(treatmentId, time, currentStatus) {
  const key = todayKey();
  const logKey = `${key}__${treatmentId}__${time}`;
  const newStatus = currentStatus === "pris" ? "attente" : "pris";
  const wasTaken = currentStatus === "pris";
  const nowTaken = newStatus === "pris";
  const stockDelta = nowTaken && !wasTaken ? -1 : !nowTaken && wasTaken ? 1 : 0;

  state.doseLog[logKey] = { status: newStatus, at: timeNow(), date: key, treatmentId, time };
  const t = state.treatments.find((x) => x.id === treatmentId);
  if (t) t.stock = Math.max(0, t.stock + stockDelta);

  saveState();
  render();
  reportDoseStatus(treatmentId, time, newStatus);
  syncPushSubscription();
}

function deleteTreatment(id) {
  state.treatments = state.treatments.filter((t) => t.id !== id);
  saveState();
  render();
  syncPushSubscription();
}

function restock(id, amount) {
  const t = state.treatments.find((x) => x.id === id);
  if (t) {
    t.stock += amount;
    t.initialStock = t.stock; // new reference point for the progress bar
  }
  saveState();
  render();
  closeSheet();
  syncPushSubscription();
}

function addTreatment(t) {
  state.treatments.push(t);
  saveState();
  render();
  closeSheet();
  syncPushSubscription();
}

// ---------- Backup / Restore ----------
function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "MesTraitements",
    version: 1,
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = todayKey();
  a.href = url;
  a.download = `mestraitements-sauvegarde-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Sauvegarde téléchargée.", "success");
}

function triggerImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.state || !Array.isArray(parsed.state.treatments)) {
          throw new Error("format invalide");
        }
        if (!confirm("Restaurer cette sauvegarde va remplacer toutes vos données actuelles. Continuer ?")) return;
        state = parsed.state;
        saveState();
        render();
        syncPushSubscription();
        showToast("Sauvegarde restaurée avec succès.", "success");
      } catch (e) {
        showToast("Ce fichier ne semble pas être une sauvegarde valide.");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ---------- Sheets ----------
function closeSheet() {
  document.getElementById("sheet-root").innerHTML = "";
}

function openAddSheet() {
  const root = document.getElementById("sheet-root");
  root.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <button class="back-btn" data-action="close-sheet">←</button>
          <div class="sheet-title font-display">Nouveau traitement</div>
        </div>

        <label class="field">
          <span class="field-label">Nom du médicament</span>
          <input class="input" id="f-name" placeholder="ex. Levothyrox 75µg">
        </label>

        <label class="field">
          <span class="field-label">Dosage / instructions</span>
          <input class="input" id="f-dosage" placeholder="ex. 1 comprimé, à jeun">
        </label>

        <div class="field">
          <span class="field-label">Fréquence</span>
          <div class="chip-row" id="freq-chips">
            <button class="chip" data-times="08:00">1x / jour</button>
            <button class="chip" data-times="08:00,20:00">2x / jour</button>
            <button class="chip" data-times="08:00,13:00,20:00">3x / jour</button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">Heures de prise</span>
          <div class="time-row" id="time-inputs"></div>
        </div>

        <div class="grid2">
          <label class="field">
            <span class="field-label">Stock actuel</span>
            <input class="input" type="number" min="0" id="f-stock" placeholder="ex. 28">
          </label>
          <label class="field">
            <span class="field-label">Alerte si ≤</span>
            <input class="input" type="number" min="0" id="f-threshold" value="3">
          </label>
        </div>

        <button class="primary-btn" id="save-treatment-btn">Enregistrer</button>
      </div>
    </div>`;

  let currentTimes = ["08:00"];
  renderTimeInputs(currentTimes);

  document.querySelectorAll("#freq-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#freq-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentTimes = chip.dataset.times.split(",");
      renderTimeInputs(currentTimes);
    });
  });

  function renderTimeInputs(times) {
    const wrap = document.getElementById("time-inputs");
    wrap.innerHTML = times.map((t, i) => `<input class="input" type="time" value="${t}" data-time-index="${i}">`).join("");
  }

  document.getElementById("save-treatment-btn").addEventListener("click", () => {
    const name = document.getElementById("f-name").value.trim();
    const dosage = document.getElementById("f-dosage").value.trim() || "—";
    const stock = document.getElementById("f-stock").value;
    const threshold = document.getElementById("f-threshold").value || "3";
    const times = Array.from(document.querySelectorAll("#time-inputs input")).map((i) => i.value).filter(Boolean).sort();

    if (!name || stock === "" || times.length === 0) {
      showToast("Merci de remplir au moins le nom, le stock et une heure de prise.");
      return;
    }

    addTreatment({
      id: uid(),
      name,
      dosage,
      times,
      stock: Number(stock),
      initialStock: Number(stock),
      alertThreshold: Number(threshold),
    });
  });
}

function openRestockSheet(treatmentId) {
  const t = state.treatments.find((x) => x.id === treatmentId);
  if (!t) return;
  const root = document.getElementById("sheet-root");
  root.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <button class="back-btn" data-action="close-sheet">←</button>
          <div class="sheet-title font-display">Renouveler · ${escapeHtml(t.name)}</div>
        </div>
        <label class="field">
          <span class="field-label">Quantité ajoutée</span>
          <input class="input" type="number" min="1" id="f-amount" placeholder="ex. 28" autofocus>
        </label>
        <button class="primary-btn" id="save-restock-btn">Ajouter au stock</button>
      </div>
    </div>`;

  document.getElementById("save-restock-btn").addEventListener("click", () => {
    const amount = Number(document.getElementById("f-amount").value);
    if (!amount || amount <= 0) {
      showToast("Indique une quantité valide.");
      return;
    }
    restock(treatmentId, amount);
  });
}

function handleAddClick() {
  const atLimit = state.treatments.length >= CONFIG.FREE_TREATMENT_LIMIT && !isPremium();
  if (atLimit) openPaywallSheet();
  else openAddSheet();
}

function openPaywallSheet() {
  const root = document.getElementById("sheet-root");
  const features = [
    { icon: "✅", text: "Traitements illimités", available: true },
    { icon: "☁️", text: "Sauvegarde et synchronisation cloud", available: false },
    { icon: "📄", text: "Export PDF de l'historique", available: false },
    { icon: "👨‍⚕️", text: "Partage avec un proche ou un professionnel", available: false },
    { icon: "📊", text: "Statistiques avancées et tendances", available: false },
  ];
  const featuresHtml = features
    .map(
      (f) => `
      <div class="feature-row ${f.available ? "" : "feature-soon"}">
        <span class="feature-icon">${f.icon}</span>
        <span class="feature-text">${f.text}</span>
        ${f.available ? "" : `<span class="feature-badge">Bientôt</span>`}
      </div>`
    )
    .join("");

  root.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <button class="back-btn" data-action="close-sheet">←</button>
          <div class="sheet-title font-display">Passer Premium</div>
        </div>

        <p style="font-size:14px; color:#3E5951; line-height:1.5; margin-bottom:4px;">
          🎉 Vous utilisez déjà les ${CONFIG.FREE_TREATMENT_LIMIT} traitements disponibles gratuitement.
        </p>
        <p style="font-size:14px; color:#3E5951; line-height:1.5; margin-bottom:18px;">
          Passez Premium pour débloquer :
        </p>

        <div class="feature-list">${featuresHtml}</div>

        <div class="price-box">
          <div class="price-amount">3,99 €<span class="price-period">/mois</span></div>
          <div class="price-note">Résiliable à tout moment depuis Stripe</div>
        </div>

        <a class="primary-btn" style="display:block; text-align:center; text-decoration:none;"
           href="${CONFIG.STRIPE_PAYMENT_LINK}" target="_blank" rel="noopener">
          Passer Premium
        </a>
        <button class="secondary-btn" data-action="close-sheet">Plus tard</button>

        <p class="privacy-note">
          🔒 Vos données restent privées. Aucune donnée médicale n'est vendue ni
          utilisée à des fins publicitaires.
        </p>
      </div>
    </div>`;
}


function attachContentListeners() {
  document.querySelectorAll('[data-action="toggle-dose"]').forEach((btn) => {
    btn.addEventListener("click", () => toggleDose(btn.dataset.tid, btn.dataset.time, btn.dataset.status));
  });
  document.querySelectorAll('[data-action="delete-treatment"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Supprimer ce traitement ?")) deleteTreatment(btn.dataset.tid);
    });
  });
  document.querySelectorAll('[data-action="open-restock"]').forEach((btn) => {
    btn.addEventListener("click", () => openRestockSheet(btn.dataset.tid));
  });
  document.querySelectorAll('[data-action="open-add"]').forEach((btn) => {
    btn.addEventListener("click", handleAddClick);
  });
  document.querySelectorAll('[data-action="export-backup"]').forEach((btn) => {
    btn.addEventListener("click", exportBackup);
  });
  document.querySelectorAll('[data-action="import-backup"]').forEach((btn) => {
    btn.addEventListener("click", triggerImport);
  });
}

document.addEventListener("click", (e) => {
  if (e.target.dataset.action === "close-sheet") closeSheet();
});

document.querySelectorAll(".navitem").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentTab = btn.dataset.tab;
    render();
  });
});

// ---------- Notifications (real push, delivered even when the app is closed) ----------
function getDeviceId() {
  let id = localStorage.getItem("mestraitements-device-id");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem("mestraitements-device-id", id);
  }
  return id;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function requestNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

function buildSchedule() {
  const byTime = {};
  state.treatments.forEach((t) => {
    (t.times || []).forEach((time) => {
      if (!byTime[time]) byTime[time] = [];
      byTime[time].push({ id: t.id, name: t.name });
    });
  });
  return Object.keys(byTime)
    .sort()
    .map((time) => ({ time, medications: byTime[time] }));
}

function buildStockInfo() {
  return state.treatments.map((t) => ({
    id: t.id,
    name: t.name,
    stock: t.stock,
    alertThreshold: t.alertThreshold,
  }));
}

async function reportDoseStatus(treatmentId, time, status) {
  try {
    await fetch("/.netlify/functions/report-dose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId(), date: todayKey(), treatmentId, time, status }),
    });
  } catch (e) {
    // Best-effort: if this fails, the missed-dose follow-up may fire even
    // though the dose was taken. Not critical, so we fail silently here.
  }
}

async function syncPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
      });
    }

    const schedule = buildSchedule();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const deviceId = getDeviceId();

    if (schedule.length === 0) {
      // no treatments left: remove the server-side subscription entirely
      await fetch("/.netlify/functions/delete-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      }).catch(() => {});
      return;
    }

    await fetch("/.netlify/functions/save-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, subscription, timezone, schedule, stockInfo: buildStockInfo() }),
    });
  } catch (e) {
    console.error("Push subscription sync failed:", e);
  }
}

// ---------- Onboarding ----------
const OB_SCREENS = [
  { icon: "💊", title: "Ne manquez plus aucun traitement", text: "Ajoutez vos traitements une fois. L'app s'occupe de vous rappeler quand et de suivre votre stock." },
  { icon: "🔔", title: "Gérez facilement vos médicaments", text: "À chaque prise, un seul tap suffit. Votre stock se met à jour tout seul, avec une alerte avant la rupture." },
  { icon: "🔒", title: "Vos données restent privées", text: "Tout reste stocké de façon sécurisée. Aucune donnée médicale n'est vendue ni utilisée à des fins publicitaires." },
];

function renderOnboarding(step = 0) {
  const ob = document.getElementById("onboarding");
  const s = OB_SCREENS[step];
  const last = step === OB_SCREENS.length - 1;

  ob.innerHTML = `
    <div class="ob-body">
      <div class="ob-icon" style="font-size:28px;">${s.icon}</div>
      <div class="ob-title font-display">${s.title}</div>
      <div class="ob-text">${s.text}</div>
    </div>
    <div class="ob-footer">
      <div class="ob-dots">
        ${OB_SCREENS.map((_, i) => `<div class="ob-dot ${i === step ? "active" : ""}"></div>`).join("")}
      </div>
      ${!last
        ? `<button class="primary-btn" id="ob-next">Continuer →</button>`
        : `<button class="primary-btn" id="ob-example">Essayer avec un exemple</button>
           <button class="secondary-btn" id="ob-own">Ajouter mon propre traitement</button>`
      }
    </div>`;

  if (!last) {
    document.getElementById("ob-next").addEventListener("click", () => renderOnboarding(step + 1));
  } else {
    document.getElementById("ob-example").addEventListener("click", async () => {
      state.treatments.push({
        id: uid(), name: "Doliprane 500mg", dosage: "1 comprimé, si besoin",
        times: ["08:00", "20:00"], stock: 16, alertThreshold: 4,
      });
      saveState();
      await finishOnboarding();
    });
    document.getElementById("ob-own").addEventListener("click", async () => {
      await finishOnboarding();
      openAddSheet();
    });
  }
}

async function finishOnboarding() {
  localStorage.setItem(ONBOARD_KEY, "true");
  document.getElementById("onboarding").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  await requestNotifPermission();
  syncPushSubscription();
  render();
}

// ---------- Boot ----------
function boot() {
  checkPremiumRedirect();
  loadState();
  const onboarded = localStorage.getItem(ONBOARD_KEY) === "true";
  if (!onboarded) {
    document.getElementById("onboarding").classList.remove("hidden");
    renderOnboarding(0);
  } else {
    document.getElementById("app").classList.remove("hidden");
    requestNotifPermission().then(syncPushSubscription);
    render();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((e) => console.error("SW error", e));
  }
}

boot();
