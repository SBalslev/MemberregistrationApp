import os
from PyPDF2 import PdfReader

pdf_path = r"C:\Users\sbalslev\Downloads\SIKSKY-2026 - Sikkerhedsbestemmelserne i skydning - version april 2026.pdf"
output_path = r"C:\c\sbalslev\Medlemscheckin\temp\siksky-2026.txt"

os.makedirs(os.path.dirname(output_path), exist_ok=True)
reader = PdfReader(pdf_path)

with open(output_path, "w", encoding="utf-8") as out:
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        out.write(f"\n--- Page {i} ---\n")
        out.write(text)

print(output_path)
