"""editable questionnaires (versioned item banks) linked to campaigns

Revision ID: 9c4e2a7f1b30
Revises: 7a1c3e5d9b20
Create Date: 2026-11-20 18:00:00.000000

The legacy bank is inserted as published version 1 and assigned to existing campaigns at API start-up
(app.questionnaire.ensure_default), so this migration only changes the schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '9c4e2a7f1b30'
down_revision: Union[str, Sequence[str], None] = '7a1c3e5d9b20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

qstatus = sa.Enum('draft', 'published', 'archived', name='qstatus_enum')


def upgrade() -> None:
    op.create_table('questionnaires',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('label', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('status', qstatus, nullable=False),
    sa.Column('content', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('revision', sa.Integer(), nullable=False),
    sa.Column('based_on_id', sa.BigInteger(), nullable=True),
    sa.Column('created_by', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_by', sa.String(length=255), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('published_by', sa.String(length=255), nullable=True),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['based_on_id'], ['questionnaires.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_questionnaires_status', 'questionnaires', ['status'])
    with op.batch_alter_table('campaigns') as b:
        b.add_column(sa.Column('questionnaire_id', sa.BigInteger(), nullable=True))
        b.create_foreign_key('fk_campaigns_questionnaire', 'questionnaires', ['questionnaire_id'], ['id'])
        b.create_index('ix_campaigns_questionnaire_id', ['questionnaire_id'])


def downgrade() -> None:
    with op.batch_alter_table('campaigns') as b:
        b.drop_index('ix_campaigns_questionnaire_id')
        b.drop_constraint('fk_campaigns_questionnaire', type_='foreignkey')
        b.drop_column('questionnaire_id')
    op.drop_index('ix_questionnaires_status', table_name='questionnaires')
    op.drop_table('questionnaires')
    qstatus.drop(op.get_bind(), checkfirst=True)
