from fastapi import APIRouter, HTTPException, Query
from app.services.market_service import get_quote, get_history, search_tickers, get_movers, get_indices

router = APIRouter(prefix="/api/v1/market", tags=["Market"])

@router.get("/quote/{ticker}")
def quote(ticker: str):
    try:
        return get_quote(ticker.upper())
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/history/{ticker}")
def history(ticker: str, period: str = Query(default="1mo")):
    try:
        return get_history(ticker.upper(), period)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/search")
def search(q: str = Query(min_length=1)):
    return search_tickers(q)

@router.get("/movers")
def movers():
    return get_movers()

@router.get("/indices")
def indices():
    return get_indices()