from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shop", "0009_alter_product_material"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="payment_method",
            field=models.CharField(default="mock_card", max_length=50),
        ),
        migrations.AddField(
            model_name="order",
            name="payment_status",
            field=models.CharField(default="paid", max_length=50),
        ),
        migrations.AddField(
            model_name="order",
            name="payment_id",
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
