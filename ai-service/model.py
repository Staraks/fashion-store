import torch
import open_clip
import numpy as np
from PIL import Image

device = "cpu" 

print("Загружаю модель marqo-fashionSigLIP ... (это может занять 1–2 минуты при первом запуске)")
model, _, preprocess = open_clip.create_model_and_transforms(
    "hf-hub:Marqo/marqo-fashionSigLIP"
)
model = model.to(device)
model.eval()
print("Модель загружена!")

def get_image_embedding(image_path: str):
    image = preprocess(Image.open(image_path).convert("RGB")).unsqueeze(0).to(device)
    with torch.no_grad():
        embedding = model.encode_image(image)
    embedding = embedding[0].cpu().numpy()
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()