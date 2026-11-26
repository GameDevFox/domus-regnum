// Tidy House equilibrium tuning — the magic numbers that set the MESSY→CLEAN feel. Shared by the
// sim (sims/tidy-house.ts) and its equilibrium test (world/household.test.ts) so the demo and its
// safety-net pin the SAME values and can't drift apart. The maids stabilize at ~85% clean; the
// steady state is asserted in household.test.ts — tune here, both follow.
export const TOTAL_GRIME_RATE = 0.06; // grime/s accumulated across the whole floor (split per node)

// Starting grime per floor node: base + random()*spread (a heavily-dirty house the maids recover).
export const INITIAL_GRIME = { base: 0.55, spread: 0.35 };
