from django.conf import settings
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.db import transaction
from rest_framework import serializers

from .models import Category, Gender, Order, OrderDetail, Product, ProductImage, ProductSize, ProductVariant, Review, Size

User = get_user_model()

ADMIN_ROLE_CHOICES = ("user", "content_manager", "sales_manager", "admin")

PASSWORD_ERROR_MESSAGES = {
    "password_too_similar": "Пароль слишком похож на ваши личные данные.",
    "password_too_short": "Пароль должен содержать минимум 8 символов.",
    "password_too_common": "Этот пароль слишком простой. Придумайте более сложный пароль.",
    "password_entirely_numeric": "Пароль не должен состоять только из цифр.",
}


def validate_password_ru(password, user):
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        messages = [
            PASSWORD_ERROR_MESSAGES.get(item.code, item.message)
            for item in error.error_list
        ]
        raise serializers.ValidationError(messages)


class UserSerializer(serializers.ModelSerializer):
    isStaff = serializers.BooleanField(source="is_staff", read_only=True)
    isSuperuser = serializers.BooleanField(source="is_superuser", read_only=True)
    avatarUrl = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "username", "role", "isStaff", "isSuperuser", "avatarUrl"]

    def get_avatarUrl(self, obj):
        if not obj.avatar_path:
            return None

        request = self.context.get("request")
        url = f"{settings.MEDIA_URL}{obj.avatar_path}"
        return request.build_absolute_uri(url) if request else url


class AdminUserSerializer(serializers.ModelSerializer):
    isStaff = serializers.BooleanField(source="is_staff", read_only=True)
    isSuperuser = serializers.BooleanField(source="is_superuser", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "isStaff", "isSuperuser"]


class AdminUserRoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ADMIN_ROLE_CHOICES)


class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        error_messages={
            "required": "Введите имя пользователя.",
            "blank": "Введите имя пользователя.",
        }
    )
    email = serializers.EmailField(
        error_messages={
            "required": "Введите электронную почту.",
            "blank": "Введите электронную почту.",
            "invalid": "Введите корректную электронную почту.",
        }
    )
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        error_messages={
            "required": "Введите пароль.",
            "blank": "Введите пароль.",
            "min_length": "Пароль должен содержать минимум 8 символов.",
        },
    )
    password_confirm = serializers.CharField(
        write_only=True,
        min_length=8,
        error_messages={
            "required": "Повторите пароль.",
            "blank": "Повторите пароль.",
            "min_length": "Подтверждение пароля должно содержать минимум 8 символов.",
        },
    )

    class Meta:
        model = User
        fields = ["username", "email", "password", "password_confirm"]

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Пользователь с такой почтой уже существует.")
        return email

    def validate_username(self, value):
        username = value.strip()
        if not username:
            raise serializers.ValidationError("Введите имя пользователя.")
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Пользователь с таким именем уже существует.")
        return username

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Пароли не совпадают."})

        draft_user = User(
            email=attrs["email"],
            username=attrs["username"],
        )
        try:
            validate_password_ru(attrs["password"], draft_user)
        except serializers.ValidationError as error:
            raise serializers.ValidationError({"password": error.detail})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        email = validated_data["email"]
        password = validated_data.pop("password")

        user = User(
            email=email,
            username=validated_data["username"],
        )
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(
        error_messages={
            "required": "Введите почту или имя пользователя.",
            "blank": "Введите почту или имя пользователя.",
        }
    )
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        error_messages={
            "required": "Введите пароль.",
            "blank": "Введите пароль.",
        },
    )


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({"token": "Password reset link is invalid or expired."})

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError({"token": "Password reset link is invalid or expired."})

        validate_password(attrs["password"], user)
        attrs["user"] = user
        return attrs

    def save(self):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["password"])
        user.save(update_fields=["password"])
        return user


class GuestCartItemSerializer(serializers.Serializer):
    productId = serializers.CharField()
    size = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1)


class AccountStateSyncSerializer(serializers.Serializer):
    favorites = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )
    cart = GuestCartItemSerializer(many=True, required=False, default=list)


class OrderCreateSerializer(serializers.Serializer):
    shipping_address = serializers.CharField()


class OrderItemSerializer(serializers.ModelSerializer):
    productId = serializers.SerializerMethodField()
    productName = serializers.SerializerMethodField()
    brand = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()
    lineTotal = serializers.SerializerMethodField()

    class Meta:
        model = OrderDetail
        fields = [
            "id",
            "productId",
            "productName",
            "brand",
            "image",
            "size",
            "quantity",
            "price",
            "lineTotal",
        ]

    def get_productId(self, obj):
        return str(obj.product_size.variant.product_id)

    def get_productName(self, obj):
        return obj.product_size.variant.product.name

    def get_brand(self, obj):
        return obj.product_size.variant.product.brand

    def get_image(self, obj):
        request = self.context.get("request")
        primary_image = (
            obj.product_size.variant.product.images.all().order_by("-is_primary", "sort_order", "id").first()
        )
        if not primary_image:
            return None

        url = primary_image.image.url
        return request.build_absolute_uri(url) if request else url

    def get_size(self, obj):
        return obj.product_size.size.size_name

    def get_lineTotal(self, obj):
        return int((obj.price * obj.quantity).quantize(Decimal("1")))


class OrderSerializer(serializers.ModelSerializer):
    totalAmount = serializers.SerializerMethodField()
    shippingAddress = serializers.CharField(source="shipping_address")
    createdAt = serializers.DateTimeField(source="created_at")
    paymentMethod = serializers.CharField(source="payment_method")
    paymentStatus = serializers.CharField(source="payment_status")
    paymentId = serializers.CharField(source="payment_id")
    items = OrderItemSerializer(source="orderdetail_set", many=True)
    itemsCount = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "status",
            "totalAmount",
            "paymentMethod",
            "paymentStatus",
            "paymentId",
            "shippingAddress",
            "createdAt",
            "itemsCount",
            "items",
        ]

    def get_totalAmount(self, obj):
        return int(obj.total_amount.quantize(Decimal("1")))

    def get_itemsCount(self, obj):
        return sum(item.quantity for item in obj.orderdetail_set.all())


class AdminOrderSerializer(OrderSerializer):
    customer = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + ["customer"]

    def get_customer(self, obj):
        if not obj.user:
            return None

        return {
            "id": obj.user_id,
            "username": obj.user.username,
            "email": obj.user.email,
        }


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            ("new", "new"),
            ("processing", "processing"),
            ("shipped", "shipped"),
            ("delivered", "delivered"),
            ("cancelled", "cancelled"),
        ]
    )


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True)


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    avatarUrl = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = [
            "id",
            "username",
            "avatarUrl",
            "rating",
            "comment",
            "created_at",
            "updated_at",
        ]

    def get_avatarUrl(self, obj):
        if not obj.user.avatar_path:
            return None

        request = self.context.get("request")
        url = f"{settings.MEDIA_URL}{obj.user.avatar_path}"
        return request.build_absolute_uri(url) if request else url


class ProductCreateSizeSerializer(serializers.Serializer):
    sizeId = serializers.IntegerField()
    stockQuantity = serializers.IntegerField(min_value=0)


class ProductCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    brand = serializers.CharField(max_length=100, allow_blank=True, required=False)
    material = serializers.CharField(max_length=255, allow_blank=True, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    base_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=0)
    categoryId = serializers.IntegerField()
    genderIds = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    color = serializers.CharField(max_length=50)
    sizes = ProductCreateSizeSerializer(many=True)
    images = serializers.ListField(
        child=serializers.ImageField(),
        required=False,
        allow_empty=True,
    )
    primaryImageIndex = serializers.IntegerField(required=False, default=0, min_value=0)

    def validate_categoryId(self, value):
        if not Category.objects.filter(id=value).exists():
            raise serializers.ValidationError("Category not found.")
        return value

    def validate_genderIds(self, value):
        existing_ids = set(Gender.objects.filter(id__in=value).values_list("id", flat=True))
        if len(existing_ids) != len(set(value)):
            raise serializers.ValidationError("Some selected genders do not exist.")
        return value

    def validate_sizes(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one size.")

        size_ids = [item["sizeId"] for item in value]
        existing_ids = set(Size.objects.filter(id__in=size_ids).values_list("id", flat=True))
        if len(existing_ids) != len(set(size_ids)):
            raise serializers.ValidationError("Some selected sizes do not exist.")
        return value

    def validate(self, attrs):
        images = attrs.get("images", [])
        primary_image_index = attrs.get("primaryImageIndex", 0)

        if images and primary_image_index >= len(images):
            raise serializers.ValidationError({"primaryImageIndex": "Primary image index is out of range."})

        return attrs

    def _sync_sizes(self, variant, size_rows):
        existing_sizes = {row.size_id: row for row in variant.sizes.all()}
        next_size_ids = set()

        for row in size_rows:
            size_id = row["sizeId"]
            next_size_ids.add(size_id)
            existing = existing_sizes.get(size_id)
            if existing:
                existing.stock_quantity = row["stockQuantity"]
                existing.save(update_fields=["stock_quantity", "updated_at"])
            else:
                ProductSize.objects.create(
                    variant=variant,
                    size_id=size_id,
                    stock_quantity=row["stockQuantity"],
                )

        variant.sizes.exclude(size_id__in=next_size_ids).delete()

    def _replace_images(self, product, variant, images, primary_image_index):
        product.images.all().delete()

        for index, image in enumerate(images):
            ProductImage.objects.create(
                product=product,
                variant=variant,
                image=image,
                is_primary=index == primary_image_index,
                sort_order=index,
            )

    def create(self, validated_data):
        images = validated_data.pop("images", [])
        primary_image_index = validated_data.pop("primaryImageIndex", 0)
        gender_ids = validated_data.pop("genderIds")
        size_rows = validated_data.pop("sizes")
        category_id = validated_data.pop("categoryId")
        color = validated_data.pop("color")

        with transaction.atomic():
            product = Product.objects.create(
                category_id=category_id,
                **validated_data,
            )
            product.genders.add(*gender_ids)

            variant = ProductVariant.objects.create(
                product=product,
                color=color,
            )

            self._sync_sizes(variant, size_rows)
            self._replace_images(product, variant, images, primary_image_index)

        return product

    def update(self, instance, validated_data):
        images = validated_data.pop("images", None)
        primary_image_index = validated_data.pop("primaryImageIndex", 0)
        gender_ids = validated_data.pop("genderIds")
        size_rows = validated_data.pop("sizes")
        category_id = validated_data.pop("categoryId")
        color = validated_data.pop("color")

        with transaction.atomic():
            instance.category_id = category_id
            instance.name = validated_data["name"]
            instance.brand = validated_data.get("brand", "")
            instance.material = validated_data.get("material", "")
            instance.description = validated_data.get("description", "")
            instance.base_price = validated_data["base_price"]
            instance.discount_percent = validated_data.get("discount_percent", 0)
            instance.save()
            instance.genders.set(gender_ids)

            variant = instance.variants.prefetch_related("sizes").order_by("id").first()
            if variant:
                variant.color = color
                variant.save(update_fields=["color"])
            else:
                variant = ProductVariant.objects.create(
                    product=instance,
                    color=color,
                )

            self._sync_sizes(variant, size_rows)

            if images:
                self._replace_images(instance, variant, images, primary_image_index)

        return instance


class AdminProductImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ["id", "url", "is_primary", "sort_order"]

    def get_url(self, obj):
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class AdminProductDetailSerializer(serializers.ModelSerializer):
    basePrice = serializers.DecimalField(source="base_price", max_digits=12, decimal_places=2)
    discountPercent = serializers.DecimalField(source="discount_percent", max_digits=5, decimal_places=2)
    categoryId = serializers.SerializerMethodField()
    subcategoryId = serializers.SerializerMethodField()
    genderIds = serializers.SerializerMethodField()
    color = serializers.SerializerMethodField()
    sizes = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "brand",
            "material",
            "description",
            "basePrice",
            "discountPercent",
            "categoryId",
            "subcategoryId",
            "genderIds",
            "color",
            "sizes",
            "images",
        ]

    def _get_primary_variant(self, obj):
        return obj.variants.prefetch_related("sizes").order_by("id").first()

    def get_categoryId(self, obj):
        if not obj.category:
            return None
        return obj.category.parent_id or obj.category_id

    def get_subcategoryId(self, obj):
        if not obj.category or not obj.category.parent_id:
            return None
        return obj.category_id

    def get_genderIds(self, obj):
        return list(obj.genders.values_list("id", flat=True))

    def get_color(self, obj):
        variant = self._get_primary_variant(obj)
        return variant.color if variant else ""

    def get_sizes(self, obj):
        variant = self._get_primary_variant(obj)
        if not variant:
            return []

        return [
            {
                "sizeId": size.size_id,
                "stockQuantity": size.stock_quantity,
            }
            for size in variant.sizes.select_related("size").order_by("size__size_name")
        ]

    def get_images(self, obj):
        ordered_images = obj.images.all().order_by("-is_primary", "sort_order", "id")
        return AdminProductImageSerializer(
            ordered_images,
            many=True,
            context=self.context,
        ).data


class ProductSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    oldPrice = serializers.SerializerMethodField()
    material = serializers.CharField(read_only=True)
    color = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    subcategory = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    sizes = serializers.SerializerMethodField()
    isBestseller = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "brand",
            "price",
            "oldPrice",
            "material",
            "color",
            "category",
            "subcategory",
            "images",
            "description",
            "sizes",
            "isBestseller",
        ]

    def _get_primary_variant(self, obj):
        return obj.variants.order_by("id").first()

    def get_id(self, obj):
        return str(obj.id)

    def get_price(self, obj):
        discount = obj.discount_percent or Decimal("0")
        final_price = obj.base_price * (Decimal("100") - discount) / Decimal("100")
        return int(final_price.quantize(Decimal("1")))

    def get_oldPrice(self, obj):
        if not obj.discount_percent:
            return None
        return int(obj.base_price.quantize(Decimal("1")))

    def get_color(self, obj):
        variant = self._get_primary_variant(obj)
        return variant.color if variant else ""

    def get_category(self, obj):
        gender_names = {gender.name.lower() for gender in obj.genders.all()}
        if "men" in gender_names or "male" in gender_names:
            return "men"
        if "women" in gender_names or "female" in gender_names:
            return "women"

        category = obj.category.name.lower() if obj.category else ""
        if "access" in category:
            return "accessories"
        return "accessories"

    def get_subcategory(self, obj):
        if obj.category and obj.category.slug:
            return obj.category.slug
        if obj.category:
            return obj.category.name.lower().replace(" ", "-")
        return "products"

    def get_images(self, obj):
        request = self.context.get("request")
        ordered_images = obj.images.all().order_by("-is_primary", "sort_order", "id")
        image_urls = []

        for image in ordered_images:
            url = image.image.url
            image_urls.append(request.build_absolute_uri(url) if request else url)

        return image_urls

    def get_sizes(self, obj):
        size_names = []
        seen = set()

        for variant in obj.variants.all():
            for product_size in variant.sizes.all():
                name = product_size.size.size_name
                if name not in seen:
                    seen.add(name)
                    size_names.append(name)

        return size_names

    def get_isBestseller(self, obj):
        featured_ids = self.context.get("featured_ids", set())
        return obj.id in featured_ids
