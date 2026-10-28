use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// A single TODO item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub text: String,
    pub done: bool,
    pub created_at: u64,
}

/// Simple JSON-file backed store.
#[derive(Debug, Serialize, Deserialize)]
pub struct TodoStore {
    items: Vec<TodoItem>,
}

impl TodoStore {
    /// Return the path to the data file.
    ///
    /// The directory can be overridden via the `STICKYTODO_DATA_DIR`
    /// environment variable (used by `npm run dev:isolated` so dev builds
    /// never touch the real data). Falls back to `%LOCALAPPDATA%/StickyTodo`.
    fn data_path() -> PathBuf {
        let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        let dir = std::env::var("STICKYTODO_DATA_DIR")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| base.join("StickyTodo"));
        fs::create_dir_all(&dir).ok();
        dir.join("todos.json")
    }

    /// Load from disk, or return empty store.
    pub fn load() -> Self {
        let path = Self::data_path();
        if path.exists() {
            let data = fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or(TodoStore { items: Vec::new() })
        } else {
            TodoStore { items: Vec::new() }
        }
    }

    /// Persist to disk.
    fn save(&self) {
        let path = Self::data_path();
        if let Ok(data) = serde_json::to_string_pretty(self) {
            fs::write(&path, data).ok();
        }
    }

    pub fn items(&self) -> &[TodoItem] {
        &self.items
    }

    /// Generate a short unique id based on timestamp + random suffix.
    fn new_id() -> String {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        format!("{:x}", ts)
    }

    pub fn add(&mut self, text: &str) {
        let item = TodoItem {
            id: Self::new_id(),
            text: text.to_string(),
            done: false,
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };
        self.items.push(item);
        self.save();
    }

    pub fn toggle(&mut self, id: &str) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.done = !item.done;
            self.save();
        }
    }

    pub fn delete(&mut self, id: &str) {
        self.items.retain(|i| i.id != id);
        self.save();
    }

    pub fn edit(&mut self, id: &str, text: &str) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.text = text.to_string();
            self.save();
        }
    }

    pub fn reorder(&mut self, ids: &[String]) {
        let mut reordered = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(pos) = self.items.iter().position(|i| &i.id == id) {
                reordered.push(self.items.remove(pos));
            }
        }
        // Append any items not in the id list (shouldn't happen, but just in case)
        reordered.append(&mut self.items);
        self.items = reordered;
        self.save();
    }
}
