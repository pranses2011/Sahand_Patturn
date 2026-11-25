// Patturn desktop shell — Windows offline-first (rule R-014).
// All geometry runs in the WebView (WASM); this process provides:
//   - SQLite for editor history and named parameter projects
//   - native file dialogs for STL/SVG/DXF/PDF export (tauri-plugin-dialog)
//   - filesystem read/write for .patturn project files (tauri-plugin-fs)
//   - manual release checks live in the frontend; signed updater is not enabled yet.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // GUI-subsystem processes have no console. Keep startup panics diagnosable
    // locally without sending project contents or any telemetry to a server.
    let diagnostic_path = std::env::var_os("PATTURN_STARTUP_LOG")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("LOCALAPPDATA").map(|base| {
            std::path::PathBuf::from(base).join("ir.patturn.studio").join("logs").join("startup.log")
        }));
    if let Some(path) = diagnostic_path {
        std::panic::set_hook(Box::new(move |info| {
            use std::io::Write;
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            // Overwrite, rather than grow an unbounded log of potentially private diagnostics.
            if let Ok(mut file) = std::fs::File::create(&path) {
                let _ = writeln!(file, "Patturn startup/runtime panic: {info}");
            }
        }));
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Do not register the signed updater without its required public-key config.
        // Missing config fails plugin initialization and prevents the entire app from opening.
        .run(tauri::generate_context!())
        .expect("error while running Patturn desktop");
}
