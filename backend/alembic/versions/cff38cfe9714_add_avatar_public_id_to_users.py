"""add avatar_public_id to users

Revision ID: cff38cfe9714
Revises: b366ceba2d02
Create Date: 2026-08-31 22:58:42.289494

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cff38cfe9714'
down_revision: Union[str, Sequence[str], None] = 'b366ceba2d02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the column. No backfill needed -- see below.

    users.avatar_url has existed since Phase 1 and no user has ever had one set,
    because until this phase there was no way to upload a picture. So there are
    no addresses to work a public_id back out of, and nothing to fill in.

    That was checked against the real database rather than assumed:

        SELECT COUNT(*) FROM users WHERE avatar_url IS NOT NULL  ->  0

    Worth doing. The previous migration DID need a backfill and autogenerate did
    not write one; the difference between the two cases is a fact about the data,
    which no tool can work out for you.
    """
    op.add_column(
        "users",
        sa.Column("avatar_public_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    """Remove the column.

    Not lossless, unlike the previous one. public_id cannot be reconstructed
    from avatar_url the way post_media's could, because going back also means
    going back to code that never stored it. Downgrading loses the ability to
    clean up old avatars; the photos themselves are untouched.
    """
    op.drop_column("users", "avatar_public_id")
