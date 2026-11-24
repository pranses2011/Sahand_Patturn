// Patturn desktop shell — Windows offline-first (rule R-014).
// All geometry runs in the WebView (WASM); this process provides:
//   - SQLite for editor history and named parameter projects
//   - native file dialogs for STL/SVG/DXF/PDF export (tauri-plugin-dialog)
//   - filesystem read/write for .patturn project files (tauri-plugin-fs)
//   - optional updater (requires internet — never blocks core features)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running Patturn desktop");
}
