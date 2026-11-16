import urllib.request
import urllib.parse
import json
import time
import os
import io
from PIL import Image, ImageFilter

ASSETS_DIR = r"E:\Appzeto Projects\scrapto\assets"
os.makedirs(ASSETS_DIR, exist_ok=True)

ITEMS = [
    # 1. Scrap Materials
    ("category_plastic.jpg", "real photograph of colorful recycled plastic bottles, milk jugs, detergent containers stacked cleanly in recycling facility, sharp focus, 8k photography"),
    ("category_metal.jpg", "real photograph of sorted scrap metal, shiny copper tubing, steel rods, aluminum cans, brass fittings on industrial table, studio lighting, canon eos r5"),
    ("category_paper.jpg", "real photograph of clean compressed cardboard recycling bales and neat bundles of newspapers with tied twine, sharp focus"),
    ("category_electronics.jpg", "real photograph of discarded computer circuit boards, RAM memory sticks, motherboards, CPU processors, and disassembled electronics e-waste"),
    ("category_copper.jpg", "real photograph of bright shiny bare copper wire coils and polished copper plumbing pipe fittings on clean workbench, metallic reflection, sharp focus"),
    ("category_aluminium.jpg", "real photograph of clean crushed colorful aluminum soda cans and shiny aluminum metal profiles"),
    ("category_steel.jpg", "real photograph of stainless steel scrap utensils, steel industrial pipes, bolts, and machinery parts, bright metallic sheen"),
    ("category_brass.jpg", "real photograph of heavy vintage brass water taps, plumbing valves, and golden brass metal fittings"),
    ("category_iron.jpg", "real photograph of heavy dark cast iron scrap, industrial iron weights, and solid metal rebar"),
    ("category_glass.jpg", "real photograph of sorted clean glass beverage bottles in amber brown, emerald green, and clear glass in wooden recycling box"),
    ("category_battery.jpg", "real photograph of heavy 12V lead-acid automotive car battery and inverter battery with red and black terminals"),
    ("category_tyre_rubber.jpg", "real photograph of clean stacked rubber car tires and motorcycle tires with deep tread grooves in garage workshop"),
    ("category_wire_cable.jpg", "real photograph of stripped electrical copper cables, colorful insulated wiring coils and thick wire spool"),
    ("category_wooden_furniture.jpg", "real photograph of clean solid wood timber pallets, wooden planks, and disassembled wooden furniture"),
    ("category_vehicles.jpg", "real photograph of scrapped automobile chassis, motor engine block, and car body panels in clean recycling yard"),

    # 2. Appliances
    ("category_appliance_ac.jpg", "real photograph of split air conditioner indoor unit and outdoor condenser metal casing with copper cooling fins"),
    ("category_appliance_washing_machine.jpg", "real photograph of modern front-loading washing machine with chrome drum"),
    ("category_appliance_refrigerator.jpg", "real photograph of modern double-door refrigerator appliance standing in clean studio"),
    ("category_appliance_microwave.jpg", "real photograph of stainless steel countertop microwave oven with digital display"),
    ("category_appliance_geyser.jpg", "real photograph of household water heater geyser appliance with copper pipes"),
    ("category_appliance_cooler.jpg", "real photograph of metal body evaporative desert air cooler with honey-comb cooling pads"),
    ("category_appliance_tv_monitor.jpg", "real photograph of sleek flat-screen LED TV monitor on clean table"),
    ("category_appliance_fans.jpg", "real photograph of metallic ceiling fan and pedestal electric fan with copper motor"),

    # 3. Banners
    ("banner_reduce_reuse_recycle.jpg", "realistic panoramic photograph of modern sustainable green recycling facility, solar panels on roof, electric recycling truck, blue sky and green trees"),
    ("banner_best_market_rates.jpg", "realistic photograph of modern digital weighing scale with scrap metal, gold bullion coins, and tablet displaying live commodity market charts"),
    ("banner_verified_collectors.jpg", "realistic photograph of smiling professional scrap collection worker wearing green uniform and safety vest, holding digital weighing scale beside green electric cargo van"),
    ("banner_doorstep_free_pickup.jpg", "realistic photograph of modern green electric cargo three-wheeler parked outside a beautiful suburban house for doorstep scrap collection"),
    ("banner_instant_upi_payment.jpg", "realistic photograph of hands holding modern smartphone showing green payment success checkmark screen with cash notes on clean wooden desk"),
    ("banner_clean_green_india.jpg", "realistic photograph of clean green smart city street with electric vehicles, lush green trees, solar streetlights, and blue sky"),

    # 4. Flow Steps
    ("step1_select_category.jpg", "realistic photograph of fingers tapping a mobile phone screen displaying an online recycling marketplace app, clean modern background"),
    ("step2_upload_photos.jpg", "realistic photograph of smartphone taking a clear photo of neatly piled scrap materials on a floor"),
    ("step3_schedule_date.jpg", "realistic photograph of clean wooden desk with a paper calendar marked with green circle, modern smartphone, and house keys"),
    ("step4_doorstep_pickup.jpg", "realistic photograph of green electric delivery loader vehicle arriving at residential driveway, daylight"),
    ("step5_digital_weighing.jpg", "realistic photograph of heavy duty industrial digital platform scale accurately weighing a heavy carton box, clear LED digital numbers"),
    ("step6_instant_payout.jpg", "realistic photograph of customer holding smartphone showing mobile banking credit transaction notification, smiling"),

    # 5. Rewards & Gamification
    ("reward_refer_and_earn.jpg", "realistic photograph of luxury elegant gift box wrapped in emerald green paper with gold satin ribbon surrounded by shiny gold coins on marble"),
    ("reward_wallet_cashback.jpg", "realistic photograph of genuine green leather wallet filled with crisp currency notes and gold coins on dark oak wood"),
    ("reward_spin_wheel.jpg", "realistic photograph of colorful illuminated lucky prize spin wheel with gold trim in studio"),
    ("reward_badge_eco_warrior.jpg", "realistic photograph of heavy solid bronze medal with embossed green recycling leaf emblem on white marble"),
    ("reward_badge_green_hero.jpg", "realistic photograph of polished sterling silver medallion badge with emerald laurel wreath engraving on granite"),
    ("reward_badge_planet_saver.jpg", "realistic photograph of 24k solid gold trophy medallion with sparkling diamond accents on black velvet"),
    ("reward_leaderboard_podium.jpg", "realistic photograph of clean white numbered 1 2 3 winners podium with polished gold, silver, and bronze trophy cups"),
    ("reward_discount_coupon.jpg", "realistic photograph of premium printed gift coupon voucher with metallic gold foil stamp and ribbon"),

    # 6. Empty States
    ("empty_orders.jpg", "realistic minimalist photograph of a clean, empty brown corrugated cardboard box sitting on light wooden floor, soft daylight"),
    ("empty_chats.jpg", "realistic photograph of a clean minimalist modern notebook with pen resting on white desk, soft natural morning light"),
    ("empty_notifications.jpg", "realistic photograph of a vintage polished brass table call bell resting on clean white table"),
    ("empty_address.jpg", "realistic photograph of a paper road map with a red push pin marker dropped on a clean work desk"),
    ("empty_bids.jpg", "realistic photograph of a polished wooden auction gavel resting next to a glass sand hourglass on oak desk"),
    ("empty_wallet.jpg", "realistic photograph of a slim minimalist black leather cardholder wallet resting on clean marble tabletop"),
    ("empty_search.jpg", "realistic photograph of a classic magnifying glass with brass handle resting on blank textured paper sheet"),

    # 7. Status & Verification
    ("status_pending.jpg", "realistic photograph of an elegant glass hourglass with golden sand running down on dark wood surface"),
    ("status_confirmed.jpg", "realistic photograph of a clean white clipboard with verified green stamp and green pen"),
    ("status_in_progress.jpg", "realistic photograph of green electric delivery cargo van driving on sunny city road"),
    ("status_weighing.jpg", "realistic photograph of commercial digital crane hanging scale weighing a heavy sack of materials"),
    ("status_completed.jpg", "realistic photograph of polished golden star award trophy on dark granite pedestal"),
    ("status_cancelled.jpg", "realistic photograph of clean minimalist red circular wax seal stamp on textured paper"),
    ("scrapper_kyc_approved.jpg", "realistic photograph of official government laminated ID card with holographic security seal and green verification checkmark ribbon"),
    ("scrapper_plan_silver.jpg", "realistic photograph of premium brushed silver metallic credit card with microchip resting on dark stone"),
    ("scrapper_plan_gold.jpg", "realistic photograph of luxury 24k gold metal VIP card with engraved emblem on black velvet"),
    ("scrapper_plan_platinum.jpg", "realistic photograph of matte black titanium elite membership card with neon green border"),
    ("scrapper_safety_kit.jpg", "realistic photograph of heavy-duty leather work gloves, bright neon safety vest, and hard hat helmet neatly arranged on table"),
    ("scrapper_vehicle_loader.jpg", "realistic photograph of modern green electric 3-wheeler commercial cargo auto loader vehicle in outdoor showroom")
]

MODELS = [
    'ICBINP - I Can\'t Believe It\'s Not Photography',
    'Deliberate',
    'AlbedoBase XL (SDXL)',
    'Juggernaut XL',
    'Dreamshaper'
]

def submit_realistic(prompt):
    full_prompt = (
        f"Commercial professional high-end photography of {prompt}, "
        "hyperrealistic, razor sharp focus, 8k resolution, Hasselblad H6D-100c, 85mm f/2.8 lens, "
        "natural lighting, rich textures, studio quality ### "
        "blurry, low quality, cartoon, 3d render, clay, drawing, illustration, CGI, noisy, distorted, pixelated, out of focus, lowres"
    )
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
        headers={
            'Content-Type': 'application/json',
            'apikey': '0000000000',
            'Client-Agent': 'ScraptoApp:2.0:realistic'
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get('id')
    except Exception as e:
        print(f"Submit error: {e}", flush=True)
        return None

def check_realistic(job_id):
    url = f'https://stablehorde.net/api/v2/generate/status/{job_id}'
    req = urllib.request.Request(url, headers={'Client-Agent': 'ScraptoApp:2.0:realistic'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {'faulted': True, 'error': str(e)}

def download_and_process(img_url, out_path):
    req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read()
        im = Image.open(io.BytesIO(raw))
        # Upscale to 1024x1024 with Lanczos
        im_1024 = im.resize((1024, 1024), Image.Resampling.LANCZOS)
        # Apply gentle unsharp mask for crystal clear sharpness
        im_sharp = im_1024.filter(ImageFilter.UnsharpMask(radius=1.4, percent=115, threshold=3))
        im_sharp.convert('RGB').save(out_path, quality=96)
        return os.path.getsize(out_path)

def main():
    print(f"Total items to generate realistic HD: {len(ITEMS)}", flush=True)
    BATCH_SIZE = 5

    for i in range(0, len(ITEMS), BATCH_SIZE):
        batch = ITEMS[i:i+BATCH_SIZE]
        print(f"\n=== Starting Realistic Batch {i//BATCH_SIZE + 1} ({len(batch)} items) ===", flush=True)
        active = {}
        for filename, prompt in batch:
            out_path = os.path.join(ASSETS_DIR, filename)
            jid = submit_realistic(prompt)
            if jid:
                active[jid] = (filename, out_path)
                print(f"Submitted {filename} -> {jid}", flush=True)
            time.sleep(0.4)

        start = time.time()
        while active and (time.time() - start < 180):
            for jid in list(active.keys()):
                filename, out_path = active[jid]
                status = check_realistic(jid)
                if status.get('done'):
                    gens = status.get('generations', [])
                    if gens and gens[0].get('img'):
                        img_url = gens[0]['img']
                        try:
                            sz = download_and_process(img_url, out_path)
                            print(f"[SUCCESS] {filename} -> {sz} bytes (1024x1024 sharp photo)", flush=True)
                        except Exception as e:
                            print(f"[FAIL] {filename}: {e}", flush=True)
                    del active[jid]
                elif status.get('faulted'):
                    print(f"[FAULT] {filename} failed on worker", flush=True)
                    del active[jid]
            if active:
                time.sleep(3)

    print("\nAll realistic HD images processed!", flush=True)

if __name__ == '__main__':
    main()
