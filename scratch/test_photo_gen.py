import urllib.request
import json
import time
from PIL import Image, ImageFilter
import io

def generate_realistic_photo(prompt, name):
    full_prompt = f"Commercial product photography of {prompt}, crystal clear sharp focus, professional studio lighting, 8k resolution, canon eos r5, 85mm f/2.8 lens, highly detailed, realistic, ultra-high definition ### blurry, low quality, cartoon, 3d render, clay, drawing, illustration, CGI, noisy, distorted, pixelated, out of focus, lowres"
    url = 'https://stablehorde.net/api/v2/generate/async'
    payload = {
        'prompt': full_prompt,
        'params': {
            'steps': 30,
            'width': 768,
            'height': 768,
            'cfg_scale': 7.5,
            'sampler_name': 'k_euler_a'
        },
        'models': ['ICBINP - I Can\'t Believe It\'s Not Photography', 'Deliberate', 'AlbedoBase XL (SDXL)', 'Juggernaut XL', 'Dreamshaper']
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'apikey': '0000000000', 'Client-Agent': 'ScraptoApp:2.0:photo'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        res = json.loads(resp.read())
        jid = res.get('id')
        print(f"Submitted {name} -> {jid}")

    for i in range(25):
        time.sleep(3)
        check_url = f'https://stablehorde.net/api/v2/generate/status/{jid}'
        c_req = urllib.request.Request(check_url, headers={'Client-Agent': 'ScraptoApp:2.0:photo'})
        with urllib.request.urlopen(c_req) as c_resp:
            status = json.loads(c_resp.read())
            if status.get('done'):
                img_url = status['generations'][0]['img']
                d_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(d_req) as d_resp:
                    raw = d_resp.read()
                    im = Image.open(io.BytesIO(raw))
                    im_1024 = im.resize((1024, 1024), Image.Resampling.LANCZOS)
                    im_sharp = im_1024.filter(ImageFilter.UnsharpMask(radius=1.5, percent=120, threshold=3))
                    im_sharp.convert('RGB').save(f"assets/{name}", quality=96)
                    print(f"DONE: {name} saved at 1024x1024, size={len(raw)} bytes")
                    return True
    return False

generate_realistic_photo("bright shiny copper scrap pipes and coiled copper wire", "test_realistic_copper_pipes.jpg")
