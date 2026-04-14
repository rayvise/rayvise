# App Icons

## Overview

macOS app icons are `.icns` files stored inside each `.app` bundle at `Contents/Resources/<CFBundleIconFile>`. We convert these to 64x64 PNGs, cache them, and serve them to the frontend as base64 data URLs.

## Architecture

### Rust backend (`src-tauri/src/commands/apps.rs`)

**`list_apps`** scans `/Applications` and `~/Applications`. For each app it calls `resolve_icon_paths`, which checks the PNG cache (`~/Library/Caches/rayvise/icons/`) without doing any conversion:

- Cache hit → returns `iconPath` (path to cached PNG), `icnsPath` is `None`
- Cache miss → returns `icnsPath` (path to raw `.icns`), `iconPath` is `None`

**`get_icon_base64`** — reads an already-cached PNG and returns it as a `data:image/png;base64,...` URL.

**`get_icon_base64_for_icns`** — converts an `.icns` to PNG on demand (via `sips`, with `iconutil` fallback for Electron-style ICNS), caches the result, and returns the base64 URL.

### Conversion strategy

1. **`sips`** — macOS built-in, handles most standard ICNS files.
2. **`iconutil` fallback** — for Electron/modern ICNS formats (e.g. Slack, VS Code) that `sips` cannot handle. Expands to an `.iconset` directory and picks the best PNG (preferring 64x64).

Converted PNGs are cached with a deterministic filename (`icon_<hash>.png`) based on the source `.icns` path. Temp files + atomic rename prevent corruption from concurrent conversions.

### Frontend (`src/hooks/useAppIcons.ts`)

The `useAppIcons` hook takes a list of `InstalledApp` objects and returns a `Record<bundleId, dataUrl>`. It handles both `iconPath` (cached) and `icnsPath` (needs conversion) cases, with a concurrency limit of 8 parallel conversions.
