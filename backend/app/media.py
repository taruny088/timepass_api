"""
Uploading a photo to Cloudinary, and refusing anything that is not one.

WHY AN OUTSIDE SERVICE AT ALL

The obvious approach is to save the file into a folder on the server. On Render
that quietly does not work: the server's own disk is wiped on every restart and
every deploy, which happens whenever you push, and whenever the free instance
wakes from sleep. Photos would vanish with no error and nothing to explain it.
That is called an EPHEMERAL FILESYSTEM.

So the file goes to Cloudinary, and only the link it hands back is stored in our
database. Cloudinary keeps the file; we keep the address.

WHY THE FILE COMES THROUGH US

The browser could upload straight to Cloudinary and only tell us the resulting
link. It would be faster and would not use Render's bandwidth. We do it this way
instead because it is the only version where OUR rules are enforced by OUR code:
the checks below run before anything leaves our control.
"""

import logging
import os
from pathlib import Path
from typing import NamedTuple

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from fastapi import HTTPException, UploadFile, status

# THIS FILE LOADS ITS OWN .env, and the reason is a bug that already happened.
#
# The first version relied on app/database.py having called load_dotenv before
# this file was imported. That is true when the whole app starts, because
# posts.py imports database before media -- so it worked, and looked fine.
#
# It is not true when this module is imported on its own, and it would stop
# being true the moment someone reordered two import lines. The failure is
# silent and misleading: os.getenv returns None, and the app reports "uploads
# are not configured" while the settings are sitting right there in .env.
#
# Depending on import order for anything is a trap. security.py already loads
# its own .env for exactly this reason; this now does the same. load_dotenv is
# safe to call twice -- it will not overwrite a value already set, which is what
# makes the real environment on Render take priority over any file.
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

# --- Configuration ----------------------------------------------------------
#
# Read once, when this module is first imported. On a laptop these come from
# backend/.env, loaded just above. On Render there is no .env file at all --
# load_dotenv quietly does nothing and os.getenv reads the platform's own
# environment settings instead. Same code, both places.
#
# NOTE THE CONSEQUENCE OF "read once": editing .env while the server is running
# changes nothing, because these three lines already ran. The backend has to be
# restarted. That is the single most common reason this appears not to work.
CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
API_KEY = os.getenv("CLOUDINARY_API_KEY")
API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# secure=True forces https links. Without it Cloudinary hands back http
# addresses, and a browser on an https page refuses to load an http image --
# the photo silently does not appear, with only a console warning to explain it.
cloudinary.config(
    cloud_name=CLOUD_NAME,
    api_key=API_KEY,
    api_secret=API_SECRET,
    secure=True,
)


# --- The rules --------------------------------------------------------------

# 5 MB. A photo straight off a modern phone is often 3-4 MB, so this leaves
# room without inviting someone to upload a film.
#
# A SIZE LIMIT IS A SECURITY MEASURE, NOT A CONVENIENCE. Without one, a single
# request can fill the disk, exhaust the memory, or simply keep the only free
# server busy for minutes at a time. That is a denial of service, and it needs
# no cleverness at all -- just a large file.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

# What the first bytes of a file look like for each type we accept.
#
# THIS IS THE POINT OF THE WHOLE FILE. A filename is a CLAIM, not a fact --
# anyone can rename anything.jpg. The content type the browser sends is also
# just a claim, chosen by whatever sent the request.
#
# The only honest answer is to read the file itself. Real formats begin with a
# fixed signature, often called a MAGIC NUMBER:
#
#     JPEG  FF D8 FF
#     PNG   89 50 4E 47 0D 0A 1A 0A
#     GIF   47 49 46 38          ("GIF8" in plain text)
#     WEBP  RIFF ....  WEBP      (four bytes, size, then WEBP)
#
# Checked as bytes, so a renamed file is caught no matter what it is called.
SIGNATURES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF8": "gif",
}


def _detect_image_type(data: bytes) -> str | None:
    """Return 'jpg', 'png', 'gif', 'webp', or None if this is not an image."""
    for signature, name in SIGNATURES.items():
        if data.startswith(signature):
            return name

    # WEBP is the awkward one: it starts with "RIFF", then four bytes giving the
    # file size, then "WEBP". So the marker is not at the very beginning and the
    # bytes in between are different for every file.
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"

    return None


class UploadedImage(NamedTuple):
    """What Cloudinary gives back, and both halves matter.

    url        where the browser fetches the photo from
    public_id  the name Cloudinary knows the file by

    A NamedTuple rather than a bare tuple, so the caller writes result.public_id
    instead of result[1]. Two plain strings in a tuple are exactly the kind of
    thing that gets swapped by accident, and swapping these two would store a
    web address as an id and never fail loudly.

    THE public_id IS WHY THIS EXISTS AT ALL. Cloudinary identifies a file by its
    public_id, not by its address, so without keeping it a deleted post leaves
    its photo on Cloudinary forever with nothing pointing at it.
    """

    url: str
    public_id: str


async def upload_image(file: UploadFile, folder: str) -> UploadedImage:
    """Check an uploaded file is really an image, send it to Cloudinary.

    Returns the link to store, and the id needed to delete it later.

    Raises HTTPException with a clear message for anything the user can fix,
    which is what lets the website show something useful rather than "error".
    """
    if not CLOUD_NAME or not API_KEY or not API_SECRET:
        # A configuration problem, not the user's fault -- so 500, and a message
        # that names the actual cause instead of leaving someone guessing why
        # uploads fail only in production.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Image uploads are not configured. CLOUDINARY_CLOUD_NAME, "
                "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must all be set."
            ),
        )

    # Read the whole file into memory.
    #
    # Fine at 5 MB, and it is what lets us inspect the bytes before deciding
    # anything. If the limit were ever raised to something large, this would
    # need to stream to disk in chunks instead -- reading a 2 GB upload into
    # memory would take the server down on its own.
    data = await file.read()

    if len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file is empty.",
        )

    # Checked AFTER reading rather than trusting a size sent by the browser,
    # for the same reason as everything else here: a claim from the client is
    # not a fact.
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            # 413 is the specific code for "your request body is too large",
            # rather than the vague 400. Worth using the exact one: the browser
            # and any proxy in between both understand it.
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"That image is {len(data) // (1024 * 1024)} MB. "
                f"The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
            ),
        )

    image_type = _detect_image_type(data)

    if image_type is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file is not an image. JPEG, PNG, GIF and WebP are accepted.",
        )

    try:
        # folder keeps posts and avatars in separate places in the Cloudinary
        # account, which makes it possible to find and manage them later.
        #
        # resource_type="image" tells Cloudinary to refuse anything that is not
        # an image. Belt and braces: our check above already ran, and this means
        # a mistake in it does not become Cloudinary hosting arbitrary files.
        result = cloudinary.uploader.upload(
            data,
            folder=folder,
            resource_type="image",
        )
    except Exception as error:
        # Cloudinary being unreachable is not something the user did, and it is
        # not something they can fix -- so say so plainly rather than showing a
        # stack trace or a silent failure.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not upload that image. Please try again.",
        ) from error

    return UploadedImage(url=result["secure_url"], public_id=result["public_id"])


def delete_image(public_id: str | None) -> None:
    """Remove a photo from Cloudinary. Never raises.

    WHY THIS REFUSES TO FAIL.

    It is called while deleting a post, after the user has already confirmed.
    If Cloudinary is unreachable at that moment, the right outcome is still that
    the post goes -- the user asked for it and they should not be told their
    delete failed because a storage service was slow.

    The cost is one file left behind on Cloudinary, which is untidy and harmless.
    The alternative is a post that will not delete, which is neither.

    So the failure is logged and swallowed. This is a deliberate exception to the
    usual rule that errors should be surfaced: the caller has nothing useful to
    do with this one.
    """
    # Empty for every photo posted before Phase 12 -- those are links pasted
    # from other websites and are not on Cloudinary at all. Asking Cloudinary to
    # delete a file it has never heard of is a request that cannot succeed.
    if not public_id:
        return

    try:
        cloudinary.uploader.destroy(public_id)
    except Exception:
        logging.warning("Could not delete %s from Cloudinary", public_id)
