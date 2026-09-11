"""Genera el QR del chat de WhatsApp del bot de Posgrados Tooli.

Apunta a wa.me con el mensaje 'hola' precargado: al escanear, el usuario
abre WhatsApp con el texto listo y solo pulsa enviar.

Uso:
    pip install "qrcode[pil]"
    python scripts/gen_qr.py

El PNG se guarda en src/public/posgrados/ (lo sirve el backend en /posgrados).
"""
import os
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask

URL = "https://wa.me/573012821925?text=hola"

# Ruta de salida relativa a la raíz del repo (portable en cualquier máquina)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO_ROOT, "src", "public", "posgrados", "qr-tooli-posgrados.png")

DARK = (3, 18, 46)        # navy de alto contraste para escaneo fiable

qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=20,
    border=3,
)
qr.add_data(URL)
qr.make(fit=True)

img = qr.make_image(
    image_factory=StyledPilImage,
    module_drawer=RoundedModuleDrawer(),
    color_mask=SolidFillColorMask(front_color=DARK, back_color=(255, 255, 255)),
).convert("RGB")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print("QR guardado:", OUT, img.size)
print("URL:", URL)
