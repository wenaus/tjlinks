# tj-getlink

Chrome extension for quickly copying markdown-formatted links with customizable title and URL.

## Features

- **Quick markdown link copying**: Instantly copy `[title](url)` to clipboard
- **Editable fields**: Modify title and URL before copying
- **Strip suffix option**: Remove query parameters (`?...`) and anchors (`#...`) with one click
- **Pin controls**: Add `:pin` during capture, with an optional top-group placement
- **Auto-expanding fields**: Title and URL fields expand to show full content
- **Clean titles**: Automatically removes line breaks and extra whitespace from titles
- **Keyboard shortcut**: Cmd+Shift+L (Mac) / Ctrl+Shift+L (Windows/Linux)
- **Wide popup**: Uses 90% of window width for better URL visibility

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `tjlinks` checkout (`~/github/tjlinks`)
5. Pin the extension to your toolbar (puzzle piece icon → pin tj-getlink)

Existing installations using `tjrepo/tj-getlink` continue through its
compatibility symlink to the standalone checkout.

## Usage

- Click the TJ icon in your toolbar or press Cmd+Shift+L
- Edit title/URL if needed
- Click "Copy" to copy with full URL
- Use the right-hand "without suffix" button beside an action to strip parameters and anchors
- Select "pin" to include `:pin`; select "top" to include `:pin` and add a saved entry to the ordered top pin group
- Press Enter for quick copy (uses full URL)

## Development

- `manifest.json`: Chrome extension configuration
- `popup.html/css/js`: Extension UI and logic
- `create_icons.py`: Generate extension icons (requires Pillow)
- Icons: 16x16, 48x48, 128x128 PNG files with "TJ" text

## Requirements

- Chrome browser
- Python 3 + Pillow for icon generation (optional)

## License and history

Developed by Torre Wenaus with AI assistance. The code is licensed under
[Apache 2.0](LICENSE). The standalone `wenaus/tjlinks` repository retains the
extension's relevant history from `tjrepo/tj-getlink`, including authorship,
dates and commit messages; extraction changes commit hashes.
