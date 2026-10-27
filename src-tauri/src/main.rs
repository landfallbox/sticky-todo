#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod todo_store;

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow,
};
use todo_store::TodoStore;

#[repr(C)]
#[derive(Debug, Default, Copy, Clone)]
struct POINT {
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "comctl32")]
#[allow(non_snake_case)]
extern "system" {
    fn SetWindowSubclass(
        hwnd: *mut c_void,
        pfnSubclass: unsafe extern "system" fn(
            hwnd: *mut c_void,
            uMsg: u32,
            wParam: usize,
            lParam: isize,
            uIdSubclass: usize,
            dwRefData: usize,
        ) -> isize,
        uIdSubclass: usize,
        dwRefData: usize,
    ) -> i32;
    fn DefSubclassProc(
        hwnd: *mut c_void,
        uMsg: u32,
        wParam: usize,
        lParam: isize,
    ) -> isize;
}

#[cfg(target_os = "windows")]
#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: *mut c_void,
        dwAttribute: u32,
        pvAttribute: *const c_void,
        cbAttribute: u32,
    ) -> i32;
}

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static IS_DRAGGING: AtomicBool = AtomicBool::new(false);
static IS_ANIMATING: AtomicBool = AtomicBool::new(false);

fn ease_out_cubic(t: f32) -> f32 {
    1.0 - (1.0 - t).powi(3)
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum DockEdge {
    None,
    Left,
    Right,
    Top,
}

#[derive(Debug, Clone)]
pub struct DockInfo {
    pub edge: DockEdge,
    pub is_collapsed: bool,
    pub exp_x: i32,
    pub exp_y: i32,
    pub col_x: i32,
    pub col_y: i32,
    pub width: i32,
    pub height: i32,
    pub last_outside_time: Option<Instant>,
}

impl Default for DockInfo {
    fn default() -> Self {
        Self {
            edge: DockEdge::None,
            is_collapsed: false,
            exp_x: 0,
            exp_y: 0,
            col_x: 0,
            col_y: 0,
            width: 320,
            height: 480,
            last_outside_time: None,
        }
    }
}

/// State shared across Tauri commands
struct AppState {
    store: Mutex<TodoStore>,
    dock: Mutex<DockInfo>,
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_todos(state: tauri::State<'_, AppState>) -> Vec<todo_store::TodoItem> {
    state.store.lock().unwrap().items().to_vec()
}

#[tauri::command]
fn add_todo(state: tauri::State<'_, AppState>, text: String) -> Vec<todo_store::TodoItem> {
    let mut store = state.store.lock().unwrap();
    store.add(&text);
    store.items().to_vec()
}

#[tauri::command]
fn toggle_todo(state: tauri::State<'_, AppState>, id: String) -> Vec<todo_store::TodoItem> {
    let mut store = state.store.lock().unwrap();
    store.toggle(&id);
    store.items().to_vec()
}

#[tauri::command]
fn delete_todo(state: tauri::State<'_, AppState>, id: String) -> Vec<todo_store::TodoItem> {
    let mut store = state.store.lock().unwrap();
    store.delete(&id);
    store.items().to_vec()
}

#[tauri::command]
fn reorder_todos(state: tauri::State<'_, AppState>, ids: Vec<String>) -> Vec<todo_store::TodoItem> {
    let mut store = state.store.lock().unwrap();
    store.reorder(&ids);
    store.items().to_vec()
}

#[tauri::command]
fn edit_todo(state: tauri::State<'_, AppState>, id: String, text: String) -> Vec<todo_store::TodoItem> {
    let mut store = state.store.lock().unwrap();
    store.edit(&id, &text);
    store.items().to_vec()
}

#[tauri::command]
fn minimize_window<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.minimize();
}

#[tauri::command]
fn hide_window<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.hide();
}

#[tauri::command]
fn show_window<R: Runtime>(window: WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.set_focus();
}

fn animate_move(window: &WebviewWindow, target_x: i32, target_y: i32) {
    if IS_ANIMATING.swap(true, Ordering::SeqCst) {
        return;
    }

    if let Ok(start) = window.outer_position() {
        let (start_x, start_y) = (start.x, start.y);
        let dist = (((target_x - start_x).pow(2) + (target_y - start_y).pow(2)) as f32).sqrt();
        if dist > 2.0 {
            // Smooth 240ms cubic ease-out animation (20 frames @ 12ms)
            let steps = 20;
            for i in 1..=steps {
                let t = i as f32 / steps as f32;
                let progress = ease_out_cubic(t);
                let cur_x = start_x + ((target_x - start_x) as f32 * progress) as i32;
                let cur_y = start_y + ((target_y - start_y) as f32 * progress) as i32;
                let _ = window.set_position(PhysicalPosition::new(cur_x, cur_y));
                std::thread::sleep(Duration::from_millis(12));
            }
        }
        let _ = window.set_position(PhysicalPosition::new(target_x, target_y));
    }

    IS_ANIMATING.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn collapse_window(state: tauri::State<'_, AppState>, app: tauri::AppHandle) {
    let mut dock = state.dock.lock().unwrap();
    if dock.edge == DockEdge::None || dock.is_collapsed {
        return;
    }
    dock.is_collapsed = true;
    let (col_x, col_y) = (dock.col_x, dock.col_y);
    drop(dock);

    if let Some(win) = app.get_webview_window("main") {
        animate_move(&win, col_x, col_y);
        let _ = win.emit("collapsed-changed", true);
    }
}

#[tauri::command]
fn expand_window(state: tauri::State<'_, AppState>, app: tauri::AppHandle) {
    let mut dock = state.dock.lock().unwrap();
    if dock.edge == DockEdge::None || !dock.is_collapsed {
        return;
    }
    dock.is_collapsed = false;
    let (exp_x, exp_y) = (dock.exp_x, dock.exp_y);
    drop(dock);

    if let Some(win) = app.get_webview_window("main") {
        animate_move(&win, exp_x, exp_y);
        let _ = win.emit("collapsed-changed", false);
    }
}

// ── Edge Docking Detection on Drag End ──────────────────────────────────────

fn handle_drag_ended(app: &tauri::AppHandle) {
    let win = match app.get_webview_window("main") {
        Some(w) => w,
        None => return,
    };

    let pos = match win.outer_position() {
        Ok(p) => p,
        Err(_) => return,
    };
    let size = match win.outer_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let monitor = match win.current_monitor() {
        Ok(Some(m)) => m,
        _ => return,
    };

    let mon_pos = monitor.position();
    let mon_size = monitor.size();

    let threshold = 40; // pixels to snap
    let strip = 16;     // pixels visible when collapsed (ensures 16px tab clearly sticks out from screen edge)

    let wx = pos.x;
    let wy = pos.y;
    let ww = size.width as i32;
    let wh = size.height as i32;
    let mx = mon_pos.x;
    let my = mon_pos.y;
    let mw = mon_size.width as i32;

    let (edge, exp_x, exp_y, col_x, col_y) = if wx - mx <= threshold {
        // Snap to Left Edge
        (
            DockEdge::Left,
            mx,
            wy,
            mx - ww + strip,
            wy,
        )
    } else if (mx + mw) - (wx + ww) <= threshold {
        // Snap to Right Edge
        (
            DockEdge::Right,
            mx + mw - ww,
            wy,
            mx + mw - strip,
            wy,
        )
    } else if wy - my <= threshold {
        // Snap to Top Edge
        (
            DockEdge::Top,
            wx,
            my,
            wx,
            my - wh + strip,
        )
    } else {
        // Not near any edge
        (
            DockEdge::None,
            wx,
            wy,
            wx,
            wy,
        )
    };

    let state = app.state::<AppState>();
    {
        let mut dock = state.dock.lock().unwrap();
        dock.edge = edge;
        dock.is_collapsed = false;
        dock.exp_x = exp_x;
        dock.exp_y = exp_y;
        dock.col_x = col_x;
        dock.col_y = col_y;
        dock.width = ww;
        dock.height = wh;
        dock.last_outside_time = None;
    }

    if edge != DockEdge::None {
        // Snap flush to edge immediately
        let _ = win.set_position(PhysicalPosition::new(exp_x, exp_y));
        let _ = win.emit("dock-changed", serde_json::json!({
            "docked": true,
            "edge": match edge {
                DockEdge::Left => "left",
                DockEdge::Right => "right",
                DockEdge::Top => "top",
                DockEdge::None => "none",
            }
        }));
    } else {
        let _ = win.emit("dock-changed", serde_json::json!({
            "docked": false,
            "edge": "none"
        }));
    }
}

// ── Win32 Subclass Procedure ────────────────────────────────────────────────

#[cfg(target_os = "windows")]
unsafe extern "system" fn window_subclass_proc(
    hwnd: *mut c_void,
    msg: u32,
    w_param: usize,
    l_param: isize,
    _id: usize,
    _data: usize,
) -> isize {
    match msg {
        0x0231 => {
            // WM_ENTERSIZEMOVE
            IS_DRAGGING.store(true, Ordering::SeqCst);
        }
        0x0232 => {
            // WM_EXITSIZEMOVE
            IS_DRAGGING.store(false, Ordering::SeqCst);
            if let Some(app) = APP_HANDLE.get() {
                handle_drag_ended(app);
            }
        }
        _ => {}
    }
    DefSubclassProc(hwnd, msg, w_param, l_param)
}

// ── Background Cursor Watcher ───────────────────────────────────────────────

fn start_cursor_watcher() {
    std::thread::spawn(|| {
        loop {
            std::thread::sleep(Duration::from_millis(50));

            if IS_DRAGGING.load(Ordering::SeqCst) {
                continue;
            }

            let app = match APP_HANDLE.get() {
                Some(a) => a,
                None => continue,
            };

            let state = match app.try_state::<AppState>() {
                Some(s) => s,
                None => continue,
            };

            let mut pt = POINT::default();
            #[cfg(target_os = "windows")]
            unsafe {
                if GetCursorPos(&mut pt) == 0 {
                    continue;
                }
            }

            let mut dock = state.dock.lock().unwrap();
            if dock.edge == DockEdge::None {
                continue;
            }

            if dock.is_collapsed {
                // Check if mouse is hovering over the visible strip
                let is_hovering_strip = match dock.edge {
                    DockEdge::Left => {
                        pt.x >= dock.col_x + dock.width - 24
                            && pt.x <= dock.col_x + dock.width + 16
                            && pt.y >= dock.col_y
                            && pt.y <= dock.col_y + dock.height
                    }
                    DockEdge::Right => {
                        pt.x >= dock.col_x - 16
                            && pt.x <= dock.col_x + 24
                            && pt.y >= dock.col_y
                            && pt.y <= dock.col_y + dock.height
                    }
                    DockEdge::Top => {
                        pt.y >= dock.col_y + dock.height - 24
                            && pt.y <= dock.col_y + dock.height + 16
                            && pt.x >= dock.col_x
                            && pt.x <= dock.col_x + dock.width
                    }
                    DockEdge::None => false,
                };

                if is_hovering_strip {
                    dock.is_collapsed = false;
                    dock.last_outside_time = None;
                    let (exp_x, exp_y) = (dock.exp_x, dock.exp_y);
                    drop(dock);

                    if let Some(win) = app.get_webview_window("main") {
                        animate_move(&win, exp_x, exp_y);
                        let _ = win.emit("collapsed-changed", false);
                    }
                }
            } else {
                // Window is expanded. Check if mouse is outside.
                let is_inside_window = pt.x >= dock.exp_x - 6
                    && pt.x <= dock.exp_x + dock.width + 6
                    && pt.y >= dock.exp_y - 6
                    && pt.y <= dock.exp_y + dock.height + 6;

                if !is_inside_window {
                    let now = Instant::now();
                    match dock.last_outside_time {
                        None => {
                            dock.last_outside_time = Some(now);
                        }
                        Some(t) => {
                            // If mouse has stayed outside for > 350ms, collapse!
                            if now.duration_since(t) > Duration::from_millis(350) {
                                dock.is_collapsed = true;
                                dock.last_outside_time = None;
                                let (col_x, col_y) = (dock.col_x, dock.col_y);
                                drop(dock);

                                if let Some(win) = app.get_webview_window("main") {
                                    animate_move(&win, col_x, col_y);
                                    let _ = win.emit("collapsed-changed", true);
                                }
                            }
                        }
                    }
                } else {
                    dock.last_outside_time = None;
                }
            }
        }
    });
}

// ── Main Entrypoint ─────────────────────────────────────────────────────────

fn main() {
    let store = TodoStore::load();

    let res = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            store: Mutex::new(store),
            dock: Mutex::new(DockInfo::default()),
        })
        .setup(|app| {
            APP_HANDLE.set(app.handle().clone()).ok();

            // Build system tray safely
            if let Some(icon) = app.default_window_icon() {
                let _tray = TrayIconBuilder::new()
                    .tooltip("Sticky Todo")
                    .icon(icon.clone())
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    if let Ok(hwnd) = win.hwnd() {
                        let preference: u32 = 2; // DWMWCP_ROUND
                        unsafe {
                            DwmSetWindowAttribute(
                                hwnd.0 as _,
                                33, // DWMWA_WINDOW_CORNER_PREFERENCE
                                &preference as *const u32 as _,
                                std::mem::size_of::<u32>() as u32,
                            );

                            SetWindowSubclass(hwnd.0 as _, subclass_proc_trampoline, 1, 0);
                        }
                    }
                }

                let _ = win.center();
                let _ = win.show();
                let _ = win.set_focus();
            }

            start_cursor_watcher();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_todos,
            add_todo,
            toggle_todo,
            delete_todo,
            reorder_todos,
            edit_todo,
            minimize_window,
            hide_window,
            show_window,
            collapse_window,
            expand_window,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = res {
        eprintln!("Run error: {:?}", e);
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn subclass_proc_trampoline(
    hwnd: *mut c_void,
    msg: u32,
    w_param: usize,
    l_param: isize,
    id: usize,
    data: usize,
) -> isize {
    window_subclass_proc(hwnd, msg, w_param, l_param, id, data)
}
