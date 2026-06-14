from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime
from app.db.base import Base

class Sell(Base):
    __tablename__ = "sells"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    sell_price = Column(Float, nullable=False)
    avg_buy_price = Column(Float, nullable=False)
    realized_pnl = Column(Float, nullable=False)
    sold_at = Column(DateTime, default=datetime.utcnow)
