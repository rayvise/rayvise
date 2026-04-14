# Platform Compatibility

Rayvise is currently a **macOS-first** desktop app built with Tauri 2, a Rust backend, and a React/TypeScript frontend.

This document is intended for potential users and contributors who want to understand:

- what works today
- which parts are macOS-specific
- what would be required to support Windows and Linux well

## Current Status

### macOS

Rayvise is currently designed around macOS workflows and APIs.

The following areas are implemented with macOS-specific behavior:

- installed app discovery from `.app` bundles
- app metadata lookup from `Info.plist`
- app icon extraction from `.icns`
- icon conversion via the built-in `sips` tool
- focused app detection
- selected text capture
- writing text back into other applications
- global shortcut integration for the main completion flow

In practice, this means **macOS is the only platform currently expected to work correctly end to end**.

### Windows

Windows is **not currently supported** for feature parity.

The project may compile only after additional platform gating and feature isolation, but the app behavior itself is not implemented for Windows.

### Linux

Linux is **not currently supported** for feature parity.

As with Windows, major functionality would need platform-specific implementations before the app could be considered usable.

## What Works on macOS Today

On macOS, the current architecture supports:

- discovering installed apps
- assigning prompts to apps
- reading and rendering app icons
- listening for the global shortcut used to trigger completions
- identifying the frontmost app
- attempting to read selected text from the active application
- attempting to write generated text back into the target application

Recent work improved app icon rendering by:

- converting `.icns` files to cached PNGs
- avoiding temp-file collisions during conversion
- sending icon data to the frontend as base64 data URLs

## macOS Distribution Considerations

Distributing Rayvise to macOS users is realistic, but there are important operational and security concerns.

### App permissions

Rayvise relies on system-level integrations that may require user approval, especially for:

- Accessibility permissions
- automation-like behavior involving other applications

Without the required permissions, features like reading selected text, detecting the focused app, or writing text back may fail or behave inconsistently.

### Signing and notarization

For public distribution on macOS, the app will likely need:

- code signing
- notarization
- appropriate entitlements

This is especially important for software that interacts with other apps and system APIs.

### Stability across app targets

Even on macOS, behavior can vary between target applications because apps expose text fields, accessibility elements, and editability differently.

Contributors should expect some app-specific quirks when testing:

- text selection may work in one app and fail in another
- writeback may depend on the focused control being editable
- some apps may expose metadata or icons differently than expected

## Why Windows and Linux Are Not Yet Supported

Several core assumptions in the current codebase are macOS-only.

Examples include:

- `.app` bundle scanning in `/Applications`
- reading `Contents/Info.plist`
- extracting icons from `.icns`
- converting icons with `sips`
- AppKit- and Accessibility-based focused app and text APIs

Those assumptions do not map directly to Windows or Linux.

## What Needs To Be Done For Cross-Platform Support

Supporting Windows and Linux well will require more than small fixes. The app needs clear platform-specific implementations behind a shared interface.

### 1. Platform-gate macOS-only code

Contributors should isolate macOS-specific functionality with conditional compilation such as:

- `cfg(target_os = "macos")`

This should apply to:

- command implementations
- macOS-only dependencies
- any logic that assumes `.app`, `.plist`, `.icns`, or AppKit

Goal:

- ensure the project can compile cleanly on non-macOS platforms even if some features are temporarily disabled

### 2. Separate platform-specific app discovery

Each platform needs its own way to enumerate installed applications and identify them consistently.

Needed work:

- macOS: keep current `.app` bundle approach, but harden edge cases
- Windows: implement Start menu / installed app discovery and executable metadata handling
- Linux: implement desktop application discovery, likely via `.desktop` files and standard icon lookup paths

### 3. Replace macOS-only icon handling with per-platform extraction

Current icon handling is tailored to `.icns`.

Needed work:

- Windows: extract icons from executables or app metadata
- Linux: resolve icons from theme directories, icon names, or desktop entries
- macOS: keep `.icns` support, but treat it as one platform adapter among several

Longer term, it may make sense to expose a single backend command that returns:

- a ready-to-render data URL, or
- a platform-safe image representation

instead of exposing file paths to the frontend.

### 4. Rework focused app detection per platform

The current focused app logic is built around macOS APIs.

Needed work:

- Windows: determine the active window and owning process using Windows APIs
- Linux: determine active window support based on display server and desktop environment

Important note:

Linux is especially tricky here because Wayland and X11 differ substantially, and some desktop environments restrict global inspection or automation.

### 5. Reimplement selected text capture and writeback per platform

This is one of the hardest parts of the app to make cross-platform.

Needed work:

- Windows: use appropriate accessibility/UI automation APIs
- Linux: determine what is feasible across Wayland and X11, and document limitations clearly

This feature should be expected to have:

- platform differences
- app-specific gaps
- stricter permission or sandbox constraints on some systems

### 6. Audit global shortcut behavior across platforms

The shortcut layer should be validated on:

- macOS
- Windows
- Linux desktop environments

Needed work:

- check registration reliability
- confirm conflicts and reserved shortcuts
- document unsupported environments if necessary

### 7. Adjust the frontend for partial platform support

The frontend should not assume all platforms expose the same capabilities.

Needed work:

- hide unsupported features on platforms where they are not implemented
- surface clear user-facing messages when a feature is macOS-only
- avoid broken UI states when a backend command is unavailable

## Recommended Roadmap

For contributors, the most practical path is:

1. Treat Rayvise as officially macOS-first today.
2. Add clear compile-time platform boundaries in the Rust backend.
3. Make non-macOS builds compile with unsupported features disabled.
4. Introduce platform adapters for app discovery, icon loading, focused app lookup, and text automation.
5. Enable Windows support incrementally.
6. Evaluate Linux support carefully, especially for text automation under Wayland.

## Contributor Guidance

If you are contributing platform work, please assume:

- app discovery is platform-specific
- icon extraction is platform-specific
- focused app detection is platform-specific
- selected text capture and writeback are platform-specific

Contributors should aim to keep:

- shared data models cross-platform
- backend command names stable where possible
- UI behavior graceful when capabilities are missing

## User Expectations

If you are evaluating Rayvise as a user today:

- macOS is the intended platform
- Windows and Linux should be treated as future work
- some macOS integrations may require system permissions before they work reliably

## Summary

Rayvise currently works best as a macOS-native workflow tool with deep platform integration.

Cross-platform distribution is possible in the long term, but it will require:

- stronger platform isolation in the backend
- per-platform app discovery and icon handling
- per-platform focused app and text automation implementations
- clear UI handling for unsupported features

Until that work is completed, the project should be understood as **macOS-first, with Windows/Linux support planned but not yet implemented**.
