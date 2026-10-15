const MAX_NAMES = 500;
const MAX_NAME_LENGTH = 120;
const STORAGE_KEY = "sorteio.nomes";
const SESSION_KEY = "sorteio.sessao";
const RECORDS_KEY = "sorteio.ganhadores";

const PALETTE = [
  { bg: "#ef6f4c", fg: "#fff8f4" },
  { bg: "#e7c36a", fg: "#2a2110" },
  { bg: "#2a9d8f", fg: "#f3fffc" },
  { bg: "#f4a261", fg: "#2b1d12" },
  { bg: "#457b9d", fg: "#f4f8fb" },
  { bg: "#e76f51", fg: "#fff7f4" },
  { bg: "#6d597a", fg: "#fbf7ff" },
  { bg: "#84a59d", fg: "#14211e" },
  { bg: "#f28482", fg: "#2c1616" },
  { bg: "#577590", fg: "#f4f7fa" },
  { bg: "#43aa8b", fg: "#f3fffa" },
  { bg: "#f6bd60", fg: "#2b2112" },
];

const nameInput = document.querySelector("#name-input");
const formMessage = document.querySelector("#form-message");
const countEl = document.querySelector("#count");
const clearBtn = document.querySelector("#clear-btn");
const canvas = document.querySelector("#wheel");
const spinBtn = document.querySelector("#spin-btn");
const spinHint = document.querySelector("#spin-hint");
const result = document.querySelector("#result");
const winnerName = document.querySelector("#winner-name");
const decisionNote = document.querySelector("#decision-note");
const decisionActions = document.querySelector("#decision-actions");
const keepBtn = document.querySelector("#keep-btn");
const removeBtn = document.querySelector("#remove-btn");
const saveBtn = document.querySelector("#save-btn");
const saveConfirm = document.querySelector("#save-confirm");
const saveQuestion = document.querySelector("#save-question");
const saveConfirmBtn = document.querySelector("#save-confirm-btn");
const saveCancelBtn = document.querySelector("#save-cancel-btn");
const saveFeedback = document.querySelector("#save-feedback");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const historyMessage = document.querySelector("#history-message");
const clearHistoryBtn = document.querySelector("#clear-history-btn");
const ctx = canvas.getContext("2d");
let useLocalRecords = false;

const state = {
  names: [],
  rotation: -Math.PI / 2,
  spinning: false,
  winner: null,
  winnerIndex: -1,
  decision: null,
  records: [],
  recordsError: "",
  clearingHistory: false,
  confirmingSave: false,
  saveStatus: "idle",
  saveError: "",
  pointerKick: 0,
};

nameInput.addEventListener("input", () => {
  if (state.spinning) return;
  applyText(nameInput.value);
});

clearBtn.addEventListener("click", () => {
  if (state.spinning || state.names.length === 0) return;
  nameInput.value = "";
  applyText("");
  nameInput.focus();
});

spinBtn.addEventListener("click", spin);
canvas.addEventListener("click", spin);
keepBtn.addEventListener("click", keepWinner);
removeBtn.addEventListener("click", removeWinner);
saveBtn.addEventListener("click", askToSave);
saveConfirmBtn.addEventListener("click", confirmSave);
saveCancelBtn.addEventListener("click", cancelSave);
clearHistoryBtn.addEventListener("click", clearHistory);

window.addEventListener("resize", draw);

function loadNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((name) => typeof name === "string" && name.trim()).slice(0, MAX_NAMES);
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.names));
}

function parseNames(raw) {
  const names = [];
  let notice = "";
  for (const line of raw.split(/\r?\n/)) {
    const name = line.trim();
    if (!name) continue;
    if ([...name].length > MAX_NAME_LENGTH) {
      notice = `Cada nome pode ter até ${MAX_NAME_LENGTH} caracteres.`;
      continue;
    }
    if (names.length >= MAX_NAMES) {
      notice = `A lista comporta até ${MAX_NAMES} nomes.`;
      break;
    }
    names.push(name);
  }
  return { names, notice };
}

function applyText(raw) {
  const { names, notice } = parseNames(raw);
  const changed = names.join("\n") !== state.names.join("\n");
  state.names = names;
  if (changed) {
    state.winner = null;
    state.winnerIndex = -1;
    state.decision = null;
    resetSave();
  }
  setMessage(notice);
  persist();
  render();
}

function setMessage(text) {
  formMessage.textContent = text;
}

function setLocked(locked) {
  nameInput.disabled = locked;
  clearBtn.disabled = locked;
}

function render() {
  const total = state.names.length;
  countEl.textContent = String(total);
  clearBtn.hidden = total === 0;

  const ready = total >= 2 && !state.spinning;
  spinBtn.disabled = !ready;
  spinBtn.textContent = state.spinning ? "Girando…" : state.winner ? "Sortear de novo" : "Sortear";

  if (state.spinning) {
    spinHint.textContent = "A roda está girando.";
  } else if (total === 0) {
    spinHint.textContent = "Adicione pelo menos dois nomes para sortear.";
  } else if (total === 1) {
    spinHint.textContent = "Falta mais um nome para sortear.";
  } else if (state.winner && !state.decision) {
    spinHint.textContent = "Escolha se mantém ou remove o nome sorteado.";
  } else if (state.winner) {
    spinHint.textContent = "Você pode girar de novo quando quiser.";
  } else {
    spinHint.textContent = "A lista está pronta. Gire a roda.";
  }

  if (state.winner) {
    winnerName.textContent = state.winner;
    result.hidden = false;
    decisionActions.hidden = Boolean(state.decision);
    if (state.decision === "kept") {
      decisionNote.hidden = false;
      decisionNote.textContent = "O nome continua na lista.";
    } else if (state.decision === "removed") {
      decisionNote.hidden = false;
      decisionNote.textContent = "O nome saiu da lista.";
    } else {
      decisionNote.hidden = true;
      decisionNote.textContent = "";
    }
    renderSave();
  } else {
    winnerName.textContent = "";
    decisionNote.textContent = "";
    decisionNote.hidden = true;
    decisionActions.hidden = true;
    result.hidden = true;
    renderSave();
  }
  renderHistory();

  canvas.setAttribute(
    "aria-label",
    total === 0 ? "Roda de sorteio vazia" : `Roda de sorteio com ${total} nomes`,
  );
  setLocked(state.spinning);
  draw();
}

function colorFor(index, total) {
  const len = PALETTE.length;
  let paletteIndex = index % len;
  if (index === total - 1 && total > 1 && paletteIndex === 0) paletteIndex = 1;
  return PALETTE[paletteIndex];
}

function draw() {
  const cssWidth = canvas.clientWidth || 520;
  const cssHeight = cssWidth * (680 / 640);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextWidth = Math.round(cssWidth * dpr);
  const nextHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  const pad = 36 * dpr;
  const radius = (canvas.width - pad * 2) / 2;
  const cx = canvas.width / 2;
  const cy = pad + radius;
  const names = state.names;
  const total = names.length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(cx, cy, radius + 10 * dpr, 0, Math.PI * 2);
  ctx.strokeStyle = "#e7c36a";
  ctx.lineWidth = 8 * dpr;
  ctx.stroke();

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1b2420";
    ctx.fill();
    ctx.fillStyle = "#c3cbbd";
    ctx.font = `${18 * dpr}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Adicione nomes", cx, cy);
    drawPointer(cx, pad, dpr);
    return;
  }

  const arc = (Math.PI * 2) / total;
  names.forEach((name, index) => {
    const start = state.rotation + index * arc;
    const color = colorFor(index, total);
    const highlighted = !state.spinning && index === state.winnerIndex;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + arc);
    ctx.closePath();
    ctx.fillStyle = color.bg;
    ctx.fill();
    if (highlighted) {
      ctx.lineWidth = 6 * dpr;
      ctx.strokeStyle = "#fff8e8";
      ctx.stroke();
    }

    const thickness = radius * arc;
    if (thickness >= 8 * dpr && !(state.spinning && total > 40)) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + arc / 2);
      ctx.fillStyle = color.fg;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const fontSize = Math.min(22 * dpr, Math.max(8 * dpr, thickness * 0.62));
      ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
      const label = fitText(name, radius * 0.62);
      ctx.fillText(label, radius - 18 * dpr, 0);
      ctx.restore();
    }
  });

  if (total <= 24) {
  for (let index = 0; index < total; index += 1) {
    const angle = state.rotation + index * arc;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * (radius + 1), cy + Math.sin(angle) * (radius + 1), 4.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = index % 2 === 0 ? "#fff8e8" : "#e7c36a";
    ctx.fill();
  }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "#121614";
  ctx.fill();
  ctx.lineWidth = 4 * dpr;
  ctx.strokeStyle = "#e7c36a";
  ctx.stroke();

  drawPointer(cx, pad, dpr);
}

function fitText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function drawPointer(cx, pad, dpr) {
  ctx.save();
  ctx.translate(cx, 0);
  ctx.rotate(state.pointerKick);
  ctx.beginPath();
  ctx.moveTo(0, pad + 10 * dpr);
  ctx.lineTo(18 * dpr, 3 * dpr);
  ctx.lineTo(-18 * dpr, 3 * dpr);
  ctx.closePath();
  ctx.fillStyle = "#fff6d4";
  ctx.strokeStyle = "#24180a";
  ctx.lineWidth = 3 * dpr;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function resetSave() {
  state.confirmingSave = false;
  state.saveStatus = "idle";
  state.saveError = "";
}

function askToSave() {
  if (!state.winner || state.spinning || state.saveStatus === "saving" || state.saveStatus === "saved") return;
  state.confirmingSave = true;
  state.saveError = "";
  state.saveStatus = "idle";
  render();
}

function cancelSave() {
  if (state.saveStatus === "saving") return;
  state.confirmingSave = false;
  state.saveError = "";
  state.saveStatus = "idle";
  render();
}

function loadLocalRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && typeof item.nome === "string");
  } catch {
    return [];
  }
}

function saveLocalRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function createLocalRecord(nome) {
  const id = globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now()}`;
  return { id, nome, registrado_em: new Date().toISOString() };
}

async function confirmSave() {
  if (!state.winner || state.saveStatus === "saving" || state.saveStatus === "saved") return;
  state.saveStatus = "saving";
  state.saveError = "";
  render();
  if (useLocalRecords) {
    state.records.unshift(createLocalRecord(state.winner));
    saveLocalRecords(state.records);
    state.confirmingSave = false;
    state.saveStatus = "saved";
    render();
    return;
  }
  try {
    const response = await fetch("/api/ganhadores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: state.winner }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.erro || "Não foi possível gravar o ganhador.");
    }
    if (payload.ganhador) state.records.unshift(payload.ganhador);
    state.confirmingSave = false;
    state.saveStatus = "saved";
  } catch (error) {
    state.saveStatus = "error";
    state.saveError = error instanceof Error && error.message
      ? error.message
      : "Não foi possível gravar o ganhador.";
    if (!state.saveError || state.saveError === "Failed to fetch") {
      state.saveError = "Não foi possível gravar o ganhador. Tente de novo.";
    }
  }
  render();
}

function renderSave() {
  const visible = Boolean(state.winner) && !state.spinning;
  saveBtn.hidden = !visible || state.confirmingSave || state.saveStatus === "saved";
  saveBtn.disabled = state.saveStatus === "saving";
  saveConfirm.hidden = !visible || !state.confirmingSave;
  saveQuestion.textContent = state.winner ? `Gravar “${state.winner}” no histórico de ganhadores?` : "";
  saveConfirmBtn.disabled = state.saveStatus === "saving";
  saveConfirmBtn.textContent = state.saveStatus === "saving" ? "Gravando…" : state.saveStatus === "error" ? "Tentar de novo" : "Confirmar gravação";
  saveCancelBtn.disabled = state.saveStatus === "saving";

  if (!visible) {
    saveFeedback.hidden = true;
    saveFeedback.textContent = "";
    return;
  }
  if (state.saveStatus === "saved") {
    saveFeedback.hidden = false;
    saveFeedback.className = "save-feedback success";
    saveFeedback.textContent = "Ganhador gravado.";
    return;
  }
  if (state.saveStatus === "error") {
    saveFeedback.hidden = false;
    saveFeedback.className = "save-feedback error";
    saveFeedback.textContent = state.saveError || "Não foi possível gravar o ganhador.";
    return;
  }
  saveFeedback.hidden = true;
  saveFeedback.textContent = "";
  saveFeedback.className = "save-feedback";
}

async function clearHistory() {
  if (state.records.length === 0 || state.clearingHistory) return;
  state.clearingHistory = true;
  renderHistory();
  try {
    if (useLocalRecords) {
      state.records = [];
      saveLocalRecords(state.records);
      state.recordsError = "";
    } else {
      const response = await fetch("/api/ganhadores", { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.erro || "Não foi possível limpar os ganhadores.");
      state.records = [];
      state.recordsError = "";
    }
  } catch {
    state.recordsError = "Não foi possível limpar os ganhadores gravados.";
  } finally {
    state.clearingHistory = false;
    renderHistory();
  }
}

function renderHistory() {
  historyList.replaceChildren();
  clearHistoryBtn.hidden = state.records.length === 0;
  clearHistoryBtn.disabled = state.clearingHistory;
  historyMessage.hidden = !state.recordsError;
  historyMessage.textContent = state.recordsError;
  historyEmpty.hidden = state.records.length > 0 || Boolean(state.recordsError);
  for (const record of state.records) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "history-name";
    name.textContent = record.nome || "";
    const time = document.createElement("time");
    time.className = "history-time";
    time.dateTime = record.registrado_em || "";
    time.textContent = formatWhen(record.registrado_em);
    item.append(name, time);
    historyList.append(item);
  }
}

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function loadRecords() {
  if (useLocalRecords) {
    state.records = loadLocalRecords();
    state.recordsError = "";
    renderHistory();
    return;
  }
  try {
    const response = await fetch("/api/ganhadores");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.erro || "Não foi possível carregar os ganhadores gravados.");
    state.records = Array.isArray(payload.ganhadores) ? payload.ganhadores : [];
    state.recordsError = "";
  } catch {
    state.recordsError = "Não foi possível carregar os ganhadores gravados.";
  }
  renderHistory();
}

function keepWinner() {
  if (!state.winner || state.decision || state.spinning) return;
  state.decision = "kept";
  render();
}

function removeWinner() {
  if (!state.winner || state.decision || state.spinning) return;
  const index = state.winnerIndex;
  if (index < 0 || index >= state.names.length) return;
  state.names.splice(index, 1);
  state.winnerIndex = -1;
  state.decision = "removed";
  nameInput.value = state.names.join("\n");
  persist();
  render();
}

let audioContext = null;
let tickBuffer = null;
let lastTickAt = 0;

function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function sharedTickBuffer(ctx) {
  if (tickBuffer && tickBuffer.sampleRate === ctx.sampleRate) return tickBuffer;
  const duration = 0.04;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / ctx.sampleRate;
    const click = Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t / 0.0035);
    const body = Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t / 0.011);
    const noise = (Math.random() * 2 - 1) * Math.exp(-t / 0.005);
    data[i] = click * 0.28 + body * 0.5 + noise * 0.28;
  }
  tickBuffer = buffer;
  return buffer;
}

function playTick(strength = 1) {
  const ctx = audio();
  if (!ctx) return;
  const nowMs = performance.now();
  if (nowMs - lastTickAt < 36) return;
  lastTickAt = nowMs;
  const source = ctx.createBufferSource();
  source.buffer = sharedTickBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 160;
  const gain = ctx.createGain();
  gain.gain.value = 0.28 * strength;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

function startWhir() {
  const ctx = audio();
  if (!ctx) return null;
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 360;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  return { source, gain, filter };
}

function sliceAtPointer(rotation, total = state.names.length) {
  const arc = (Math.PI * 2) / total;
  let angle = (-Math.PI / 2 - rotation) % (Math.PI * 2);
  if (angle < 0) angle += Math.PI * 2;
  return Math.floor(angle / arc) % total;
}

function spin() {
  if (state.spinning || state.names.length < 2) return;

  const total = state.names.length;
  const winner = Math.floor(Math.random() * total);
  const arc = (Math.PI * 2) / total;
  const current = ((state.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let desired = (-Math.PI / 2 - (winner * arc + arc / 2)) % (Math.PI * 2);
  if (desired < 0) desired += Math.PI * 2;
  let delta = desired - current;
  if (delta <= 0) delta += Math.PI * 2;
  delta += (5 + Math.floor(Math.random() * 2)) * Math.PI * 2;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduced ? 400 : 4600;
  const start = state.rotation;
  const end = state.rotation + delta;
  const started = performance.now();
  let previousSlice = sliceAtPointer(state.rotation, total);
  const whir = startWhir();

  state.spinning = true;
  state.winner = null;
  state.winnerIndex = -1;
  state.decision = null;
  resetSave();
  render();

  function frame(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - progress) ** 4;
    state.rotation = start + (end - start) * eased;
    const slice = sliceAtPointer(state.rotation, total);
    const speed = (1 - progress) ** 3;
    if (whir) {
      const ctx = audio();
      whir.gain.gain.setTargetAtTime(0.01 + speed * 0.045, ctx.currentTime, 0.04);
      whir.filter.frequency.setTargetAtTime(260 + speed * 980, ctx.currentTime, 0.05);
    }
    if (slice !== previousSlice) {
      state.pointerKick = 0.28;
      previousSlice = slice;
      playTick(0.45 + speed * 0.7);
    }
    state.pointerKick *= 0.82;
    draw();
    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }
    state.rotation = end;
    state.pointerKick = 0;
    state.spinning = false;
    if (whir) {
      const ctx = audio();
      whir.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
      window.setTimeout(() => whir.source.stop(), 350);
    }
    playTick(1);
    state.winnerIndex = winner;
    state.winner = state.names[winner];
    render();
    result.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  requestAnimationFrame(frame);
}

function remembersNamesLocally() {
  useLocalRecords = true;
  state.names = loadNames();
}

async function adoptSession() {
  try {
    const response = await fetch("/api/sessao");
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.includes("json")) {
      remembersNamesLocally();
      return;
    }
    const payload = await response.json();
    const current = typeof payload.id === "string" ? payload.id : "";
    if (!current) {
      remembersNamesLocally();
      return;
    }
    useLocalRecords = false;
    if (localStorage.getItem(SESSION_KEY) !== current) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RECORDS_KEY);
      localStorage.setItem(SESSION_KEY, current);
      state.names = [];
      return;
    }
    state.names = loadNames();
  } catch {
    remembersNamesLocally();
  }
}

async function start() {
  await adoptSession();
  nameInput.value = state.names.join("\n");
  render();
  loadRecords();
}

start();
