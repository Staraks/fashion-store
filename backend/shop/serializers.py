from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .models import Category, Gender, Product, ProductImage, ProductSize, ProductVariant, Size

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    isStaff = serializers.BooleanField(source="is_staff", read_only=True)
    isSuperuser = serializers.BooleanField(source="is_superuser", read_only=True)

    class Meta:
        model = User
        fields = ["id", "name", "email", "username", "role", "isStaff", "isSuperuser"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["name", "email", "password", "password_confirm"]

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        draft_user = User(
            email=attrs["email"],
            username=attrs["email"],
            name=attrs.get("name", "").strip(),
        )
        validate_password(attrs["password"], draft_user)
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        email = validated_data["email"]
        password = validated_data.pop("password")

        user = User(
            email=email,
            username=email,
            name=validated_data.get("name", "").strip(),
        )
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


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

            ProductSize.objects.bulk_create(
                [
                    ProductSize(
                        variant=variant,
                        size_id=row["sizeId"],
                        stock_quantity=row["stockQuantity"],
                    )
                    for row in size_rows
                ]
            )

            # Create each image individually so ImageField storage and post_save
            # signals run for every file, including embedding generation.
            for index, image in enumerate(images):
                ProductImage.objects.create(
                    product=product,
                    variant=variant,
                    image=image,
                    is_primary=index == primary_image_index,
                    sort_order=index,
                )

        return product


class ProductSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    oldPrice = serializers.SerializerMethodField()
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
            "category",
            "subcategory",
            "images",
            "description",
            "sizes",
            "isBestseller",
        ]

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
