from fastapi import APIRouter, Query
from app.services.screener_service import fetch_screener_data

router = APIRouter(prefix="/screener", tags=["screener"])

@router.get("/stocks")
def get_stocks(
    sector: str = Query(default=""),
    cap:    str = Query(default=""),
    sort:   str = Query(default="market_cap"),
):
    data = fetch_screener_data()

    if sector:
        data = [s for s in data if s["sector"].lower() == sector.lower()]
    if cap:
        data = [s for s in data if s["cap"].lower() == cap.lower()]

    reverse = True
    key_fn = {
        "market_cap": lambda s: s.get("market_cap_raw") or 0,
        "pe":         lambda s: s.get("pe") or 0,
        "change":     lambda s: s.get("change_pct") or 0,
        "change_asc": lambda s: s.get("change_pct") or 0,
    }.get(sort, lambda s: s.get("market_cap_raw") or 0)

    if sort == "change_asc":
        reverse = False

    data = sorted(data, key=key_fn, reverse=reverse)
    return data

@router.get("/sectors")
def get_sectors():
    data = fetch_screener_data()
    sectors = sorted({
        s["sector"] for s in data
        if s["sector"] and s["sector"] not in ("Other", "—")
    })
    return sectors
