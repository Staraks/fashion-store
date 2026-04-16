from django.contrib import admin

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
    ProductImage,
    ProductSize,
    ProductVariant,
    Review,
    Size,
    User,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "parent", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "email", "name", "is_staff", "is_superuser", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "base_price", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "color", "created_at")
    readonly_fields = ("created_at",)


@admin.register(ProductSize)
class ProductSizeAdmin(admin.ModelAdmin):
    list_display = ("variant", "size", "stock_quantity", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("product", "variant", "is_primary", "sort_order", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "rating", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "added_at")
    readonly_fields = ("added_at",)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "total_amount", "status", "date", "created_at")
    readonly_fields = ("date", "created_at")


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ("cart", "product_size", "quantity", "added_at", "updated_at")
    readonly_fields = ("added_at", "updated_at")


admin.site.register(Gender)
admin.site.register(Size)
admin.site.register(ProductGender)
admin.site.register(OrderDetail)
