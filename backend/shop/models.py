# shop/models.py
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator
from pgvector.django import VectorField


class Gender(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        verbose_name_plural = "genders"
        db_table = 'genders'

    def __str__(self):
        return self.name


class Size(models.Model):
    size_name = models.CharField(max_length=20, unique=True)

    class Meta:
        db_table = 'sizes'

    def __str__(self):
        return self.size_name


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, unique=True, blank=True, null=True)
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
        verbose_name=_("parent category")
    )
    #description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'categories'
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class User(AbstractUser):
    """
    Кастомная модель пользователя с таблицей 'users'
    """
    name = models.CharField(max_length=100, blank=True, verbose_name=_("full name"))
    email = models.EmailField(unique=True, verbose_name=_("email address"))
    role = models.CharField(max_length=30, default='user')
    avatar_path = models.CharField(max_length=512, blank=True, verbose_name=_("avatar"))
    created_at = models.DateTimeField(auto_now_add=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    class Meta:
        db_table = 'users'
        verbose_name = _("user")
        verbose_name_plural = _("users")

    def __str__(self):
        return self.email or self.username


class Product(models.Model):
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=100, blank=True)
    material = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    base_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Скидка в процентах (0–100)"
    )
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    genders = models.ManyToManyField(Gender, through='ProductGender', related_name='products')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'
        indexes = [
            models.Index(fields=['category'], name='idx_products_category'),
            models.Index(fields=['brand'], name='idx_products_brand'),
        ]

    def __str__(self):
        return self.name


class ProductVariant(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    color = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_variants'
        unique_together = [['product', 'color']]
        indexes = [
            models.Index(fields=['product'], name='idx_product_variants_product'),
        ]

    def __str__(self):
        return f"{self.product.name} — {self.color}"


class ProductSize(models.Model):
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name='sizes')
    size = models.ForeignKey(Size, on_delete=models.PROTECT)
    stock_quantity = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'product_sizes'
        unique_together = [['variant', 'size']]
        indexes = [
            models.Index(fields=['variant'], name='idx_product_sizes_variant'),
        ]


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.SET_NULL)
    image = models.ImageField(upload_to="products/")
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    alt_text = models.CharField(max_length=255, blank=True)
    embedding = VectorField(dimensions=768, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_images'
        indexes = [
            models.Index(fields=['product'], name='idx_product_images_product'),
            models.Index(fields=['variant'], name='idx_product_images_variant'),
            models.Index(fields=['product'], condition=models.Q(is_primary=True), name='idx_product_images_primary'),
        ]


class ProductGender(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    gender = models.ForeignKey(Gender, on_delete=models.CASCADE)

    class Meta:
        db_table = 'product_gender'
        unique_together = [['product', 'gender']]


class Review(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    rating = models.PositiveSmallIntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reviews'
        unique_together = [['user', 'product']]
        indexes = [
            models.Index(fields=['product'], name='idx_reviews_product'),
            models.Index(fields=['user'], name='idx_reviews_user'),
            models.Index(fields=['rating'], name='idx_reviews_rating'),
        ]


class Favorite(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'favorites'
        unique_together = [['user', 'product']]
        indexes = [
            models.Index(fields=['user'], name='idx_favorites_user'),
        ]


class Order(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=50, default='new')
    payment_method = models.CharField(max_length=50, default='mock_card')
    payment_status = models.CharField(max_length=50, default='paid')
    payment_id = models.CharField(max_length=100, blank=True)
    shipping_address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'orders'
        indexes = [
            models.Index(fields=['user'], name='idx_orders_user'),
        ]


class OrderDetail(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE)
    product_size = models.ForeignKey(ProductSize, on_delete=models.PROTECT)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField()

    class Meta:
        db_table = 'order_details'
        indexes = [
            models.Index(fields=['order'], name='idx_order_details_order'),
        ]


class Cart(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'carts'
        unique_together = [['user']]
        indexes = [
            models.Index(fields=['user'], name='idx_carts_user'),
        ]


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE)
    product_size = models.ForeignKey(ProductSize, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Количество товара в корзине (минимум 1)"
    )
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cart_items'
        unique_together = [['cart', 'product_size']]
        indexes = [
            models.Index(fields=['cart'], name='idx_cart_items_cart'),
            models.Index(fields=['product_size'], name='idx_cart_items_product_size'),
        ]
