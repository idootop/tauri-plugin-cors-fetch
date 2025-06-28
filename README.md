![tauri-plugin-cors-fetch](https://github.com/idootop/tauri-plugin-cors-fetch/raw/main/banner.png)

[![crates.io](https://img.shields.io/crates/v/tauri-plugin-cors-fetch.svg)](https://crates.io/crates/tauri-plugin-cors-fetch)
[![Download](https://img.shields.io/crates/d/tauri-plugin-cors-fetch.svg)](https://crates.io/crates/tauri-plugin-cors-fetch)
[![MIT licensed](https://img.shields.io/crates/l/tauri-plugin-cors-fetch.svg)](./LICENSE)
[![Documentation](https://docs.rs/tauri-plugin-cors-fetch/badge.svg)](https://docs.rs/crate/tauri-plugin-cors-fetch)

An **unofficial** Tauri plugin that enables seamless cross-origin resource sharing (CORS) for web fetch requests within Tauri applications.

| Platform | Supported |
| -------- | --------- |
| Linux    | ✓         |
| Windows  | ✓         |
| macOS    | ✓         |
| Android  | ✓         |
| iOS      | ✓         |

## Overview

When building cross-platform desktop applications with [Tauri](https://tauri.app), we often need to access services like [OpenAI](https://openai.com/product) that are restricted by **Cross-Origin Resource Sharing (CORS)** policies in web environments.

However, on the desktop, we can bypass CORS and access these services directly. While the official [tauri-plugin-http](https://crates.io/crates/tauri-plugin-http) can bypass CORS, it requires modifying your network requests and might not be compatible with third-party dependencies that rely on the standard `fetch` API.

## How it Works

This plugin extends the official [tauri-plugin-http](https://crates.io/crates/tauri-plugin-http) by hooking into the browser's native `fetch` method during webpage initialization. It transparently redirects requests to the [tauri-plugin-http](https://crates.io/crates/tauri-plugin-http), allowing you to use the standard `fetch` API without additional code changes or workarounds.

## Installation

1. Add the plugin to your Tauri project's dependencies:

```shell
# src-tauri
cargo add tauri-plugin-cors-fetch
```

2. Initialize the plugin in your Tauri application setup:

```rust
// src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cors_fetch::init())
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
```

3. Add permissions in your `capabilities` configuration:

```json
// src-tauri/capabilities/default.json
{
  "permissions": ["cors-fetch:default"]
}
```

4. Enable `withGlobalTauri` in your Tauri configuration:

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "withGlobalTauri": true
  }
}
```

## Usage

Once installed, the plugin automatically hooks into the browser's `fetch` API. You can use `fetch` normally without any code changes:

```javascript
// Standard fetch - now works with CORS
fetch("https://api.example.com/data")
  .then((response) => response.json())
  .then((data) => console.log(data));
```

### Configuration (Optional)

Configure which requests should bypass CORS:

```javascript
window.CORSFetch.config({
  include: [/^https?:\/\//i], // Process all HTTP requests (default)
  exclude: ["https://api.openai.com/v1/chat/completions"], // Skip CORS bypass
  // Enabling a proxy for fetch requests without proxy configuration
  // see https://v2.tauri.app/reference/javascript/http/#proxy-1
  proxy: {
    all: "socks5://127.0.0.1:7890",
  }
});
```

### Alternative Methods

```javascript
// Direct CORS-enabled fetch
window.fetchCORS("https://api.example.com/data");

// Original native fetch (with CORS restrictions)
window.fetchNative("https://api.example.com/data");
```

## Limitations

- **Streaming**: Server-Sent Events (SSE) and streaming responses are not supported. See [implementation details](https://github.com/idootop/tauri-plugin-cors-fetch/issues/7#issuecomment-2791652415).
- **XHR**: Only supports the modern `fetch` API, not `XMLHttpRequest`.

## License

[MIT](LICENSE) License © 2024-PRESENT Del Wang
