import json
import logging
from decimal import Decimal

from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.db.models import Prefetch, Q
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Cart, CartItem, Category, Favorite, Gender, Order, OrderDetail, Product, ProductSize, ProductVariant, Size
from .serializers import (
    AccountStateSyncSerializer,
    LoginSerializer,
    OrderCreateSerializer,
    ProductCreateSerializer,
    ProductSerializer,
    RegisterSerializer,
    UserSerializer,
)
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
    return set(Product.objects.order_by("-created_at").values_list("id", flat=True)[:4])


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
            {"detail": "Invalid username, email, or password."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            "token": token.key,
            "user": UserSerializer(user).data,
        }
    )

def _user_can_manage_admin(user):
    if not user or not user.is_authenticated:
        return False

    elevated_roles = {"admin", "manager", "content_manager", "staff"}
    return bool(user.is_staff or user.is_superuser or user.role in elevated_roles)


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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    return Response(UserSerializer(request.user).data)


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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_order(request):
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

    return Response({"orderId": order.id}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_catalog_options(request):
    if not _user_can_manage_admin(request.user):
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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_create_product(request):
    if not _user_can_manage_admin(request.user):
        return _admin_forbidden_response()

    raw_sizes = request.data.get("sizes")
    parsed_sizes = raw_sizes
    if isinstance(raw_sizes, str):
        try:
            parsed_sizes = json.loads(raw_sizes)
        except json.JSONDecodeError:
            parsed_sizes = raw_sizes

    payload = {
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
    products = _get_product_queryset().filter(id__in=featured_ids).order_by("-created_at")
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


@api_view(["POST"])
@permission_classes([AllowAny])
def search_by_image(request):
    image = request.FILES["file"]
    results = search_products_by_image(image)
    product_ids = [result["product_id"] for result in results]
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
