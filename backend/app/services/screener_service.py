import os
import json
import time
import threading
import yfinance as yf

# ── CURATED LISTS (grouped by cap so the filter works instantly) ──
LARGE_CAP = [
    "RELIANCE.NS","TCS.NS","INFY.NS","HDFCBANK.NS","ICICIBANK.NS",
    "HINDUNILVR.NS","ITC.NS","SBIN.NS","BHARTIARTL.NS","KOTAKBANK.NS",
    "LT.NS","AXISBANK.NS","ASIANPAINT.NS","MARUTI.NS","TITAN.NS",
    "BAJFINANCE.NS","WIPRO.NS","ULTRACEMCO.NS","HCLTECH.NS","SUNPHARMA.NS",
    "ONGC.NS","NTPC.NS","POWERGRID.NS","TECHM.NS","BAJAJFINSV.NS",
    "ADANIPORTS.NS","COALINDIA.NS","GRASIM.NS","JSWSTEEL.NS","INDUSINDBK.NS",
    "TATASTEEL.NS","TATAMOTORS.NS","DIVISLAB.NS","DRREDDY.NS","CIPLA.NS",
    "EICHERMOT.NS","HEROMOTOCO.NS","APOLLOHOSP.NS","BRITANNIA.NS","SBILIFE.NS",
    "HDFCLIFE.NS","BPCL.NS","IOC.NS","HINDALCO.NS","UPL.NS",
    "PIDILITIND.NS","NESTLEIND.NS","BAJAJ-AUTO.NS","TATACONSUM.NS","M&M.NS",
    "ADANIENT.NS","ADANIGREEN.NS","ADANIPOWER.NS","IRCTC.NS","HAL.NS",
    "BEL.NS","ETERNAL.NS","BANKBARODA.NS","CANBK.NS","PNB.NS",
    "MUTHOOTFIN.NS","CHOLAFIN.NS","SHRIRAMFIN.NS","DABUR.NS","MARICO.NS",
    "COLPAL.NS","GODREJCP.NS","BERGEPAINT.NS","HAVELLS.NS","VOLTAS.NS",
    "TRENT.NS","NYKAA.NS","VEDL.NS","SAIL.NS","NMDC.NS",
    "RECLTD.NS","PFC.NS","IRFC.NS","NHPC.NS","SJVN.NS",
]
MID_CAP = [
    "PERSISTENT.NS","COFORGE.NS","MPHASIS.NS","LTTS.NS","KPITTECH.NS",
    "TATAELXSI.NS","HAPPSTMNDS.NS","SONACOMS.NS","DIXON.NS","AMBER.NS",
    "LALPATHLAB.NS","METROPOLIS.NS","LAURUSLABS.NS","ALKEM.NS","JBCHEPHARM.NS",
    "TORNTPHARM.NS","IPCALAB.NS","AUROPHARMA.NS","GLENMARK.NS","MANKIND.NS",
    "FEDERALBNK.NS","IDFCFIRSTB.NS","RBLBANK.NS","BANDHANBNK.NS","DCBBANK.NS",
    "APOLLOTYRE.NS","MRF.NS","CEAT.NS","BALKRISIND.NS","ESCORTS.NS",
    "DEEPAKNTR.NS","NAVINFLUOR.NS","CLEAN.NS","ALKYLAMINE.NS",
    "JSWENERGY.NS","TORNTPOWER.NS","CESC.NS","TATAPOWER.NS","ADANIENSOL.NS",
    "PAGEIND.NS","KAJARIACER.NS","CERA.NS","ASTRAL.NS","SUPREMEIND.NS",
    "ABFRL.NS","SHOPERSTOP.NS","MANYAVAR.NS",
    "EMAMILTD.NS","JYOTHYLAB.NS","VSTIND.NS","RADICO.NS",
    "IIFL.NS","MOTILALOFS.NS","ANGELONE.NS",
]
SMALL_CAP = [
    "KAYNES.NS","IDEAFORGE.NS","DOMS.NS","SENCO.NS",
    "ROUTE.NS","EASEMYTRIP.NS","NUVAMA.NS","NETWEB.NS","RATEGAIN.NS",
    "GESHIP.NS","ELGIEQUIP.NS","CARBORUNIV.NS","GRINDWELL.NS","TIMKEN.NS",
    "JKCEMENT.NS","RAMCOCEM.NS","HEIDELBERG.NS","INDIACEM.NS",
    "SULA.NS","DEVYANI.NS","WESTLIFE.NS","JUBLFOOD.NS",
    "UJJIVANSFB.NS","EQUITASBNK.NS",
    "PRAJIND.NS","THERMAX.NS","BHEL.NS","BEML.NS","RVNL.NS",
    "TIINDIA.NS","CRAFTSMAN.NS","GREENPANEL.NS","CENTURYPLY.NS",
    "INTELLECT.NS","TANLA.NS","LATENTVIEW.NS","MASTEK.NS",
]

STOCK_LIST = LARGE_CAP + MID_CAP + SMALL_CAP
CAP_TIER = {
    **{t: "Large" for t in LARGE_CAP},
    **{t: "Mid"   for t in MID_CAP},
    **{t: "Small" for t in SMALL_CAP},
}

# ── DISK CACHE for slow fundamentals (name/sector/pe/mcap) ──
_DIR = os.path.dirname(__file__)
_META_FILE = os.path.join(_DIR, "screener_meta.json")
_meta_cache: dict | None = None
_warming = False
_warm_lock = threading.Lock()

# ── IN-MEMORY CACHE for live prices ──
_price_cache: dict = {"data": {}, "ts": 0.0}
PRICE_TTL = 300  # 5 minutes


def _fmt_mcap(mc: float | None) -> str | None:
    if not mc:
        return None
    cr = mc / 1e7  # rupees → crores
    if cr >= 100000:
        return f"₹{cr/100000:.1f}L Cr"
    if cr >= 1000:
        return f"₹{cr/1000:.1f}K Cr"
    return f"₹{cr:.0f} Cr"


def _load_meta() -> dict:
    global _meta_cache
    if _meta_cache is not None:
        return _meta_cache
    if os.path.exists(_META_FILE):
        try:
            with open(_META_FILE, "r", encoding="utf-8") as f:
                _meta_cache = json.load(f)
                return _meta_cache
        except Exception:
            pass
    _meta_cache = {}
    return _meta_cache


def _warm_meta() -> None:
    """Fetch fundamentals once, throttled, in a background thread → disk."""
    global _warming, _meta_cache
    with _warm_lock:
        if _warming:
            return
        _warming = True
    try:
        meta = dict(_load_meta())
        changed = False
        for tk in STOCK_LIST:
            if tk in meta:
                continue
            try:
                info = yf.Ticker(tk).info
                sector = info.get("sector")
                if not sector:
                    continue  # incomplete response — leave missing so it retries
                pe = info.get("trailingPE") or info.get("forwardPE")
                meta[tk] = {
                    "name":   info.get("longName") or info.get("shortName") or tk.replace(".NS", ""),
                    "sector": sector,
                    "pe":     round(pe, 1) if pe else None,
                    "mcap":   info.get("marketCap"),
                }
                changed = True
            except Exception:
                pass  # transient — retry on the next warm pass
            time.sleep(0.5)  # throttle — never trip Yahoo's rate limiter
        if changed:
            _meta_cache = meta
            try:
                with open(_META_FILE, "w", encoding="utf-8") as f:
                    json.dump(meta, f)
            except Exception:
                pass
    finally:
        _warming = False


def ensure_warm() -> None:
    """Kick off the background fundamentals fetch if anything is missing."""
    meta = _load_meta()
    if any(tk not in meta for tk in STOCK_LIST) and not _warming:
        threading.Thread(target=_warm_meta, daemon=True).start()


def _fetch_prices() -> dict:
    """ONE batched download → price, change%, 52w range for all tickers."""
    now = time.time()
    if _price_cache["data"] and now - _price_cache["ts"] < PRICE_TTL:
        return _price_cache["data"]

    try:
        df = yf.download(
            STOCK_LIST, period="1y", group_by="ticker",
            progress=False, threads=True, auto_adjust=True,
        )
    except Exception:
        df = None

    rows: dict = {}
    for tk in STOCK_LIST:
        price = prev = hi = lo = None
        try:
            close = df[tk]["Close"].dropna()
            if len(close):
                price = float(close.iloc[-1])
                prev  = float(close.iloc[-2]) if len(close) > 1 else price
                hi    = float(close.max())
                lo    = float(close.min())
        except Exception:
            pass
        rows[tk] = {"price": price, "prev": prev, "hi": hi, "lo": lo}

    _price_cache["data"] = rows
    _price_cache["ts"]   = now
    return rows


def fetch_screener_data() -> list[dict]:
    ensure_warm()
    prices = _fetch_prices()
    meta   = _load_meta()

    results = []
    for tk in STOCK_LIST:
        p = prices.get(tk, {})
        m = meta.get(tk, {})
        price = p.get("price")
        prev  = p.get("prev")
        if not price:
            continue  # skip dead/transient tickers — no empty cards
        change_pct = ((price - prev) / prev * 100) if price and prev else None

        results.append({
            "ticker":      tk.replace(".NS", "").replace(".BO", ""),
            "name":        m.get("name") or tk.replace(".NS", ""),
            "sector":      m.get("sector") or "—",
            "cap":         CAP_TIER.get(tk, "Unknown"),
            "price":       round(price, 2) if price else None,
            "change_pct":  round(change_pct, 2) if change_pct is not None else None,
            "market_cap":  _fmt_mcap(m.get("mcap")),
            "market_cap_raw": m.get("mcap"),
            "pe":          m.get("pe"),
            "week52_high": round(p["hi"], 2) if p.get("hi") else None,
            "week52_low":  round(p["lo"], 2) if p.get("lo") else None,
        })
    return results
