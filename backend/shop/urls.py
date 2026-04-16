from django.urls import path

from .views import (
    account_state,
    admin_catalog_options,
    admin_create_product,
    bestseller_list,
    create_order,
    current_user,
    login_user,
    logout_user,
    product_detail,
    product_filters,
    product_list,
    register_user,
    search_by_image,
    sync_account_state,
)

urlpatterns = [
    path("auth/register/", register_user),
    path("auth/login/", login_user),
    path("auth/me/", current_user),
    path("auth/logout/", logout_user),
    path("admin/catalog/options/", admin_catalog_options),
    path("admin/products/", admin_create_product),
    path("account/state/", account_state),
    path("account/sync/", sync_account_state),
    path("orders/", create_order),
    path("products/filters/", product_filters),
    path("products/", product_list),
    path("products/bestsellers/", bestseller_list),
    path("products/<int:product_id>/", product_detail),
    path("search-by-image/", search_by_image),
]
