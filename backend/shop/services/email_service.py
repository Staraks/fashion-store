import logging
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from shop.models import Order, User

logger = logging.getLogger(__name__)


def _money(value):
    amount = Decimal(value).quantize(Decimal("1"))
    return f"{amount} RUB"


def build_order_receipt_context(order):
    items = []
    for detail in order.orderdetail_set.all():
        product = detail.product_size.variant.product
        line_total = detail.price * detail.quantity
        items.append(
            {
                "brand": product.brand,
                "name": product.name,
                "size": detail.product_size.size.size_name,
                "quantity": detail.quantity,
                "price": _money(detail.price),
                "line_total": _money(line_total),
            }
        )

    return {
        "order": order,
        "customer_name": order.user.name or order.user.username,
        "created_at": timezone.localtime(order.created_at).strftime("%d.%m.%Y %H:%M"),
        "items": items,
        "total": _money(order.total_amount),
    }


def send_order_receipt_email(order_id):
    if not settings.ORDER_RECEIPT_EMAIL_ENABLED:
        return

    order = (
        Order.objects.select_related("user")
        .prefetch_related(
            "orderdetail_set__product_size__size",
            "orderdetail_set__product_size__variant__product",
        )
        .filter(id=order_id)
        .first()
    )
    if not order or not order.user or not order.user.email:
        return

    context = build_order_receipt_context(order)
    subject = f"Чек по заказу #{order.id}"
    message = render_to_string("shop/emails/order_receipt.txt", context)

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[order.user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Failed to send receipt email for order %s", order.id)


def send_order_delivered_email(order_id):
    if not settings.ORDER_RECEIPT_EMAIL_ENABLED:
        return

    order = Order.objects.select_related("user").filter(id=order_id).first()
    if not order or not order.user or not order.user.email:
        return

    context = {
        "order": order,
        "customer_name": order.user.name or order.user.username,
        "delivered_at": timezone.localtime(timezone.now()).strftime("%d.%m.%Y %H:%M"),
    }
    subject = f"Заказ #{order.id} доставлен"
    message = render_to_string("shop/emails/order_delivered.txt", context)

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[order.user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Failed to send delivered email for order %s", order.id)


def send_password_reset_email(user_id):
    user = User.objects.filter(id=user_id).first()
    if not user or not user.email:
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/#/reset-password/{uid}/{token}"
    context = {
        "user": user,
        "reset_url": reset_url,
    }
    subject = "Смена пароля Fashion Store"
    message = render_to_string("shop/emails/password_reset.txt", context)

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Failed to send password reset email for user %s", user.id)
