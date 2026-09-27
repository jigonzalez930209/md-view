// In release we do not want an extra console behind the window on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    md_view_lib::run();
}
