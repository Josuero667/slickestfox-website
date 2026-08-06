import json
import os

JSON_PATH = os.path.join("assets", "art", "data", "images.json")
PREVIEW_DIR = os.path.join("assets", "art", "previews")

def update_manifest():
    if not os.path.exists(JSON_PATH):
        print(f"Error: {JSON_PATH} not found.")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    updated_count = 0
    for img in data.get("images", []):
        src = img.get("src", "")
        if not src:
            continue
        base_name = os.path.splitext(os.path.basename(src))[0]
        preview_filename = f"{base_name}.webp"
        preview_path_local = os.path.join(PREVIEW_DIR, preview_filename)
        
        if os.path.exists(preview_path_local):
            img["preview"] = f"assets/art/previews/{preview_filename}"
            updated_count += 1

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

    print(f"Successfully updated {updated_count} image entries in {JSON_PATH} with preview paths.")

if __name__ == "__main__":
    update_manifest()
