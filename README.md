# Quran Chrome Extension

A beautiful Chrome extension for listening to Quran recitations using the [mp3quran.net API](https://www.mp3quran.net/ar/api).

## Features

- 🎵 Select from multiple reciters
- 📖 Browse all 114 surahs
- ▶️ Play/Pause controls
- ⏭️ Next/Previous surah navigation
- 💾 Saves your preferences (last selected reciter and surah)
- 🎨 Modern UI built with shadcn/ui and Tailwind CSS

## Installation

### Development Setup

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

### Creating Icons

The extension requires PNG icon files. You can:

1. Convert the SVG files in the `icons` folder to PNG using any image converter
2. Or create your own icons (16x16, 48x48, and 128x128 pixels)
3. Save them as `icon16.png`, `icon48.png`, and `icon128.png` in the `icons` folder

## Development

- **Build**: `npm run build`
- **Watch mode**: `npm run dev` (rebuilds on file changes)

After building, reload the extension in Chrome to see changes.

## Usage

1. Click the extension icon in your Chrome toolbar
2. Select a reciter from the dropdown
3. Select a surah (chapter)
4. Use the play button to start playback
5. Use next/previous buttons to navigate between surahs
6. Your preferences are automatically saved

## Tech Stack

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icons

## API

This extension uses the mp3quran.net API v3:
- `/api/v3/reciters` - List of reciters
- `/api/v3/suwar` - List of surahs

## License

MIT

