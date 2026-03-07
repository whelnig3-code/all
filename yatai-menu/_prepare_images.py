"""
YATAI Menu - Image Preparation Helper

Usage:
  python _prepare_images.py              # Show missing images report
  python _prepare_images.py optimize     # Resize & convert existing images to WebP (600x400, max 80KB)

Requirements:
  pip install Pillow
"""

import json
import os
import sys

MENU_JSON = os.path.join(os.path.dirname(__file__), 'data', 'menu.json')
IMAGES_DIR = os.path.join(os.path.dirname(__file__), 'images')
PLACEHOLDER = 'images/placeholder.webp'
TARGET_SIZE = (600, 400)  # 3:2 ratio
MAX_KB = 80


def load_menu():
    with open(MENU_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)


def report():
    data = load_menu()
    items = data['items']
    cats = {c['id']: c['name']['ko'] for c in data['categories']}

    missing = []
    has_photo = []

    for item in items:
        img = item.get('image', PLACEHOLDER)
        if img == PLACEHOLDER:
            missing.append(item)
        else:
            has_photo.append(item)

    print(f'\n=== YATAI Menu Image Report ===')
    print(f'Total items: {len(items)}')
    print(f'With photo:  {len(has_photo)}')
    print(f'Missing:     {len(missing)}')

    if missing:
        print(f'\n--- Missing Photos ({len(missing)}) ---')
        current_cat = None
        for item in sorted(missing, key=lambda x: (x['category'], x.get('sort', 0))):
            cat = cats.get(item['category'], item['category'])
            if cat != current_cat:
                current_cat = cat
                print(f'\n  [{cat}]')
            name = item['name']['ko']
            print(f'    - {item["id"]}: {name}')

    if has_photo:
        print(f'\n--- Has Photo ({len(has_photo)}) ---')
        for item in has_photo:
            img = item.get('image', '')
            exists = os.path.exists(os.path.join(os.path.dirname(__file__), img))
            status = 'OK' if exists else 'FILE MISSING!'
            print(f'    {item["id"]}: {img} [{status}]')

    print(f'\n--- How to add photos ---')
    print(f'1. Take photos with smartphone (landscape orientation)')
    print(f'2. Copy to images/ folder as: <item-id>.jpg')
    print(f'3. Run: python _prepare_images.py optimize')
    print(f'4. Update menu.json image field to: images/<item-id>.webp')
    print()


def optimize():
    try:
        from PIL import Image
    except ImportError:
        print('ERROR: Pillow required. Run: pip install Pillow')
        sys.exit(1)

    if not os.path.exists(IMAGES_DIR):
        print('No images/ directory found')
        return

    count = 0
    for fname in os.listdir(IMAGES_DIR):
        if fname == 'placeholder.webp':
            continue
        if not fname.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            continue

        fpath = os.path.join(IMAGES_DIR, fname)
        name_base = os.path.splitext(fname)[0]
        out_path = os.path.join(IMAGES_DIR, name_base + '.webp')

        img = Image.open(fpath)
        img = img.convert('RGB')

        # Crop to 3:2 ratio
        w, h = img.size
        target_ratio = TARGET_SIZE[0] / TARGET_SIZE[1]
        current_ratio = w / h

        if current_ratio > target_ratio:
            new_w = int(h * target_ratio)
            left = (w - new_w) // 2
            img = img.crop((left, 0, left + new_w, h))
        elif current_ratio < target_ratio:
            new_h = int(w / target_ratio)
            top = (h - new_h) // 2
            img = img.crop((0, top, w, top + new_h))

        img = img.resize(TARGET_SIZE, Image.LANCZOS)

        # Save with quality adjustment to stay under MAX_KB
        quality = 85
        while quality > 20:
            img.save(out_path, 'WEBP', quality=quality)
            size_kb = os.path.getsize(out_path) / 1024
            if size_kb <= MAX_KB:
                break
            quality -= 5

        size_kb = os.path.getsize(out_path) / 1024
        print(f'  {fname} -> {name_base}.webp ({size_kb:.0f}KB, q={quality})')
        count += 1

    print(f'\nOptimized {count} images.')
    print('Now update menu.json image fields to: images/<name>.webp')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'optimize':
        optimize()
    else:
        report()
