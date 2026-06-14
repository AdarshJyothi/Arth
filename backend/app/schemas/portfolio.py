from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AddHoldingRequest(BaseModel):
    ticker: str
    quantity: float
    buy_price: float

class HoldingResponse(BaseModel):
    id: int
    ticker: str
    quantity: float
    avg_buy_price: float
    current_price: float
    current_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    created_at: datetime
    class Config:
        from_attributes = True

class PortfolioSummary(BaseModel):
    total_invested: float
    current_value: float
    total_pnl: float
    total_pnl_pct: float
    holdings: list[HoldingResponse]

class SellRequest(BaseModel):
    quantity: float
    sell_price: float

class SellResponse(BaseModel):
    id: int
    ticker: str
    quantity: float
    sell_price: float
    avg_buy_price: float
    realized_pnl: float
    sold_at: datetime
    class Config:
        from_attributes = True

class AlertRequest(BaseModel):
    ticker: str
    target_price: float
    direction: str  # "above" | "below"

class AlertResponse(BaseModel):
    id: int
    ticker: str
    target_price: float
    direction: str
    triggered: bool
    created_at: datetime
    current_price: Optional[float] = None

class DividendRequest(BaseModel):
    ticker: str
    amount: float
    date: Optional[datetime] = None
    notes: Optional[str] = None

class DividendResponse(BaseModel):
    id: int
    ticker: str
    amount: float
    date: datetime
    notes: Optional[str]
    class Config:
        from_attributes = True

class TransactionResponse(BaseModel):
    id: int
    ticker: str
    txn_type: str
    quantity: float
    price: float
    realized_pnl: Optional[float] = None
    created_at: datetime
    class Config:
        from_attributes = True

class WatchlistAddRequest(BaseModel):
    ticker: str
    name: str = ""

class WatchlistResponse(BaseModel):
    id: int
    ticker: str
    name: str
    created_at: datetime
    class Config:
        from_attributes = True

class SectorAllocation(BaseModel):
    sector: str
    value: float
    pct: float

class HistoryPoint(BaseModel):
    date: str
    value: float
