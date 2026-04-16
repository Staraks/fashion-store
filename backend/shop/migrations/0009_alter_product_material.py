from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0008_alter_productimage_embedding"),
    ]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="material",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
