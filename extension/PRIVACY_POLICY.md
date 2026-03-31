# Privacy Policy for All-in-One Toolkit

**Last updated:** 2025-12-15

We built this extension to run locally in your browser. We do not operate any servers for it and we do not sell or share your data.

## What the extension stores

- **Settings you change:** language/theme are saved in Chrome `storage.local`.
- **Download jobs:** when you start a download, the extension keeps a local history (title, source URL, optional media URL, status, progress, timestamps, error text, and Chrome download IDs). The history is limited (up to 50 items) and stays in `storage.local`.
- **Popup UI preferences:** some UI state (active downloads sub-tab, sort direction) is stored locally in the popup’s `localStorage`.

## What the extension does **not** collect

- No analytics, no tracking pixels, no cookies added by us.
- No account info, passwords, or payment data.
- No data is sent to our servers (we do not have any) or to third parties for profiling.

## Network calls it makes

- **Conversion requests (YouTube / Twitter-X / some Instagram downloads):** the extension calls `loader.to` to request a download link for the media you choose. This includes sending the page URL you selected (e.g., the YouTube video URL, Tweet URL, or Reel URL) and then polling `loader.to` for conversion progress. When ready, your browser downloads the file from the `download_url` returned by that service (which may be hosted on `loader.to` or another domain).
- **Direct media downloads (Instagram/Twitter images and some Instagram media):** for image downloads (and for some Instagram downloads when a direct media URL is available), the extension downloads the file directly from the media URL (for example, Instagram CDN / `twimg.com` URLs) using the browser download API.
- **ZIP downloads (multiple images):** when you download multiple images as a ZIP, the extension fetches each image URL to build a ZIP file locally in your browser memory, then downloads that ZIP. The images are not uploaded anywhere by the extension.

## Your controls

- You can clear the download history from the extension UI.
- You can remove all saved data by uninstalling the extension or clearing its site data in browser settings.

## Contact

For questions or concerns, open an issue on the repository where you got this extension.
