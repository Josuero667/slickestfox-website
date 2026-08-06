import os
import re

COMMISSIONS_PATH = "commissions.html"
PREVIEW_DIR = os.path.join("assets", "art", "previews")

def update_commissions():
    if not os.path.exists(COMMISSIONS_PATH):
        print(f"Error: {COMMISSIONS_PATH} not found.")
        return

    with open(COMMISSIONS_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # Pattern matching src="assets/art/(main|additional)/(...)"
    pattern = re.compile(r'src=["\']assets/art/(?:main|additional)/([^"\']+\.(?:png|jpg|jpeg|webp))["\']', re.IGNORECASE)

    updated_count = 0

    def replace_match(match):
        nonlocal updated_count
        orig_filename = match.group(1)
        base_name = os.path.splitext(orig_filename)[0]
        preview_filename = f"{base_name}.webp"
        preview_filepath = os.path.join(PREVIEW_DIR, preview_filename)

        if os.path.exists(preview_filepath):
            updated_count += 1
            return f'src="assets/art/previews/{preview_filename}"'
        else:
            return match.group(0)

    new_content = pattern.sub(replace_match, content)

    with open(COMMISSIONS_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"Successfully updated {updated_count} image tags in {COMMISSIONS_PATH}.")

if __name__ == "__main__":
    update_commissions()
