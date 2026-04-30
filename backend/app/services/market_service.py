import yfinance as yf
import math
from app.schemas.market import (
    QuoteResponse, OHLCVPoint, HistoryResponse,
    SearchResult, MoverItem, MoversResponse, IndexSnapshot
)

NIFTY50_TICKERS = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS",
    "LT.NS", "AXISBANK.NS", "WIPRO.NS", "ASIANPAINT.NS", "MARUTI.NS",
    "SUNPHARMA.NS", "TITAN.NS", "ULTRACEMCO.NS", "BAJFINANCE.NS", "NESTLEIND.NS"
]

INDICES = [
    {"name": "Nifty 50",    "ticker": "^NSEI"},
    {"name": "Sensex",      "ticker": "^BSESN"},
    {"name": "Bank Nifty",  "ticker": "^NSEBANK"},
]

def get_quote(ticker: str) -> QuoteResponse:
    t = yf.Ticker(ticker)
    info = t.info
    price = info.get("currentPrice") or info.get("regularMarketPrice", 0.0)
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose", price)
    change = round(price - prev_close, 2)
    change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0

    return QuoteResponse(
        ticker=ticker.upper(),
        name=info.get("longName") or info.get("shortName", ticker),
        price=price,
        change=change,
        change_pct=change_pct,
        volume=info.get("volume") or info.get("regularMarketVolume", 0),
        market_cap=info.get("marketCap"),
        pe_ratio=info.get("trailingPE"),
        week_52_high=info.get("fiftyTwoWeekHigh"),
        week_52_low=info.get("fiftyTwoWeekLow"),
        sector=info.get("sector"),
        currency=info.get("currency"),
    )


def get_history(ticker: str, period: str) -> HistoryResponse:
    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y"}
    if period not in valid_periods:
        period = "1mo"

    t = yf.Ticker(ticker)
    df = t.history(period=period)
    df = df.reset_index()
    df = df.dropna(subset=["Open", "High", "Low", "Close"])  # drop rows with NaN

    data = []
    for _, row in df.iterrows():
        # sanitize any remaining NaN/inf floats → 0.0
        def safe_float(val):
            try:
                f = float(val)
                return 0.0 if (math.isnan(f) or math.isinf(f)) else round(f, 2)
            except Exception:
                return 0.0

        date_val = row["Date"]
        if hasattr(date_val, "tzinfo") and date_val.tzinfo is not None:
            date_val = date_val.tz_convert(None)

        data.append(OHLCVPoint(
            date=str(date_val.date()),
            open=safe_float(row["Open"]),
            high=safe_float(row["High"]),
            low=safe_float(row["Low"]),
            close=safe_float(row["Close"]),
            volume=int(row["Volume"]) if not math.isnan(float(row["Volume"])) else 0,
        ))

    return HistoryResponse(ticker=ticker.upper(), period=period, data=data)

def search_tickers(query: str) -> list[SearchResult]:
    results = []
    q = query.upper()
    for ticker in NIFTY50_TICKERS:
        base = ticker.replace(".NS", "").replace(".BO", "")
        if q in base:
            try:
                info = yf.Ticker(ticker).info
                results.append(SearchResult(
                    ticker=ticker,
                    name=info.get("longName") or info.get("shortName", ticker),
                    exchange=info.get("exchange", "NSE"),
                ))
            except Exception:
                pass
        if len(results) >= 6:
            break
    return results

def get_movers() -> MoversResponse:
    results = []
    for ticker in NIFTY50_TICKERS:
        try:
            info = yf.Ticker(ticker).info
            price = info.get("currentPrice") or info.get("regularMarketPrice", 0.0)
            prev = info.get("previousClose") or price
            pct = round(((price - prev) / prev) * 100, 2) if prev else 0.0
            results.append(MoverItem(
                ticker=ticker,
                name=info.get("shortName", ticker),
                price=price,
                change_pct=pct,
            ))
        except Exception:
            pass
    results.sort(key=lambda x: x.change_pct, reverse=True)
    return MoversResponse(gainers=results[:5], losers=results[-5:][::-1])

def get_indices() -> list[IndexSnapshot]:
    snapshots = []
    for idx in INDICES:
        try:
            info = yf.Ticker(idx["ticker"]).info
            price = info.get("regularMarketPrice") or info.get("currentPrice", 0.0)
            prev = info.get("regularMarketPreviousClose") or price
            pct = round(((price - prev) / prev) * 100, 2) if prev else 0.0
            snapshots.append(IndexSnapshot(
                name=idx["name"],
                ticker=idx["ticker"],
                price=price,
                change_pct=pct,
            ))
        except Exception:
            pass
    return snapshots