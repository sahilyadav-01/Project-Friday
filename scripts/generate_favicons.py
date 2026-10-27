import os
from PIL import Image, ImageDraw

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
img_path = os.path.join(base_dir, 'frontend', 'public', 'friday-core.jpg')
public_dir = os.path.join(base_dir, 'frontend', 'public')

print(f"Loading {img_path}...")
img = Image.open(img_path).convert("RGBA")

# Ensure image is square
w, h = img.size
min_dim = min(w, h)
left = (w - min_dim) // 2
top = (h - min_dim) // 2
img_cropped = img.crop((left, top, left + min_dim, top + min_dim))

# High-resolution master
master_size = 512
master = img_cropped.resize((master_size, master_size), Image.Resampling.LANCZOS)

# Create a smooth circular mask with antialiasing
mask = Image.new("L", (master_size * 2, master_size * 2), 0)
draw = ImageDraw.Draw(mask)
draw.ellipse((2, 2, master_size * 2 - 2, master_size * 2 - 2), fill=255)
mask = mask.resize((master_size, master_size), Image.Resampling.LANCZOS)

# Apply circular mask
circular_master = Image.new("RGBA", (master_size, master_size), (0, 0, 0, 0))
circular_master.paste(master, (0, 0), mask=mask)

# Save pwa-512x512.png
pwa_512 = os.path.join(public_dir, 'pwa-512x512.png')
circular_master.save(pwa_512, format='PNG')
print(f"Saved {pwa_512}")

# Save pwa-192x192.png
pwa_192 = circular_master.resize((192, 192), Image.Resampling.LANCZOS)
pwa_192_path = os.path.join(public_dir, 'pwa-192x192.png')
pwa_192.save(pwa_192_path, format='PNG')
print(f"Saved {pwa_192_path}")

# Save apple-touch-icon.png (180x180)
apple_icon = circular_master.resize((180, 180), Image.Resampling.LANCZOS)
apple_icon_path = os.path.join(public_dir, 'apple-touch-icon.png')
apple_icon.save(apple_icon_path, format='PNG')
print(f"Saved {apple_icon_path}")

# Save favicon-32x32.png
fav_32 = circular_master.resize((32, 32), Image.Resampling.LANCZOS)
fav_32_path = os.path.join(public_dir, 'favicon-32x32.png')
fav_32.save(fav_32_path, format='PNG')
print(f"Saved {fav_32_path}")

# Save favicon-16x16.png
fav_16 = circular_master.resize((16, 16), Image.Resampling.LANCZOS)
fav_16_path = os.path.join(public_dir, 'favicon-16x16.png')
fav_16.save(fav_16_path, format='PNG')
print(f"Saved {fav_16_path}")

# Save favicon.png
fav_png_path = os.path.join(public_dir, 'favicon.png')
fav_32.save(fav_png_path, format='PNG')
print(f"Saved {fav_png_path}")

# Save multi-size favicon.ico
fav_ico_path = os.path.join(public_dir, 'favicon.ico')
circular_master.save(
    fav_ico_path,
    format='ICO',
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
)
print(f"Saved {fav_ico_path}")
print("All F.R.I.D.A.Y. logo & favicon assets successfully generated!")
