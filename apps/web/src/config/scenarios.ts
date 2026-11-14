import scenarioA from '@data/scenarios/scenario-a.json';
import scenarioB from '@data/scenarios/scenario-b.json';
import scenarioC from '@data/scenarios/scenario-c.json';
import scenarioD from '@data/scenarios/scenario-d.json';
import type { ScenarioConfig } from '@/types/simulation';

export const PRESET_SCENARIOS: ScenarioConfig[] = [
  scenarioA as ScenarioConfig,
  scenarioB as ScenarioConfig,
  scenarioC as ScenarioConfig,
  scenarioD as ScenarioConfig,
];

export const DEFAULT_SCENARIO: ScenarioConfig = PRESET_SCENARIOS[0];
