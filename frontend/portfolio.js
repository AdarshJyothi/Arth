// ── PORTFOLIO (Stage 2) ───────────────────────
const AUTH_API = "http://localhost:8000/api/v1";
const TOKEN_KEY = "arth-token";
const EMAIL_KEY = "arth-email";
const INACTIVITY_MS = 30 * 60 * 1000;

let authMode = "login";
let inactivityTimer = null;
let historyChartInst = null;
let sectorChartInst = null;
let activeSellHoldingId = null;

function getToken()   { return localStorage.getItem(TOKEN_KEY); }
function setToken(t)  { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }
function getEmail()   { return localStorage.getItem(EMAIL_KEY) || ""; }
function setEmail(e)  { localStorage.setItem(EMAIL_KEY, e); }
function clearEmail() { localStorage.removeItem(EMAIL_KEY); }

// ── TOAST ─────────────────────────────────────
function toast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.getElementById("toastContainer").appendChild(t);
  setTimeout(() => t.classList.add("toast-show"), 10);
  setTimeout(() => { t.classList.remove("toast-show"); setTimeout(() => t.remove(), 300); }, 3000);
}

// ── AUTH ELEMENTS ─────────────────────────────
const authModal    = document.getElementById("authModal");
const authForm     = document.getElementById("authForm");
const authEmail    = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSubmit   = document.getElementById("authSubmit");
const authError    = document.getElementById("authError");
const popover      = document.getElementById("sidebarPopover");

// ── SIDEBAR PROFILE ───────────────────────────
function updateSidebarProfile() {
  const loggedIn     = !!getToken();
  const email        = getEmail();
  const nameEl       = document.getElementById("sidebarProfileName");
  const avatarEl     = document.getElementById("sidebarAvatar");
  const popOut       = document.getElementById("popoverLoggedOut");
  const popIn        = document.getElementById("popoverLoggedIn");
  const popEmailEl   = document.getElementById("popoverEmail");
  if (loggedIn) {
    nameEl.textContent     = email ? email.split("@")[0] : "Account";
    avatarEl.classList.add("avatar-loggedin");
    popEmailEl.textContent = email || "Signed in";
    popOut.classList.add("hidden");
    popIn.classList.remove("hidden");
  } else {
    nameEl.textContent = "Sign In";
    avatarEl.classList.remove("avatar-loggedin");
    popIn.classList.add("hidden");
    popOut.classList.remove("hidden");
  }
}

// ── POPOVER ───────────────────────────────────
document.getElementById("sidebarProfileBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  updateSidebarProfile();
  popover.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!popover.classList.contains("hidden") &&
      !document.getElementById("sidebarUser").contains(e.target))
    popover.classList.add("hidden");
});
document.getElementById("popoverSignIn").addEventListener("click", () => { popover.classList.add("hidden"); openAuthModal("login"); });
document.getElementById("popoverRegister").addEventListener("click", () => { popover.classList.add("hidden"); openAuthModal("register"); });
document.getElementById("popoverSignOut").addEventListener("click", () => {
  popover.classList.add("hidden");
  signOut();
});

function signOut() {
  clearToken(); clearEmail();
  updateSidebarProfile();
  clearTimeout(inactivityTimer);
  // Drop the per-user watchlist cache + reset the dashboard ★ button
  if (typeof watchlist !== "undefined") watchlist = [];
  if (typeof currentTicker !== "undefined" && currentTicker) updateWatchlistBtn(currentTicker);
  if (document.getElementById("page-portfolio").classList.contains("active-page")) {
    document.getElementById("portfolioView").classList.add("hidden");
    document.getElementById("portfolioAuth").classList.remove("hidden");
  }
  if (document.getElementById("page-watchlist").classList.contains("active-page")) {
    document.getElementById("watchlistView").classList.add("hidden");
    document.getElementById("watchlistAuth").classList.remove("hidden");
  }
}

// ── MODAL ─────────────────────────────────────
function openAuthModal(mode) {
  if (mode) switchAuthTab(mode);
  authModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => authEmail.focus(), 50);
}
function closeAuthModal() {
  authModal.classList.add("hidden");
  document.body.style.overflow = "";
  authForm.reset();
  hideError(authError);
}
document.getElementById("modalCloseBtn").addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (e) => { if (e.target === authModal) closeAuthModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!authModal.classList.contains("hidden")) closeAuthModal();
    if (!document.getElementById("sellModal").classList.contains("hidden")) closeSellModal();
  }
});

function switchAuthTab(mode) {
  authMode = mode;
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.authTab === mode));
  authSubmit.textContent = mode === "login" ? "Sign In" : "Create Account";
  hideError(authError);
}
document.querySelectorAll(".auth-tab").forEach((tab) => tab.addEventListener("click", () => switchAuthTab(tab.dataset.authTab)));

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError(authError);
  const email = authEmail.value.trim();
  const password = authPassword.value;
  try {
    let token;
    if (authMode === "register") {
      const res = await fetch(`${AUTH_API}/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw await errFrom(res);
      token = (await res.json()).access_token;
    } else {
      const res = await fetch(`${AUTH_API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: email, password }),
      });
      if (!res.ok) throw await errFrom(res);
      token = (await res.json()).access_token;
    }
    setToken(token); setEmail(email);
    updateSidebarProfile();
    closeAuthModal();
    resetInactivityTimer();
    navigateToPortfolio();
    // Refresh watchlist cache so the dashboard ★ button reflects this user
    if (typeof loadWatchlistCache === "function") {
      loadWatchlistCache().then(() => { if (typeof currentTicker !== "undefined" && currentTicker) updateWatchlistBtn(currentTicker); });
    }
    checkAlerts();
    toast(`Welcome${email ? ", " + email.split("@")[0] : ""}!`);
  } catch (err) {
    showError(authError, err.message || "Something went wrong");
  }
});

// ── PORTFOLIO NAVIGATION ──────────────────────
document.querySelector('[data-page="portfolio"]').addEventListener("click", () => {
  if (getToken()) showPortfolioView();
  else {
    document.getElementById("portfolioAuth").classList.remove("hidden");
    document.getElementById("portfolioView").classList.add("hidden");
  }
});

function navigateToPortfolio() {
  document.querySelectorAll(".sidebar-item").forEach((i) => i.classList.remove("active"));
  document.querySelector('[data-page="portfolio"]').classList.add("active");
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active-page"));
  document.getElementById("page-portfolio").classList.add("active-page");
  showPortfolioView();
}

function showPortfolioView() {
  document.getElementById("portfolioAuth").classList.add("hidden");
  document.getElementById("portfolioView").classList.remove("hidden");
  loadPortfolio();
}

// ── LOAD PORTFOLIO ────────────────────────────
async function loadPortfolio() {
  const summary = document.getElementById("portfolioSummary");
  const body    = document.getElementById("holdingsBody");
  const empty   = document.getElementById("holdingsEmpty");

  // Skeleton
  summary.innerHTML = Array(4).fill(`<div class="summary-card skeleton-card"><div class="skel skel-line"></div><div class="skel skel-val"></div></div>`).join("");
  body.innerHTML = Array(3).fill(`<tr>${Array(8).fill('<td><div class="skel skel-cell"></div></td>').join("")}</tr>`).join("");

  try {
    const res = await authFetch(`${AUTH_API}/portfolio/`);
    if (!res) return;
    const d = await res.json();

    const pnlClass = d.total_pnl >= 0 ? "gain" : "loss";
    const sign = d.total_pnl >= 0 ? "+" : "";
    summary.innerHTML = `
      <div class="summary-card"><span class="summary-label">Invested</span><span class="summary-value">${inr(d.total_invested)}</span></div>
      <div class="summary-card"><span class="summary-label">Current Value</span><span class="summary-value">${inr(d.current_value)}</span></div>
      <div class="summary-card"><span class="summary-label">Total P&L</span><span class="summary-value ${pnlClass}">${sign}${inr(d.total_pnl)}</span></div>
      <div class="summary-card"><span class="summary-label">Total P&L %</span><span class="summary-value ${pnlClass}">${sign}${d.total_pnl_pct.toFixed(2)}%</span></div>`;

    if (!d.holdings.length) {
      body.innerHTML = ""; empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      body.innerHTML = d.holdings.map((h) => {
        const hc = h.unrealized_pnl >= 0 ? "gain" : "loss";
        const hs = h.unrealized_pnl >= 0 ? "+" : "";
        return `<tr>
          <td class="td-ticker">${h.ticker.replace(".NS","").replace(".BO","")}</td>
          <td>${h.quantity}</td><td>${inr(h.avg_buy_price)}</td><td>${inr(h.current_price)}</td>
          <td>${inr(h.current_value)}</td>
          <td class="${hc}">${hs}${inr(h.unrealized_pnl)}</td>
          <td class="${hc}">${hs}${h.unrealized_pnl_pct.toFixed(2)}%</td>
          <td style="display:flex;gap:4px;align-items:center">
            <button class="sell-btn" onclick="openSellModal(${h.id},'${h.ticker}',${h.quantity})" title="Sell">Sell</button>
            <button class="holding-del" onclick="confirmDelete(${h.id})" title="Remove">✕</button>
          </td>
        </tr>`;
      }).join("");
    }

    // Load charts, realized, alerts, dividends in parallel
    loadHistoryChart("1mo");
    loadSectorChart();
    loadRealized();
    loadDividends();
    loadTransactions();

  } catch (e) {
    summary.innerHTML = `<div class="summary-card"><span class="summary-label">Failed to load</span></div>`;
  }
}

// ── HISTORY CHART ─────────────────────────────
async function loadHistoryChart(period) {
  document.querySelectorAll(".hist-btn").forEach((b) => b.classList.toggle("active", b.dataset.period === period));
  const wrap  = document.getElementById("historyCanvasWrap");
  const empty = document.getElementById("historyEmpty");
  try {
    const res = await authFetch(`${AUTH_API}/portfolio/history?period=${period}`);
    if (!res) return;
    const data = await res.json();
    if (!data.length) {
      if (historyChartInst) { historyChartInst.destroy(); historyChartInst = null; }
      wrap.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    empty.classList.add("hidden");
    const labels = data.map((d) => d.date);
    const values = data.map((d) => d.value);
    const isGain = values[values.length - 1] >= values[0];
    const color = isGain ? "#4CAF7D" : "#ef5350";
    const ctx = document.getElementById("historyChart").getContext("2d");
    // Gradient built from live chart area so the shading fills the full height
    // in every state (incl. fullscreen), not a fixed pixel height.
    const grad = (context) => {
      const { ctx: c, chartArea } = context.chart;
      if (!chartArea) return undefined;
      const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, isGain ? "rgba(76,175,125,0.2)" : "rgba(239,83,80,0.2)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      return g;
    };
    if (historyChartInst) historyChartInst.destroy();
    historyChartInst = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ data: values, borderColor: color, borderWidth: 2, backgroundColor: grad, fill: true, tension: 0.3, pointRadius: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${inr(c.parsed.y)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#888", font: { size: 10 }, maxTicksLimit: 5 } },
          y: { position: "right", grid: { color: "rgba(128,128,128,0.08)" }, ticks: { color: "#888", font: { size: 10 }, callback: (v) => inr(v) } },
        },
      },
    });
  } catch (e) { /* silent */ }
}

document.querySelectorAll(".hist-btn").forEach((b) => {
  b.addEventListener("click", () => loadHistoryChart(b.dataset.period));
});

// ── HISTORY CHART FULLSCREEN ───────────────────
const historyExpandBtn = document.getElementById("historyExpandBtn");
const historyChartCard = document.getElementById("historyChartCard");

const expandIconSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
</svg>`;
const compressIconSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
</svg>`;

let _historyCardPlaceholder = null;

function exitHistoryFullscreen() {
  historyChartCard.classList.remove("is-fullscreen");
  historyExpandBtn.innerHTML = expandIconSVG;
  historyExpandBtn.title = "Expand chart";
  // Move card back to original position
  if (_historyCardPlaceholder) {
    _historyCardPlaceholder.parentNode.insertBefore(historyChartCard, _historyCardPlaceholder);
    _historyCardPlaceholder.remove();
    _historyCardPlaceholder = null;
  }
  // Wait for the grid to reflow back to 2fr 1fr before resizing charts,
  // otherwise both canvases keep their stretched fullscreen dimensions.
  requestAnimationFrame(() => {
    const activePeriod = document.querySelector(".hist-btn.active")?.dataset.period || "1mo";
    loadHistoryChart(activePeriod);
    if (sectorChartInst) sectorChartInst.resize();
  });
}

historyExpandBtn.addEventListener("click", () => {
  const isFullscreen = historyChartCard.classList.toggle("is-fullscreen");
  historyExpandBtn.innerHTML = isFullscreen ? compressIconSVG : expandIconSVG;
  historyExpandBtn.title = isFullscreen ? "Exit fullscreen" : "Expand chart";
  if (isFullscreen) {
    // Move to body to escape sidebar stacking context
    _historyCardPlaceholder = document.createComment("history-chart-placeholder");
    historyChartCard.parentNode.insertBefore(_historyCardPlaceholder, historyChartCard);
    document.body.appendChild(historyChartCard);
    if (historyChartInst) historyChartInst.resize();
  } else {
    exitHistoryFullscreen();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && historyChartCard.classList.contains("is-fullscreen")) {
    exitHistoryFullscreen();
  }
});

// ── SECTOR CHART ──────────────────────────────
async function loadSectorChart() {
  try {
    const res = await authFetch(`${AUTH_API}/portfolio/sectors`);
    if (!res) return;
    const data = await res.json();
    if (!data.length) return;
    const colors = ["#4CAF7D","#81C784","#AED581","#FFB74D","#64B5F6","#BA68C8","#4DD0E1","#F06292","#A1887F","#90A4AE"];
    const ctx = document.getElementById("sectorChart").getContext("2d");
    if (sectorChartInst) sectorChartInst.destroy();
    sectorChartInst = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.sector),
        datasets: [{ data: data.map((d) => d.value), backgroundColor: colors.slice(0, data.length), borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: "#888", font: { size: 11 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${inr(c.parsed)} (${data[c.dataIndex].pct}%)` } },
        },
      },
    });
  } catch (e) { /* silent */ }
}

// ── ADD HOLDING ───────────────────────────────
document.getElementById("addHoldingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const holdingError = document.getElementById("holdingError");
  hideError(holdingError);
  const ticker    = document.getElementById("holdingTicker").value.trim().toUpperCase();
  const quantity  = parseFloat(document.getElementById("holdingQty").value);
  const buy_price = parseFloat(document.getElementById("holdingPrice").value);
  try {
    const res = await authFetch(`${AUTH_API}/portfolio/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, quantity, buy_price }),
    });
    if (!res) return;
    if (!res.ok) throw await errFrom(res);
    document.getElementById("addHoldingForm").reset();
    selectedTicker = "";
    toast("Holding added");
    loadPortfolio();
  } catch (err) { showError(holdingError, err.message || "Failed to add holding"); }
});

// ── CONFIRM DELETE ────────────────────────────
function confirmDelete(id) {
  if (confirm("Remove this holding?")) deleteHolding(id);
}

async function deleteHolding(id) {
  const res = await authFetch(`${AUTH_API}/portfolio/${id}`, { method: "DELETE" });
  if (!res) return;
  toast("Holding removed", "error");
  loadPortfolio();
}

// ── SELL MODAL ────────────────────────────────
function openSellModal(id, ticker, maxQty) {
  activeSellHoldingId = id;
  document.getElementById("sellModalTicker").textContent = `${ticker.replace(".NS","").replace(".BO","")} — max ${maxQty} units`;
  document.getElementById("sellQty").max = maxQty;
  document.getElementById("sellForm").reset();
  hideError(document.getElementById("sellError"));
  document.getElementById("sellModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeSellModal() {
  document.getElementById("sellModal").classList.add("hidden");
  document.body.style.overflow = "";
  activeSellHoldingId = null;
}
document.getElementById("sellModalClose").addEventListener("click", closeSellModal);
document.getElementById("sellModal").addEventListener("click", (e) => { if (e.target === document.getElementById("sellModal")) closeSellModal(); });

document.getElementById("sellForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sellError = document.getElementById("sellError");
  hideError(sellError);
  const quantity   = parseFloat(document.getElementById("sellQty").value);
  const sell_price = parseFloat(document.getElementById("sellPrice").value);
  try {
    const res = await authFetch(`${AUTH_API}/portfolio/sell/${activeSellHoldingId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity, sell_price }),
    });
    if (!res) return;
    if (!res.ok) throw await errFrom(res);
    const data = await res.json();
    closeSellModal();
    const sign = data.realized_pnl >= 0 ? "+" : "";
    toast(`Sold — Realized P&L: ${sign}${inr(data.realized_pnl)}`, data.realized_pnl >= 0 ? "success" : "error");
    loadPortfolio();
  } catch (err) { showError(sellError, err.message || "Sell failed"); }
});

// ── REALIZED P&L ──────────────────────────────
async function loadRealized() {
  const res = await authFetch(`${AUTH_API}/portfolio/realized`);
  if (!res) return;
  const data = await res.json();
  const wrapper = document.getElementById("realizedWrapper");
  const body    = document.getElementById("realizedBody");
  const totalEl = document.getElementById("realizedTotal");
  if (!data.length) { wrapper.style.display = "none"; totalEl.textContent = "No sells yet"; return; }
  wrapper.style.display = "block";
  const total = data.reduce((s, r) => s + r.realized_pnl, 0);
  const sign  = total >= 0 ? "+" : "";
  totalEl.textContent = `Total: ${sign}${inr(total)}`;
  totalEl.className = `section-total ${total >= 0 ? "gain" : "loss"}`;
  body.innerHTML = data.map((r) => {
    const rc = r.realized_pnl >= 0 ? "gain" : "loss";
    const rs = r.realized_pnl >= 0 ? "+" : "";
    const rowGlow = r.realized_pnl >= 0 ? "row-up" : "row-down";
    return `<tr class="${rowGlow}">
      <td class="td-ticker">${r.ticker.replace(".NS","").replace(".BO","")}</td>
      <td>${r.quantity}</td><td>${inr(r.avg_buy_price)}</td><td>${inr(r.sell_price)}</td>
      <td class="${rc}">${rs}${inr(r.realized_pnl)}</td>
      <td style="color:var(--color-text-muted);font-size:var(--text-xs)">${r.sold_at.split("T")[0]}</td>
    </tr>`;
  }).join("");
}

// ── CSV EXPORT ────────────────────────────────
document.getElementById("csvExportBtn").addEventListener("click", async () => {
  const res = await authFetch(`${AUTH_API}/portfolio/`);
  if (!res) return;
  const d = await res.json();
  if (!d.holdings.length) { toast("No holdings to export", "error"); return; }
  const rows = [["Ticker","Quantity","Avg Buy Price","Current Price","Current Value","Unrealized P&L","P&L %"]];
  d.holdings.forEach((h) => rows.push([h.ticker, h.quantity, h.avg_buy_price.toFixed(2), h.current_price.toFixed(2), h.current_value.toFixed(2), h.unrealized_pnl.toFixed(2), h.unrealized_pnl_pct.toFixed(2)]));
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `arth-portfolio-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  toast("CSV downloaded");
});

// ── ALERTS — moved to the Watchlist page (per-stock alerts in app.js) ──

// ── DIVIDENDS ─────────────────────────────────
document.getElementById("dividendForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ticker = document.getElementById("divTicker").value.trim().toUpperCase();
  const amount = parseFloat(document.getElementById("divAmount").value);
  const date   = document.getElementById("divDate").value || null;
  const notes  = document.getElementById("divNotes").value.trim() || null;
  const res = await authFetch(`${AUTH_API}/portfolio/dividends`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, amount, date: date ? new Date(date).toISOString() : null, notes }),
  });
  if (!res) return;
  document.getElementById("dividendForm").reset();
  toast("Dividend logged");
  loadDividends();
});

async function loadDividends() {
  const res = await authFetch(`${AUTH_API}/portfolio/dividends`);
  if (!res) return;
  const data = await res.json();
  const wrapper  = document.getElementById("dividendWrapper");
  const body     = document.getElementById("dividendBody");
  const totalEl  = document.getElementById("dividendTotal");
  if (!data.length) { wrapper.style.display = "none"; totalEl.textContent = "₹0.00 total"; return; }
  wrapper.style.display = "block";
  const total = data.reduce((s, d) => s + d.amount, 0);
  totalEl.textContent = `Total: ${inr(total)}`;
  totalEl.className = "section-total gain";
  body.innerHTML = data.map((d) => `<tr>
    <td class="td-ticker">${d.ticker.replace(".NS","").replace(".BO","")}</td>
    <td class="gain">${inr(d.amount)}</td>
    <td style="color:var(--color-text-muted);font-size:var(--text-xs)">${d.date.split("T")[0]}</td>
    <td style="color:var(--color-text-muted);font-size:var(--text-xs)">${d.notes || "—"}</td>
    <td><button class="holding-del" onclick="deleteDividend(${d.id})">✕</button></td>
  </tr>`).join("");
}

async function deleteDividend(id) {
  await authFetch(`${AUTH_API}/portfolio/dividends/${id}`, { method: "DELETE" });
  toast("Dividend removed", "error");
  loadDividends();
}

// ── TRANSACTION HISTORY ───────────────────────
let txnCache = [];

async function loadTransactions() {
  const res = await authFetch(`${AUTH_API}/portfolio/transactions`);
  if (!res) return;
  txnCache = await res.json();
  const wrapper = document.getElementById("txnWrapper");
  const empty   = document.getElementById("txnEmpty");
  const body    = document.getElementById("txnBody");
  const totalEl = document.getElementById("txnTotal");
  if (!txnCache.length) {
    wrapper.style.display = "none";
    empty.style.display = "block";
    totalEl.textContent = "";
    return;
  }
  wrapper.style.display = "block";
  empty.style.display = "none";
  totalEl.textContent = `${txnCache.length} transaction${txnCache.length !== 1 ? "s" : ""}`;
  body.innerHTML = txnCache.map((t) => {
    const isBuy   = t.txn_type === "BUY";
    const typeCls = isBuy ? "gain" : "loss";
    const pnl = t.realized_pnl == null ? "—"
      : `<span class="${t.realized_pnl >= 0 ? "gain" : "loss"}">${t.realized_pnl >= 0 ? "+" : ""}${inr(t.realized_pnl)}</span>`;
    return `<tr>
      <td><span class="txn-tag ${typeCls}">${t.txn_type}</span></td>
      <td class="td-ticker">${t.ticker.replace(".NS","").replace(".BO","")}</td>
      <td>${t.quantity}</td>
      <td>${inr(t.price)}</td>
      <td>${pnl}</td>
      <td style="color:var(--color-text-muted);font-size:var(--text-xs)">${t.created_at.split("T")[0]}</td>
    </tr>`;
  }).join("");
}

document.getElementById("txnCsvBtn").addEventListener("click", () => {
  if (!txnCache.length) { toast("No transactions to export", "error"); return; }
  const rows = [["Type","Ticker","Quantity","Price","Realized P&L","Date"]];
  txnCache.forEach((t) => rows.push([
    t.txn_type, t.ticker, t.quantity, t.price.toFixed(2),
    t.realized_pnl == null ? "" : t.realized_pnl.toFixed(2),
    t.created_at.split("T")[0],
  ]));
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `arth-transactions-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  toast("CSV downloaded");
});

// ── TICKER SEARCH ─────────────────────────────
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Reusable ticker autocomplete. onSelect(ticker) runs when a suggestion is picked.
function attachTickerAutocomplete(input, dropdown, onSelect) {
  input.addEventListener("input", debounce(async (e) => {
    const q = e.target.value.trim();
    if (q.length < 1) { dropdown.classList.add("hidden"); return; }
    try {
      const res = await fetch(`${AUTH_API}/market/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.length) { dropdown.classList.add("hidden"); return; }
      dropdown.innerHTML = data.map((r) => `
        <li data-ticker="${r.ticker}">
          <span class="td-ticker">${r.ticker.replace(".NS","").replace(".BO","")}</span>
          <span class="ticker-drop-name">${r.name}</span>
        </li>`).join("");
      dropdown.classList.remove("hidden");
      dropdown.querySelectorAll("li").forEach((li) => {
        li.addEventListener("click", () => {
          input.value = li.dataset.ticker;
          dropdown.classList.add("hidden");
          if (onSelect) onSelect(li.dataset.ticker);
        });
      });
    } catch { dropdown.classList.add("hidden"); }
  }, 300));

  input.addEventListener("keydown", (e) => { if (e.key === "Escape") dropdown.classList.add("hidden"); });
}

const holdingTickerInput = document.getElementById("holdingTicker");
let selectedTicker = "";
attachTickerAutocomplete(holdingTickerInput, document.getElementById("tickerDropdown"), (t) => {
  selectedTicker = t;
  document.getElementById("holdingQty").focus();
});
attachTickerAutocomplete(document.getElementById("divTicker"), document.getElementById("divTickerDropdown"), () => {
  document.getElementById("divAmount").focus();
});

// Close any open ticker dropdown when clicking outside its wrapper
document.addEventListener("click", (e) => {
  if (!e.target.closest(".holding-ticker-wrapper")) {
    document.querySelectorAll(".ticker-dropdown").forEach((d) => d.classList.add("hidden"));
  }
});

// ── INACTIVITY ────────────────────────────────
function resetInactivityTimer() {
  if (!getToken()) return;
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    signOut();
    openAuthModal("login");
  }, INACTIVITY_MS);
}
["mousemove","keydown","click","scroll","touchstart"].forEach((evt) => {
  document.addEventListener(evt, resetInactivityTimer, { passive: true });
});

// ── HELPERS ───────────────────────────────────
function inr(v) {
  return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
async function errFrom(res) {
  try { const d = await res.json(); return new Error(typeof d.detail === "string" ? d.detail : "Request failed"); }
  catch { return new Error("Request failed"); }
}
function showError(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }
function hideError(el) { el.classList.add("hidden"); }

async function authFetch(url, opts = {}) {
  const token = getToken();
  if (!token) return null;
  opts.headers = { ...opts.headers, Authorization: `Bearer ${token}` };
  const res = await fetch(url, opts);
  if (res.status === 401) { signOut(); openAuthModal("login"); return null; }
  return res;
}

// ── PRICE ALERT NOTIFICATIONS (top-right pop-ups) ──
const notifiedAlerts = new Set();   // alert ids already popped this session

function showAlertNotification(a) {
  const container = document.getElementById("alertNotifyContainer");
  if (!container) return;
  const tkr  = a.ticker.replace(".NS", "").replace(".BO", "");
  const cond = a.direction === "above" ? "≥" : "≤";
  const el = document.createElement("div");
  el.className = "alert-notify";
  el.innerHTML = `
    <span class="alert-notify-icon">🔔</span>
    <div class="alert-notify-body">
      <div class="alert-notify-title">${tkr} hit your target</div>
      <div class="alert-notify-sub">Now ${a.current_price != null ? inr(a.current_price) : "—"} · target ${cond} ${inr(a.target_price)}</div>
    </div>
    <button class="alert-notify-close" aria-label="Dismiss">&times;</button>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const dismiss = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 320); };
  el.querySelector(".alert-notify-close").addEventListener("click", (e) => { e.stopPropagation(); dismiss(); });
  // Click the notification body → jump to the Watchlist page
  el.addEventListener("click", () => {
    document.querySelector('[data-page="watchlist"]')?.click();
    dismiss();
  });
  setTimeout(dismiss, 8000);
}

async function checkAlerts() {
  if (!getToken()) return;
  const res = await authFetch(`${AUTH_API}/portfolio/alerts`);
  if (!res) return;
  const alerts = await res.json();
  alerts.forEach((a) => {
    if (a.triggered && !notifiedAlerts.has(a.id)) {
      notifiedAlerts.add(a.id);
      showAlertNotification(a);
    } else if (!a.triggered) {
      notifiedAlerts.delete(a.id);   // reset so it can fire again if re-triggered
    }
  });
}

// Poll every 60s for triggered alerts (in addition to the watchlist page view)
setInterval(checkAlerts, 60000);

// ── INIT ──────────────────────────────────────
updateSidebarProfile();
resetInactivityTimer();
// Preload the per-user watchlist so the dashboard ★ button is accurate on load
if (getToken() && typeof loadWatchlistCache === "function") {
  loadWatchlistCache().then(() => { if (typeof currentTicker !== "undefined" && currentTicker) updateWatchlistBtn(currentTicker); });
}
if (getToken()) checkAlerts();   // notify about any already-triggered alerts on load
