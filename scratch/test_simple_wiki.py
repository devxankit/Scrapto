import urllib.request
import urllib.parse
import json

simple = [
    'copper scrap', 'metal scrap', 'cardboard recycling', 'steel scrap', 'brass scrap',
    'iron scrap', 'glass bottles recycling', 'car battery', 'tire recycling', 'wood pallet recycling',
    'scrap car', 'air conditioner unit', 'washing machine', 'refrigerator appliance', 'microwave oven',
    'digital scale', 'recycling truck', 'gift box'
]

for q in simple:
    url = f"https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch={urllib.parse.quote(q)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|size|mime"
    req = urllib.request.Request(url, headers={'User-Agent': 'ScraptoApp/2.0 (admin@scrapto.com)'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            pages = data.get('query', {}).get('pages', {})
            found = False
            for pid, pdata in pages.items():
                info = pdata.get('imageinfo', [{}])[0]
                url = info.get('url', '')
                mime = info.get('mime', '')
                if 'image/' in mime and any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png']):
                    w = info.get('width')
                    h = info.get('height')
                    sz = info.get('size')
                    print(f"{q} -> {w}x{h} ({sz} bytes) : {url}")
                    found = True
                    break
            if not found:
                print(f"{q} -> NOT FOUND")
    except Exception as e:
        print(f"{q} -> error {e}")
