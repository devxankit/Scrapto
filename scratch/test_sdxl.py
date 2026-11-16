import urllib.request
import json
import time

url = 'https://stablehorde.net/api/v2/generate/async'
payload = {
    'prompt': 'A high quality crystal clear realistic photograph of bright clean copper scrap pipes and coiled copper electrical wire in sharp focus, professional commercial product photography, studio lighting, canon eos r5 85mm lens, f/2.8, 8k uhd, hyperrealistic, detailed metal texture ### blurry, low quality, cartoon, 3d render, clay, drawing, illustration, out of focus',
    'params': {
        'steps': 30,
        'width': 768,
        'height': 768,
        'cfg_scale': 7.5,
        'sampler_name': 'k_euler_a'
    },
    'models': ['Juggernaut XL', 'ICBINP - I Can\'t Believe It\'s Not Photography', 'Deliberate', 'AlbedoBase XL (SDXL)']
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'apikey': '0000000000',
        'Client-Agent': 'ScraptoApp:1.0:test_hd'
    }
)

with urllib.request.urlopen(req, timeout=15) as resp:
    res = json.loads(resp.read())
    jid = res.get('id')
    print('Job submitted:', jid)

time.sleep(2)
for _ in range(20):
    check_url = f'https://stablehorde.net/api/v2/generate/status/{jid}'
    c_req = urllib.request.Request(check_url, headers={'Client-Agent': 'ScraptoApp:1.0:test_hd'})
    with urllib.request.urlopen(c_req) as c_resp:
        status = json.loads(c_resp.read())
        print(f"waiting: {status.get('wait_time')}, queue: {status.get('queue_position')}, done: {status.get('done')}")
        if status.get('done'):
            img_url = status['generations'][0]['img']
            print('Success! Image URL:', img_url[:80])
            break
    time.sleep(4)
