//! AoKira deterministic Rust/WASM simulation engine.
//! Implements Standard DH forward kinematics, damped least-squares inverse kinematics,
//! quintic joint-space trajectory planning, analytical capsule/box collision checks,
//! and the 8-stage pick-and-place production state machine on a fixed 20 ms clock.

pub mod collision;
pub mod conveyor;
pub mod gripper;
pub mod kinematics;
pub mod math;
pub mod metrics;
pub mod production;
pub mod robot;
pub mod scheduler;
pub mod trajectory;
pub mod types;

use scheduler::SimulationEngine;
use types::{Pose3D, ScenarioConfig};
use wasm_bindgen::prelude::*;

pub const CANONICAL_WORKCELL_JSON: &str =
    include_str!("../../../data/workcell/aokira-workcell.v1.json");

pub const ENGINE_CONTRACT_VERSION: &str = "1.0.0";

#[wasm_bindgen]
pub fn engine_version() -> String {
    ENGINE_CONTRACT_VERSION.to_string()
}

fn serialize_err(msg: String) -> JsValue {
    JsValue::from_str(&msg)
}

#[wasm_bindgen]
pub struct AokiraSimEngine {
    inner: SimulationEngine,
}

#[wasm_bindgen]
impl AokiraSimEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(workcell_json: Option<String>) -> Result<AokiraSimEngine, JsValue> {
        let inner = SimulationEngine::new(workcell_json.as_deref()).map_err(serialize_err)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen]
    pub fn load_scenario(&mut self, scenario_json: &str) -> Result<String, JsValue> {
        let scenario: ScenarioConfig = serde_json::from_str(scenario_json)
            .map_err(|e| serialize_err(format!("Invalid scenario JSON: {e}")))?;
        let out = self.inner.load_scenario(scenario).map_err(serialize_err)?;
        serde_json::to_string(&out).map_err(|e| serialize_err(e.to_string()))
    }

    #[wasm_bindgen]
    pub fn command(&mut self, action: &str) -> Result<String, JsValue> {
        let out = self.inner.command(action).map_err(serialize_err)?;
        serde_json::to_string(&out).map_err(|e| serialize_err(e.to_string()))
    }

    #[wasm_bindgen]
    pub fn step_ticks(&mut self, tick_count: u32) -> Result<String, JsValue> {
        let out = self.inner.step_ticks(tick_count);
        serde_json::to_string(&out).map_err(|e| serialize_err(e.to_string()))
    }

    #[wasm_bindgen]
    pub fn set_joints(&mut self, angles_json: &str) -> Result<String, JsValue> {
        let angles: Vec<f64> = serde_json::from_str(angles_json)
            .map_err(|e| serialize_err(format!("Invalid joint angles JSON: {e}")))?;
        let out = self.inner.set_joints(&angles).map_err(serialize_err)?;
        serde_json::to_string(&out).map_err(|e| serialize_err(e.to_string()))
    }

    #[wasm_bindgen]
    pub fn solve_ik(&mut self, target_pose_json: &str, apply: bool) -> Result<String, JsValue> {
        let pose: Pose3D = serde_json::from_str(target_pose_json)
            .map_err(|e| serialize_err(format!("Invalid target Pose3D JSON: {e}")))?;
        let out = self.inner.solve_ik(&pose, apply);
        serde_json::to_string(&out).map_err(|e| serialize_err(e.to_string()))
    }

    #[wasm_bindgen]
    pub fn set_gripper(&mut self, open: bool) -> Result<String, JsValue> {
        let out = self.inner.set_gripper(open);
        serde_json::to_string(&out).map_err(|e| serialize_err(e.to_string()))
    }

    #[wasm_bindgen]
    pub fn get_snapshot_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.snapshot()).map_err(|e| serialize_err(e.to_string()))
    }

    #[wasm_bindgen]
    pub fn get_metrics_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.metrics()).map_err(|e| serialize_err(e.to_string()))
    }
}
