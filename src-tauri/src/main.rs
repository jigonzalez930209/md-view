// En release no queremos una consola extra detras de la ventana en Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    md_view_lib::run();
}
