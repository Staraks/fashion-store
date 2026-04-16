import requests


AI_SERVICE_URL = "http://127.0.0.1:8001/embedding"


def get_image_embedding(image_path: str):

    with open(image_path, "rb") as f:
        files = {"file": f}

        response = requests.post(
            AI_SERVICE_URL,
            files=files,
            timeout=30
        )

    response.raise_for_status()

    data = response.json()

    return data["embedding"]

