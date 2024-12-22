# v3.0.0

**✨ New Features**

- Upgraded to Tauri 2.0
- Added support for Android and iOS platforms ([#4](https://github.com/idootop/tauri-plugin-cors-fetch/pull/4) by [@ArthurZhou](https://github.com/ArthurZhou))

**🚨 Breaking Changes**

- Renamed `hookedFetch` to `fetchCORS`.
- Renamed `originalFetch` to `fetchNative`.

# v2.1.0

- Fix: Exclude Tauri IPC requests from the request hook.

# v2.0.0

- New: Hook `fetch` requests and redirect them to [tauri-plugin-http](https://crates.io/crates/tauri-plugin-http).

# v1.0.0

- New: Hook `fetch` requests and redirect them to `x-http` and `x-https` custom protocols.
