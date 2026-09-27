# Signing binaries

By default the installers are **unsigned**: they work, but macOS and Windows warn about an
unknown developer. Signing is optional and only requires adding secrets — the workflows don't
change.

## macOS

Signing and notarizing requires an Apple Developer account (paid). Add these repository
secrets (**Settings → Secrets and variables → Actions**):

| Secret | Content |
| --- | --- |
| `APPLE_CERTIFICATE` | Your *Developer ID Application* certificate exported as `.p12`, base64 encoded |
| `APPLE_CERTIFICATE_PASSWORD` | The password of that `.p12` |
| `APPLE_SIGNING_IDENTITY` | For example `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | An app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | The 10-character team identifier |

Tauri reads them from the environment during `tauri build`, so the workflow needs no changes.
Without them, macOS users must approve the app once from *System Settings → Privacy &
Security*.

## Windows

Windows installers can be signed with an Authenticode certificate (EV certificates also remove
the SmartScreen warning immediately). Add:

| Secret | Content |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | The minisign private key used by the updater/signature step |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password |

For a classic Authenticode certificate (`signtool`), the usual approach is a Tauri
`beforeBundleCommand` or a small step in the workflow; the Tauri documentation keeps the
canonical recipe in *Distribution → Windows Code Signing*.

## Auto-updates

Tauri's updater needs an endpoint and a public key in `tauri.conf.json`
(`plugins.updater`). md-view doesn't configure it today: the app ships without auto-update, so
`TAURI_SIGNING_PRIVATE_KEY` is only needed if you enable signing for the installers
themselves.

## Verifying a signature

```bash
# macOS
codesign --verify --deep --strict --verbose=2 /Applications/md-view.app
spctl --assess --type execute --verbose=4 /Applications/md-view.app

# Windows (Developer Command Prompt)
signtool verify /pa /v md-view_0.3.0_x64-setup.exe
```

## Linux

Linux packages are not signed; distributions rely on checksums and repository metadata. Every
release page lists the files and GitHub provides the checksums of the assets.
