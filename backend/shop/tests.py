import json
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    Cart,
    CartItem,
    Category,
    Favorite,
    Gender,
    Order,
    OrderDetail,
    Product,
    ProductGender,
    ProductSize,
    ProductVariant,
    Review,
    Size,
)
from .services.email_service import (
    send_order_delivered_email,
    send_order_receipt_email,
    send_password_reset_email,
)


User = get_user_model()

TEST_MEDIA_ROOT = tempfile.mkdtemp()


def create_user(username="user", email="user@example.com", role="user", password="StrongPass123!", **kwargs):
    return User.objects.create_user(
        username=username,
        email=email,
        password=password,
        role=role,
        **kwargs,
    )


def auth_client(user):
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=user)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


def create_catalog_product(
    name="Test hoodie",
    brand="Acne",
    base_price=Decimal("1000.00"),
    discount_percent=Decimal("0.00"),
    stock_quantity=10,
):
    gender = Gender.objects.create(name="male")
    size = Size.objects.create(size_name="M")
    category = Category.objects.create(name="Hoodies", slug="hoodies")
    product = Product.objects.create(
        name=name,
        brand=brand,
        material="cotton",
        description="Warm hoodie",
        base_price=base_price,
        discount_percent=discount_percent,
        category=category,
    )
    ProductGender.objects.create(product=product, gender=gender)
    variant = ProductVariant.objects.create(product=product, color="black")
    product_size = ProductSize.objects.create(
        variant=variant,
        size=size,
        stock_quantity=stock_quantity,
    )
    return {
        "gender": gender,
        "size": size,
        "category": category,
        "product": product,
        "variant": variant,
        "product_size": product_size,
    }


@override_settings(
    MEDIA_ROOT=TEST_MEDIA_ROOT,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="noreply@example.com",
    FRONTEND_BASE_URL="http://localhost:3000",
)
class ShopCrudAndApiTests(TestCase):
    def test_model_crud_for_core_entities(self):
        user = create_user()
        gender = Gender.objects.create(name="female")
        size = Size.objects.create(size_name="S")
        category = Category.objects.create(name="Dresses", slug="dresses")
        product = Product.objects.create(
            name="Silk dress",
            brand="Toteme",
            base_price=Decimal("15000.00"),
            category=category,
        )
        ProductGender.objects.create(product=product, gender=gender)
        variant = ProductVariant.objects.create(product=product, color="ivory")
        product_size = ProductSize.objects.create(variant=variant, size=size, stock_quantity=3)
        review = Review.objects.create(user=user, product=product, rating=5, comment="Great fit")
        favorite = Favorite.objects.create(user=user, product=product)
        cart = Cart.objects.create(user=user)
        cart_item = CartItem.objects.create(cart=cart, product_size=product_size, quantity=2)
        order = Order.objects.create(user=user, total_amount=Decimal("30000.00"), shipping_address="Moscow")
        order_detail = OrderDetail.objects.create(
            order=order,
            product_size=product_size,
            price=Decimal("15000.00"),
            quantity=2,
        )

        product.name = "Silk evening dress"
        product.save(update_fields=["name"])
        review.rating = 4
        review.save(update_fields=["rating"])
        cart_item.quantity = 1
        cart_item.save(update_fields=["quantity"])
        order.status = "processing"
        order.save(update_fields=["status"])

        self.assertEqual(Product.objects.get(id=product.id).name, "Silk evening dress")
        self.assertEqual(Review.objects.get(id=review.id).rating, 4)
        self.assertEqual(CartItem.objects.get(id=cart_item.id).quantity, 1)
        self.assertEqual(Order.objects.get(id=order.id).status, "processing")

        order_detail.delete()
        cart_item.delete()
        favorite.delete()
        review.delete()
        product.delete()

        self.assertFalse(OrderDetail.objects.filter(id=order_detail.id).exists())
        self.assertFalse(CartItem.objects.filter(id=cart_item.id).exists())
        self.assertFalse(Favorite.objects.filter(id=favorite.id).exists())
        self.assertFalse(Review.objects.filter(id=review.id).exists())
        self.assertFalse(Product.objects.filter(id=product.id).exists())

    def test_public_product_api_filters_detail_and_reviews(self):
        data = create_catalog_product()
        product = data["product"]
        user = create_user()

        response = self.client.get("/api/products/", {"gender": "men", "brand": "Acne"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], str(product.id))

        response = self.client.get(f"/api/products/{product.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], product.name)

        response = self.client.get("/api/products/filters/", {"gender": "men"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("Acne", response.data["brands"])

        response = self.client.post(f"/api/products/{product.id}/reviews/", {"rating": 5, "comment": "Love it"})
        self.assertEqual(response.status_code, 401)

        client = auth_client(user)
        response = client.post(f"/api/products/{product.id}/reviews/", {"rating": 5, "comment": "Love it"})
        self.assertEqual(response.status_code, 201)
        review = Review.objects.get(user=user, product=product)
        self.assertEqual(review.rating, 5)
        self.assertEqual(review.status, Review.STATUS_PENDING)

        response = self.client.get(f"/api/products/{product.id}/reviews/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reviewsCount"], 0)

        content_manager = create_user(
            username="content_reviews",
            email="content_reviews@example.com",
            role="content_manager",
        )
        response = auth_client(content_manager).get("/api/admin/reviews/", {"status": Review.STATUS_PENDING})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], review.id)
        self.assertEqual(response.data[0]["productName"], product.name)

        response = auth_client(content_manager).patch(
            f"/api/admin/reviews/{review.id}/",
            {"status": Review.STATUS_APPROVED},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        review.refresh_from_db()
        self.assertEqual(review.status, Review.STATUS_APPROVED)
        self.assertEqual(review.moderated_by, content_manager)

        response = self.client.get(f"/api/products/{product.id}/reviews/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reviewsCount"], 1)

        response = client.post(f"/api/products/{product.id}/reviews/", {"rating": 4, "comment": "Still good"})
        self.assertEqual(response.status_code, 200)
        review.refresh_from_db()
        self.assertEqual(review.rating, 4)
        self.assertEqual(review.status, Review.STATUS_PENDING)

    def test_authentication_and_current_user_flow(self):
        register_payload = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
        }
        response = self.client.post("/api/auth/register/", register_payload)
        self.assertEqual(response.status_code, 201)
        self.assertIn("token", response.data)

        response = self.client.post(
            "/api/auth/login/",
            {"identifier": "newuser@example.com", "password": "StrongPass123!"},
        )
        self.assertEqual(response.status_code, 200)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        response = client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "newuser@example.com")

        response = client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 204)
        response = client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_role_based_admin_authorization(self):
        create_catalog_product()
        regular = create_user(username="regular", email="regular@example.com")
        content_manager = create_user(
            username="content",
            email="content@example.com",
            role="content_manager",
        )
        sales_manager = create_user(
            username="sales",
            email="sales@example.com",
            role="sales_manager",
        )
        admin = create_user(username="admin", email="admin@example.com", role="admin")

        self.assertEqual(auth_client(regular).get("/api/admin/catalog/options/").status_code, 403)
        self.assertEqual(auth_client(regular).get("/api/admin/reviews/").status_code, 403)
        self.assertEqual(auth_client(content_manager).get("/api/admin/catalog/options/").status_code, 200)
        self.assertEqual(auth_client(content_manager).get("/api/admin/reviews/").status_code, 200)
        self.assertEqual(auth_client(content_manager).get("/api/admin/orders/").status_code, 403)
        self.assertEqual(auth_client(sales_manager).get("/api/admin/orders/").status_code, 200)
        self.assertEqual(auth_client(sales_manager).get("/api/admin/users/").status_code, 403)

        response = auth_client(admin).patch(
            f"/api/admin/users/{regular.id}/",
            {"role": "content_manager"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        regular.refresh_from_db()
        self.assertEqual(regular.role, "content_manager")

    def test_admin_product_api_crud(self):
        category = Category.objects.create(name="Outerwear", slug="outerwear")
        gender = Gender.objects.create(name="male")
        size = Size.objects.create(size_name="L")
        content_manager = create_user(
            username="content",
            email="content@example.com",
            role="content_manager",
        )
        client = auth_client(content_manager)

        payload = {
            "name": "Wool coat",
            "brand": "Zegna",
            "material": "wool",
            "description": "Winter coat",
            "base_price": "25000.00",
            "discount_percent": "10.00",
            "categoryId": str(category.id),
            "genderIds": [str(gender.id)],
            "color": "navy",
            "sizes": json.dumps([{"sizeId": size.id, "stockQuantity": 5}]),
            "primaryImageIndex": "0",
        }
        response = client.post("/api/admin/products/", payload, format="multipart")
        self.assertEqual(response.status_code, 201)
        product_id = int(response.data["id"])
        self.assertTrue(Product.objects.filter(id=product_id, name="Wool coat").exists())

        response = client.get(f"/api/admin/products/{product_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["brand"], "Zegna")

        payload["name"] = "Updated wool coat"
        payload["sizes"] = json.dumps([{"sizeId": size.id, "stockQuantity": 7}])
        response = client.patch(f"/api/admin/products/{product_id}/", payload, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Product.objects.get(id=product_id).name, "Updated wool coat")
        self.assertEqual(ProductSize.objects.get(variant__product_id=product_id).stock_quantity, 7)

        response = client.delete(f"/api/admin/products/{product_id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Product.objects.filter(id=product_id).exists())

    def test_favorites_cart_order_payment_and_sales_report_flow(self):
        data = create_catalog_product(base_price=Decimal("1200.00"), discount_percent=Decimal("25.00"), stock_quantity=4)
        product = data["product"]
        product_size = data["product_size"]
        user = create_user()
        sales_manager = create_user(username="sales", email="sales@example.com", role="sales_manager")
        client = auth_client(user)

        response = client.post(
            "/api/account/sync/",
            {
                "favorites": [str(product.id)],
                "cart": [{"productId": str(product.id), "size": "M", "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Favorite.objects.filter(user=user, product=product).exists())
        self.assertEqual(CartItem.objects.get(cart__user=user, product_size=product_size).quantity, 2)

        with patch("shop.views.send_order_receipt_email") as receipt_mock:
            with self.captureOnCommitCallbacks(execute=True):
                response = client.post("/api/orders/", {"shipping_address": "Moscow, Tverskaya 1"})

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(user=user)
        self.assertEqual(order.total_amount, Decimal("1800.00"))
        self.assertEqual(order.payment_method, "mock_card")
        self.assertEqual(order.payment_status, "paid")
        self.assertTrue(order.payment_id.startswith("mock_"))
        receipt_mock.assert_called_once_with(order.id)
        self.assertFalse(CartItem.objects.filter(cart__user=user).exists())
        product_size.refresh_from_db()
        self.assertEqual(product_size.stock_quantity, 2)

        today = timezone.localdate()
        response = auth_client(sales_manager).get(
            "/api/admin/reports/sales/",
            {"start": today.isoformat(), "end": today.isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertGreater(len(response.content), 100)

    def test_visual_search_by_image_returns_ranked_products(self):
        data = create_catalog_product()
        product = data["product"]
        upload = SimpleUploadedFile("query.jpg", b"image-bytes", content_type="image/jpeg")

        with patch(
            "shop.views.search_products_by_image",
            return_value=[{"product_id": product.id, "similarity": 0.91}],
        ) as search_mock:
            response = self.client.post("/api/search-by-image/?gender=men", {"file": upload}, format="multipart")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], str(product.id))
        self.assertEqual(response.data[0]["similarity"], 0.91)
        search_mock.assert_called_once()
        self.assertEqual(search_mock.call_args.kwargs["gender_name"], "male")

    def test_email_notifications_are_sent(self):
        data = create_catalog_product()
        user = create_user(name="Customer")
        order = Order.objects.create(
            user=user,
            total_amount=Decimal("1000.00"),
            shipping_address="Moscow",
            created_at=timezone.now() - timedelta(minutes=5),
        )
        OrderDetail.objects.create(
            order=order,
            product_size=data["product_size"],
            price=Decimal("1000.00"),
            quantity=1,
        )

        send_order_receipt_email(order.id)
        send_password_reset_email(user.id)
        send_order_delivered_email(order.id)

        self.assertEqual(len(mail.outbox), 3)
        self.assertEqual(mail.outbox[0].to, [user.email])
        self.assertIn(str(order.id), mail.outbox[0].subject)
        self.assertIn("/#/reset-password/", mail.outbox[1].body)
        self.assertIn(str(order.id), mail.outbox[2].subject)
