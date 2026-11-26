import { NodeId } from "./nav";

// The reactive job board from the MVP spec (06-mvp-poc §4.2): the world posts jobs, idle servants
// auto-claim the best one by score, and the player can override (assign a specific servant, or mark
// a job urgent). Kept as a plain factory over an array so the household sim stays deterministic and
// unit-testable; the integration layer wraps `jobs` in a Value for the React roster/meter.

export type JobType = "sweep" | "haul";

export type Job = {
  id: string;
  type: JobType;
  node: NodeId; // where the work happens (pickup node, for haul)
  target: NodeId | null; // destination for a haul (e.g. the kitchen a dish is carried to)
  priority: number; // base desirability (e.g. grime level for a sweep)
  claimedBy: string | null;
  urgent: boolean; // player-queued -> large scoring bonus
  forcedAssignee: string | null; // player override -> this servant takes it regardless of score
  progress: number; // 0..1 while being worked
};

export type JobInit = {
  id: string;
  type: JobType;
  node: NodeId;
  target?: NodeId | null;
  priority?: number;
  urgent?: boolean;
  forcedAssignee?: string | null;
};

// Tunable weights for auto-claim scoring. Defaults make nearer + dirtier + urgent win.
export type ScoreWeights = {
  priority: number;
  distance: number;
  urgency: number;
};

const DEFAULT_WEIGHTS: ScoreWeights = { priority: 1, distance: 0.35, urgency: 100 };

export type JobBoard = {
  jobs: Job[];
  add: (init: JobInit) => Job;
  remove: (id: string) => void;
  open: () => Job[]; // unclaimed
  hasAt: (type: JobType, node: NodeId) => boolean; // avoid posting duplicates
  // The best job for a servant, given how far it is from each job's node. Returns null if nothing is
  // claimable. A forced assignment to this servant always wins. Mutates nothing — claiming is explicit.
  bestFor: (servantId: string, distanceTo: (node: NodeId) => number, type?: JobType) => Job | null;
  claim: (job: Job, servantId: string) => void;
  release: (job: Job) => void; // give a claimed job back (e.g. the servant couldn't reach it)
};

// Forced-to-me jobs must always outrank any non-forced job, but still be chosen deterministically
// among themselves (by score, then id) — so this bonus is just larger than any real score spread.
const FORCED_BONUS = 1e6;

export type JobBoardOptions = { weights?: Partial<ScoreWeights> };

export const JobBoard = ({ weights }: JobBoardOptions = {}): JobBoard => {
  const w: ScoreWeights = { ...DEFAULT_WEIGHTS, ...weights };
  const jobs: Job[] = [];

  const score = (job: Job, dist: number): number =>
    job.priority * w.priority - dist * w.distance + (job.urgent ? w.urgency : 0);

  const board: JobBoard = {
    jobs,

    add: (init) => {
      const job: Job = {
        id: init.id,
        type: init.type,
        node: init.node,
        target: init.target ?? null,
        priority: init.priority ?? 1,
        claimedBy: null,
        urgent: init.urgent ?? false,
        forcedAssignee: init.forcedAssignee ?? null,
        progress: 0,
      };
      jobs.push(job);
      return job;
    },

    remove: (id) => {
      const i = jobs.findIndex((j) => j.id === id);
      if (i >= 0) jobs.splice(i, 1);
    },

    open: () => jobs.filter((j) => j.claimedBy === null),

    hasAt: (type, node) => jobs.some((j) => j.type === type && j.node === node),

    bestFor: (servantId, distanceTo, type) => {
      let best: Job | null = null;
      let bestScore = -Infinity;
      for (const job of jobs) {
        if (job.claimedBy !== null) continue;
        if (type !== undefined && job.type !== type) continue; // restrict to one kind (e.g. sweep)
        // Another servant's forced job is off-limits to this one.
        if (job.forcedAssignee !== null && job.forcedAssignee !== servantId) continue;
        // A job forced onto this servant always outranks non-forced work, but forced jobs still
        // compete with each other by score so the choice is deterministic.
        const s = score(job, distanceTo(job.node)) + (job.forcedAssignee === servantId ? FORCED_BONUS : 0);
        // Tie-break by id so selection is deterministic.
        if (s > bestScore || (s === bestScore && best !== null && job.id < best.id)) {
          bestScore = s;
          best = job;
        }
      }
      return best;
    },

    claim: (job, servantId) => {
      job.claimedBy = servantId;
    },

    release: (job) => {
      job.claimedBy = null;
    },
  };

  return board;
};
