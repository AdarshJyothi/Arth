import yfinance as yf
import pandas as pd
from sqlalchemy.orm import Session
from app.models.holding import Holding
from app.models.sell import Sell
from app.models.transaction import Transaction

def normalize_ticker(ticker: str) -> str:
    """Canonical symbol used for storage + merge: upper, trimmed, no exchange suffix.
    So RELIANCE, reliance, 'RELIANCE.NS', 'RELIANCE.BO' all collapse to 'RELIANCE'."""
    t = (ticker or "").strip().upper()
    for suffix in (".NS", ".BO"):
        if t.endswith(suffix):
            t = t[: -len(suffix)]
    return t

def get_live_prices(tickers: list[str]) -> dict[str, float]:
    unique = list({t.upper() for t in tickers})
    if not unique:
        return {}
    prices: dict[str, float] = {t: 0.0 for t in unique}
    # Add .NS suffix for NSE stocks (yfinance needs it for Indian stocks)
    ns_map = {(t if "." in t else t + ".NS"): t for t in unique}
    data = yf.Tickers(" ".join(ns_map.keys()))
    for ns_t, orig_t in ns_map.items():
        try:
            fi = data.tickers[ns_t].fast_info
            price = getattr(fi, "last_price", None)
            prices[orig_t] = float(price) if price else 0.0
        except Exception:
            prices[orig_t] = 0.0
    return prices

def get_live_price(ticker: str) -> float:
    return get_live_prices([ticker]).get(ticker.upper(), 0.0)

def add_or_merge_holding(db: Session, user_id: int, ticker: str, quantity: float, buy_price: float) -> Holding:
    ticker = normalize_ticker(ticker)
    existing = db.query(Holding).filter(Holding.user_id == user_id, Holding.ticker == ticker).first()
    if existing:
        total_qty = existing.quantity + quantity
        existing.avg_buy_price = ((existing.avg_buy_price * existing.quantity) + (buy_price * quantity)) / total_qty
        existing.quantity = total_qty
    else:
        existing = Holding(user_id=user_id, ticker=ticker, quantity=quantity, avg_buy_price=buy_price)
        db.add(existing)
    # Log the buy as a transaction (preserves individual buy events lost by merge)
    db.add(Transaction(user_id=user_id, ticker=ticker, txn_type="BUY",
                        quantity=quantity, price=buy_price))
    db.commit()
    db.refresh(existing)
    return existing

def consolidate_user_holdings(db: Session, user_id: int) -> None:
    """One-shot self-heal: merge any holdings that share a normalized symbol
    (e.g. legacy 'RELIANCE' + 'RELIANCE.NS') into a single weighted-avg row."""
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    groups: dict[str, list[Holding]] = {}
    for h in holdings:
        groups.setdefault(normalize_ticker(h.ticker), []).append(h)

    changed = False
    for norm, rows in groups.items():
        # Normalize the stored ticker even when there's only one row
        if len(rows) == 1:
            if rows[0].ticker != norm:
                rows[0].ticker = norm
                changed = True
            continue
        # Merge multiple rows into the first
        keep = rows[0]
        total_qty = sum(r.quantity for r in rows)
        total_cost = sum(r.avg_buy_price * r.quantity for r in rows)
        keep.ticker = norm
        keep.quantity = total_qty
        keep.avg_buy_price = (total_cost / total_qty) if total_qty else 0.0
        for r in rows[1:]:
            db.delete(r)
        changed = True

    if changed:
        db.commit()

def compute_pnl(holding: Holding, current_price: float | None = None) -> dict:
    if current_price is None:
        current_price = get_live_price(holding.ticker)
    cost_basis = holding.avg_buy_price * holding.quantity
    current_value = current_price * holding.quantity
    pnl = current_value - cost_basis
    pnl_pct = (pnl / cost_basis * 100) if cost_basis else 0.0
    return {
        "id": holding.id,
        "ticker": holding.ticker,
        "quantity": holding.quantity,
        "avg_buy_price": holding.avg_buy_price,
        "current_price": current_price,
        "current_value": current_value,
        "unrealized_pnl": pnl,
        "unrealized_pnl_pct": pnl_pct,
        "created_at": holding.created_at,
    }

def record_sell(db: Session, user_id: int, holding_id: int, quantity: float, sell_price: float):
    holding = db.query(Holding).filter(Holding.id == holding_id, Holding.user_id == user_id).first()
    if not holding:
        return None, "Holding not found"
    if quantity > holding.quantity:
        return None, "Quantity exceeds holding"
    realized_pnl = (sell_price - holding.avg_buy_price) * quantity
    sell = Sell(
        user_id=user_id,
        ticker=holding.ticker,
        quantity=quantity,
        sell_price=sell_price,
        avg_buy_price=holding.avg_buy_price,
        realized_pnl=realized_pnl,
    )
    db.add(sell)
    # Mirror the sell into the unified transaction history
    db.add(Transaction(user_id=user_id, ticker=holding.ticker, txn_type="SELL",
                        quantity=quantity, price=sell_price, realized_pnl=realized_pnl))
    if quantity >= holding.quantity:
        db.delete(holding)
    else:
        holding.quantity -= quantity
    db.commit()
    db.refresh(sell)
    return sell, None

def get_sector_allocation(holdings: list[Holding], prices: dict[str, float]) -> list[dict]:
    sector_values: dict[str, float] = {}
    for h in holdings:
        try:
            ns = h.ticker if "." in h.ticker else h.ticker + ".NS"
            info = yf.Ticker(ns).info
            sector = info.get("sector") or "Other"
        except Exception:
            sector = "Other"
        value = prices.get(h.ticker.upper(), 0.0) * h.quantity
        sector_values[sector] = sector_values.get(sector, 0.0) + value
    total = sum(sector_values.values()) or 1.0
    return [
        {"sector": s, "value": round(v, 2), "pct": round(v / total * 100, 1)}
        for s, v in sector_values.items()
    ]

def get_portfolio_history(holdings: list[Holding], period: str = "1mo") -> list[dict]:
    if not holdings:
        return []
    tickers = [h.ticker.upper() for h in holdings]
    quantities = {h.ticker.upper(): h.quantity for h in holdings}
    # Add .NS suffix so yfinance fetches NSE prices, not US micro-caps
    ns_tickers = [t if "." in t else t + ".NS" for t in tickers]
    try:
        raw = yf.download(ns_tickers, period=period, progress=False, auto_adjust=True)
        if raw.empty:
            return []
        if len(ns_tickers) == 1:
            close = raw[["Close"]].copy()
            close.columns = [tickers[0]]
        else:
            close = raw["Close"].copy()
            # Strip .NS/.BO so column names match original ticker keys in quantities
            close.columns = [str(c).upper().replace(".NS", "").replace(".BO", "") for c in close.columns]
        result = []
        for date, row in close.iterrows():
            total = sum(float(row.get(t, 0) or 0) * quantities.get(t, 0) for t in tickers)
            result.append({"date": date.strftime("%Y-%m-%d"), "value": round(total, 2)})
        return result
    except Exception:
        return []
