"""
Creating, viewing and deleting posts.

This file is where PLAN.md's central idea for Phase 5 lives: OWNERSHIP.

Phase 3 answered "who are you?" -- that is AUTHENTICATION, and it is done by
get_current_user before any endpoint here runs. This file answers a different
question: "may YOU do this to THIS PARTICULAR THING?" -- that is
AUTHORISATION, and knowing someone's name tells you nothing about it.

The two words get muddled constantly. Knowing that a request comes from a
genuinely logged-in user does NOT mean that user may delete post 12.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.media import upload_image
from app.models import Post, PostMedia, User
from app.post_view import build_post
from app.schemas import PostCreate, PostOut

router = APIRouter(prefix="/posts", tags=["posts"])


@router.post(
    "",
    response_model=PostOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a post",
)
async def create_post(
    # THE PHOTO ARRIVES AS A FILE, NOT AS TEXT.
    #
    # Every endpoint before this one took JSON. A file is not text, and cramming
    # raw bytes into a JSON string would make them a third larger and would need
    # encoding and decoding at both ends.
    #
    # So the browser sends multipart/form-data instead: one request body holding
    # the file and the other fields side by side with separators between them.
    # The browser builds it (FormData); FastAPI unpacks it. Unpacking is what
    # the python-multipart package added in this phase actually does -- without
    # it FastAPI raises an error telling you to install it.
    #
    # File(...) means required. UploadFile rather than bytes so the file is
    # handled as a stream with a filename attached, rather than the whole thing
    # being materialised before our code can decide anything about it.
    image: UploadFile = File(..., description="The photo. JPEG, PNG, GIF or WebP."),
    #
    # Form(...) for the caption, because in a multipart request every field
    # comes through the form, not through JSON. It cannot be a Pydantic model
    # here for the same reason -- so the value is validated by handing it to
    # PostCreate below rather than by being parsed as one.
    caption: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PostOut:
    """Create a post owned by whoever is logged in.

    async def, unlike every other endpoint in this project. Reading an uploaded
    file is an await, so this function has to be able to wait -- see
    media.upload_image.
    """
    # Run the caption through PostCreate so the length limit and the trimming
    # rule stay in schemas.py with all the other validation, instead of being
    # written out again here where the two copies could drift apart.
    details = PostCreate(caption=caption)

    # UPLOAD BEFORE WRITING THE ROW.
    #
    # If the upload fails, nothing has been saved and the user sees a clear
    # error. The other order would leave a post in the database pointing at a
    # photo that was never stored -- a broken post that nobody asked for and
    # nothing cleans up.
    #
    # This checks the file's real type by reading its first bytes, and enforces
    # the size limit. See media.py.
    url = await upload_image(image, folder="timepass/posts")

    post = Post(
        # The author comes from the TOKEN, not from the request body.
        #
        # This single line is why PostCreate has no user_id field. If the
        # browser could choose the author, anyone could post as anyone else by
        # typing a different number. The browser cannot influence this.
        user_id=current_user.id,
        caption=details.caption,
    )

    # position=0 because this is the first photo. Phase 12b adds the rest, and
    # they will be 1, 2, 3 and so on -- which is why the number is stored rather
    # than assumed from the order the rows happen to come back in.
    post.media.append(PostMedia(url=url, position=0))

    db.add(post)
    db.commit()

    # Re-read the row so the id and created_at that PostgreSQL filled in are
    # present in the reply.
    db.refresh(post)

    # A brand new post has no likes and no comments, but it is built through
    # the same function as every other post so the reply has exactly the same
    # shape. The website never has to special-case a just-created post.
    return build_post(db, post, current_user)


@router.get("/{post_id}", response_model=PostOut, summary="View one post")
def read_post(
    post_id: int,
    db: Session = Depends(get_db),
    # The login requirement. We do not use current_user for anything here --
    # anyone logged in may view any post -- but naming it as a dependency is
    # what makes a token mandatory.
    current_user: User = Depends(get_current_user),
) -> PostOut:
    """Return one post by its id."""
    post = db.get(Post, post_id)

    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found.",
        )

    return build_post(db, post, current_user)


@router.delete(
    "/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete one of your own posts",
)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a post, but only if it belongs to the person asking.

    THIS IS THE MOST IMPORTANT FUNCTION IN PHASE 5.

    The website will only draw a delete button on your own posts. That is
    decoration. It stops nobody. Anyone can open their browser's developer
    tools and send this request by hand:

        DELETE /posts/12
        Authorization: Bearer <their own perfectly valid token>

    No button is involved. Their token is real -- they genuinely are logged
    in, and get_current_user will happily confirm who they are. The check
    below is the only thing standing between them and someone else's post,
    and it runs on the server where they cannot reach it.
    """
    post = db.get(Post, post_id)

    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found.",
        )

    # THE OWNERSHIP CHECK. Everything else in this phase is ordinary; this one
    # comparison is the lesson.
    if post.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own posts.",
        )

    # 403 rather than 404 is a deliberate choice. 403 means "this exists and
    # you may not touch it", which is honest. 404 would hide whether the post
    # exists at all, which matters when an id is itself a secret -- but these
    # photos are already visible on a profile page, so there is nothing to
    # hide and the clearer message wins.

    db.delete(post)
    db.commit()

    # 204 No Content means "done, and there is nothing to send back", which is
    # exactly right for a deletion. Returning None is what produces an empty
    # body.
    return None
