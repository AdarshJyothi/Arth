from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.news_service import get_news
from app.schemas.news import NewsResponse

router = APIRouter(prefix="/api/v1/news", tags=["News"])

@router.get("/{ticker}", response_model=NewsResponse)
def news(ticker: str, db: Session = Depends(get_db)):
    try:
        return get_news(ticker.upper(), db)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"news fetch failed: {e}")
