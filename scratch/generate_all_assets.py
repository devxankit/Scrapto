import urllib.request
import json
import time
import os
import io
from PIL import Image

ASSETS_DIR = r"E:\Appzeto Projects\scrapto\assets"
os.makedirs(ASSETS_DIR, exist_ok=True)

ITEMS = [
    # Group 1: Core Scrap Materials & Categories
    ("category_plastic.jpg", "3D isometric render of recyclable plastic items, clear PET bottles, colorful plastic containers, and detergent jugs stacked cleanly with emerald green recycling badge. Clean studio lighting, claymorphism style, white background"),
    ("category_metal.jpg", "3D isometric render of clean scrap metal recycling, shiny copper pipes, polished steel beams, aluminum cans, golden brass fittings arranged neatly. Sleek metallic reflections, white background"),
    ("category_paper.jpg", "3D isometric render of recyclable paper and cardboard, neatly tied stack of cardboard cartons, newspapers, kraft paper rolls with green eco-leaf badge, white background"),
    ("category_electronics.jpg", "3D isometric render of electronic e-waste scrap, green computer motherboard, RAM sticks, old smartphone, CPU chips with gold pins, clean studio lighting, white background"),
    ("category_copper.jpg", "3D isometric render of scrap copper recycling, bright shiny copper wire bundles, heavy copper pipe fittings, bare bright copper wire coils arranged neatly, white background"),
    ("category_aluminium.jpg", "3D isometric render of clean scrap aluminum recycling, compressed aluminum beverage cans, aluminum foil rolls, shiny extruded profiles, white background"),
    ("category_steel.jpg", "3D isometric render of stainless steel scrap, shiny metal utensils, steel pipes, industrial steel gears and bolts, bright chrome finish, white background"),
    ("category_brass.jpg", "3D isometric render of scrap brass recycling, vintage golden brass water taps, heavy brass valves, plumbing fittings, shiny polished metal, white background"),
    ("category_iron.jpg", "3D isometric render of heavy scrap iron, black cast iron weights, wrought iron gate fragment, iron industrial rebar, realistic textures, white background"),
    ("category_glass.jpg", "3D isometric render of recyclable glass bottles and jars, transparent clear, emerald green, and amber brown bottles in modern recycling crate, white background"),
    ("category_battery.jpg", "3D isometric render of heavy automotive car battery and home inverter battery with red and black terminals, electrolyte level markers, clean product render, white background"),
    ("category_tyre_rubber.jpg", "3D isometric render of recycled automotive rubber tires, motorcycle tyres neatly stacked with distinct tread patterns, clean studio render, white background"),
    ("category_wire_cable.jpg", "3D isometric render of stripped electrical copper wiring, thick industrial power cable spool, colorful insulated wires, white background"),
    ("category_wooden_furniture.jpg", "3D isometric render of recyclable scrap timber wood, clean wooden shipping pallet, disassembled timber planks, eco-friendly recycling badge, white background"),
    ("category_vehicles.jpg", "3D isometric render of vehicle automobile scrap recycling, modern dismantled car chassis, metallic motor engine block, car door panels, white background"),

    # Group 2: Home & Office Appliances
    ("category_appliance_ac.jpg", "3D isometric render of scrap split air conditioner indoor unit, outdoor condenser unit with copper cooling fins, white background, clean product style"),
    ("category_appliance_washing_machine.jpg", "3D isometric render of scrap front-loading washing machine with transparent glass door, stainless steel drum, white background"),
    ("category_appliance_refrigerator.jpg", "3D isometric render of scrap double-door refrigerator, open doors showing cooling coils and compressor, white background"),
    ("category_appliance_microwave.jpg", "3D isometric render of old microwave oven and kitchen electrical appliances, glass turntable plate, white background"),
    ("category_appliance_geyser.jpg", "3D isometric render of water heater geyser appliance with copper heating element and water inlet pipes, white background"),
    ("category_appliance_cooler.jpg", "3D isometric render of desert air cooler metal body, cooling honey-comb pads, electric water pump, white background"),
    ("category_appliance_tv_monitor.jpg", "3D isometric render of flat screen LED TV and computer monitor with circuit board peeking out, white background"),
    ("category_appliance_fans.jpg", "3D isometric render of metallic ceiling fan and pedestal fan with copper motor winding visible, white background"),

    # Group 3: Hero & Marketing Banners
    ("banner_reduce_reuse_recycle.jpg", "Vibrant 3D panoramic banner illustration of Reduce Reuse Recycle eco-system, green floating island with modern recycling center, clean wind turbine, solar panels, lush trees, emerald green aesthetic"),
    ("banner_best_market_rates.jpg", "Vibrant 3D panoramic banner illustration of live scrap market rates, ascending gold bar chart, floating golden rupee coins, digital balance scale, financial prosperity theme"),
    ("banner_verified_collectors.jpg", "Vibrant 3D panoramic banner illustration of verified friendly scrap collector wearing green eco-uniform with ID badge, carrying digital weighing machine, modern electric cargo van in background"),
    ("banner_doorstep_free_pickup.jpg", "Vibrant 3D panoramic banner illustration of doorstep scrap pickup service, cute modern green electric delivery van parked outside a stylish house, sunrise lighting, friendly service"),
    ("banner_instant_upi_payment.jpg", "Vibrant 3D panoramic banner illustration of instant UPI payment, modern smartphone screen with green success checkmark, rupee cash notes and digital coins flying into digital wallet"),
    ("banner_clean_green_india.jpg", "Vibrant 3D panoramic banner illustration of clean green smart city, eco-friendly streets, electric mobility, happy citizens recycling scrap, sustainable future, blue sky"),

    # Group 4: Step-by-Step 'How It Works' Flow
    ("step1_select_category.jpg", "3D isometric render of mobile phone showing scrap category selection UI with plastic, metal, and paper icons, finger tapping screen, studio lighting, white background"),
    ("step2_upload_photos.jpg", "3D isometric render of smartphone taking a photo of a scrap pile, camera aperture icon, holographic image upload preview, clean modern 3D icon"),
    ("step3_schedule_date.jpg", "3D isometric render of digital calendar with highlighted date, green checkmark clock, doorstep delivery pin, white background"),
    ("step4_doorstep_pickup.jpg", "3D isometric render of green electric 3-wheeler scrap loader auto arriving at doorstep, GPS navigation pin on top, white background"),
    ("step5_digital_weighing.jpg", "3D isometric render of high-precision heavy-duty digital weighing platform with scrap box on top, illuminated LED display screen, certified accuracy badge"),
    ("step6_instant_payout.jpg", "3D isometric render of instant bank transfer, smartphone showing incoming payment notification with green tick and golden rupee coins"),

    # Group 5: Rewards, Wallet & Gamification
    ("reward_refer_and_earn.jpg", "3D render of refer and earn concept, golden gift box opening with confetti, connected friends avatars, flying coins, vibrant festive lighting"),
    ("reward_wallet_cashback.jpg", "3D render of full emerald green leather wallet overflowing with golden coins and cashback percentage badge % off"),
    ("reward_spin_wheel.jpg", "3D lucky spin wheel with colorful sections for scrap bonus cash, discount coupons, and multiplier prizes, glowing gold rim"),
    ("reward_badge_eco_warrior.jpg", "3D shiny bronze and green leaf medal badge for Eco Warrior recycler level 1, glossy enamel texture, white background"),
    ("reward_badge_green_hero.jpg", "3D shiny polished silver recycling medal badge with emerald laurel wreath for Green Hero level 2, white background"),
    ("reward_badge_planet_saver.jpg", "3D gleaming golden crown and diamond-studded recycling badge for Planet Saver level 3, sparkling light reflections"),
    ("reward_leaderboard_podium.jpg", "3D winner podium numbered 1 2 3 with golden trophy cup, green leafy garlands, and floating celebration stars"),
    ("reward_discount_coupon.jpg", "3D colorful gift voucher coupon ticket with perforated edges, golden scissors, and percentage discount symbol"),

    # Group 6: Empty States & Placeholders
    ("empty_orders.jpg", "3D cute minimalist empty cardboard carton box with soft shadow, gentle floating question mark, clean white background, friendly empty state illustration"),
    ("empty_chats.jpg", "3D pair of empty speech message bubbles floating gently with three subtle dots, friendly waiting state, white background"),
    ("empty_notifications.jpg", "3D golden notification bell with silence slash line, floating gentle zzz sleep symbols, white background"),
    ("empty_address.jpg", "3D empty location map pad with dashed outline pin and green plus button to add new address, clean design"),
    ("empty_bids.jpg", "3D wooden auction hammer resting beside an hourglass, peaceful waiting for scrapper bids, white background"),
    ("empty_wallet.jpg", "3D sleek empty cardholder wallet with single shimmering coin ready to start earning, white background"),
    ("empty_search.jpg", "3D magnifying glass floating over empty document paper with soft pastel colors, no results found illustration"),

    # Group 7: Order & Pickup Status Badges
    ("status_pending.jpg", "3D clock hourglass badge with amber glowing ring, request pending review, glossy modern render"),
    ("status_confirmed.jpg", "3D emerald green circular badge with crisp white checkmark, certified order confirmation, floating sparkles"),
    ("status_in_progress.jpg", "3D animated gears turning with green electric recycling van on track, pickup in progress status icon"),
    ("status_weighing.jpg", "3D hanging hook digital scale weighing a scrap bundle, live weight measurement in progress icon"),
    ("status_completed.jpg", "3D golden celebration star with green ribbon and laurel, order successfully completed icon"),
    ("status_cancelled.jpg", "3D soft red circular badge with smooth cross mark, gentle cancellation status icon"),

    # Group 8: Scrapper Partner Pro & KYC
    ("scrapper_kyc_approved.jpg", "3D security shield with green lock and verified government ID card with photo and checkmark, trust badge"),
    ("scrapper_plan_silver.jpg", "3D metallic silver subscription card with modern microchip and Scrapto silver partner badge, white background"),
    ("scrapper_plan_gold.jpg", "3D brushed gold luxury subscription card with crown motif and VIP scrapper privileges, white background"),
    ("scrapper_plan_platinum.jpg", "3D dark titanium and neon green platinum partner card with glowing diamond icon, ultimate tier"),
    ("scrapper_safety_kit.jpg", "3D scrapper safety equipment, heavy duty protective gloves, neon high-visibility vest, safety helmet, and digital meter"),
    ("scrapper_vehicle_loader.jpg", "3D custom electric cargo three-wheeler designed for scrap hauling, green paint, sturdy metal railings, clean isometric view")
]

def submit_job(prompt, models=None):
    if models is None:
        models = ["stable_diffusion", "Deliberate", "Dreamshaper", "ICBINP - I Can't Believe It's Not Photography"]
    url = 'https://stablehorde.net/api/v2/generate/async'
    full_prompt = prompt + ", 3D render, claymorphism, isometric, soft studio lighting, high resolution, highly detailed, beautiful design, 8k"
    payload = {
        'prompt': full_prompt,
        'params': {
            'steps': 25,
            'width': 512,
            'height': 512,
            'cfg_scale': 7.5,
            'sampler_name': 'k_euler'
        },
        'models': models
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'apikey': '0000000000',
            'Client-Agent': 'ScraptoApp:1.0:fullgen'
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get('id')
    except Exception as e:
        print(f"Submission error: {e}", flush=True)
        return None

def check_job(job_id):
    url = f'https://stablehorde.net/api/v2/generate/status/{job_id}'
    req = urllib.request.Request(url, headers={'Client-Agent': 'ScraptoApp:1.0:fullgen'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {'faulted': True, 'error': str(e)}

def download_and_save(img_url, out_path):
    req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
        im = Image.open(io.BytesIO(raw))
        im.convert('RGB').save(out_path, quality=94)
        return len(raw)

def main():
    todo = []
    for filename, prompt in ITEMS:
        out_path = os.path.join(ASSETS_DIR, filename)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
            print(f"[EXISTS] {filename} ({os.path.getsize(out_path)} bytes)", flush=True)
        else:
            todo.append((filename, prompt, out_path))

    print(f"\nTotal items in plan: {len(ITEMS)}. Remaining to generate: {len(todo)}\n", flush=True)
    if not todo:
        print("All assets already generated!", flush=True)
        return

    # Process in batches of 6
    BATCH_SIZE = 6
    for i in range(0, len(todo), BATCH_SIZE):
        batch = todo[i:i+BATCH_SIZE]
        print(f"\n--- Starting Batch {i//BATCH_SIZE + 1} ({len(batch)} items) ---", flush=True)
        active_jobs = {}
        for filename, prompt, out_path in batch:
            jid = submit_job(prompt)
            if jid:
                active_jobs[jid] = (filename, out_path)
                print(f"Submitted {filename} -> {jid}", flush=True)
            time.sleep(0.4)

        start_time = time.time()
        while active_jobs and (time.time() - start_time < 180):
            for jid in list(active_jobs.keys()):
                filename, out_path = active_jobs[jid]
                status = check_job(jid)
                if status.get('done'):
                    gens = status.get('generations', [])
                    if gens and gens[0].get('img'):
                        img_url = gens[0]['img']
                        try:
                            nbytes = download_and_save(img_url, out_path)
                            print(f"[DONE] {filename} saved! ({nbytes} bytes)", flush=True)
                        except Exception as e:
                            print(f"[ERROR] Failed saving {filename}: {e}", flush=True)
                    else:
                        print(f"[NO-IMG] {filename} had no image returned", flush=True)
                    del active_jobs[jid]
                elif status.get('faulted'):
                    print(f"[FAULT] {filename} faulted", flush=True)
                    del active_jobs[jid]
            if active_jobs:
                time.sleep(3)

        if active_jobs:
            print(f"Batch timed out with {len(active_jobs)} unfinished items.", flush=True)

    print("\nGeneration process complete!", flush=True)

if __name__ == '__main__':
    main()
