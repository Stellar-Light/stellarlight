// Replays read the clock (liveness keys use Date.now()); pin it to the
// capture time so base and branch replays compare code, not wall time.
const t = Date.parse(process.env.PIN_NOW);
if (!Number.isFinite(t)) throw new Error("set PIN_NOW");
Date.now = () => t;
