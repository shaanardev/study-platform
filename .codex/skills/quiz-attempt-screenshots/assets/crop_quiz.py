import json
import sys
from pathlib import Path
from PIL import Image

manifest = Path(sys.argv[1])
output_dir = Path(sys.argv[2])
output_dir.mkdir(parents=True, exist_ok=True)
records = json.loads(manifest.read_text(encoding="utf-8"))
for record in records:
    number = record["number"]
    source = Path(record["rawPath"])
    bounds = tuple(record["crop"])
    with Image.open(source) as image:
        if not (0 <= bounds[0] < bounds[2] <= image.width and 0 <= bounds[1] < bounds[3] <= image.height):
            raise ValueError(f"Invalid crop for q{number}: {bounds}")
        destination = output_dir / f"q{number}.png"
        image.crop(bounds).save(destination, format="PNG", optimize=True)
        print(f"{destination.name}: {bounds[2] - bounds[0]}x{bounds[3] - bounds[1]}")
