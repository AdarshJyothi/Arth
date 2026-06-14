from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime
from app.db.base import Base

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    txn_type = Column(String, nullable=False)   # "BUY" | "SELL"
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    realized_pnl = Column(Float, nullable=True)  # only set on SELL
    created_at = Column(DateTime, default=datetime.utcnow)
