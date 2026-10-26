/**
 * ============================================================================
 * Litefin - SpringPhysics
 * ============================================================================
 * Apple-style (iOS) scroll physics: a linear damped harmonic oscillator
 *
 *     x'' = ω²·(target − x) − 2ζω·x'
 *
 * Unlike the classic time-based easeOutQuad engine in ScrollController, this
 * model is velocity-driven. The camera holds a real velocity that carries
 * across retargeting keypresses (held D-pad navigation) and glides down into
 * a critically-damped, asymptotic stop — the smooth Apple TV (tvOS) scroll
 * character, with **no overshoot and no bounce**.
 *
 * Terminology (block: undefined at runtime, pure functions only):
 *   ω (omega) — natural frequency, rad/ms
 *   ζ  (zeta) — damping ratio. ζ = 1 is critically damped (no overshoot),
 *               ζ < 1 is underdamped (springy settle).
 *   v0        — initial velocity, px/ms, injected at spring start so short
 *               hops launch with the same outgoing velocity as the old
 *               easeOutQuad engine (slope 2 at t=0 → v0 = 2·D/T).
 *
 * All values are tuned for TV D-pad navigation (130–340ms hop budgets) and
 * verified numerically in tests/SpringScrollPhysics.test.js.
 * ============================================================================
 */

// ============================================================================
// Tunable constants — all tunable values in one place for easy TV tweaking
// ============================================================================

/**
 * Damping ratio (ζ). ζ = 1.0 is critically damped — the Apple TV (tvOS)
 * character: a fast glide toward the target and a smooth asymptotic stop
 * with **zero overshoot or bounce**.
 *
 * Numerically verified (tests/SpringScrollPhysics.test.js simulates the whole
 * trajectory space):
 *   - Single hops: monotonic approach, 0.00% overshoot across the entire hop grid.
 *   - Held D-pad key storms (press every 125ms) couple into a steady glide
 *     with a small trailing gap (≤~200px on huge rows), never pumping or
 *     diverging, landing exactly on the final target.
 */
export const SPRING_DAMPING_RATIO = 1.0;

/**
 * Natural frequency factor. ω = factor / (ζ·T) where T is the duration
 * preference budget. With critical damping the un-damped factor of 3 leaves
 * a dragging exponential tail, so the tuned value tightens the envelope
 * while keeping the glide Apple-TV smooth (verified settle times: 192-850ms
 * across the hop grid, always ≤ ~2.3× the duration budget).
 */
export const SPRING_FREQUENCY_FACTOR = 5.0;

/**
 * Minimum duration (ms) used for deriving the spring's natural frequency.
 * Hops below this still feel like a spring, not a rubber-band snap.
 */
export const SPRING_MIN_DURATION_MS = 60;

/**
 * Initial velocity cap as a fraction of the natural impulse scale (ω·D).
 * Prevents large-hop overshoot spikes on TV compositors.
 */
export const SPRING_IMPETUS_CAP = 0.9;

/**
 * Hard velocity ceiling (px/ms) = 7000 px/s. Protects virtual row window
 * updates and TV compositors from extreme impulses.
 */
export const SPRING_VELOCITY_CEILING_PX_MS = 7;

/**
 * Integration substep (ms). The integrator is semi-implicit Euler, which is
 * stable for ω·dt ≪ 1. 8ms substeps guarantee stability and identical
 * trajectories at 30/60/120 Hz displays.
 */
export const SPRING_SUBSTEP_MS = 8;

/**
 * Settle thresholds: the spring is considered finished when the remaining
 * distance (px) and velocity magnitude (px/ms) both fall under these.
 */
export const SPRING_SETTLE_DISTANCE_PX = 0.3;
export const SPRING_SETTLE_VELOCITY_PX_MS = 0.015;

/**
 * Absolute animation timeout (ms). Safety net for pathological retarget
 * storms and tiny residual demands that technically equal the thresholds.
 */
export const SPRING_MAX_DURATION_MS = 1200;

/**
 * Builds spring parameters for a hop of `distance` px within a `durationMs`
 * settle budget.
 *
 * The natural frequency is derived from the duration preference:
 * an underdamped decay envelope e^(−ζωt) reaches ~5% residual when ζωt ≈ 3,
 * so ω = 3 / (ζ·T). This adapts the spring to the user's scroll duration
 * preference ('current' → snappy, 'slower' → relaxed, cinematic glide).
 *
 * @param {number} distance - Signed travel distance (target − current), px
 * @param {number} durationMs - Settle budget from duration preference, ms
 * @returns {{omega: number, zeta: number, v0: number}} Spring parameters
 */
export function createSpring(distance, durationMs) {
    const dist = Math.abs(distance);
    const dur = Math.max(durationMs || 0, SPRING_MIN_DURATION_MS);
    const zeta = SPRING_DAMPING_RATIO;
    const omega = SPRING_FREQUENCY_FACTOR / (zeta * dur);

    // Match the outgoing velocity of the old easeOutQuad engine (initial
    // slope 2 → v0 = 2·D/T), capped as a fraction of the natural impulse
    // scale ω·D so far hops never spike past the compositor budget.
    const target = Math.min((2 * dist) / dur, SPRING_IMPETUS_CAP * omega * Math.max(dist, 1));
    let v0 = Math.sign(distance) * target;

    if (Math.abs(v0) > SPRING_VELOCITY_CEILING_PX_MS) {
        v0 = Math.sign(v0) * SPRING_VELOCITY_CEILING_PX_MS;
    }

    return { omega, zeta, v0 };
}

/**
 * One semi-implicit Euler integration step.
 *
 * @param {number} x - Current position, px
 * @param {number} v - Current velocity, px/ms
 * @param {number} target - Target position, px
 * @param {number} omega - Natural frequency, rad/ms
 * @param {number} zeta - Damping ratio
 * @param {number} dt - Timestep, ms (should be ≤ SPRING_SUBSTEP_MS)
 * @returns {[number, number]} New [x, v]
 */
export function springStep(x, v, target, omega, zeta, dt) {
    const springForce = omega * omega * (target - x);
    const dampingForce = 2 * zeta * omega * v;
    let nv = v + (springForce - dampingForce) * dt;
    if (nv > SPRING_VELOCITY_CEILING_PX_MS) nv = SPRING_VELOCITY_CEILING_PX_MS;
    else if (nv < -SPRING_VELOCITY_CEILING_PX_MS) nv = -SPRING_VELOCITY_CEILING_PX_MS;
    return [x + nv * dt, nv];
}

/**
 * Offline simulation of a full spring hop. Used by the test suite to verify
 * settle time, overshoot and termination without a browser RAF loop.
 *
 * @param {number} x0 - Start position, px
 * @param {number} target - Target position, px
 * @param {number} durationMs - Duration budget, ms
 * @param {number} [maxDurationMs=SPRING_MAX_DURATION_MS] - Hard timeout
 * @returns {{durationMs: number, overshootPx: number, overshootRatio: number, settled: boolean}}
 */
export function simulateSpring(x0, target, durationMs, maxDurationMs = SPRING_MAX_DURATION_MS) {
    const { omega, zeta, v0 } = createSpring(target - x0, durationMs);
    const dir = Math.sign(target - x0);
    let x = x0;
    let v = v0;
    let t = 0;
    let overPx = 0;
    let settled = false;

    while (t < maxDurationMs) {
        const step = Math.min(SPRING_SUBSTEP_MS, maxDurationMs - t);
        [x, v] = springStep(x, v, target, omega, zeta, step);
        t += step;

        // Only positions genuinely beyond the target (in the direction of
        // travel) count as overshoot; measure along the hop direction.
        const beyond = (x - target) * dir;
        if (beyond > overPx) {
            overPx = beyond;
        }

        if (Math.abs(target - x) < SPRING_SETTLE_DISTANCE_PX && Math.abs(v) < SPRING_SETTLE_VELOCITY_PX_MS) {
            settled = true;
            break;
        }
    }

    const hopDist = Math.abs(target - x0) || 1;
    return {
        durationMs: t,
        overshootPx: overPx,
        overshootRatio: overPx / hopDist,
        settled
    };
}
