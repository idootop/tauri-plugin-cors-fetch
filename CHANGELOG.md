# Changelog

## v4.1.0

### ✨ Features

- **Default request configuration**: Added global configuration support for default request parameters applied to all CORS requests

```javascript
window.CORSFetch.config({
  // Default request parameters (applied to all CORS requests)
  // see https://v2.tauri.app/reference/javascript/http/#clientoptions
  request: {
    maxRedirections: 5, // Default maximum redirections
    connectTimeout: 30 * 1000, // Default connection timeout (ms)
    proxy: {
      all: "http://127.0.0.1:7890", // Default proxy for all requests
    },
  },
});
```

Closes [#10](https://github.com/idootop/tauri-plugin-cors-fetch/issues/10). Thanks to [@kanoshiou](https://github.com/kanoshiou) for the contribution in PR [#11](https://github.com/idootop/tauri-plugin-cors-fetch/issues/11).

## v4.0.0

### ✨ Features

- **Configurable CORS bypass**: Configure which requests should bypass CORS restrictions [#9](https://github.com/idootop/tauri-plugin-cors-fetch/issues/9)

```javascript
window.CORSFetch.config({
  include: [/^https?:\/\//i], // Process all HTTP requests (default)
  exclude: ["https://api.openai.com/v1/chat/completions"], // Skip CORS bypass
});
```

### 💥 Breaking Changes

- Removed `window.enableCORSFetch` API

## v3.1.0

### 🐛 Fixes

- Fixed metadata for platform support

## v3.0.0

### ✨ Features

- **Tauri 2.0 support**: Upgraded to Tauri 2.0
- **Mobile platform support**: Added Android and iOS support ([#4](https://github.com/idootop/tauri-plugin-cors-fetch/pull/4) by [@ArthurZhou](https://github.com/ArthurZhou))

### 💥 Breaking Changes

- Renamed `hookedFetch` → `fetchCORS`
- Renamed `originalFetch` → `fetchNative`

## v2.1.0

### 🐛 Fixes

- Excluded Tauri IPC requests from request hooks

## v2.0.0

### ✨ Features

- **Fetch request hooking**: Redirect `fetch` requests to [tauri-plugin-http](https://crates.io/crates/tauri-plugin-http)

## v1.0.0

### ✨ Features

- **Initial release**: Hook `fetch` requests and redirect to `x-http` and `x-https` custom protocols
