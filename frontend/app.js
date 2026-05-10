const API = "http://localhost:8000/api/v1/market";
let priceChart = null;
let currentTicker = null;
let currentChartType = "line";

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

    const renderList = async (items, elId, isGain) => {
      document.getElementById(elId).innerHTML = items
        .map((m, i) => `
          <li class="mover-item">
            <div class="mover-left">
              <div class="mover-ticker">${m.ticker.replace(".NS","").replace(".BO","")}</div>
              <div class="mover-name">${m.name}</div>
            </div>
            <div class="mover-right">
              <span class="mover-pct ${isGain ? "gain" : "loss"}">
                ${m.change_pct >= 0 ? "+" : ""}${m.change_pct}%
              </span>
              <canvas
                class="sparkline-canvas"
                id="spark-${elId}-${i}"
                width="64" height="28">
              </canvas>
            </div>
          </li>`
        ).join("");

      // draw sparklines after DOM is ready
      for (let i = 0; i < items.length; i++) {
        drawSparkline(`spark-${elId}-${i}`, items[i].ticker, isGain);
      }
    };

    await renderList(data.gainers, "gainersList", true);
    await renderList(data.losers,  "losersList",  false);

  } catch (e) {
    document.getElementById("gainersList").innerHTML = '<li class="mover-skeleton">Failed to load</li>';
    document.getElementById("losersList").innerHTML  = '<li class="mover-skeleton">Failed to load</li>';
  }
}

// ── SPARKLINE DRAW ────────────────────────────
async function drawSparkline(canvasId, ticker, isGain) {
  try {
    const res  = await fetch(`${API}/history/${ticker}?period=1mo`);
    const data = await res.json();
    const prices = data.data.map((d) => d.close);
    if (!prices.length) return;

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const W = canvas.width;
    const H = canvas.height;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const toX = (i) => (i / (prices.length - 1)) * W;
    const toY = (v) => H - ((v - min) / range) * H * 0.85 - H * 0.075;

    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(prices[0]));
    for (let i = 1; i < prices.length; i++) {
      ctx.lineTo(toX(i), toY(prices[i]));
    }
    ctx.strokeStyle = isGain ? "#4CAF7D" : "#ef5350";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

  } catch (e) {
    // silently fail — sparkline is decorative
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

// ── CHART ROUTER ──────────────────────────────
async function loadChart(ticker, period) {
  if (currentChartType === "candlestick") {
    await loadCandlestickChart(ticker, period);
  } else {
    await loadLineChart(ticker, period);
  }
}

// ── LINE CHART ────────────────────────────────
async function loadLineChart(ticker, period) {
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
        datasets: [{
          data: prices,
          borderColor: color,
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index", intersect: false,
            callbacks: {
              label: (ctx) => ` ₹${ctx.parsed.y.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#7aab85", font: { size: 11 }, maxTicksLimit: 6 },
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
    console.error("Line chart failed:", e);
  }
}

// ── CANDLESTICK CHART ─────────────────────────
async function loadCandlestickChart(ticker, period) {
  try {
    const res = await fetch(`${API}/history/${ticker}?period=${period}`);
    const data = await res.json();

    const candleData = data.data.map((d) => ({
      x: new Date(d.date).getTime(),
      o: d.open,
      h: d.high,
      l: d.low,
      c: d.close,
    }));

    if (priceChart) priceChart.destroy();

    const ctx = document.getElementById("priceChart").getContext("2d");

    priceChart = new Chart(ctx, {
      type: "candlestick",
      data: {
        datasets: [{
          label: ticker,
          data: candleData,
          color: { up: "#4CAF7D", down: "#ef5350", unchanged: "#aaaaaa" },
          borderColor: { up: "#4CAF7D", down: "#ef5350", unchanged: "#aaaaaa" },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = ctx.raw;
                return [
                  `O: ₹${d.o.toLocaleString("en-IN")}`,
                  `H: ₹${d.h.toLocaleString("en-IN")}`,
                  `L: ₹${d.l.toLocaleString("en-IN")}`,
                  `C: ₹${d.c.toLocaleString("en-IN")}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            type: "timeseries",
            time: { unit: "day", tooltipFormat: "dd MMM yyyy" },
            grid: { display: false },
            ticks: { color: "#7aab85", font: { size: 11 }, maxTicksLimit: 6 },
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
    console.error("Candlestick chart failed:", e);
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

document.querySelectorAll(".type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentChartType = btn.dataset.type;
    if (currentTicker) {
      const activePeriod = document.querySelector(".period-btn.active").dataset.period;
      loadChart(currentTicker, activePeriod);
    }
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


// ── FULLSCREEN ────────────────────────────────
const fullscreenBtn = document.getElementById("fullscreenBtn");
const chartSection  = document.getElementById("chartSection");

const expandIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
</svg>`;

const compressIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
</svg>`;

function exitFullscreen() {
  chartSection.classList.remove("is-fullscreen");
  fullscreenBtn.innerHTML = expandIcon;

  // destroy and redraw at original size
  const activePeriod = document.querySelector(".period-btn.active").dataset.period;
  if (priceChart) priceChart.destroy();
  priceChart = null;
  loadChart(currentTicker, activePeriod);
}

fullscreenBtn.addEventListener("click", () => {
  const isFullscreen = chartSection.classList.toggle("is-fullscreen");
  fullscreenBtn.innerHTML = isFullscreen ? compressIcon : expandIcon;
  if (isFullscreen) {
    if (priceChart) priceChart.resize();
  } else {
    exitFullscreen();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && chartSection.classList.contains("is-fullscreen")) {
    exitFullscreen();
  }
});

// ── AUTO REFRESH ──────────────────────────────
let secondsSinceUpdate = 0;

function updateTimestamp() {
  const el = document.getElementById("lastUpdated");
  if (!el) return;
  el.textContent = secondsSinceUpdate === 0
    ? "Just updated"
    : `Updated ${secondsSinceUpdate}s ago`;
  secondsSinceUpdate += 5;
}

async function refreshMarketData() {
  secondsSinceUpdate = 0;

  // refresh indices
  await loadIndices();
  const indicesList = document.getElementById("indicesList");
  indicesList.classList.remove("refreshed");
  void indicesList.offsetWidth; // force reflow to restart animation
  indicesList.classList.add("refreshed");

  // refresh movers
  await loadMovers();
}

// tick every 5 seconds to update the "X seconds ago" text
setInterval(updateTimestamp, 5000);

// refresh data every 60 seconds
setInterval(refreshMarketData, 100000);

// ── INIT ──────────────────────────────────────
loadIndices();
loadMovers();