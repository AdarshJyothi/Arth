from sqlalchemy import Column, Integer, String, Float, DateTime, Text, UniqueConstraint, Index
from datetime import datetime
from app.db.base import Base

class NewsItem(Base):
    __tablename__ = "news_cache"
    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)   # normalized, no .NS/.BO suffix
    headline = Column(Text, nullable=False)
    url = Column(Text, nullable=False, default="")
    source = Column(String, nullable=False, default="")   # publisher name
    published_at = Column(DateTime, nullable=True)         # article publish time (UTC)
    sentiment_label = Column(String, nullable=False, default="neutral")  # bullish|bearish|neutral
    sentiment_score = Column(Float, nullable=False, default=0.0)         # VADER compound, -1..1
    fetched_at = Column(DateTime, default=datetime.utcnow)  # when we cached it (freshness)
    __table_args__ = (
        # de-dupe the same article per ticker across refreshes
        UniqueConstraint("ticker", "url", name="uq_news_ticker_url"),
        Index("ix_news_ticker_fetched", "ticker", "fetched_at"),
    )
