import {
  Agent,
  AgentOptions,
  PICK_PLACE_TIME,
  routeAdjacent,
  setDestination,
  startWork as startAgentWork,
  stopAgent,
  tickBrain,
} from "./agent";
import { GrimeField } from "./grime";
import { Job, JobBoard } from "./jobs";
import { assignHaulTargets, bestDetour } from "./maid-perception";
import { Nav, NodeId } from "./nav";
import { nearestNode } from "./nearest";
import { randomDestination } from "./world";

// The "Tidy House" household sim (06-mvp-poc). Servants run a small brain each tick, claiming the
// best job from a scored board and either:
//   - SWEEP: walk to a grimy floor node, work for a skill-scaled duration, drive its grime to 0; or
//   - HAUL:  walk to a discrete mess (dirty dishes on a table), pick it up, carry it to the nearest
//            station (kitchen), and set it down clean.
// Ambient grime accrues everywhere, foot traffic dirties busy nodes, and discrete messes appear over
// time — so the house tends toward mess and the servants fight to keep it tidy. Deterministic given
// an injected rng, so it records/scrubs and unit-tests like the rest of the sim.
//
// Implements MVP M2 (job board + scored auto-claim), the ambient-grime half of M3 (sweep), and the
// discrete-mess half of M3 (dishes → haul). Energy/rest and skills-affect-quality remain fast-follows.
//
// Hauling servants stop ADJACENT to the dish source / station (route to it, back up one step) and
// spend PICK_PLACE_TIME (agent.ts) there picking up / setting down — so they reach beside the
// table and pause, rather than walking onto it.

export type MessState = "dirty" | "carried" | "clean";

// A discrete mess instance (e.g. dirty dishes). `node` is where it currently is (its source while
// dirty; it rides the carrier while carried — the view positions carried messes on the carrier).
export type Mess = {
  id: string;
  node: NodeId;
  state: MessState;
};

export type Servant = Agent & {
  name: string;
  skill: number; // 0..1 — higher works faster
  job: Job | null;
  carrying: Mess[]; // messes being hauled (≤ carryCapacity); empty = free-handed
  detour: Mess | null; // a piece she's swinging by to grab mid-haul (perception, capacity > 1)
};

// A render-agnostic snapshot of a servant for a UI roster. Keeps the React layer from reaching into
// live sim objects (or re-rendering on every position change).
export type ServantView = {
  id: string;
  name: string;
  activity: "idle" | "walking" | "working" | "carrying";
  task: string | null; // current job type, or null
  progress: number; // 0..1 while working
};

export const viewServant = (s: Servant): ServantView => ({
  id: s.id,
  name: s.name,
  activity: s.carrying.length > 0
    ? "carrying"
    : s.state === "working"
      ? "working"
      : s.state === "moving"
        ? "walking"
        : "idle",
  task: s.job ? s.job.type : null,
  progress: s.job ? s.job.progress : 0,
});

export type ServantOptions = AgentOptions & { name?: string; skill?: number };

export const Servant = (opts: ServantOptions): Servant => ({
  ...Agent(opts),
  name: opts.name ?? opts.id,
  skill: opts.skill ?? 0.6,
  job: null,
  carrying: [],
  detour: null,
});

export type HouseholdOptions = {
  nav: Nav;
  servants: Servant[];
  grime?: GrimeField;
  board?: JobBoard;
  rng?: () => number;
  postThreshold?: number; // grime at/above which a sweep job is posted (default 0.25)
  workDuration?: number; // base seconds to sweep a node at skill 1 (default 1.4)
  trafficRate?: number; // grime added at a servant's current node per second (default 0.015)
  // Discrete messes (dishes): tables where mess appears + stations (kitchens) it's hauled to.
  messSources?: NodeId[];
  stations?: NodeId[];
  messInterval?: number; // average seconds between mess spawns (default 6)
  // PERCEPTION model for HAUL (maid-perception.ts): when finite, maids only "see" trash within this
  // world-distance and the closest available maid within a piece's radius takes it (recomputed each
  // tick, so a closer maid taking over makes the previous one disengage). Default Infinity = the
  // legacy global job-board haul (every existing test runs this path unchanged). Sweep always uses
  // the board. Delete this option + the `perception` branches + maid-perception.ts to revert.
  noticeRadius?: number;
  // How many messes a maid can carry at once. >1 enables the opportunistic DETOUR (a carrying maid
  // under capacity swings by a nearby piece on her way to the station). Default 1 = single carry, no
  // detour (behaviour identical to before). Only meaningful with a finite noticeRadius.
  carryCapacity?: number;
  // Max extra distance a detour may add vs going straight to the station to still count as "on the
  // way". Default = noticeRadius. Smaller = only grab pieces almost directly en route.
  maxDetour?: number;
};

export type Household = {
  nav: Nav;
  grime: GrimeField;
  board: JobBoard;
  servants: Servant[];
  messes: Mess[];
  tick: (dt: number) => void;
  cleanliness: () => number; // grime-based, in [0,1]
  pendingMess: () => number; // outstanding dirty/carried messes
  washedCount: () => number; // total messes delivered to a station
};

const startWork = (s: Servant, workDuration: number) => {
  startAgentWork(s, workDuration / Math.max(s.skill, 0.2)); // skill scales the sweep duration
  if (s.job) s.job.progress = 0;
};

// The pause beside a dish source / station while picking up or setting down (fixed, skill-independent).
const startHaulWork = (s: Servant) => {
  startAgentWork(s, PICK_PLACE_TIME);
  if (s.job) s.job.progress = 0;
};

// tickBrain has already reset the work state when this runs — just close out the job.
const finishWork = (s: Servant, grime: GrimeField, board: JobBoard) => {
  if (s.job) {
    grime.setGrime(s.job.node, 0); // the floor is clean
    board.remove(s.job.id);
  }
  s.job = null;
};

export const Household = ({
  nav,
  servants,
  grime = GrimeField({ nav }),
  board = JobBoard(),
  rng = Math.random,
  postThreshold = 0.25,
  workDuration = 1.4,
  trafficRate = 0.015,
  messSources = [],
  stations = [],
  messInterval = 6,
  noticeRadius = Infinity,
  carryCapacity = 1,
  maxDetour = Number.isFinite(noticeRadius) ? noticeRadius : 0,
}: HouseholdOptions): Household => {
  const wander = randomDestination(nav, rng);
  const perception = Number.isFinite(noticeRadius); // haul via maid-perception instead of the board
  const messes: Mess[] = [];
  const jobMess = new Map<string, Mess>(); // haul jobId -> the mess it concerns
  let haulAssignment = new Map<string, Mess>(); // servantId -> the mess she should haul (perception)
  const openHaulJobFor = (mess: Mess): Job | undefined =>
    board.jobs.find((j) => j.claimedBy === null && jobMess.get(j.id) === mess);
  const dishesEnabled = messSources.length > 0 && stations.length > 0;
  let messTimer = 0;
  let messSeq = 0;
  let washed = 0;

  // Set ALL carried messes down clean at the station and close out the haul job. Each mess is removed
  // from the world (washed and put away) and counted, so the array stays bounded over a long run.
  const finishHaul = (s: Servant) => {
    for (const m of s.carrying) {
      m.state = "clean";
      const i = messes.indexOf(m);
      if (i >= 0) messes.splice(i, 1);
      washed++;
    }
    s.carrying = [];
    if (s.job) {
      board.remove(s.job.id);
      jobMess.delete(s.job.id);
    }
    s.job = null;
  };

  // Called after a hauling servant has paused beside a node: either the pickup (grab + route toward
  // the station, stopping adjacent) or the station (set down).
  const onHaulArrive = (s: Servant) => {
    const job = s.job;
    if (!job) return;
    // DETOUR: arrived beside a piece she swung by mid-haul — grab it, then resume to the station.
    if (s.detour) {
      const m = s.detour;
      s.detour = null;
      if (m.state === "dirty") {
        m.state = "carried";
        s.carrying.push(m);
        const mJob = board.jobs.find((j) => jobMess.get(j.id) === m);
        if (mJob) {
          board.remove(mJob.id);
          jobMess.delete(mJob.id);
        }
      }
      if (job.target == null) {
        finishHaul(s);
        return;
      }
      const outcome = routeAdjacent(s, job.target, nav); // back on the way to the station
      if (outcome === "unreachable") finishHaul(s);
      else if (outcome === "beside") startHaulWork(s);
      return;
    }
    if (s.carrying.length > 0) {
      finishHaul(s); // beside the station carrying the mess(es) — set them down
      return;
    }
    const mess = jobMess.get(job.id);
    if (mess && mess.state === "dirty") {
      mess.state = "carried";
      s.carrying.push(mess);
    } else {
      // The mess vanished (shouldn't happen) — abandon the job cleanly.
      board.remove(job.id);
      jobMess.delete(job.id);
      s.job = null;
      return;
    }
    // Head to the station, stopping ADJACENT to it (back up one step).
    if (job.target == null) {
      finishHaul(s);
      return;
    }
    const outcome = routeAdjacent(s, job.target, nav);
    if (outcome === "unreachable") finishHaul(s); // unreachable station — set down here
    else if (outcome === "beside") startHaulWork(s); // already beside the station — set it down
  };

  // Drive a freshly-claimed job: act in place if already adjacent, else path to it. Sweeps walk onto
  // the grimy tile; hauls stop one step short of the dish source. Returns false if the path failed.
  const driveTowardJob = (s: Servant): boolean => {
    const job = s.job!;
    if (job.type === "sweep") {
      if (s.location === job.node) {
        startWork(s, workDuration);
        return true;
      }
      setDestination(s, job.node, nav);
      return s.state === "moving";
    }
    // haul: approach a node adjacent to the dish source.
    const outcome = routeAdjacent(s, job.node, nav);
    if (outcome === "unreachable") return false;
    if (outcome === "beside") startHaulWork(s);
    return true;
  };

  // The servant brain, as tickBrain policy handlers (the skeleton lives in agent.ts).
  const brain = {
    onWorkTick: (s: Servant) => {
      if (s.job) s.job.progress = Math.min(1, 1 - s.workLeft / s.workTotal);
    },
    onWorkDone: (s: Servant) => {
      if (s.job?.type === "haul") onHaulArrive(s); // the grab / set-down lands after the pause
      else finishWork(s, grime, board);
    },
    onArrive: (s: Servant) => {
      if (!s.job) return;
      if (s.job.type === "sweep") {
        if (s.location === s.job.node) startWork(s, workDuration);
      } else {
        startHaulWork(s); // reached the pickup/station approach → pause, then grab/set-down
      }
    },
    // Idle: claim the best job (sweep or haul), else wander.
    decide: (s: Servant) => {
      const distanceTo = (node: NodeId) => s.position.distanceTo(nav.positionOf(node));
      // Try a job, then fall through to wander. PERCEPTION: haul comes from this tick's assignment
      // (the mess this maid is the closest available one to, within her noticeRadius), and sweep
      // from the board (sweep-only so distant trash she can't see never leaks in). LEGACY: the board
      // scores haul + sweep together.
      const claimAndDrive = (job: Job | null | undefined): boolean => {
        if (!job) return false;
        board.claim(job, s.id);
        s.job = job;
        if (driveTowardJob(s)) return true;
        board.release(job); // path failed: release so the job isn't leaked / the servant deadlocked
        s.job = null;
        return false;
      };
      if (perception) {
        const mess = haulAssignment.get(s.id);
        if (mess && claimAndDrive(openHaulJobFor(mess))) return;
        if (claimAndDrive(board.bestFor(s.id, distanceTo, "sweep"))) return;
      } else if (claimAndDrive(board.bestFor(s.id, distanceTo))) {
        return;
      }

      const dest = wander(s);
      if (dest !== null && dest !== s.location) setDestination(s, dest, nav);
    },
  };

  const spawnMess = (dt: number) => {
    if (!dishesEnabled) return;
    messTimer += dt;
    if (messTimer < messInterval) return;
    messTimer -= messInterval;
    // A source with no outstanding mess gets a new dirty pile.
    const free = messSources.filter((src) => !messes.some((m) => m.node === src && m.state !== "clean"));
    if (free.length === 0) return;
    const src = free[Math.floor(rng() * free.length)];
    const mess: Mess = { id: `mess${messSeq++}`, node: src, state: "dirty" };
    messes.push(mess);
    const job = board.add({
      id: `haul-${mess.id}`,
      type: "haul",
      node: src,
      target: nearestNode(stations, nav.positionOf(src), nav),
      priority: 1.6, // mess is more urgent than ambient dust
    });
    jobMess.set(job.id, mess);
  };

  // PERCEPTION disengage: a maid walking to a haul target (not yet carrying) gives it up the moment
  // this tick's assignment hands her piece to a CLOSER maid. She brakes to a stop at the next node on
  // her path (node-valid; the trapezoid decelerates into it), releases the job so the closer maid can
  // claim it, and re-decides from there. No-op unless she's mid-haul-walk and was reassigned.
  const maybeDisengage = (s: Servant) => {
    if (s.state !== "moving" || !s.job || s.job.type !== "haul" || s.carrying.length > 0) return;
    const mess = jobMess.get(s.job.id);
    if (mess && haulAssignment.get(s.id) === mess) return; // still hers — keep walking
    const job = s.job;
    s.job = null;
    board.release(job); // hand it back so the closer maid can take it this tick
    // Brake to a stop at the next node toward where she was headed (a real node, so re-pathing works).
    const dest = s.target;
    const np = dest != null && nav.findNodePath ? nav.findNodePath(s.location, dest) : [];
    if (np.length >= 2) {
      setDestination(s, np[1], nav); // coast/brake into the next node, then idle (job released → no grab)
    } else {
      stopAgent(s); // no node path → just stop and re-search next tick
    }
  };

  // PERCEPTION detour (capacity > 1): a maid carrying but not full, walking to a station, swings by a
  // nearby free piece that's "on the way" (small detour cost) and grabs it too — picked up on arrival
  // (onHaulArrive), then she resumes to the station. Reserves the piece's job so others back off.
  const maybeDetour = (s: Servant) => {
    if (
      s.state !== "moving" ||
      s.detour ||
      s.carrying.length === 0 ||
      s.carrying.length >= carryCapacity ||
      !s.job ||
      s.job.type !== "haul" ||
      s.job.target == null
    )
      return;
    const candidates = messes.filter((m) => m.state === "dirty" && openHaulJobFor(m));
    const m = bestDetour(s, candidates, nav.positionOf(s.job.target), nav, noticeRadius, maxDetour);
    if (!m) return;
    const mJob = openHaulJobFor(m);
    if (!mJob) return;
    board.claim(mJob, s.id); // reserve it; grabbed on arrival
    s.detour = m;
    const outcome = routeAdjacent(s, m.node, nav);
    if (outcome === "unreachable") {
      board.release(mJob); // can't get there — undo the detour
      s.detour = null;
    } else if (outcome === "beside") {
      startHaulWork(s); // already beside it → pause, then grab in onHaulArrive
    }
  };

  const tickServant = (s: Servant, dt: number) => {
    grime.raise(s.location, trafficRate * dt); // foot traffic dirties where they stand
    if (perception) {
      maybeDisengage(s);
      maybeDetour(s);
    }
    tickBrain(s, dt, brain);
  };

  const tick = (dt: number) => {
    grime.tick(dt); // 1. the house gets a little grimier everywhere
    spawnMess(dt); // 2a. discrete messes appear over time

    // 2b. Post / refresh sweep jobs where the floor is dirty. Existing jobs (claimed or not) get their
    //     priority refreshed to current grime so scoring tracks the mess.
    grime.dirtiest(postThreshold).forEach((node) => {
      const existing = board.jobs.find((j) => j.type === "sweep" && j.node === node);
      if (existing) existing.priority = grime.grimeOf(node);
      else board.add({ id: `sweep-${node}`, type: "sweep", node, priority: grime.grimeOf(node) });
    });

    // 2c. PERCEPTION: recompute who-hauls-what from current positions (closest available maid within
    //     each piece's noticeRadius). Recomputing every tick is what drives disengage — a maid whose
    //     assigned mess moved to a closer maid is handled in the brain.
    if (perception) haulAssignment = assignHaulTargets(servants, messes, nav, noticeRadius);

    // 3. Each servant runs its brain.
    for (const s of servants) tickServant(s, dt);
  };

  return {
    nav,
    grime,
    board,
    servants,
    messes,
    tick,
    cleanliness: () => grime.cleanliness(),
    pendingMess: () => messes.filter((m) => m.state !== "clean").length,
    washedCount: () => washed,
  };
};
