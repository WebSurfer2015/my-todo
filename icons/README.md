# My Todos — App Icons

Complete icon set for "My Todos" web and mobile apps, exported from a single 1024×1024 vector master.

## What's inside

```
MyTodos-icons/
├── ios/                          → drop into Xcode AppIcon.appiconset
├── android/                      → drop into res/mipmap-* folders
├── web/                          → favicon, PWA, apple-touch, MS tiles
├── source-svg/                   → editable vector masters
├── wordmark-800x200.png          → header / splash screen
├── wordmark-1600x400.png         → @2x version
├── icon-monochrome-1024.png      → press kit / single-color use
└── favicon.png                   → quick-grab favicon (32px)
```

## iOS

Drop the entire `ios/` folder into Xcode. The 1024 is your App Store marketing icon; the rest cover every device class from notification badges (20pt) to iPad Pro (83.5pt).

| File | Use |
|---|---|
| `AppIcon-1024.png` | App Store listing |
| `AppIcon-180.png` | iPhone home screen (60pt @3x) |
| `AppIcon-167.png` | iPad Pro (83.5pt @2x) |
| `AppIcon-152.png` | iPad (76pt @2x) |
| `AppIcon-120.png` | iPhone home screen (60pt @2x) |
| `AppIcon-87/80/76/60/58/40/29/20.png` | Spotlight, Settings, notifications |

## Android

| File | Density | Use |
|---|---|---|
| `ic_launcher-512.png` | — | Play Store |
| `ic_launcher-xxxhdpi-192.png` | 640dpi | Pixel 4+ launchers |
| `ic_launcher-xxhdpi-144.png` | 480dpi | most modern devices |
| `ic_launcher-xhdpi-96.png` | 320dpi | |
| `ic_launcher-hdpi-72.png` | 240dpi | |
| `ic_launcher-mdpi-48.png` | 160dpi | baseline |
| `ic_launcher_round-*.png` | — | round mask launchers (Pixel) |

For full Android 8+ adaptive icon support, also generate a foreground/background pair using `source-svg/icon-primary.svg` — Android Studio's Image Asset Studio handles this.

## Web / PWA

Add to your HTML `<head>`:

```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="msapplication-TileColor" content="#4F46E9">
<meta name="msapplication-TileImage" content="/mstile-150.png">
<meta name="theme-color" content="#4F46E9">
```

Sample `site.webmanifest`:

```json
{
  "name": "My Todos",
  "short_name": "My Todos",
  "icons": [
    { "src": "/android-chrome-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/android-chrome-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "theme_color": "#4F46E9",
  "background_color": "#FFFFFF",
  "display": "standalone"
}
```

## Brand colors

| Role | Hex |
|---|---|
| Primary indigo | `#4F46E9` |
| Indigo highlight | `#6366F1` |
| Success green | `#10B981` / `#059669` |
| Text primary | `#0F172A` |
| Text secondary | `#475569` |

## Editing

All four masters live in `source-svg/`. Edit the SVG, then re-run the export script (or open in Figma / Illustrator / Inkscape — they're plain SVG with no funny business).
