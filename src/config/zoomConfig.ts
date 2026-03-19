export const ZOOM_MAX_FREE_DURATION_MINUTES = 40;

/**
 * Returns true if this backend is configured to use a Zoom
 * account on the free plan. This is driven by environment
 * variables so we can toggle behaviour per deployment.
 *
 * Supported env vars:
 * - ZOOM_IS_FREE_PLAN=true|false
 * - ZOOM_PLAN=free|paid
 */
export function isZoomFreePlan(): boolean {
  const flag = (process.env.ZOOM_IS_FREE_PLAN || "").toLowerCase();
  const plan = (process.env.ZOOM_PLAN || "").toLowerCase();

  if (flag === "true") return true;
  if (flag === "false") return false;

  return plan === "free";
}

