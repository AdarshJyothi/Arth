from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.holding import Holding
from app.models.sell import Sell
from app.models.alert import Alert
from app.models.dividend import Dividend
from app.models.transaction import Transaction
from app.models.watchlist import Watchlist
from app.schemas.portfolio import (
    AddHoldingRequest, HoldingResponse, PortfolioSummary,
    SellRequest, SellResponse,
    AlertRequest, AlertResponse,
    DividendRequest, DividendResponse,
    SectorAllocation, HistoryPoint,
    TransactionResponse,
    WatchlistAddRequest, WatchlistResponse,
)
from app.services.portfolio_service import (
    add_or_merge_holding, compute_pnl, get_live_prices,
    record_sell, get_sector_allocation, get_portfolio_history,
    consolidate_user_holdings,
)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

# ── HOLDINGS ──────────────────────────────────
@router.get("/", response_model=PortfolioSummary)
def get_portfolio(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    consolidate_user_holdings(db, current_user.id)
    holdings = db.query(Holding).filter(Holding.user_id == current_user.id).all()
    prices = get_live_prices([h.ticker for h in holdings])
    computed = [compute_pnl(h, prices.get(h.ticker.upper(), 0.0)) for h in holdings]
    total_invested = sum(h["avg_buy_price"] * h["quantity"] for h in computed)
    current_value = sum(h["current_value"] for h in computed)
    total_pnl = current_value - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested else 0.0
    return {
        "total_invested": total_invested,
        "current_value": current_value,
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,
        "holdings": computed,
    }

@router.post("/", response_model=HoldingResponse)
def add_holding(data: AddHoldingRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    holding = add_or_merge_holding(db, current_user.id, data.ticker, data.quantity, data.buy_price)
    return compute_pnl(holding)

@router.delete("/{holding_id:int}")
def delete_holding(holding_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    holding = db.query(Holding).filter(Holding.id == holding_id, Holding.user_id == current_user.id).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(holding)
    db.commit()
    return {"message": "Deleted"}

# ── SELL ──────────────────────────────────────
@router.post("/sell/{holding_id}", response_model=SellResponse)
def sell_holding(holding_id: int, data: SellRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sell, err = record_sell(db, current_user.id, holding_id, data.quantity, data.sell_price)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return sell

@router.get("/realized", response_model=list[SellResponse])
def get_realized(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Sell).filter(Sell.user_id == current_user.id).order_by(Sell.sold_at.desc()).all()

# ── TRANSACTION HISTORY ───────────────────────
@router.get("/transactions", response_model=list[TransactionResponse])
def get_transactions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (db.query(Transaction)
              .filter(Transaction.user_id == current_user.id)
              .order_by(Transaction.created_at.desc())
              .all())

# ── WATCHLIST ─────────────────────────────────
@router.get("/watchlist", response_model=list[WatchlistResponse])
def get_watchlist(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (db.query(Watchlist)
              .filter(Watchlist.user_id == current_user.id)
              .order_by(Watchlist.created_at.desc())
              .all())

@router.post("/watchlist", response_model=WatchlistResponse)
def add_watchlist(data: WatchlistAddRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ticker = data.ticker.strip().upper()
    existing = db.query(Watchlist).filter(Watchlist.user_id == current_user.id, Watchlist.ticker == ticker).first()
    if existing:
        return existing
    w = Watchlist(user_id=current_user.id, ticker=ticker, name=data.name or ticker)
    db.add(w); db.commit(); db.refresh(w)
    return w

@router.delete("/watchlist")
def delete_watchlist(ticker: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    w = db.query(Watchlist).filter(Watchlist.user_id == current_user.id, Watchlist.ticker == ticker.strip().upper()).first()
    if w:
        db.delete(w); db.commit()
    return {"message": "ok"}

# ── SECTORS ───────────────────────────────────
@router.get("/sectors", response_model=list[SectorAllocation])
def get_sectors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    holdings = db.query(Holding).filter(Holding.user_id == current_user.id).all()
    if not holdings:
        return []
    prices = get_live_prices([h.ticker for h in holdings])
    return get_sector_allocation(holdings, prices)

# ── HISTORY ───────────────────────────────────
@router.get("/history", response_model=list[HistoryPoint])
def get_history(period: str = "1mo", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    holdings = db.query(Holding).filter(Holding.user_id == current_user.id).all()
    return get_portfolio_history(holdings, period)

# ── ALERTS ────────────────────────────────────
@router.get("/alerts", response_model=list[AlertResponse])
def get_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alerts = db.query(Alert).filter(Alert.user_id == current_user.id).all()
    tickers = list({a.ticker for a in alerts})
    prices = get_live_prices(tickers) if tickers else {}
    result = []
    for a in alerts:
        price = prices.get(a.ticker.upper(), 0.0)
        triggered = (a.direction == "above" and price >= a.target_price) or \
                    (a.direction == "below" and price <= a.target_price)
        result.append(AlertResponse(
            id=a.id, ticker=a.ticker, target_price=a.target_price,
            direction=a.direction, triggered=triggered,
            created_at=a.created_at, current_price=price,
        ))
    return result

@router.post("/alerts", response_model=AlertResponse)
def create_alert(data: AlertRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = Alert(user_id=current_user.id, ticker=data.ticker.upper(),
                  target_price=data.target_price, direction=data.direction)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    price = get_live_prices([alert.ticker]).get(alert.ticker, 0.0)
    triggered = (alert.direction == "above" and price >= alert.target_price) or \
                (alert.direction == "below" and price <= alert.target_price)
    return AlertResponse(id=alert.id, ticker=alert.ticker, target_price=alert.target_price,
                         direction=alert.direction, triggered=triggered,
                         created_at=alert.created_at, current_price=price)

@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == current_user.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"message": "Deleted"}

# ── DIVIDENDS ─────────────────────────────────
@router.get("/dividends", response_model=list[DividendResponse])
def get_dividends(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Dividend).filter(Dividend.user_id == current_user.id).order_by(Dividend.date.desc()).all()

@router.post("/dividends", response_model=DividendResponse)
def add_dividend(data: DividendRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    div = Dividend(
        user_id=current_user.id,
        ticker=data.ticker.upper(),
        amount=data.amount,
        date=data.date or datetime.utcnow(),
        notes=data.notes,
    )
    db.add(div)
    db.commit()
    db.refresh(div)
    return div

@router.delete("/dividends/{div_id}")
def delete_dividend(div_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    div = db.query(Dividend).filter(Dividend.id == div_id, Dividend.user_id == current_user.id).first()
    if not div:
        raise HTTPException(status_code=404, detail="Dividend not found")
    db.delete(div)
    db.commit()
    return {"message": "Deleted"}
