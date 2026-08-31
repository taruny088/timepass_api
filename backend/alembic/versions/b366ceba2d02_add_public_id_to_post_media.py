"""add public_id to post_media

Revision ID: b366ceba2d02
Revises: dcc47d54b848
Create Date: 2026-08-31 22:52:40.003085


WHAT THIS DOES
--------------
Adds post_media.public_id, the name Cloudinary uses for a file, and fills it in
for the photos already uploaded.

Cloudinary identifies a file by its public_id, not by its address. Without this
column, deleting a post removes the row and leaves the photo on Cloudinary
forever, with nothing pointing at it and nothing that will ever clean it up.


COMPARE THIS WITH THE PREVIOUS MIGRATION
----------------------------------------
The last one moved data out of a column and then dropped it. Autogenerate wrote
a draft that would have destroyed every photo, and the whole file had to be
rewritten by hand.

This one adds a nullable column. Autogenerate got it exactly right, and the only
addition is the backfill. That difference is worth noticing: autogenerate is
reliable for changes that ADD something and unreliable for changes that MOVE or
REMOVE something, because it compares shapes and cannot know your intent.

The difference matters for deployment too. Adding a nullable column is invisible
to code that does not know about it, so THIS migration can safely run before the
new code is deployed -- the old code simply ignores the column. The previous one
could not: whichever went first, the code and the database disagreed for a
while, and the live site was down in between.

An additive migration can go first. A destructive one cannot. That is what makes
destructive ones dangerous.


WHY public_id IS NULLABLE
-------------------------
Not laziness -- it is the honest shape.

The posts made before Phase 12 hold links pasted from other websites:
picsum.photos, and a few images found elsewhere. Those files are not on
Cloudinary at all, so they have no public_id and never can. The backfill fills
in only rows whose address is genuinely a Cloudinary one, and everything that
deletes from Cloudinary must skip a row where this is empty -- otherwise it asks
Cloudinary to remove a file it has never heard of.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b366ceba2d02"
down_revision: Union[str, Sequence[str], None] = "dcc47d54b848"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the column, then work out the value for photos already uploaded."""
    op.add_column(
        "post_media",
        sa.Column("public_id", sa.String(length=255), nullable=True),
    )

    # --- The backfill -------------------------------------------------------
    #
    # A Cloudinary address looks like this:
    #
    #   https://res.cloudinary.com/<cloud>/image/upload/v1788181642/timepass/posts/c4ubc.jpg
    #                                                   |__________| |_________________|
    #                                                    version      the public_id
    #
    # So the public_id is everything after "/upload/", minus the version prefix
    # and minus the file extension:
    #
    #   split_part(url, '/upload/', 2)   ->  v1788181642/timepass/posts/c4ubc.jpg
    #   strip ^v[0-9]+/                  ->  timepass/posts/c4ubc.jpg
    #   strip \.[a-zA-Z0-9]+$            ->  timepass/posts/c4ubc
    #
    # The WHERE clause is what protects the older rows. Only addresses that are
    # actually Cloudinary ones are touched; the pasted links from before Phase
    # 12 keep a NULL public_id, which is the truth about them.
    #
    # Written as SQL rather than a Python loop so the database does the whole
    # job in one statement, without sending a single row to Python and back.
    op.execute(
        r"""
        UPDATE post_media
        SET public_id = regexp_replace(
                split_part(url, '/upload/', 2),
                '^v[0-9]+/|\.[a-zA-Z0-9]+$',
                '',
                'g'
            )
        WHERE url LIKE 'https://res.cloudinary.com/%/upload/%'
        """
    )


def downgrade() -> None:
    """Remove the column.

    Genuinely lossless, unlike the previous migration's downgrade. public_id is
    worked out from the url, and the url stays -- so running upgrade again
    reconstructs every value exactly. Nothing is lost by going back.
    """
    op.drop_column("post_media", "public_id")
