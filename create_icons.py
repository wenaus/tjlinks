from PIL import Image, ImageDraw, ImageFont

# Create simple TJ icon
for size in [16, 48, 128]:
    img = Image.new('RGB', (size, size), color='#007aff')
    draw = ImageDraw.Draw(img)
    
    # Draw "TJ" text - make it bigger
    font_size = max(int(size * 0.65), 10)  # 65% of icon size
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
    except:
        try:
            # Try a different font path
            font = ImageFont.truetype('/Library/Fonts/Arial.ttf', font_size)
        except:
            font = ImageFont.load_default()
    
    text = "TJ"
    # Simple center positioning
    draw.text((size//2, size//2), text, fill='white', font=font, anchor='mm')
    
    img.save(f'icon{size}.png')

print("Icons created")