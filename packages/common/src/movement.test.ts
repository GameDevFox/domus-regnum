import {
  HUMAN_RUN_SPEED,
  HUMAN_WALK_SPEED,
  brakingDistance,
  brakingSpeed,
  trapezoidDuration,
  trapezoidStep,
} from "./movement";

describe("movement — braking math", () => {
  it("brakingSpeed inverts brakingDistance (v² = 2·a·d both ways)", () => {
    const v = 1.5;
    const a = 2;
    expect(brakingSpeed(brakingDistance(v, a), a)).toBeCloseTo(v);
  });

  it("brakingSpeed clamps negative remaining distance to zero", () => {
    expect(brakingSpeed(-0.01, 2)).toBe(0);
  });
});

describe("movement — trapezoidStep", () => {
  const opts = { accel: 2, topSpeed: 1, remaining: 100 };

  it("ramps up from rest by accel·dt", () => {
    expect(trapezoidStep(0, 0.1, opts)).toBeCloseTo(0.2);
  });

  it("caps at the top speed on long trips", () => {
    expect(trapezoidStep(0.95, 0.1, opts)).toBe(1);
  });

  it("caps at the braking speed near the target", () => {
    const v = trapezoidStep(1, 0.1, { ...opts, remaining: 0.01 });
    expect(v).toBeCloseTo(brakingSpeed(0.01, 2));
    expect(v).toBeLessThan(0.3);
  });
});

describe("movement — trapezoidDuration", () => {
  it("computes the closed-form trapezoid time (cruise reached)", () => {
    // 3 m at top 1 m/s, accel 2: ramp 0.5 s + brake 0.5 s cover 0.5 m; cruise 2.5 m at 1 m/s.
    expect(trapezoidDuration(3, 1, 2)).toBeCloseTo(3.5);
  });

  it("computes the triangle time on short trips", () => {
    // 1 m, accel 1, top speed never reached: t = 2·√(d/a) = 2 s.
    expect(trapezoidDuration(1, 10, 1)).toBeCloseTo(2);
  });

  it("matches a per-tick integration of trapezoidStep", () => {
    const [d, top, a, dt] = [3, 1, 2, 1 / 1000];
    let traveled = 0;
    let v = 0;
    let t = 0;
    while (traveled < d) {
      v = trapezoidStep(v, dt, { accel: a, topSpeed: top, remaining: d - traveled });
      traveled += v * dt;
      t += dt;
    }
    expect(t).toBeCloseTo(trapezoidDuration(d, top, a), 1);
  });

  it("falls back to constant speed without accel, and zero distance is instant", () => {
    expect(trapezoidDuration(3, 1.5)).toBeCloseTo(2);
    expect(trapezoidDuration(0, 1, 2)).toBe(0);
  });

  it("reference speeds: a 10 m hallway takes a believable time", () => {
    const walk = trapezoidDuration(10, HUMAN_WALK_SPEED, 1.2);
    const run = trapezoidDuration(10, HUMAN_RUN_SPEED, 1.2);
    expect(walk).toBeGreaterThan(run);
    expect(walk).toBeCloseTo(10 / 1.34 + 1.34 / 1.2, 1); // ~8.6 s
    expect(run).toBeCloseTo(10 / 2.5 + 2.5 / 1.2, 1); // ~6.1 s
  });
});
