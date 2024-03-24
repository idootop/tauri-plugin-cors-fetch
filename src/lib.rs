use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

mod cors;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("cors-fetch")
        .invoke_handler(tauri::generate_handler![cors::cancel_cors_request])
        .register_asynchronous_uri_scheme_protocol("x-http", move |_app, req, responder| {
            tauri::async_runtime::spawn(async move {
                if let Some(resp) = cors::cors_request(req).await {
                    responder.respond(resp);
                }
            });
        })
        .register_asynchronous_uri_scheme_protocol("x-https", move |_app, req, responder| {
            tauri::async_runtime::spawn(async move {
                if let Some(resp) = cors::cors_request(req).await {
                    responder.respond(resp);
                }
            });
        })
        .build()
}
