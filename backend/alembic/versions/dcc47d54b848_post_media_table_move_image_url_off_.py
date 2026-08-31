"""post_media table, move image_url off posts

Revision ID: dcc47d54b848
Revises:
Create Date: 2026-08-31 17:05:37.168300


WHAT THIS DOES, IN PLAIN ENGLISH
--------------------------------
A post used to hold exactly one photo, in a column called posts.image_url. It
now holds up to ten, which one column cannot express. This migration moves the
photos into their own table, one row per photo.

Going forward (upgrade):

    1. Build the new post_media table.
    2. Copy every existing posts.image_url into it as photo number 0.
    3. Only then drop posts.image_url.

Going back (downgrade):

    1. Add image_url back, allowing empty for the moment.
    2. Copy photo number 0 of each post back into it.
    3. Remove any post that has no photo at all, since the old shape has no way
       to represent one.
    4. Make the column required again, as it originally was.
    5. Drop post_media.


WHY THIS FILE WAS WRITTEN BY HAND
---------------------------------
Alembic generated a first draft, and the draft was dangerous. It wrote:

    op.create_table('post_media', ...)
    op.drop_column('posts', 'image_url')

with no copy in between. Autogenerate compares the shape of the models to the
shape of the database. It can see that a column has gone; it cannot see that
the data was meant to go somewhere. Running that draft on the live database
would have deleted the photo link of every existing post, with no error.

Its downgrade was broken too:

    op.add_column('posts', sa.Column('image_url', ..., nullable=False))

PostgreSQL refuses that on a table that already has rows -- it would have to
invent a value for each existing row, and there is none. The fix is to add the
column empty, fill it in, and only then require it.

This is the whole reason a migration is a file you read rather than a command
you run.


THE DOWNGRADE IS NOT LOSSLESS, AND YOU SHOULD KNOW BEFORE YOU RUN IT
--------------------------------------------------------------------
The old shape holds one photo per post. The new one holds ten. Going back keeps
photo number 0 of each post and DISCARDS the rest, because there is nowhere to
put them.

That is not a flaw in this file -- it is what going back to a smaller shape
means. It is written down here so it is a decision rather than a surprise.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dcc47d54b848"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Move the photos into their own table."""
    # --- 1. The new table ---------------------------------------------------
    op.create_table(
        "post_media",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("position >= 0", name="ck_post_media_position_positive"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "post_id", "position", name="uq_post_media_post_position"
        ),
    )

    # --- 2. THE STEP AUTOGENERATE DID NOT WRITE -----------------------------
    #
    # Copy every existing photo across before the column that holds it is
    # dropped. Every old post becomes a post with exactly one photo, at
    # position 0.
    #
    # This is raw SQL rather than Python looping over rows, and deliberately:
    # the database does the whole job in one statement without sending a single
    # row to Python and back. It is also the only version that stays correct if
    # the table is large.
    #
    # It is written against the table NAMES rather than the models on purpose.
    # A migration must keep working years from now, and models.py will have
    # moved on -- if this said Post.image_url it would break the moment that
    # attribute was deleted, which is in this very commit.
    op.execute(
        """
        INSERT INTO post_media (post_id, url, position, created_at)
        SELECT id, image_url, 0, created_at
        FROM posts
        """
    )

    # --- 3. Now it is safe to drop ------------------------------------------
    op.drop_column("posts", "image_url")


def downgrade() -> None:
    """Put the photos back on posts, keeping only the first of each."""
    # --- 1. Add the column back, EMPTY for now ------------------------------
    #
    # nullable=True at this point, unlike the original column. It has to be:
    # PostgreSQL cannot add a required column to a table that already has rows,
    # because there would be no value to put in them. Fill first, require after.
    op.add_column(
        "posts",
        sa.Column("image_url", sa.VARCHAR(length=500), nullable=True),
    )

    # --- 2. Copy photo 0 of each post back ----------------------------------
    op.execute(
        """
        UPDATE posts
        SET image_url = post_media.url
        FROM post_media
        WHERE post_media.post_id = posts.id
          AND post_media.position = 0
        """
    )

    # --- 3. Anything with no photo cannot exist in the old shape ------------
    #
    # A post with no photo at all should be impossible -- the app requires one.
    # But a downgrade has to cope with the database as it actually is, not as it
    # ought to be, and one such row would make step 4 fail with a message that
    # explains nothing.
    #
    # Deleting rows is a serious thing for a migration to do, which is why it is
    # spelled out at the top of this file rather than buried here.
    op.execute("DELETE FROM posts WHERE image_url IS NULL")

    # --- 4. Restore the original rule ---------------------------------------
    op.alter_column("posts", "image_url", nullable=False)

    # --- 5. And remove the new table ----------------------------------------
    op.drop_table("post_media")
