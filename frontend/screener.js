// ── SCREENER ──────────────────────────────────
const SCREENER_API = "http://localhost:8000/api/v1/screener";

let screenerSector = "";
let screenerCap    = "";
let screenerSort   = "market_cap";
let screenerSearch = "";
let screenerLoaded = false;
let screenerStocks = [];   // last fetched list (pre-search)

// ── SIDEBAR NAV ───────────────────────────────
document.querySelector('[data-page="screener"]').addEventListener("click", () => {
  if (!screenerLoaded) initScreener();
});

async function initScreener() {
  screenerLoaded = true;
  renderSkeletons();
  await loadSectorPills();
  loadScreener();
}

// ── SECTOR PILLS ──────────────────────────────
let sectorPillTries = 0;

async function loadSectorPills() {
  const container = document.getElementById("sectorFilters");
  let sectors = [];
  try {
    const res = await fetch(`${SCREENER_API}/sectors`);
    sectors = await res.json();
  } catch { /* silent */ }

  // Rebuild every pill (incl. "All Sectors") so handlers + active state stay correct
  const mkPill = (label, val) => {
    const btn = document.createElement("button");
    btn.className = "filter-pill" + (val === screenerSector ? " active" : "");
    btn.dataset.sector = val;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      screenerSector = val === screenerSector ? "" : val;
      container.querySelectorAll(".filter-pill").forEach((p) =>
        p.classList.toggle("active", p.dataset.sector === screenerSector)
      );
      loadScreener();
    });
    return btn;
  };

  container.innerHTML = "";
  container.appendChild(mkPill("All Sectors", ""));
  sectors.forEach((s) => container.appendChild(mkPill(s, s)));

  // Fundamentals warm up in the background on first ever run — retry until ready
  if (!sectors.length && sectorPillTries++ < 12) {
    setTimeout(loadSectorPills, 4000);
  }
}

// ── CAP BUTTONS ───────────────────────────────
document.querySelectorAll(".cap-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    screenerCap = btn.dataset.cap;
    document.querySelectorAll(".cap-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.cap === screenerCap)
    );
    loadScreener();
  });
});

// ── SORT ──────────────────────────────────────
document.getElementById("screenerSort").addEventListener("change", (e) => {
  screenerSort = e.target.value;
  loadScreener();
});

// ── SEARCH ────────────────────────────────────
// Filters the already-loaded list instantly (no backend round-trip)
document.getElementById("screenerSearch").addEventListener("input", (e) => {
  screenerSearch = e.target.value;
  applySearch();
});

// ── LOAD STOCKS ───────────────────────────────
async function loadScreener() {
  renderSkeletons();
  const params = new URLSearchParams({ sort: screenerSort });
  if (screenerSector) params.set("sector", screenerSector);
  if (screenerCap)    params.set("cap", screenerCap);

  try {
    const res  = await fetch(`${SCREENER_API}/stocks?${params}`);
    screenerStocks = await res.json();
    applySearch();
  } catch (e) {
    document.getElementById("screenerGrid").innerHTML =
      `<p style="color:var(--color-text-muted);grid-column:1/-1;padding:var(--space-8)">Failed to load stocks. Is the backend running?</p>`;
  }
}

// Filter the loaded list by the search box (partial, case-insensitive) + render
function applySearch() {
  const q = screenerSearch.trim().toLowerCase();
  const list = !q ? screenerStocks : screenerStocks.filter((s) =>
    (s.name || "").toLowerCase().includes(q) ||
    (s.ticker || "").toLowerCase().includes(q)
  );
  renderCards(list);
  document.getElementById("screenerMeta").textContent =
    `${list.length} stock${list.length !== 1 ? "s" : ""}` +
    (q ? ` matching “${screenerSearch.trim()}”` : "");
}

// ── SKELETONS ─────────────────────────────────
function renderSkeletons() {
  const grid = document.getElementById("screenerGrid");
  grid.innerHTML = Array(12).fill(
    `<div class="stock-card stock-card-skel">
      <div class="skel skel-line" style="width:40%;margin-bottom:6px"></div>
      <div class="skel skel-line" style="width:70%;height:10px"></div>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px">
        <div class="skel skel-line" style="width:50%;height:18px"></div>
        <div class="skel skel-line" style="width:35%;height:10px"></div>
      </div>
    </div>`
  ).join("");
}

// ── RENDER CARDS ──────────────────────────────
function renderCards(stocks) {
  const grid = document.getElementById("screenerGrid");
  if (!stocks.length) {
    grid.innerHTML = `<p style="color:var(--color-text-muted);grid-column:1/-1;padding:var(--space-8)">No stocks match this filter.</p>`;
    return;
  }

  grid.innerHTML = stocks.map((s) => {
    const chgClass = s.change_pct == null ? "" : s.change_pct >= 0 ? "gain" : "loss";
    const chgSign  = s.change_pct != null && s.change_pct >= 0 ? "+" : "";
    const chgStr   = s.change_pct != null ? `${chgSign}${s.change_pct.toFixed(2)}%` : "—";
    const priceStr = s.price != null ? `₹${s.price.toLocaleString("en-IN")}` : "—";
    const peStr    = s.pe    != null ? `P/E ${s.pe}` : "";
    const mcStr    = s.market_cap || "";

    // 52W range bar
    let rangeBar = "";
    if (s.week52_low != null && s.week52_high != null && s.price != null) {
      const pct = Math.min(100, Math.max(0,
        ((s.price - s.week52_low) / (s.week52_high - s.week52_low)) * 100
      ));
      rangeBar = `
        <div class="range-wrap">
          <span class="range-label">52W</span>
          <div class="range-track"><div class="range-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <span class="range-label">${pct.toFixed(0)}%</span>
        </div>`;
    }

    const capClass = s.cap === "Large" ? "tag-large" : s.cap === "Mid" ? "tag-mid" : "tag-small";
    const downClass = s.change_pct != null && s.change_pct < 0 ? " card-down" : "";

    return `<div class="stock-card${downClass}" onclick="handleScreenerClick('${s.ticker}')">
      <div class="sc-top">
        <div>
          <div class="sc-ticker">${s.ticker}</div>
          <div class="sc-name">${s.name}</div>
        </div>
        <div class="sc-change ${chgClass}">${chgStr}</div>
      </div>
      <div class="sc-price">${priceStr}</div>
      <div class="sc-meta">
        ${mcStr ? `<span class="sc-meta-item">${mcStr}</span>` : ""}
        ${peStr ? `<span class="sc-meta-item">${peStr}</span>` : ""}
      </div>
      ${rangeBar}
      <div class="sc-tags">
        <span class="sc-tag">${s.sector}</span>
        <span class="sc-tag ${capClass}">${s.cap}</span>
      </div>
    </div>`;
  }).join("");
}

// ── CLICK → OPEN STOCK ON DASHBOARD ───────────
function handleScreenerClick(ticker) {
  // Switch to the dashboard page
  document.querySelectorAll(".sidebar-item").forEach((i) => i.classList.remove("active"));
  document.querySelector('[data-page="dashboard"]').classList.add("active");
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active-page"));
  document.getElementById("page-dashboard").classList.add("active-page");
  document.querySelector(".main-wrapper")?.scrollTo({ top: 0 });

  // Call the dashboard's quote loader directly (loads quote + chart).
  // The search box only knows 20 hardcoded stocks, so we bypass it.
  const full = ticker.includes(".") ? ticker : ticker + ".NS";
  if (typeof loadQuote === "function") loadQuote(full);
}
