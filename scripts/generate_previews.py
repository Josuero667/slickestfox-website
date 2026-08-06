import os
import glob
from PIL import Image

SOURCE_DIRS = [
    os.path.join("assets", "art", "main"),
    os.path.join("assets", "art", "additional")
]
OUTPUT_DIR = os.path.join("assets", "art", "previews")
MAX_SIZE = (600, 600)
QUALITY = 80

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    exts = ("*.png", "*.jpg", "*.jpeg", "*.webp")
    files = []
    for s_dir in SOURCE_DIRS:
        if os.path.exists(s_dir):
            for ext in exts:
                files.extend(glob.glob(os.path.join(s_dir, ext)))
    
    print(f"Found {len(files)} image files to process.")
    
    count = 0
    total_orig_bytes = 0
    total_thumb_bytes = 0

    for filepath in files:
        filename = os.path.basename(filepath)
        name_without_ext = os.path.splitext(filename)[0]
        out_filename = f"{name_without_ext}.webp"
        out_path = os.path.join(OUTPUT_DIR, out_filename)
        
        orig_size = os.path.getsize(filepath)
        total_orig_bytes += orig_size

        try:
            with Image.open(filepath) as img:
                # Convert color modes if necessary
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    img = img.convert("RGBA")
                else:
                    img = img.convert("RGB")
                
                img.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
                img.save(out_path, "WEBP", quality=QUALITY, optimize=True)
                
            thumb_size = os.path.getsize(out_path)
            total_thumb_bytes += thumb_size
            count += 1
            print(f"[{count}/{len(files)}] Processed: {filename} ({orig_size // 1024} KB -> {thumb_size // 1024} KB)")
        except Exception as e:
            print(f"Error processing {filename}: {e}")

    orig_mb = total_orig_bytes / (1024 * 1024)
    thumb_mb = total_thumb_bytes / (1024 * 1024)
    print(f"\nDone! Processed {count} images.")
    print(f"Original size: {orig_mb:.2f} MB")
    print(f"Previews size: {thumb_mb:.2f} MB")
    if orig_mb > 0:
        savings = (1 - (thumb_mb / orig_mb)) * 100
        print(f"Bandwidth savings: {savings:.1f}%")

if __name__ == "__main__":
    main()
