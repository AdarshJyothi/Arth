from pydantic import BaseModel
from typing import Optional

class QuoteResponse(BaseModel):
    ticker: str
    name: str
    price: float
    change: float
    change_pct: float
    volume: int
    market_cap: Optional[float]
    pe_ratio: Optional[float]
    week_52_high: Optional[float]
    week_52_low: Optional[float]
    sector: Optional[str]
    currency: Optional[str]

class OHLCVPoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int

class HistoryResponse(BaseModel):
    ticker: str
    period: str
    data: list[OHLCVPoint]

class SearchResult(BaseModel):
    ticker: str
    name: str
    exchange: str

class MoverItem(BaseModel):
    ticker: str
    name: str
    price: float
    change_pct: float

class MoversResponse(BaseModel):
    gainers: list[MoverItem]
    losers: list[MoverItem]

class IndexSnapshot(BaseModel):
    name: str
    ticker: str
    price: float
    change_pct: float