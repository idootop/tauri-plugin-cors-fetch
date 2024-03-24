![tauri-plugin-cors-fetch](https://github.com/idootop/tauri-plugin-cors-fetch/raw/main/banner.png)

[![crates.io](https://img.shields.io/crates/v/tauri-plugin-cors-fetch.svg)](https://crates.io/crates/tauri-plugin-cors-fetch)
[![Documentation](https://docs.rs/tauri-plugin-cors-fetch/badge.svg)](https://docs.rs/tauri-plugin-cors-fetch)
[![MIT licensed](https://img.shields.io/crates/l/tauri-plugin-cors-fetch.svg)](./LICENSE)

An **unofficial** Tauri plugin that enables seamless cross-origin resource sharing (CORS) for web fetch requests within Tauri applications.

## Overview

When developing cross-platform desktop applications with [Tauri](https://tauri.app), you may encounter CORS restrictions that prevent direct access to certain web resources, such as [OpenAI](https://openai.com/product) services. While the official [tauri-plugin-http](https://docs.rs/crate/tauri-plugin-http) can achieve CORS bypassing, it requires modifying your network requests and may not be compatible with third-party dependencies that rely on the standard `fetch` API.

`tauri-plugin-cors-fetch` provides a transparent solution by automatically intercepting and modifying outgoing `fetch` requests, adding the necessary headers to bypass CORS restrictions. This allows you to continue using the standard `fetch` API without the need for additional code changes or workarounds.

## Installation

1. Add the plugin to your Tauri project's dependencies:

```shell
# src-tauri
cargo add tauri-plugin-cors-fetch
```

2. Initialize the plugin in your Tauri application setup:

```rust
// src-tauri/main.rs
fn main() {
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

After installing and initializing the plugin, you can start making `fetch` requests from your Tauri application without encountering CORS-related errors.

```javascript
// Enable CORS for the hooked fetch globally (default is true on app start)
window.enableCORSFetch(true);

// Use the hooked fetch with CORS support
fetch("https://example.com/api")
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => console.error(error));

// Use the hooked fetch directly
window.hookedFetch("https://example.com/api");

// Use the original, unhooked fetch
window.originalFetch("https://example.com/api");
```

Note: To allow requests, you may update your Content Security Policy (CSP) to include `x-http` and `x-https` protocols:

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "withGlobalTauri": true,
    "security": {
      "csp": "default-src x-http: x-https: 'self'; connect-src ipc: http://ipc.localhost"
    }
  }
}
```

## How it Works

This plugin registers custom `x-http` and `x-https` protocols for Tauri applications. During webpage initialization, it hooks the browser's native `fetch` method and redirects `http` and `https` requests to the `x-http` and `x-https` custom protocols. All traffic then goes through local native requests, and the plugin adds CORS-related headers to the response headers, effectively bypassing CORS.

## Limitation

1. **No Custom CSP Policy Support**: By default, all HTTP/HTTPS requests will be redirected to local native requests.
2. **No XMLHttpRequest Support**: The plugin is designed specifically to work with the modern `fetch` API and does not support `XMLHttpRequest` (XHR) requests.
3. **No Mobile Platform Support**: Only desktop platforms are supported; iOS and Android have not been tested.

## License

This project is licensed under the MIT License.
