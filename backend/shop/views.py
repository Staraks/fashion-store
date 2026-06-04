import json
import logging
import os
import uuid
import zipfile
from collections import defaultdict
from datetime import datetime, time
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.contrib.auth import authenticate, get_user_model
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Avg, Prefetch, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Cart, CartItem, Category, Favorite, Gender, Order, OrderDetail, Product, ProductSize, ProductVariant, Review, Size
from .serializers import (
    AccountStateSyncSerializer,
    AdminOrderSerializer,
    AdminProductDetailSerializer,
    AdminReviewSerializer,
    AdminReviewStatusUpdateSerializer,
    AdminUserRoleUpdateSerializer,
    AdminUserSerializer,
    LoginSerializer,
    OrderSerializer,
    OrderCreateSerializer,
    OrderStatusUpdateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProductCreateSerializer,
    ProductSerializer,
    ReviewCreateSerializer,
    ReviewSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .services.email_service import send_order_delivered_email, send_order_receipt_email, send_password_reset_email
from .services.search_service import search_products_by_image

User = get_user_model()
logger = logging.getLogger(__name__)

GENDER_NAME_MAP = {
    "men": "male",
    "male": "male",
    "women": "female",
    "female": "female",
}


def _get_product_queryset():
    return Product.objects.select_related("category").prefetch_related(
        "genders",
        "images",
        Prefetch(
            "variants",
            queryset=ProductVariant.objects.prefetch_related(
                Prefetch("sizes", queryset=ProductSize.objects.select_related("size"))
            ),
        ),
    )


def _filter_products(queryset, gender=None, category_slug=None, subcategory_slug=None, brand=None):
    if gender:
        normalized = gender.strip().lower()
        mapped_gender = GENDER_NAME_MAP.get(normalized)
        if mapped_gender:
            queryset = queryset.filter(genders__name__iexact=mapped_gender)
        elif normalized == "accessories":
            queryset = queryset.filter(category__name__icontains="access")
    
    if category_slug:
        normalized_category = category_slug.strip().lower()
        queryset = queryset.filter(
            Q(category__slug__iexact=normalized_category)
            | Q(category__parent__slug__iexact=normalized_category)
            | Q(category__name__iexact=normalized_category)
            | Q(category__parent__name__iexact=normalized_category)
        )

    if subcategory_slug:
        normalized_subcategory = subcategory_slug.strip().lower()
        queryset = queryset.filter(
            Q(category__slug__iexact=normalized_subcategory)
            | Q(category__name__iexact=normalized_subcategory)
        )

    if brand:
        queryset = queryset.filter(brand__iexact=brand.strip())

    return queryset.distinct()


def _get_featured_ids():
    featured_ids = list(
        OrderDetail.objects.values("product_size__variant__product_id")
        .annotate(total_sold=Sum("quantity"))
        .order_by("-total_sold", "-product_size__variant__product__created_at")
        .values_list("product_size__variant__product_id", flat=True)[:4]
    )

    if len(featured_ids) < 4:
        fallback_ids = list(
            Product.objects.exclude(id__in=featured_ids)
            .order_by("-created_at")
            .values_list("id", flat=True)[: 4 - len(featured_ids)]
        )
        featured_ids.extend(fallback_ids)

    return featured_ids


def _final_product_price(product):
    discount = product.discount_percent or Decimal("0")
    return product.base_price * (Decimal("100") - discount) / Decimal("100")


def _get_or_create_cart(user):
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


def _find_product_size(product_id, size_name):
    return (
        ProductSize.objects.select_related("variant__product", "size")
        .filter(variant__product_id=product_id, size__size_name=size_name)
        .order_by("id")
        .first()
    )


def _serialize_product(product, request, featured_ids):
    return ProductSerializer(
        product,
        context={"request": request, "featured_ids": featured_ids},
    ).data


def _serialize_cart_items(cart_items, request, featured_ids):
    items = []
    for cart_item in cart_items:
        product_data = _serialize_product(cart_item.product_size.variant.product, request, featured_ids)
        product_data["quantity"] = cart_item.quantity
        product_data["selectedSize"] = cart_item.product_size.size.size_name
        items.append(product_data)
    return items


def _serialize_account_state(user, request):
    featured_ids = _get_featured_ids()
    favorite_products = (
        Product.objects.filter(favorite__user=user)
        .select_related("category")
        .prefetch_related("genders", "images", "variants__sizes__size")
        .distinct()
    )
    favorite_data = ProductSerializer(
        favorite_products,
        many=True,
        context={"request": request, "featured_ids": featured_ids},
    ).data

    cart = _get_or_create_cart(user)
    cart_items = (
        CartItem.objects.filter(cart=cart)
        .select_related("product_size__size", "product_size__variant__product__category")
        .prefetch_related(
            "product_size__variant__product__genders",
            "product_size__variant__product__images",
            "product_size__variant__product__variants__sizes__size",
        )
    )
    cart_data = _serialize_cart_items(cart_items, request, featured_ids)

    return {
        "favorites": favorite_data,
        "cart": cart_data,
    }


def _sync_user_state(user, request, favorites, cart_items):
    featured_ids = _get_featured_ids()
    favorite_ids = []
    for favorite_id in favorites:
        try:
            favorite_ids.append(int(favorite_id))
        except (TypeError, ValueError):
            continue

    Favorite.objects.filter(user=user).exclude(product_id__in=favorite_ids).delete()
    existing_favorite_ids = set(
        Favorite.objects.filter(user=user, product_id__in=favorite_ids).values_list("product_id", flat=True)
    )
    Favorite.objects.bulk_create(
        [
            Favorite(user=user, product_id=product_id)
            for product_id in favorite_ids
            if product_id not in existing_favorite_ids
        ],
        ignore_conflicts=True,
    )

    cart = _get_or_create_cart(user)
    CartItem.objects.filter(cart=cart).delete()
    new_cart_items = []
    for item in cart_items:
        try:
            product_id = int(item["productId"])
        except (TypeError, ValueError):
            continue

        product_size = _find_product_size(product_id, item["size"])
        if not product_size:
            continue

        new_cart_items.append(
            CartItem(
                cart=cart,
                product_size=product_size,
                quantity=item["quantity"],
            )
        )

    CartItem.objects.bulk_create(new_cart_items)
    return _serialize_account_state(user, request)


@api_view(["POST"])
@permission_classes([AllowAny])
def register_user(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    token, _ = Token.objects.get_or_create(user=user)

    return Response(
        {
            "token": token.key,
            "user": UserSerializer(user).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def login_user(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    identifier = serializer.validated_data["identifier"].strip()
    password = serializer.validated_data["password"]
    matched_user = User.objects.filter(
        Q(email__iexact=identifier) | Q(username__iexact=identifier)
    ).first()
    username = matched_user.username if matched_user else identifier
    user = authenticate(request, username=username, password=password)

    if not user:
        return Response(
            {"detail": "Неверная почта, имя пользователя или пароль."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            "token": token.key,
            "user": UserSerializer(user).data,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_password_reset(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data.get("email")
    if email and email != (request.user.email or "").lower():
        return Response(
            {"email": "Use the email address from your account."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    transaction.on_commit(lambda user_id=request.user.id: send_password_reset_email(user_id))
    return Response({"detail": "Password reset email has been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_password_reset(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    Token.objects.filter(user=serializer.validated_data["user"]).delete()
    return Response({"detail": "Password has been changed."})

def _user_can_manage_admin(user):
    if not user or not user.is_authenticated:
        return False

    return any(
        [
            _user_can_manage_catalog(user),
            _user_can_moderate_reviews(user),
            _user_can_manage_orders(user),
            _user_can_view_reports(user),
        ]
    )


def _user_is_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or user.role == "admin"))


def _user_can_manage_catalog(user):
    return bool(user and user.is_authenticated and (_user_is_admin(user) or user.role == "content_manager"))


def _user_can_moderate_reviews(user):
    return bool(user and user.is_authenticated and (_user_is_admin(user) or user.role == "content_manager"))


def _user_can_manage_orders(user):
    return bool(user and user.is_authenticated and (_user_is_admin(user) or user.role == "sales_manager"))


def _user_can_view_reports(user):
    return bool(user and user.is_authenticated and (_user_is_admin(user) or user.role == "sales_manager"))


def _user_can_manage_users(user):
    return _user_is_admin(user)


def _admin_forbidden_response():
    return Response(
        {"detail": "You do not have permission to access the admin panel."},
        status=status.HTTP_403_FORBIDDEN,
    )


def _resolve_root_category(category):
    current = category
    while current and current.parent_id:
        current = current.parent
    return current


def _get_category_size_group(category):
    root = _resolve_root_category(category)
    root_name = (root.name if root else "").strip().lower()

    if "джинс" in root_name or "брюк" in root_name:
        return "denim"
    if "обув" in root_name:
        return "shoes"
    return "alpha"


def _build_admin_product_payload(request):
    raw_sizes = request.data.get("sizes")
    parsed_sizes = raw_sizes
    if isinstance(raw_sizes, str):
        try:
            parsed_sizes = json.loads(raw_sizes)
        except json.JSONDecodeError:
            parsed_sizes = raw_sizes

    return {
        "name": request.data.get("name"),
        "brand": request.data.get("brand", ""),
        "material": request.data.get("material", ""),
        "description": request.data.get("description", ""),
        "base_price": request.data.get("base_price"),
        "discount_percent": request.data.get("discount_percent", "0"),
        "categoryId": request.data.get("categoryId"),
        "genderIds": request.data.getlist("genderIds"),
        "color": request.data.get("color"),
        "sizes": parsed_sizes,
        "images": request.FILES.getlist("images"),
        "primaryImageIndex": request.data.get("primaryImageIndex", 0),
    }


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def current_user(request):
    if request.method == "GET":
        return Response(UserSerializer(request.user, context={"request": request}).data)

    avatar = request.FILES.get("avatar")
    if not avatar:
        return Response({"detail": "Avatar file is required."}, status=status.HTTP_400_BAD_REQUEST)

    content_type = getattr(avatar, "content_type", "") or ""
    if not content_type.startswith("image/"):
        return Response({"detail": "Avatar must be an image."}, status=status.HTTP_400_BAD_REQUEST)

    extension = os.path.splitext(avatar.name)[1].lower() or ".jpg"
    avatar_path = default_storage.save(f"avatars/{uuid.uuid4()}{extension}", avatar)

    if request.user.avatar_path and default_storage.exists(request.user.avatar_path):
        default_storage.delete(request.user.avatar_path)

    request.user.avatar_path = avatar_path
    request.user.save(update_fields=["avatar_path"])

    return Response(UserSerializer(request.user, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_user(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def account_state(request):
    return Response(_serialize_account_state(request.user, request))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_account_state(request):
    serializer = AccountStateSyncSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    state = _sync_user_state(
        request.user,
        request,
        serializer.validated_data["favorites"],
        serializer.validated_data["cart"],
    )
    return Response(state)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def create_order(request):
    if request.method == "GET":
        orders = (
            Order.objects.filter(user=request.user)
            .prefetch_related(
                "orderdetail_set__product_size__size",
                "orderdetail_set__product_size__variant__product__images",
            )
            .order_by("-created_at")
        )
        serializer = OrderSerializer(orders, many=True, context={"request": request})
        return Response(serializer.data)

    serializer = OrderCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    with transaction.atomic():
        cart = _get_or_create_cart(request.user)
        cart_items = list(
            CartItem.objects.select_for_update()
            .filter(cart=cart)
            .select_related("product_size__variant__product", "product_size__size")
        )
        if not cart_items:
            return Response({"detail": "Cart is empty."}, status=status.HTTP_400_BAD_REQUEST)

        product_size_ids = [item.product_size_id for item in cart_items]
        locked_sizes = {
            size.id: size
            for size in ProductSize.objects.select_for_update()
            .select_related("variant__product", "size")
            .filter(id__in=product_size_ids)
        }

        for item in cart_items:
            product_size = locked_sizes.get(item.product_size_id)
            if not product_size:
                return Response(
                    {"detail": "Some items in the cart are no longer available."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if product_size.stock_quantity < item.quantity:
                return Response(
                    {
                        "detail": (
                            f"Not enough stock for {product_size.variant.product.name} "
                            f"({product_size.size.size_name})."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        total_amount = sum(
            _final_product_price(item.product_size.variant.product) * item.quantity for item in cart_items
        )
        order = Order.objects.create(
            user=request.user,
            total_amount=total_amount,
            shipping_address=serializer.validated_data["shipping_address"],
            status="new",
            payment_method="mock_card",
            payment_status="paid",
            payment_id=f"mock_{uuid.uuid4().hex[:12]}",
        )

        OrderDetail.objects.bulk_create(
            [
                OrderDetail(
                    order=order,
                    product_size=item.product_size,
                    price=_final_product_price(item.product_size.variant.product),
                    quantity=item.quantity,
                )
                for item in cart_items
            ]
        )

        for item in cart_items:
            product_size = locked_sizes[item.product_size_id]
            product_size.stock_quantity -= item.quantity

        ProductSize.objects.bulk_update(locked_sizes.values(), ["stock_quantity", "updated_at"])
        CartItem.objects.filter(cart=cart).delete()
        transaction.on_commit(lambda order_id=order.id: send_order_receipt_email(order_id))

    return Response(
        {"orderId": order.id, "paymentId": order.payment_id},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_catalog_options(request):
    if not _user_can_manage_catalog(request.user):
        return _admin_forbidden_response()

    categories = list(Category.objects.select_related("parent").order_by("parent__name", "name"))
    genders = Gender.objects.order_by("name").values("id", "name")
    sizes = Size.objects.order_by("size_name").values("id", "size_name")
    brands = (
        Product.objects.exclude(brand="")
        .order_by("brand")
        .values_list("brand", flat=True)
        .distinct()
    )

    return Response(
        {
            "categories": [
                {
                    "id": category.id,
                    "name": category.name,
                    "slug": category.slug,
                    "parentId": category.parent_id,
                    "parentName": category.parent.name if category.parent else None,
                    "sizeGroup": _get_category_size_group(category),
                }
                for category in categories
            ],
            "genders": list(genders),
            "sizes": [
                {
                    "id": size["id"],
                    "name": size["size_name"],
                }
                    for size in sizes
            ],
            "brands": list(brands),
        }
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def admin_products(request):
    if not _user_can_manage_catalog(request.user):
        return _admin_forbidden_response()

    if request.method == "GET":
        category_slug = request.query_params.get("category")
        subcategory = request.query_params.get("subcategory")
        brand = request.query_params.get("brand")
        featured_ids = _get_featured_ids()
        products = _filter_products(
            _get_product_queryset(),
            category_slug=category_slug,
            subcategory_slug=subcategory,
            brand=brand,
        ).order_by("-created_at")
        serializer = ProductSerializer(
            products,
            many=True,
            context={"request": request, "featured_ids": featured_ids},
        )
        return Response(serializer.data)

    payload = _build_admin_product_payload(request)

    serializer = ProductCreateSerializer(data=payload)
    if not serializer.is_valid():
        logger.warning(
            "Admin product create validation failed. payload=%s errors=%s",
            {
                "name": payload.get("name"),
                "brand_length": len(payload.get("brand") or ""),
                "material_length": len(payload.get("material") or ""),
                "description_length": len(payload.get("description") or ""),
                "categoryId": payload.get("categoryId"),
                "genderIds": payload.get("genderIds"),
                "color": payload.get("color"),
                "sizes_type": type(payload.get("sizes")).__name__,
                "sizes": payload.get("sizes"),
                "images_count": len(payload.get("images") or []),
            },
            serializer.errors,
        )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    product = serializer.save()

    product = _get_product_queryset().get(id=product.id)
    return Response(
        _serialize_product(product, request, _get_featured_ids()),
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def admin_product_detail_manage(request, product_id):
    if not _user_can_manage_catalog(request.user):
        return _admin_forbidden_response()

    product = (
        Product.objects.select_related("category", "category__parent")
        .prefetch_related("genders", "images", "variants__sizes")
        .filter(id=product_id)
        .first()
    )
    if not product:
        return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = AdminProductDetailSerializer(product, context={"request": request})
        return Response(serializer.data)

    if request.method == "DELETE":
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    payload = _build_admin_product_payload(request)
    serializer = ProductCreateSerializer(instance=product, data=payload)
    if not serializer.is_valid():
        logger.warning(
            "Admin product update validation failed. product_id=%s payload=%s errors=%s",
            product_id,
            {
                "name": payload.get("name"),
                "brand_length": len(payload.get("brand") or ""),
                "material_length": len(payload.get("material") or ""),
                "description_length": len(payload.get("description") or ""),
                "categoryId": payload.get("categoryId"),
                "genderIds": payload.get("genderIds"),
                "color": payload.get("color"),
                "sizes_type": type(payload.get("sizes")).__name__,
                "sizes": payload.get("sizes"),
                "images_count": len(payload.get("images") or []),
            },
            serializer.errors,
        )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    updated_product = serializer.save()
    updated_product = _get_product_queryset().get(id=updated_product.id)
    return Response(_serialize_product(updated_product, request, _get_featured_ids()))


def _get_admin_review_queryset():
    return (
        Review.objects.select_related("user", "product", "moderated_by")
        .order_by("-updated_at", "-created_at")
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_reviews(request):
    if not _user_can_moderate_reviews(request.user):
        return _admin_forbidden_response()

    review_status = request.query_params.get("status")
    reviews = _get_admin_review_queryset()
    if review_status:
        reviews = reviews.filter(status=review_status)

    return Response(AdminReviewSerializer(reviews, many=True, context={"request": request}).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_review_detail_manage(request, review_id):
    if not _user_can_moderate_reviews(request.user):
        return _admin_forbidden_response()

    review = _get_admin_review_queryset().filter(id=review_id).first()
    if not review:
        return Response({"detail": "Review not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = AdminReviewStatusUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    review.status = serializer.validated_data["status"]
    review.moderated_by = request.user
    review.moderated_at = timezone.now()
    review.save(update_fields=["status", "moderated_by", "moderated_at", "updated_at"])

    return Response(AdminReviewSerializer(review, context={"request": request}).data)


def _get_admin_order_queryset():
    return (
        Order.objects.select_related("user")
        .prefetch_related(
            "orderdetail_set__product_size__size",
            "orderdetail_set__product_size__variant__product__images",
        )
        .order_by("-created_at")
    )


def _column_name(index):
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _xlsx_cell(value, row_index, column_index):
    reference = f"{_column_name(column_index)}{row_index}"
    if value is None:
        return f'<c r="{reference}"/>'
    if isinstance(value, (int, float, Decimal)):
        return f'<c r="{reference}"><v>{value}</v></c>'

    text = escape(str(value))
    return f'<c r="{reference}" t="inlineStr"><is><t>{text}</t></is></c>'


def _xlsx_sheet(rows):
    xml_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = "".join(_xlsx_cell(value, row_index, column_index) for column_index, value in enumerate(row, start=1))
        xml_rows.append(f'<row r="{row_index}">{cells}</row>')

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        '</worksheet>'
    )


def _build_xlsx_workbook(sheets):
    buffer = BytesIO()
    workbook_sheets = []
    workbook_rels = []
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    ]

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>',
        )

        for sheet_index, (sheet_name, rows) in enumerate(sheets, start=1):
            safe_name = escape(sheet_name, {'"': "&quot;"})
            workbook_sheets.append(f'<sheet name="{safe_name}" sheetId="{sheet_index}" r:id="rId{sheet_index}"/>')
            workbook_rels.append(
                f'<Relationship Id="rId{sheet_index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{sheet_index}.xml"/>'
            )
            overrides.append(
                f'<Override PartName="/xl/worksheets/sheet{sheet_index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            )
            workbook.writestr(f"xl/worksheets/sheet{sheet_index}.xml", _xlsx_sheet(rows))

        workbook.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets>{"".join(workbook_sheets)}</sheets>'
            '</workbook>',
        )
        workbook.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'{"".join(workbook_rels)}'
            '</Relationships>',
        )
        workbook.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f'{"".join(overrides)}'
            '</Types>',
        )

    return buffer.getvalue()


def _parse_report_period(request):
    start_value = request.query_params.get("start")
    end_value = request.query_params.get("end")

    if not start_value or not end_value:
        return None, None, Response({"detail": "Select start and end dates."}, status=status.HTTP_400_BAD_REQUEST)

    start_date = parse_date(start_value)
    end_date = parse_date(end_value)
    if not start_date or not end_date:
        return None, None, Response({"detail": "Use dates in YYYY-MM-DD format."}, status=status.HTTP_400_BAD_REQUEST)
    if start_date > end_date:
        return None, None, Response({"detail": "Start date must be before or equal to end date."}, status=status.HTTP_400_BAD_REQUEST)

    start_at = timezone.make_aware(datetime.combine(start_date, time.min))
    end_at = timezone.make_aware(datetime.combine(end_date, time.max))
    return start_at, end_at, None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_sales_report(request):
    if not _user_can_view_reports(request.user):
        return _admin_forbidden_response()

    start_at, end_at, error_response = _parse_report_period(request)
    if error_response:
        return error_response

    orders = list(
        _get_admin_order_queryset()
        .filter(created_at__gte=start_at, created_at__lte=end_at)
        .exclude(status="cancelled")
    )

    total_revenue = sum((order.total_amount for order in orders), Decimal("0"))
    total_items = sum(item.quantity for order in orders for item in order.orderdetail_set.all())
    product_totals = defaultdict(lambda: {"quantity": 0, "revenue": Decimal("0")})

    order_rows = [
        ["ID заказа", "Дата", "Статус", "Покупатель", "Email", "Адрес доставки", "Позиций", "Сумма"]
    ]
    item_rows = [
        ["ID заказа", "Дата", "Покупатель", "Email", "Бренд", "Товар", "Размер", "Количество", "Цена", "Сумма"]
    ]

    for order in orders:
        customer_name = order.user.username if order.user else "Пользователь удален"
        customer_email = order.user.email if order.user else ""
        order_items = list(order.orderdetail_set.all())
        order_rows.append(
            [
                order.id,
                timezone.localtime(order.created_at).strftime("%d.%m.%Y %H:%M"),
                order.status,
                customer_name,
                customer_email,
                order.shipping_address,
                sum(item.quantity for item in order_items),
                order.total_amount,
            ]
        )

        for item in order_items:
            product = item.product_size.variant.product
            size_name = item.product_size.size.size_name
            line_total = item.price * item.quantity
            product_key = (product.id, product.brand, product.name)
            product_totals[product_key]["quantity"] += item.quantity
            product_totals[product_key]["revenue"] += line_total
            item_rows.append(
                [
                    order.id,
                    timezone.localtime(order.created_at).strftime("%d.%m.%Y %H:%M"),
                    customer_name,
                    customer_email,
                    product.brand,
                    product.name,
                    size_name,
                    item.quantity,
                    item.price,
                    line_total,
                ]
            )

    product_rows = [["ID товара", "Бренд", "Товар", "Продано, шт.", "Выручка"]]
    for (product_id, brand, name), totals in sorted(
        product_totals.items(),
        key=lambda row: row[1]["revenue"],
        reverse=True,
    ):
        product_rows.append([product_id, brand, name, totals["quantity"], totals["revenue"]])

    summary_rows = [
        ["Отчет по продажам"],
        ["Период", f"{start_at.date().isoformat()} - {end_at.date().isoformat()}"],
        ["Заказов", len(orders)],
        ["Продано товаров", total_items],
        ["Выручка", total_revenue],
        ["Исключены статусы", "cancelled"],
    ]

    workbook = _build_xlsx_workbook(
        [
            ("Сводка", summary_rows),
            ("Заказы", order_rows),
            ("Товары", item_rows),
            ("По товарам", product_rows),
        ]
    )
    filename = f"sales-report-{start_at.date().isoformat()}-{end_at.date().isoformat()}.xlsx"
    response = HttpResponse(
        workbook,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_orders(request):
    if not _user_can_manage_orders(request.user):
        return _admin_forbidden_response()

    serializer = AdminOrderSerializer(
        _get_admin_order_queryset(),
        many=True,
        context={"request": request},
    )
    return Response(serializer.data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_order_detail_manage(request, order_id):
    if not _user_can_manage_orders(request.user):
        return _admin_forbidden_response()

    order = _get_admin_order_queryset().filter(id=order_id).first()
    if not order:
        return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = OrderStatusUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    previous_status = order.status
    order.status = serializer.validated_data["status"]
    order.save(update_fields=["status"])
    if previous_status != "delivered" and order.status == "delivered":
        transaction.on_commit(lambda order_id=order.id: send_order_delivered_email(order_id))

    return Response(AdminOrderSerializer(order, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_users(request):
    if not _user_can_manage_users(request.user):
        return _admin_forbidden_response()

    users = User.objects.order_by("email", "username")
    return Response(AdminUserSerializer(users, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_user_detail_manage(request, user_id):
    if not _user_can_manage_users(request.user):
        return _admin_forbidden_response()

    target_user = User.objects.filter(id=user_id).first()
    if not target_user:
        return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = AdminUserRoleUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    target_user.role = serializer.validated_data["role"]
    target_user.save(update_fields=["role"])
    return Response(AdminUserSerializer(target_user).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def product_list(request):
    gender = request.query_params.get("gender")
    category_slug = request.query_params.get("category")
    subcategory = request.query_params.get("subcategory")
    brand = request.query_params.get("brand")
    featured_ids = _get_featured_ids()

    products = _filter_products(
        _get_product_queryset(),
        gender=gender,
        category_slug=category_slug,
        subcategory_slug=subcategory,
        brand=brand,
    )
    serializer = ProductSerializer(
        products.order_by("-created_at"),
        many=True,
        context={"request": request, "featured_ids": featured_ids},
    )
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def product_filters(request):
    gender = request.query_params.get("gender")
    category_slug = request.query_params.get("category")
    products = _filter_products(_get_product_queryset(), gender=gender)

    category_ids = set()
    subcategory_ids = set()
    brands = sorted({product.brand for product in products if product.brand})

    for product in products:
        if not product.category:
            continue
        if product.category.parent_id:
            category_ids.add(product.category.parent_id)
            subcategory_ids.add(product.category_id)
        else:
            category_ids.add(product.category_id)

    categories = [
        {
            "name": category["name"],
            "slug": category["slug"] or category["name"],
        }
        for category in Category.objects.filter(id__in=category_ids).order_by("name").values("name", "slug")
    ]

    subcategory_queryset = Category.objects.filter(id__in=subcategory_ids)
    if category_slug:
        subcategory_queryset = subcategory_queryset.filter(parent__slug__iexact=category_slug)

    subcategories = [
        {
            "name": category["name"],
            "slug": category["slug"] or category["name"],
            "parentSlug": category["parent__slug"] or category["parent__name"],
        }
        for category in subcategory_queryset.order_by("name").values("name", "slug", "parent__slug", "parent__name")
    ]

    return Response(
        {
            "categories": categories,
            "subcategories": subcategories,
            "brands": brands,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def bestseller_list(request):
    featured_ids = _get_featured_ids()
    products = list(_get_product_queryset().filter(id__in=featured_ids))
    featured_order = {product_id: index for index, product_id in enumerate(featured_ids)}
    products.sort(key=lambda product: featured_order.get(product.id, len(featured_ids)))
    serializer = ProductSerializer(
        products,
        many=True,
        context={"request": request, "featured_ids": featured_ids},
    )
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def product_detail(request, product_id):
    product = _get_product_queryset().filter(id=product_id).first()
    if not product:
        return Response({"detail": "Product not found."}, status=404)

    serializer = ProductSerializer(
        product,
        context={"request": request, "featured_ids": _get_featured_ids()},
    )
    return Response(serializer.data)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def product_reviews(request, product_id):
    product = Product.objects.filter(id=product_id).first()
    if not product:
        return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        reviews = (
            Review.objects.filter(product_id=product_id, status=Review.STATUS_APPROVED)
            .select_related("user")
            .order_by("-updated_at", "-created_at")
        )
        summary = reviews.aggregate(average_rating=Avg("rating"))
        serializer = ReviewSerializer(reviews, many=True, context={"request": request})
        return Response(
            {
                "averageRating": float(summary["average_rating"]) if summary["average_rating"] is not None else None,
                "reviewsCount": reviews.count(),
                "reviews": serializer.data,
            }
        )

    if not request.user or not request.user.is_authenticated:
        return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = ReviewCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    review, created = Review.objects.update_or_create(
        user=request.user,
        product=product,
        defaults={
            "rating": serializer.validated_data["rating"],
            "comment": serializer.validated_data.get("comment", "").strip(),
            "status": Review.STATUS_PENDING,
            "moderated_by": None,
            "moderated_at": None,
        },
    )

    response_serializer = ReviewSerializer(review, context={"request": request})
    return Response(
        response_serializer.data,
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def search_by_image(request):
    image = request.FILES.get("file")
    if not image:
        return Response({"detail": "Image file is required."}, status=status.HTTP_400_BAD_REQUEST)

    requested_gender = request.query_params.get("gender")
    normalized_gender = requested_gender.strip().lower() if requested_gender else None
    mapped_gender = GENDER_NAME_MAP.get(normalized_gender)

    results = search_products_by_image(image, gender_name=mapped_gender)
    product_ids = [result["product_id"] for result in results]

    if not product_ids:
        return Response([])

    featured_ids = _get_featured_ids()

    products = _get_product_queryset().filter(id__in=product_ids)
    serializer = ProductSerializer(
        products,
        many=True,
        context={"request": request, "featured_ids": featured_ids},
    )
    products_data = serializer.data
    similarity_map = {result["product_id"]: result["similarity"] for result in results}

    for product in products_data:
        product["similarity"] = similarity_map.get(int(product["id"]), None)

    products_data.sort(
        key=lambda product: product["similarity"] if product["similarity"] else 0,
        reverse=True,
    )

    return Response(products_data)
