import urllib.request
import urllib.parse
import json
from PIL import Image, ImageFilter
import io
import os

ASSETS_DIR = r"E:\Appzeto Projects\scrapto\assets"

CATEGORIES = [
    ("category_plastic.jpg", "bales of PET bottles recycling"),
    ("category_metal.jpg", "scrap metal sorted copper aluminum steel"),
    ("category_paper.jpg", "cardboard recycling bales Zion"),
    ("category_electronics.jpg", "electronic waste circuit boards recycling"),
    ("category_copper.jpg", "copper scrap pipes recycling"),
    ("category_aluminium.jpg", "crushed aluminum cans recycling"),
    ("category_steel.jpg", "scrap steel recycling rebar"),
    ("category_brass.jpg", "brass scrap plumbing valves fittings"),
    ("category_iron.jpg", "scrap iron metal recycling pile"),
    ("category_glass.jpg", "recycling glass bottles colored sorted"),
    ("category_battery.jpg", "lead acid car battery recycling"),
    ("category_tyre_rubber.jpg", "scrap tires recycling rubber pile"),
    ("category_wire_cable.jpg", "scrap copper wire stripped recycling"),
    ("category_wooden_furniture.jpg", "wooden pallets recycling timber"),
    ("category_vehicles.jpg", "car scrap junkyard recycling automobile"),
    ("category_appliance_ac.jpg", "air conditioner outdoor unit scrap recycling"),
    ("category_appliance_washing_machine.jpg", "scrap washing machines recycling"),
    ("category_appliance_refrigerator.jpg", "refrigerator recycling scrap metal"),
    ("category_appliance_microwave.jpg", "microwave oven electronic waste scrap"),
    ("category_appliance_fans.jpg", "ceiling fan electric motor copper recycling")
]

def search_wikimedia(query):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime"
    req = urllib.request.Request(url, headers={'User-Agent': 'ScraptoApp/2.0 (admin@scrapto.com)'})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read())
            pages = data.get('query', {}).get('pages', {})
            for pid, pdata in pages.items():
                info = pdata.get('imageinfo', [{}])[0]
                mime = info.get('mime', '')
                url = info.get('url', '')
                w = info.get('width', 0)
                h = info.get('height', 0)
                if 'image/' in mime and ('jpg' in url.lower() or 'png' in url.lower() or 'jpeg' in url.lower()) and w >= 800 and h >= 800:
                    return url
    except Exception as e:
        print(f"Error searching {query}: {e}")
    return None

def process_and_save(img_url, out_path, target_size=(1024, 1024)):
    req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
        im = Image.open(io.BytesIO(raw))
        w, h = im.size
        # Crop center square
        min_dim = min(w, h)
        left = (w - min_dim) // 2
        top = (h - min_dim) // 2
        im_crop = im.crop((left, top, left + min_dim, top + min_dim))
        im_resized = im_crop.resize(target_size, Image.Resampling.LANCZOS)
        # Apply gentle unsharp mask for crystal clear sharpness
        im_sharp = im_resized.filter(ImageFilter.UnsharpMask(radius=1.2, percent=110, threshold=3))
        im_sharp.convert('RGB').save(out_path, quality=95)
        return os.path.getsize(out_path)

for filename, query in CATEGORIES:
    url = search_wikimedia(query)
    out_path = os.path.join(ASSETS_DIR, filename)
    if url:
        try:
            sz = process_and_save(url, out_path)
            print(f"[REAL PHOTO SUCCESS] {filename} -> {sz} bytes (from {url[:60]}...)")
        except Exception as e:
            print(f"[DOWNLOAD FAIL] {filename}: {e}")
    else:
        print(f"[NOT FOUND] {filename} query: {query}")
