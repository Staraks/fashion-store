from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0011_review_moderation"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="is_visible",
            field=models.BooleanField(default=True),
        ),
        migrations.AddIndex(
            model_name="product",
            index=models.Index(fields=["is_visible"], name="idx_products_visible"),
        ),
    ]
