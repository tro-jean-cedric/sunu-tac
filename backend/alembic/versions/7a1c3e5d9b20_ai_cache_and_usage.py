"""ai cache and usage

Revision ID: 7a1c3e5d9b20
Revises: 22c44f8b8f10
Create Date: 2026-11-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7a1c3e5d9b20'
down_revision: Union[str, Sequence[str], None] = '22c44f8b8f10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('ai_cache',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('kind', sa.String(length=32), nullable=False),
    sa.Column('key', sa.String(length=255), nullable=False),
    sa.Column('content', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('model', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('kind', 'key', name='uq_ai_cache_kind_key')
    )
    op.create_table('ai_usage',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('user_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('count', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'day', name='uq_ai_usage_user_day')
    )
    op.create_index(op.f('ix_ai_usage_user_id'), 'ai_usage', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_ai_usage_user_id'), table_name='ai_usage')
    op.drop_table('ai_usage')
    op.drop_table('ai_cache')
