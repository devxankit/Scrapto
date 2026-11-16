import urllib.request
import json

url = "https://stablehorde.net/api/v2/status/models"
req = urllib.request.Request(url, headers={"Client-Agent": "ScraptoApp:1.0:test"})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        models = json.loads(resp.read())
        sorted_models = sorted(models, key=lambda m: m.get("count", 0), reverse=True)
        for m in sorted_models[:10]:
            print(m.get("name"), "count:", m.get("count"), "eta:", m.get("eta"))
except Exception as e:
    print("Models error:", e)
