# Coding Conventions

## Language
- **JavaScript**: Modern ES6+. No transpilation (running directly in Chrome).
- **CSS**: Vanilla CSS. No preprocessors.

## Extension
- **Manifest**: Version 3.
- **Communication**: Use `chrome.runtime.sendMessage` for Popup <-> Background communication.
- **Storage**: `chrome.storage.local` for all persistent data.

## Code Style
- **Formatting**: Standard JS formatting.
- **Comments**: JSDoc style for major functions.
