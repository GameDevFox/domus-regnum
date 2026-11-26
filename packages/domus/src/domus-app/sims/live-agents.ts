import { Value } from "@kitsune/common-web/src/value";

import { Agent } from "../../world/agent";

// The live maid/agent roster published by whichever in-game sim is running (Tidy House / haul), read
// by the door-swing controller (sims/doors.ts) so doors can react to maids WITHOUT coupling the sim
// branch to the blocks branch (they mount in sibling groups). Empty when no sim runs. Mirrors the
// shared-mutable pattern of blocks/current-level.ts.
export const liveAgents = Value<Agent[]>([]);
