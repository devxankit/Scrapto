import urllib.request
import json
import time
import os
from PIL import Image
import io

def submit_job(prompt, models=None):
    if models is None:
        models = ["stable_diffusion", "Deliberate", "Dreamshaper", "ICBINP - I Can't Believe It's Not Photography"]
    url = 'https://stablehorde.net/api/v2/generate/async'
    payload = {
        'prompt': prompt + ', 3D render, isometric, studio lighting, clean background, 8k resolution, trending on artstation, masterpiece',
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
            'Client-Agent': 'ScraptoApp:1.0:batch'
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get('id')
    except Exception as e:
        print(f"Error submitting {prompt[:20]}: {e}")
        return None

def check_job(job_id):
    url = f'https://stablehorde.net/api/v2/generate/status/{job_id}'
    req = urllib.request.Request(url, headers={'Client-Agent': 'ScraptoApp:1.0:batch'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {'faulted': True, 'error': str(e)}

items = [
    ('category_aluminium.jpg', 'scrap aluminum metal cans and clean metal ingots on white background'),
    ('category_steel.jpg', 'stainless steel scrap utensils, pipes and steel bolts shiny on white background'),
    ('category_brass.jpg', 'golden brass scrap valves, brass plumbing fittings, polished brass metal on white background')
]

jobs = {}
for filename, prompt in items:
    jid = submit_job(prompt)
    if jid:
        jobs[jid] = filename
        print(f"Submitted {filename} -> {jid}")
    time.sleep(0.5)

start = time.time()
completed = {}
while jobs and (time.time() - start < 120):
    for jid, filename in list(jobs.items()):
        status = check_job(jid)
        if status.get('done'):
            gens = status.get('generations', [])
            if gens and gens[0].get('img'):
                img_url = gens[0]['img']
                req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as resp:
                    raw = resp.read()
                    im = Image.open(io.BytesIO(raw))
                    out_path = os.path.join('assets', filename)
                    im.convert('RGB').save(out_path, quality=92)
                    print(f"DONE: {filename} -> saved to {out_path} ({len(raw)} bytes)")
                    completed[filename] = out_path
            del jobs[jid]
        elif status.get('faulted'):
            print(f"FAULT: {filename}")
            del jobs[jid]
    if jobs:
        time.sleep(3)

print("Batch finished. Completed:", len(completed))
