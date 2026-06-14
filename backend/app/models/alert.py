from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from datetime import datetime
from app.db.base import Base

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    target_price = Column(Float, nullable=False)
    direction = Column(String, nullable=False)  # "above" | "below"
    created_at = Column(DateTime, default=datetime.utcnow)
