"""email verification: email_tokens table and users.email_verified_at

Revision ID: 44f1de93ab3b
Revises: cff38cfe9714
Create Date: 2026-09-01 16:07:41.451439

WHAT THIS MIGRATION DOES, IN PLAIN ENGLISH.

Three things:

  1. Creates a new table, email_tokens, to hold one-time codes sent by email.
  2. Adds one column to the existing users table, email_verified_at, which is
     empty for somebody who has not confirmed their address.
  3. Fills that column in for every account that ALREADY EXISTS.

Step 3 is the one no tool can write for you, and the one that matters most.

Alembic's autogenerate compares the models file against the real database and
writes the difference. It is very good at that and completely blind to what the
DATA means. It wrote steps 1 and 2 correctly and stopped, because "what should
the new column say for rows that are already there" is a question about people,
not about schema.

Left alone, the answer would be NULL -- and NULL means unverified. Every
account on the live site would wake up unable to post, comment or follow,
because a rule was invented after they signed up. There was no verification
email to click when they registered; blocking them now punishes them for our
timing. So they are all marked verified, and only accounts created from here
on have to prove anything.

This is the same lesson as the very first migration in this project: the
previous one needed a backfill and autogenerate did not write one either. The
difference between the two cases is a fact about the data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44f1de93ab3b'
down_revision: Union[str, Sequence[str], None] = 'cff38cfe9714'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. the new table -------------------------------------------------
    #
    # ondelete='CASCADE' on the foreign key: delete a user and their
    # outstanding codes go with them, rather than being left pointing at an
    # account that no longer exists.
    op.create_table(
        "email_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Every redemption finds its row by this column and no other, so it is
    # indexed. unique=True as well: a repeat would mean the random source has
    # failed, and a loud error is better than two accounts sharing a code.
    op.create_index(
        op.f("ix_email_tokens_token_hash"),
        "email_tokens",
        ["token_hash"],
        unique=True,
    )

    # --- 2. the new column ------------------------------------------------
    #
    # nullable=True is required here, not merely convenient. The table already
    # has rows, and PostgreSQL cannot add a NOT NULL column to a populated
    # table without being told what to put in the existing rows -- it refuses
    # the whole migration. Nullable is also the right shape anyway: NULL is
    # exactly what "has not verified" means.
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- 3. the backfill --------------------------------------------------
    #
    # THE PART AUTOGENERATE CANNOT WRITE. See the note at the top of the file.
    #
    # now() rather than each account's own created_at, deliberately. created_at
    # would read as "this person confirmed their address on the day they signed
    # up", which never happened. now() reads as "granted at the moment the rule
    # changed", which is the truth. Every grandfathered account sharing one
    # timestamp is a feature: it is visibly the batch, not a real confirmation.
    #
    # WHERE email_verified_at IS NULL is belt and braces -- the column was
    # created one statement ago so every row is NULL -- but it costs nothing
    # and makes the statement safe to run twice.
    op.execute(
        "UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL"
    )


def downgrade() -> None:
    """Undo all three, newest first.

    NOT LOSSLESS, and worth being clear about why. Dropping the column throws
    away who had verified, so upgrading again would send everyone back through
    the backfill and mark accounts verified that never were. Dropping the table
    kills every outstanding code, so any reset link already sitting in somebody's
    inbox stops working.

    Neither is a disaster -- codes are meant to be short-lived and verification
    can be redone -- but "reversible" here means the schema comes back, not the
    facts.
    """
    op.drop_column("users", "email_verified_at")
    op.drop_index(op.f("ix_email_tokens_token_hash"), table_name="email_tokens")
    op.drop_table("email_tokens")
