import urllib.request
import urllib.parse
import json

queries = [
    'scrap copper pipes',
    'aluminum cans recycling',
    'plastic bottles recycling',
    'cardboard recycling bundles',
    'electronic e-waste recycling',
    'car scrap recycling'
]

for q in queries:
    url = f'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch={urllib.parse.quote(q)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url|size|mime'
    req = urllib.request.Request(url, headers={'User-Agent': 'ScraptoApp/1.0 (contact@scrapto.com)'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            pages = data.get('query', {}).get('pages', {})
            for pid, pdata in pages.items():
                info = pdata.get('imageinfo', [{}])[0]
                w = info.get('width')
                h = info.get('height')
                size = info.get('size')
                u = info.get('url', '')
                print(f"{q}: {w}x{h}, {size} bytes, URL: {u}")
    except Exception as e:
        print(f"{q} error: {e}")
