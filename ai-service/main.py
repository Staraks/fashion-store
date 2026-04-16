from fastapi import FastAPI, UploadFile
import shutil
import uuid
import os

from model import get_image_embedding

app = FastAPI()

UPLOAD_DIR = "tmp"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.post("/embedding")
async def create_embedding(file: UploadFile):

    file_id = str(uuid.uuid4())
    path = f"{UPLOAD_DIR}/{file_id}.jpg"

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    embedding = get_image_embedding(path)

    os.remove(path)

    return {
        "embedding": embedding
    }


@app.post("/search-by-image")
async def search_by_image(file: UploadFile):

    file_id = str(uuid.uuid4())
    path = f"{UPLOAD_DIR}/{file_id}.jpg"

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    embedding = get_image_embedding(path)

    os.remove(path)

    return {
        "embedding": embedding
    }