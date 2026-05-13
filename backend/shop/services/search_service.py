import requests
from django.db import connection

AI_URL = "http://127.0.0.1:8001/search-by-image"
MAX_RESULTS = 10
MIN_SIMILARITY = 0.8
MIN_FALLBACK_SIMILARITY = 0.6
FALLBACK_RESULTS = 1


def search_products_by_image(image_file, gender_name=None):
    response = requests.post(
        AI_URL,
        files={"file": image_file}
    )
    response.raise_for_status()

    embedding = response.json()["embedding"]
    gender_filter_sql = ""
    query_params = [embedding]

    if gender_name:
        gender_filter_sql = """
            AND EXISTS (
                SELECT 1
                FROM product_gender pg
                JOIN genders g ON g.id = pg.gender_id
                WHERE pg.product_id = product_images.product_id
                  AND g.name ILIKE %s
            )
        """
        query_params.append(gender_name)

    query_params.append(embedding)

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT
                product_id,
                1 - (embedding <=> %s::vector) AS similarity
            FROM product_images
            WHERE embedding IS NOT NULL
            {gender_filter_sql}
            ORDER BY embedding <=> %s::vector
            LIMIT 100
            """,
            query_params
        )
        rows = cursor.fetchall()

    best_matches_by_product = {}

    for product_id, similarity in rows:
        similarity_value = float(similarity)
        current_best = best_matches_by_product.get(product_id)
        if current_best is None or similarity_value > current_best:
            best_matches_by_product[product_id] = similarity_value

    ranked_results = sorted(
        (
            {
                "product_id": product_id,
                "similarity": similarity,
            }
            for product_id, similarity in best_matches_by_product.items()
        ),
        key=lambda item: item["similarity"],
        reverse=True,
    )

    high_confidence_results = [
        result for result in ranked_results
        if result["similarity"] >= MIN_SIMILARITY
    ]

    if high_confidence_results:
        return high_confidence_results[:MAX_RESULTS]

    fallback_results = [
        result for result in ranked_results
        if result["similarity"] >= MIN_FALLBACK_SIMILARITY
    ]

    return fallback_results[:FALLBACK_RESULTS]
