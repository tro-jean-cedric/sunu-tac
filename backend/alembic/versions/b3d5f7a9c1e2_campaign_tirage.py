"""random draw of questions per respondent (campaigns.tirage)

Revision ID: b3d5f7a9c1e2
Revises: 9c4e2a7f1b30
Create Date: 2026-11-20 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b3d5f7a9c1e2'
down_revision: Union[str, Sequence[str], None] = '9c4e2a7f1b30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('campaigns', sa.Column('tirage', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'),
                                         nullable=True))


def downgrade() -> None:
    op.drop_column('campaigns', 'tirage')
