from pydantic import BaseModel
from typing import Optional

class NewsItemOut(BaseModel):
    headline: str
    url: str
    source: str
    published_at: Optional[str]          # ISO-8601 UTC, e.g. "2026-07-17T13:55:28Z"
    sentiment_label: str                 # bullish | bearish | neutral
    sentiment_score: float               # VADER compound, -1..1

class NewsSummary(BaseModel):
    bullish: int
    bearish: int
    neutral: int
    avg_score: float
    overall: str                         # bullish | bearish | neutral

class NewsResponse(BaseModel):
    ticker: str
    count: int
    summary: NewsSummary
    items: list[NewsItemOut]
