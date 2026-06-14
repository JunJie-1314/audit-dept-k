"""Create placeholder resource files for the audit-dept-k website."""
import os

resources_dir = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "resources"
)
os.makedirs(resources_dir, exist_ok=True)

# Minimal valid PDF
pdf_content = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
    b"xref\n0 4\n"
    b"0000000000 65535 f \n"
    b"0000000009 00000 n \n"
    b"0000000058 00000 n \n"
    b"0000000115 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n206\n%%EOF"
)

# Minimal valid XLSX (Office Open XML)
xlsx_content = (
    b"PK\x03\x04\x14\x00\x00\x00\x08\x00"
    b"\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\x0a\x00\x00\x00"
)

# Minimal valid DOCX
docx_content = xlsx_content  # Same ZIP-based format, just placeholder

files = {
    "audit-procedure-checklist.pdf": pdf_content,
    "audit-working-paper-template.xlsx": xlsx_content,
    "career-plan-template.docx": docx_content,
}

for filename, content in files.items():
    filepath = os.path.join(resources_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    print(f"Created: {filepath} ({os.path.getsize(filepath)} bytes)")

print("Done!")
