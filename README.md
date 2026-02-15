# Bramble 🌿

Shop independently - find local alternatives to mega-corporations.

A Chrome extension that helps you discover local businesses and ethical alternatives when shopping on major retail sites.

## Features

- **Product Detection**: Automatically detects products on Amazon, Walmart, Target, and Best Buy
- **Side Panel UI**: Beautiful, collapsible side panel with smooth animations
- **Company Analysis**: Identifies parent companies and provides ethical scores
- **Alternative Recommendations**: Suggests local businesses, sustainable options, and fair-trade alternatives
- **Cost-Benefit Analysis**: Shows the positive impact of choosing ethical alternatives
- **Customizable Settings**: Toggle preferences for local businesses, avoiding specific corporations, and sustainable products
- **Impact Tracking**: Keep track of your ethical shopping contributions

## Installation

### Development Mode

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the `treehacks-project` directory
6. The Bramble extension is now installed!

### Using the Extension

1. Visit any product page on:
   - Amazon.com
   - Walmart.com
   - Target.com
   - BestBuy.com

2. Wait for the extension to detect the product (you'll see a green checkmark badge)

3. Click the floating toggle button on the right side of the page to open the side panel

4. Browse ethical alternatives and make informed decisions!

5. Click the extension icon in the toolbar to customize your preferences

## File Structure

```
treehacks-project/
├── manifest.json          # Extension manifest (Manifest V3)
├── content.js            # Content script for product detection
├── sidepanel.html        # Side panel UI structure
├── sidepanel.js          # Side panel controller
├── popup.html            # Extension settings popup
├── popup.js              # Popup controller
├── background.js         # Service worker for messaging
├── styles.css            # Cohesive design system
├── icons/
│   ├── icon16.png        # 16x16 icon
│   ├── icon48.png        # 48x48 icon
│   └── icon128.png       # 128x128 icon
└── README.md            # This file
```

## Design System

Bramble uses a cohesive earth-tone color palette:

- **Primary Green**: `#7ba05b` - Main brand color
- **Dark Green**: `#5d7e47` - Hover states and emphasis
- **Light Green**: `#9cb87f` - Accents
- **Cream**: `#f5f3ed` - Background
- **Warm Gray**: `#d4d0c8` - Borders and subtle elements
- **Text Dark**: `#2d4a2b` - Primary text

## Settings

Configure your preferences in the extension popup:

- **🏪 Support Local Businesses** - Prioritize local shops in recommendations
- **🌱 Sustainable Products** - Prioritize eco-friendly alternatives
- **🚫 Brands to Avoid** - Add any brands or companies you want to avoid (e.g., Amazon, Nestlé, Walmart, etc.)

## Future Enhancements

- Integration with real alternative product databases
- User reviews and ratings for alternatives
- Price comparison tools
- Carbon footprint calculator
- Community-sourced alternatives
- Browser extension for Firefox
- Mobile app version

## Technology Stack

- **Manifest V3**: Latest Chrome extension standard
- **Vanilla JavaScript**: Modern ES6+ syntax
- **CSS3**: Animations and responsive design
- **Chrome Storage API**: Settings and data persistence
- **Chrome Messaging API**: Inter-component communication

## Privacy

Bramble respects your privacy:
- No data collection or tracking
- No external API calls (in current version)
- All data stored locally on your device
- Settings synced via Chrome Sync (optional)
- Open source and transparent

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - Feel free to use and modify as needed.

## Credits

Created for TreeHacks 2026 🌲

---

**Note**: This is a prototype with placeholder data for alternatives. In production, this would integrate with real databases of ethical businesses and product alternatives.
