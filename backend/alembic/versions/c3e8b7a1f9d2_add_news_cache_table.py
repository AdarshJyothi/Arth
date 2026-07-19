"""add news_cache table

Revision ID: c3e8b7a1f9d2
Revises: a2c24046429f
Create Date: 2026-07-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e8b7a1f9d2'
down_revision: Union[str, Sequence[str], None] = 'a2c24046429f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('news_cache',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ticker', sa.String(), nullable=False),
    sa.Column('headline', sa.Text(), nullable=False),
    sa.Column('url', sa.Text(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('published_at', sa.DateTime(), nullable=True),
    sa.Column('sentiment_label', sa.String(), nullable=False),
    sa.Column('sentiment_score', sa.Float(), nullable=False),
    sa.Column('fetched_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('ticker', 'url', name='uq_news_ticker_url')
    )
    op.create_index(op.f('ix_news_cache_id'), 'news_cache', ['id'], unique=False)
    op.create_index(op.f('ix_news_cache_ticker'), 'news_cache', ['ticker'], unique=False)
    op.create_index('ix_news_ticker_fetched', 'news_cache', ['ticker', 'fetched_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_news_ticker_fetched', table_name='news_cache')
    op.drop_index(op.f('ix_news_cache_ticker'), table_name='news_cache')
    op.drop_index(op.f('ix_news_cache_id'), table_name='news_cache')
    op.drop_table('news_cache')
