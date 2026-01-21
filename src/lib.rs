// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! ![tauri-plugin-cors-fetch](https://github.com/idootop/tauri-plugin-cors-fetch/raw/main/banner.png)
//!
//! Enabling Cross-Origin Resource Sharing (CORS) for Fetch Requests within Tauri applications.

pub use reqwest;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use error::{Error, Result};
mod commands;
mod error;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("cors-fetch")
        .setup(|app, _| {
            app.manage(commands::RequestPool::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cors_request,
            commands::cancel_cors_request,
        ])
        .build()
}
