import { buildSolverContext, solveSquad } from "./solver.js";
import { solvePointsChallenge } from "./points-solver.js";

const WORKER_RESPONSE = "SOLVER_WORKER_RESPONSE";

const reply = (requestId, ok, data, error) => {
  self.postMessage({ type: WORKER_RESPONSE, requestId, ok, data, error });
};

self.addEventListener("message", async (event) => {
  const { type, requestId, payload } = event.data || {};
  if (!type || !requestId) return;

  if (type === "INIT") {
    return reply(requestId, true, { ready: true, mode: "content-worker" });
  }

  if (type === "SOLVE") {
    try {
      const context = buildSolverContext(payload || {});
      const result = solveSquad(context);
      return reply(requestId, true, result);
    } catch (error) {
      return reply(requestId, false, null, {
        code: "SOLVER_FAILED",
        message: error?.message || "Solver failed",
      });
    }
  }

  if (type === "SOLVE_POINTS") {
    try {
      return reply(requestId, true, solvePointsChallenge(payload || {}));
    } catch (error) {
      return reply(requestId, false, null, {
        code: "POINTS_SOLVER_FAILED",
        message: error?.message || "Points solver failed",
      });
    }
  }

  return reply(requestId, true, { ok: true });
});
