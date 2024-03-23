![tauri-plugin-cors-fetch](https://github.com/idootop/tauri-plugin-cors-fetch/raw/main/banner.png)

[![crates.io](https://img.shields.io/crates/v/tauri-plugin-cors-fetch.svg)](https://crates.io/crates/tauri-plugin-cors-fetch)
[![Documentation](https://docs.rs/tauri-plugin-cors-fetch/badge.svg)](https://docs.rs/tauri-plugin-cors-fetch)
[![MIT licensed](https://img.shields.io/crates/l/tauri-plugin-cors-fetch.svg)](./LICENSE)

An **unofficial** Tauri plugin that enables seamless cross-origin resource sharing (CORS) for web fetch requests within Tauri applications.

## Overview

When developing cross-platform desktop applications with [Tauri](https://tauri.app), you may encounter CORS restrictions that prevent direct access to certain web resources, such as [OpenAI](https://openai.com/product) services. While the official [tauri-plugin-http](https://docs.rs/crate/tauri-plugin-http/latest) can achieve CORS bypassing, it requires adapting your network requests and may not be compatible with third-party dependencies.

`tauri-plugin-cors-fetch` provides a transparent solution by automatically intercepting and modifying outgoing `fetch` requests, adding the necessary headers to bypass CORS restrictions. This allows you to continue using the standard `fetch` API without the need for additional code changes or workarounds.

**Features**

- **CORS Bypass**: Automatically handles CORS restrictions for `fetch` requests.
- **Seamless Integration**: Use the standard `fetch` API without modifications.
- **Flexible Configuration**: Enable CORS globally or on a per-request basis.

## Installation

Add the plugin to your Tauri project's dependencies:

```shell
cargo add tauri-plugin-cors-fetch
```

Then, initialize the plugin in your Tauri application setup:

```rust
// main.rs
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cors_fetch::init())
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
```

Add permissions for this plugin:

```json
// src-tauri/capabilities/main.json
{
  "permissions": [
    "cors-fetch:allow-cancel-cors-request"
    // ...
  ]
}
```

After installing and initializing the plugin, you can start making `fetch` requests from your Tauri application without encountering CORS-related errors.

```javascript
// For global configuration (default is true when the app starts)
window.enableCORSFetch(true);

// Use the hooked fetch
fetch("https://example.com/api")
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => console.error(error));

// Or, explicitly call window.corsFetch (even if the global switch is off)
window.corsFetch("https://example.com/api");
```

Note: To allow requests, you may need to update your Content Security Policy (CSP) to include `x-http` and `x-https` protocols:

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

1. Requires Tauri version 2.0 or later. Only desktop platforms are supported; iOS and Android have not been tested.
2. Does not support `XMLHttpRequest` (XHR) requests. It is designed specifically to work with the modern `fetch` API.

## License

This project is licensed under the MIT License.
