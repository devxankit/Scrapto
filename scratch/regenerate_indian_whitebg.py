import urllib.request
import json
import time
import os
import io
from PIL import Image, ImageFilter

ASSETS_DIR = r"E:\Appzeto Projects\scrapto\assets"
os.makedirs(ASSETS_DIR, exist_ok=True)

# 1. Categories on PURE WHITE BACKGROUND for mobile app UI cards
WHITE_BG_CATEGORIES = [
    ("category_plastic.jpg", "recyclable plastic scrap items, clear transparent PET water bottles and colorful detergent plastic bottles neatly grouped, e-commerce catalog product shot"),
    ("category_metal.jpg", "sorted clean scrap metal pieces, copper pipe cut, steel gear, aluminum can, and brass fitting neatly centered, e-commerce catalog product shot"),
    ("category_paper.jpg", "clean tied bundle of old newspapers and brown corrugated cardboard boxes tied with natural jute twine, e-commerce catalog product shot"),
    ("category_electronics.jpg", "clean green computer motherboard circuit board and laptop RAM memory stick, tech e-waste catalog product shot"),
    ("category_copper.jpg", "bright shiny bare copper wire coil and polished copper plumbing pipe elbow fittings, metallic sheen, e-commerce product shot"),
    ("category_aluminium.jpg", "clean crushed colorful aluminum beverage soda cans neatly grouped in center, e-commerce product shot"),
    ("category_steel.jpg", "shiny stainless steel kitchen utensils, steel rebar rod section, and industrial hex bolts, e-commerce product shot"),
    ("category_brass.jpg", "vintage polished golden brass water tap bibcock and heavy brass plumbing gate valve, e-commerce product shot"),
    ("category_iron.jpg", "heavy black cast iron weight and solid iron metal bar, clean e-commerce product shot"),
    ("category_glass.jpg", "clean sorted glass beverage bottles in amber brown, emerald green, and clear glass standing upright, e-commerce product shot"),
    ("category_battery.jpg", "red and black 12V automotive car and home inverter battery with brass terminals, clean product shot"),
    ("category_tyre_rubber.jpg", "clean black automotive vehicle car tire standing upright, deep tread grooves, clean product shot"),
    ("category_wire_cable.jpg", "neat coil of colorful stripped electrical copper wiring and copper cable, clean product shot"),
    ("category_wooden_furniture.jpg", "clean small wooden timber shipping pallet and timber wood blocks, clean product shot"),
    ("category_vehicles.jpg", "scrapped automobile car engine block and metal wheel rim, clean product shot"),

    # Appliances
    ("category_appliance_ac.jpg", "split air conditioner indoor wall unit and outdoor compressor condenser unit with copper cooling coils, clean e-commerce appliance product shot"),
    ("category_appliance_washing_machine.jpg", "modern front-loading washing machine with silver door and chrome drum, clean e-commerce appliance product shot"),
    ("category_appliance_refrigerator.jpg", "modern silver double-door home refrigerator appliance, clean e-commerce appliance product shot"),
    ("category_appliance_microwave.jpg", "countertop stainless steel microwave oven with digital touch panel, clean e-commerce appliance product shot"),
    ("category_appliance_geyser.jpg", "household electric water heater geyser tank appliance with pipe inlet, clean e-commerce appliance product shot"),
    ("category_appliance_cooler.jpg", "metal desert room air cooler with cooling honeycomb pads, clean e-commerce appliance product shot"),
    ("category_appliance_tv_monitor.jpg", "modern slim black LED TV flat screen monitor on stand, clean e-commerce product shot"),
    ("category_appliance_fans.jpg", "modern metallic 3-blade ceiling fan and electric copper motor, clean e-commerce product shot"),

    # Fallback category copies
    ("cat_plastic.jpg", "cluster of clean recyclable transparent PET bottles and plastic containers, isolated on pure white background"),
    ("cat_metal.jpg", "clean pieces of copper pipe, steel rebar, aluminum cans on pure white background"),
    ("cat_paper.jpg", "neat stack of cardboard cartons and tied newspapers on pure white background")
]

# 2. Indian Human Context & App UI Banners
INDIAN_HUMAN_ITEMS = [
    ("banner_verified_collectors.jpg", 
     "Authentic realistic photography of a friendly smiling 28-year-old Indian man working as a scrap collector in India, wearing a clean neat green polo t-shirt uniform with an official company ID badge lanyard around neck, holding a digital hanging scale, standing beside a modern green electric delivery cargo auto, daylight, sharp portrait, real Indian person ### foreigner, caucasian, white person, cartoon, CGI, 3d render, fake, blurry"),

    ("banner_doorstep_free_pickup.jpg", 
     "Authentic photography in an Indian residential neighborhood, a modern green electric commercial 3-wheeler cargo auto rickshaw parked outside a neat Indian home, a friendly young Indian delivery partner loading a carton box of recyclable scrap, daylight, authentic Indian setting ### foreigner, european, american, cartoon, 3d render, blurry"),

    ("banner_instant_upi_payment.jpg", 
     "Realistic close-up photograph of an Indian person holding a modern smartphone displaying a successful green UPI digital payment screen with Indian Rupee symbol INR, authentic Indian 500 rupee banknotes and 200 rupee banknotes resting on clean wooden table, daylight, sharp focus ### foreigner, dollar, euro, cartoon, 3d render, blurry"),

    ("banner_clean_green_india.jpg", 
     "Realistic photograph of a clean, modern green Indian city street in Bengaluru or Delhi, lush green neem trees, solar street lights, electric green auto rickshaws, happy young Indian people walking, bright blue sky ### western city, cartoon, 3d render, messy, smog, blurry"),

    ("step1_select_category.jpg", 
     "Realistic close-up photograph of Indian hands holding a smartphone in clean studio, tapping on a modern mobile app with scrap recycling categories, isolated on pure solid white background, clean app UI concept ### caucasian hands, dark, blurry, cartoon"),

    ("step2_upload_photos.jpg", 
     "Realistic photograph of an Indian user holding a smartphone and taking a clear photo of sorted cardboard and metal scrap in home courtyard, natural sunlight, sharp focus ### foreigner, cartoon, 3d render, blurry"),

    ("step4_doorstep_pickup.jpg", 
     "Realistic photograph of a green electric 3-wheeler cargo delivery loader auto arriving at an Indian residential house gate, friendly Indian driver waving with a smile ### western car, foreigner, cartoon, 3d render, blurry"),

    ("step5_digital_weighing.jpg", 
     "Realistic photograph of a professional young Indian scrap collector in green uniform carefully weighing a box of scrap on an accurate heavy-duty digital platform scale, showing digital LED weight display ### foreigner, cartoon, 3d render, blurry"),

    ("step6_instant_payout.jpg", 
     "Realistic candid portrait of a happy smiling Indian homeowner checking smartphone receiving instant UPI bank credit alert after scrap pickup, warm natural daylight ### foreigner, caucasian, cartoon, 3d render, blurry"),

    ("scrapper_kyc_approved.jpg", 
     "Realistic photograph of an official Indian government format photo identity card with green verified checkmark shield badge and holographic security ribbon on clean white desk ### foreign passport, cartoon, 3d render, blurry"),

    ("scrapper_vehicle_loader.jpg", 
     "Commercial studio photograph of a modern green electric 3-wheeler commercial cargo auto loader vehicle designed for scrap collection in India, isolated on pure solid white background, sharp focus, clean product shot ### outdoor, messy, cartoon, 3d render, blurry")
]

MODELS = [
    'Juggernaut XL',
    'ICBINP - I Can\'t Believe It\'s Not Photography',
    'AlbedoBase XL (SDXL)',
    'Deliberate'
]

def submit_item(prompt, is_white_bg=True):
    if is_white_bg:
        full_prompt = (
            f"Commercial e-commerce product photograph of {prompt}, "
            "centered composition, isolated on pure solid white background, seamless #ffffff background, "
            "professional studio lighting, razor sharp focus, 8k resolution, Hasselblad H6D-100c, 85mm f/2.8 lens, "
            "clean mobile app catalog photography, pristine crisp details ### "
            "dark background, black background, grey background, floor, ground, wall, room, outdoor, grass, messy, table, shadow, text, watermark, blurry, low quality, cartoon, 3d render, clay, drawing, illustration, CGI, distorted, noisy"
        )
    else:
        full_prompt = prompt

    url = 'https://stablehorde.net/api/v2/generate/async'
    payload = {
        'prompt': full_prompt,
        'params': {
            'steps': 28,
            'width': 768,
            'height': 768,
            'cfg_scale': 7.5,
            'sampler_name': 'k_euler_a'
        },
        'models': MODELS
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'apikey': '0000000000', 'Client-Agent': 'ScraptoApp:3.0:indian_app'}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get('id')
    except Exception as e:
        print(f"Submit error: {e}", flush=True)
        return None

def check_item(job_id):
    url = f'https://stablehorde.net/api/v2/generate/status/{job_id}'
    req = urllib.request.Request(url, headers={'Client-Agent': 'ScraptoApp:3.0:indian_app'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {'faulted': True, 'error': str(e)}

def download_and_save(img_url, out_path):
    req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read()
        im = Image.open(io.BytesIO(raw))
        im_1024 = im.resize((1024, 1024), Image.Resampling.LANCZOS)
        im_sharp = im_1024.filter(ImageFilter.UnsharpMask(radius=1.3, percent=110, threshold=3))
        im_sharp.convert('RGB').save(out_path, quality=96)
        return os.path.getsize(out_path)

def process_batch(items, is_white_bg=True):
    active = {}
    for filename, prompt in items:
        out_path = os.path.join(ASSETS_DIR, filename)
        jid = submit_item(prompt, is_white_bg=is_white_bg)
        if jid:
            active[jid] = (filename, out_path)
            print(f"Submitted {filename} -> {jid}", flush=True)
        time.sleep(0.4)

    start = time.time()
    while active and (time.time() - start < 180):
        for jid in list(active.keys()):
            filename, out_path = active[jid]
            status = check_item(jid)
            if status.get('done'):
                gens = status.get('generations', [])
                if gens and gens[0].get('img'):
                    img_url = gens[0]['img']
                    try:
                        sz = download_and_save(img_url, out_path)
                        print(f"[SUCCESS] {filename} -> {sz} bytes (HD 1024x1024)", flush=True)
                    except Exception as e:
                        print(f"[ERROR] {filename}: {e}", flush=True)
                del active[jid]
            elif status.get('faulted'):
                print(f"[FAULT] {filename} faulted", flush=True)
                del active[jid]
        if active:
            time.sleep(3)

def main():
    print("=== Step 1: Processing Category Images on PURE WHITE BACKGROUND ===", flush=True)
    BATCH_SIZE = 5
    for i in range(0, len(WHITE_BG_CATEGORIES), BATCH_SIZE):
        batch = WHITE_BG_CATEGORIES[i:i+BATCH_SIZE]
        print(f"\n--- Category Batch {i//BATCH_SIZE + 1} ({len(batch)} items) ---", flush=True)
        process_batch(batch, is_white_bg=True)

    print("\n=== Step 2: Processing Indian Human & Realistic Context Items ===", flush=True)
    for i in range(0, len(INDIAN_HUMAN_ITEMS), BATCH_SIZE):
        batch = INDIAN_HUMAN_ITEMS[i:i+BATCH_SIZE]
        print(f"\n--- Indian Context Batch {i//BATCH_SIZE + 1} ({len(batch)} items) ---", flush=True)
        process_batch(batch, is_white_bg=False)

    print("\nAll white-background categories and Indian context items updated successfully!", flush=True)

if __name__ == '__main__':
    main()
