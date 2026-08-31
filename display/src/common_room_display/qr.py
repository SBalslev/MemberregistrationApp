from __future__ import annotations

import io

import qrcode


def generate_qr_png(value: str) -> bytes:
    qr_code = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=4,
    )
    qr_code.add_data(value)
    qr_code.make(fit=True)
    image = qr_code.make_image(fill_color="black", back_color="white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()