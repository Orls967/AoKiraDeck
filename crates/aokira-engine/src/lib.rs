//! AoKira deterministic simulation core.
//! Full robotics, trajectory, collision, and production state machine modules
//! are implemented in Phase 3.

use serde_json::Value;
use wasm_bindgen::prelude::*;

pub const CANONICAL_WORKCELL_JSON: &str =
    include_str!("../../../data/workcell/aokira-workcell.v1.json");

pub const ENGINE_CONTRACT_VERSION: &str = "1.0.0";

#[wasm_bindgen]
pub fn engine_version() -> String {
    ENGINE_CONTRACT_VERSION.to_string()
}

pub fn parse_canonical_workcell_json() -> Result<Value, serde_json::Error> {
    serde_json::from_str(CANONICAL_WORKCELL_JSON)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_workcell_json_parses_cleanly() {
        let parsed = parse_canonical_workcell_json().expect("canonical workcell JSON must parse");
        assert_eq!(parsed["workcellId"], "aokira-cell-v1");
        assert_eq!(parsed["robot"]["dof"], 6);
    }
}
