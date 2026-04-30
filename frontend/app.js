const API = "http://localhost:8000/api/v1/market";
let priceChart = null;
let currentTicker = null;

// ── THEME TOGGLE ──────────────────────────────
const themeToggle = document.querySelector("[data-theme-toggle]");
themeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const current = html.getAttribute("data-theme");
  html.setAttribute("data-theme", current === "dark" ? "light" : "dark");
});

// ── INDICES ───────────────────────────────────
async function loadIndices() {
  try {
    const res = await fetch(`${API}/indices`);
    const data = await res.json();
    const container = document.getElementById("indicesList");
    container.innerHTML = data
      .map(
        (idx) => `
      <div class="index-item">
        <span class="index-name">${idx.name}</span>
        <span class="index-price">₹${idx.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        <span class="index-change ${idx.change_pct >= 0 ? "gain" : "loss"}">
          ${idx.change_pct >= 0 ? "▲" : "▼"} ${Math.abs(idx.change_pct)}%
        </span>
      </div>`
      )
      .join("");
  } catch (e) {
    document.getElementById("indicesList").innerHTML =
      '<span class="index-skeleton">Failed to load indices</span>';
  }
}

// ── MOVERS ────────────────────────────────────
async function loadMovers() {
  try {
    const res = await fetch(`${API}/movers`);
    const data = await res.json();

    const renderList = (items, elId, isGain) => {
      document.getElementById(elId).innerHTML = items
        .map(
          (m) => `
        <li class="mover-item">
          <div>
            <div class="mover-ticker">${m.ticker.replace(".NS", "").replace(".BO", "")}</div>
            <div class="mover-name">${m.name}</div>
          </div>
          <span class="mover-pct ${isGain ? "gain" : "loss"}">
            ${m.change_pct >= 0 ? "+" : ""}${m.change_pct}%
          </span>
        </li>`
        )
        .join("");
    };

    renderList(data.gainers, "gainersList", true);
    renderList(data.losers, "losersList", false);
  } catch (e) {
    document.getElementById("gainersList").innerHTML =
      '<li class="mover-skeleton">Failed to load</li>';
    document.getElementById("losersList").innerHTML =
      '<li class="mover-skeleton">Failed to load</li>';
  }
}

// ── SEARCH ────────────────────────────────────
const searchInput = document.getElementById("searchInput");
const searchDropdown = document.getElementById("searchDropdown");
let searchTimeout = null;

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (q.length < 1) {
    searchDropdown.classList.add("hidden");
    return;
  }
  searchTimeout = setTimeout(() => fetchSearch(q), 300);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") searchDropdown.classList.add("hidden");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrapper")) {
    searchDropdown.classList.add("hidden");
  }
});

async function fetchSearch(q) {
  try {
    const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.length) {
      searchDropdown.classList.add("hidden");
      return;
    }
    searchDropdown.innerHTML = data
      .map(
        (r) => `
      <li data-ticker="${r.ticker}">
        <span>${r.ticker.replace(".NS", "").replace(".BO", "")}</span>
        <span class="ticker-name">${r.name}</span>
      </li>`
      )
      .join("");
    searchDropdown.classList.remove("hidden");

    searchDropdown.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        searchInput.value = li.dataset.ticker;
        searchDropdown.classList.add("hidden");
        loadQuote(li.dataset.ticker);
      });
    });
  } catch (e) {
    searchDropdown.classList.add("hidden");
  }
}

// ── QUOTE ─────────────────────────────────────
async function loadQuote(ticker) {
  currentTicker = ticker;
  const card = document.getElementById("quoteCard");
  card.innerHTML = `<div class="quote-placeholder">Loading ${ticker}…</div>`;

  try {
    const res = await fetch(`${API}/quote/${ticker}`);
    const d = await res.json();
    const isGain = d.change_pct >= 0;

    card.innerHTML = `
      <div class="quote-header">
        <div class="quote-name">${d.name} · ${d.ticker}</div>
        <div class="quote-price-row">
          <span class="quote-price">₹${d.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="quote-change ${isGain ? "gain" : "loss"}">
            ${isGain ? "+" : ""}${d.change} (${isGain ? "+" : ""}${d.change_pct}%)
          </span>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Market Cap</span>
          <span class="stat-value">${formatMarketCap(d.market_cap)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">P/E Ratio</span>
          <span class="stat-value">${d.pe_ratio ? d.pe_ratio.toFixed(2) : "N/A"}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">52W High</span>
          <span class="stat-value">₹${d.week_52_high ? d.week_52_high.toLocaleString("en-IN") : "N/A"}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">52W Low</span>
          <span class="stat-value">₹${d.week_52_low ? d.week_52_low.toLocaleString("en-IN") : "N/A"}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Volume</span>
          <span class="stat-value">${d.volume ? d.volume.toLocaleString("en-IN") : "N/A"}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Sector</span>
          <span class="stat-value">${d.sector || "N/A"}</span>
        </div>
      </div>`;

    loadChart(ticker, "1mo");
    document.getElementById("chartSection").classList.remove("hidden");
  } catch (e) {
    card.innerHTML = `<div class="quote-placeholder">Failed to load data for ${ticker}</div>`;
  }
}

// ── CHART ─────────────────────────────────────
async function loadChart(ticker, period) {
  try {
    const res = await fetch(`${API}/history/${ticker}?period=${period}`);
    const data = await res.json();

    const labels = data.data.map((d) => d.date);
    const prices = data.data.map((d) => d.close);
    const isGain = prices[prices.length - 1] >= prices[0];
    const color = isGain ? "#4CAF7D" : "#ef5350";

    if (priceChart) priceChart.destroy();

    const ctx = document.getElementById("priceChart").getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, isGain ? "rgba(76,175,125,0.2)" : "rgba(239,83,80,0.2)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    priceChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: prices,
            borderColor: color,
            borderWidth: 2,
            backgroundColor: gradient,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          mode: "index", intersect: false,
          callbacks: {
            label: (ctx) => ` ₹${ctx.parsed.y.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          },
        }},
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#7aab85", font: { size: 11 },
              maxTicksLimit: 6,
            },
          },
          y: {
            position: "right",
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: {
              color: "#7aab85", font: { size: 11 },
              callback: (v) => "₹" + v.toLocaleString("en-IN"),
            },
          },
        },
      },
    });
  } catch (e) {
    console.error("Chart failed:", e);
  }
}

// ── PERIOD BUTTONS ────────────────────────────
document.querySelectorAll(".period-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".period-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (currentTicker) loadChart(currentTicker, btn.dataset.period);
  });
});

// ── HELPERS ───────────────────────────────────
function formatMarketCap(val) {
  if (!val) return "N/A";
  if (val >= 1e12) return "₹" + (val / 1e12).toFixed(2) + "T";
  if (val >= 1e9)  return "₹" + (val / 1e9).toFixed(2) + "B";
  if (val >= 1e7)  return "₹" + (val / 1e7).toFixed(2) + "Cr";
  return "₹" + val.toLocaleString("en-IN");
}

// ── INIT ──────────────────────────────────────
loadIndices();
loadMovers();