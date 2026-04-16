import os

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ProductImage
from .services.ai_service import get_image_embedding


@receiver(post_save, sender=ProductImage)
def generate_embedding(sender, instance, created, **kwargs):

    if not created:
        return

    if instance.embedding:
        return

    if not instance.image:
        return

    image_path = instance.image.path

    if not os.path.exists(image_path):
        return

    embedding = get_image_embedding(image_path)

    instance.embedding = embedding
    instance.save(update_fields=["embedding"])
