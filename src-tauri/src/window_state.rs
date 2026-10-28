use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Which screen edge the window is docked to (if any).
///
/// Serialized as a lowercase name so the on-disk JSON matches the
/// convention the frontend already uses for dock events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockEdge {
    None,
    Left,
    Right,
    Top,
}

/// Persisted window state: outer position/size plus dock/collapse state.
///
/// `x`/`y` are always the *expanded* (fully visible) position in physical
/// pixels. The collapsed position is not stored — it is derived from the
/// expanded position plus the current monitor geometry at restore time, so a
/// changed monitor layout cannot leave the 16px strip in the wrong place.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub edge: DockEdge,
    pub collapsed: bool,
}

impl WindowState {
    fn path() -> PathBuf {
        crate::todo_store::data_dir().join("window_state.json")
    }

    /// Load persisted state, or `None` if the file is missing or corrupt.
    pub fn load() -> Option<WindowState> {
        let path = Self::path();
        if !path.exists() {
            return None;
        }
        let data = fs::read_to_string(&path).ok()?;
        serde_json::from_str(&data).ok()
    }

    /// Persist to disk. Failures are silent (matches `TodoStore::save`).
    pub fn save(state: &WindowState) {
        let path = Self::path();
        if let Ok(data) = serde_json::to_string_pretty(state) {
            fs::write(&path, data).ok();
        }
    }
}
