# FloatFrame 🌐

A floating window you launch from your browser console that displays another website in an iframe, on top of any page.

## Features

- 🪟 Draggable and resizable floating window
- 🔘 Ready-made site buttons (FrAnime, BrainworxEdu, KartBros, BikeBros)
- ➕ Add your own links manually, saved in your browser
- ⛶ Maximize / restore button
- — Minimize to a small floating bubble
- ✕ Close button
- 📺 Fullscreen support for video players and games
- 🔗 `https://` is added automatically

## Usage

1. Open your browser console (`F12`, **Console** tab).
2. Paste this command and press Enter:

```javascript
fetch("https://raw.githubusercontent.com/hugu641/ConsChromeGame/main/floatframe.js").then(r=>r.text()).then(eval)
```

### As a bookmarklet

Create a bookmark and use this code as its URL to launch FloatFrame in one click:

```
javascript:fetch("https://raw.githubusercontent.com/hugu641/ConsChromeGame/main/floatframe.js").then(r=>r.text()).then(eval)
```

## Customization

Edit the `DEFAULT_SITES` array at the top of `floatframe.js` to change the default sites. The **↺** button in the window resets the list to the defaults.

## Limitations

- Some websites refuse to be displayed in an iframe (`X-Frame-Options` / CSP). In that case the frame stays blank.
- Some websites block `fetch` or `eval` through their security policy, so the script won't run on them.
- Favorites are saved in the `localStorage` of the site you run the script on.

## Disclaimer

This script loads and runs external code. Always read the code before running it in your console.
