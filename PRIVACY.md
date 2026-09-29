# Privacy

md-view is a local application. It has no account, no telemetry, no analytics and no update
check. Nothing is sent anywhere unless you open it yourself.

## What is stored on your computer

| Where | What |
| --- | --- |
| `localStorage` of the app (`md-view:prefs`, `md-view:window`, `md-view:recents`, `md-view:drafts`) | Preferences, window geometry, the recent-files list, the paths of the last session and the drafts of unsaved documents |
| App configuration folder (`recents.json`, `drafts.json`) | The same recent list and drafts, for the desktop build |
| Disk next to your documents | Only when you save, export or print |

Drafts are deleted on a clean exit; recents can be cleared from the app.

## Network

The app makes no requests on its own. Two cases can reach the network, both because a document
asks for it:

- Images or other media referenced by a URL in a document are loaded from that URL.
- Links you click open in your browser.

Documentation pages and release downloads are just regular web pages hosted by GitHub.
