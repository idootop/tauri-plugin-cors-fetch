const COMMANDS: &[&str] = &["cancel_cors_request"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
