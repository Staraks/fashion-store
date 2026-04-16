import requests
from django.db import connection

AI_URL = "http://127.0.0.1:8001/search-by-image"


def search_products_by_image(image_file):

    response = requests.post(
        AI_URL,
        files={"file": image_file}
    )

    embedding = response.json()["embedding"]

    with connection.cursor() as cursor:

        cursor.execute(
            """
            SELECT 
                product_id,
                1 - (embedding <=> %s::vector) AS similarity
            FROM product_images
            WHERE embedding <=> %s::vector < 0.5
            ORDER BY embedding <=> %s::vector
            LIMIT 10
            """,
            [embedding, embedding, embedding]
        )

        rows = cursor.fetchall()

    results = [
        {
            "product_id": r[0],
            "similarity": float(r[1])
        }
        for r in rows
    ]

    return results