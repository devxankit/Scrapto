import urllib.request
import json
import time
from PIL import Image, ImageFilter
import io
import os

ASSETS_DIR = r"E:\Appzeto Projects\scrapto\assets"

def test_generate(prompt, name):
    url = 'https://stablehorde.net/api/v2/generate/async'
    payload = {
        'prompt': prompt,
        'params': {
            'steps': 30,
            'width': 768,
            'height': 768,
            'cfg_scale': 7.5,
            'sampler_name': 'k_euler_a'
        },
        'models': ['Juggernaut XL', 'ICBINP - I Can\'t Believe It\'s Not Photography', 'AlbedoBase XL (SDXL)', 'Deliberate']
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'apikey': '0000000000', 'Client-Agent': 'ScraptoApp:3.0:indian_whitebg'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        jid = json.loads(resp.read())['id']
        print(f"Submitted {name} -> {jid}")

    for _ in range(30):
        time.sleep(3)
        c_req = urllib.request.Request(f'https://stablehorde.net/api/v2/generate/status/{jid}', headers={'Client-Agent': 'ScraptoApp:3.0:indian_whitebg'})
        with urllib.request.urlopen(c_req) as c_resp:
            status = json.loads(c_resp.read())
            if status.get('done'):
                img_url = status['generations'][0]['img']
                d_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(d_req) as d_resp:
                    im = Image.open(io.BytesIO(d_resp.read()))
                    im_1024 = im.resize((1024, 1024), Image.Resampling.LANCZOS)
                    im_sharp = im_1024.filter(ImageFilter.UnsharpMask(radius=1.3, percent=110, threshold=3))
                    out_path = os.path.join(ASSETS_DIR, name)
                    im_sharp.convert('RGB').save(out_path, quality=96)
                    print(f"SUCCESS: {name} saved! ({os.path.getsize(out_path)} bytes)")
                    return True
    return False

# Test 1: Category on pure white background
p_cat = (
    "Commercial e-commerce product photograph of recyclable plastic scrap items, "
    "clean clear PET water bottles, colorful detergent bottles neatly clustered in center, "
    "isolated on pure solid white background, studio lighting, high resolution, sharp focus, "
    "no shadow, product catalog shot for mobile app ### "
    "dark background, messy room, floor, grass, outdoor, text, blurry, cartoon, illustration, 3d render"
)
test_generate(p_cat, "test_whitebg_plastic.jpg")

# Test 2: Indian scrap collector human
p_indian = (
    "Authentic realistic photography of a friendly 28-year-old Indian man working as a scrap recycling partner in India, "
    "wearing a clean neat emerald green collared polo shirt with an official company ID card badge around his neck, "
    "warm friendly genuine smile, holding a modern digital hanging scale, standing in front of a modern green electric delivery auto, "
    "natural daylight, professional portrait photography, authentic Indian person, canon 5d mark iv, 85mm portrait lens, sharp focus ### "
    "caucasian, white person, foreigner, cartoon, fake, 3d render, anime, blurry, deformed face, bad eyes"
)
test_generate(p_indian, "test_indian_scrapper.jpg")
