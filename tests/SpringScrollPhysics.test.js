import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createSpring,
    springStep,
    simulateSpring,
    SPRING_DAMPING_RATIO,
    SPRING_SUBSTEP_MS,
    SPRING_VELOCITY_CEILING_PX_MS,
    SPRING_MAX_DURATION_MS,
    SPRING_MIN_DURATION_MS,
    SPRING_SETTLE_DISTANCE_PX,
    SPRING_SETTLE_VELOCITY_PX_MS
} from '../src/ui/SpringPhysics.js';

/**
 * ============================================================================
 * Environment Mock Setup for Node.js Test Execution
 * ============================================================================
 */
const storageMap = new Map();
globalThis.localStorage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear()
};

globalThis.document = {
    createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        setAttribute: () => {},
        getAttribute: () => null
    }),
    documentElement: {
        setAttribute: () => {},
        getAttribute: () => null,
        dir: 'ltr'
    }
};
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (cb) => 1;
globalThis.cancelAnimationFrame = () => {};

const { scrollController, default: ScrollController } = await import('../src/ui/ScrollController.js');
const { storage } = await import('../src/utils/StorageService.js');

/**
 * ============================================================================
 * SCROLL PHYSICS PREFERENCE
 * ============================================================================
 */

test('ScrollController: scroll physics defaults to "easing" (opt-in spring)', () => {
    storage.removeItem('pref:scrollPhysics');
    const controller = new ScrollController();
    assert.strictEqual(
        controller.getScrollPhysics(),
        'easing',
        'Classic easing must remain the default so existing scroll behavior is untouched'
    );
});

test('ScrollController: scroll physics honors "spring" preference and exposes a setter reader', () => {
    const controller = new ScrollController();
    storage.setItem('pref:scrollPhysics', 'spring');
    assert.strictEqual(controller.getScrollPhysics(), 'spring');
    storage.setItem('pref:scrollPhysics', 'easing');
    assert.strictEqual(controller.getScrollPhysics(), 'easing');
    storage.setItem('pref:scrollPhysics', 'garbage');
    assert.strictEqual(
        controller.getScrollPhysics(),
        'easing',
        'Any unrecognized value must fall back to classic easing'
    );
    storage.removeItem('pref:scrollPhysics');
});

/**
 * ============================================================================
 * SPRING PARAMETER GENERATION
 * ============================================================================
 */

test('createSpring: derives a stable natural frequency from duration and floors tiny durations', () => {
    // Tiny durations must be floored so ω never explodes into instability
    const floorParams = createSpring(400, 10);
    const minParams = createSpring(400, SPRING_MIN_DURATION_MS);
    assert.ok(
        Math.abs(floorParams.omega - minParams.omega) < 1e-9,
        'Durations below the minimum must clamp to SPRING_MIN_DURATION_MS'
    );

    // Longer settle budget → softer spring (lower ω)
    const fast = createSpring(400, 130);
    const slow = createSpring(400, 340);
    assert.ok(fast.omega > slow.omega, 'Faster duration preference must yield higher ω (stiffest spring)');

    // ζ must be critically damped (exactly 1) — smooth glide, zero bounce,
    // matching the Apple TV (tvOS) scroll character
    assert.strictEqual(SPRING_DAMPING_RATIO, 1.0, 'ζ must be critically damped (1.0): no overshoot, no bounce');
});

test('createSpring: initial impulse matches easeOutQuad outgoing velocity and respects ceilings', () => {
    const D = 400;
    const T = 180;
    const { omega, v0 } = createSpring(D, T);

    // easeOutQuad initial slope is 2 → v0 = 2·D/T
    const expected = (2 * D) / T;
    assert.ok(
        Math.abs(v0 - expected) < 1e-9,
        `For a 400px/180ms hop v0 must equal 2·D/T (${expected.toFixed(2)}), got ${v0}`
    );

    // Hard ceiling: giant distances clamp v0, protecting TV compositors
    const giant = createSpring(100000, 130);
    assert.ok(
        Math.abs(giant.v0) <= SPRING_VELOCITY_CEILING_PX_MS,
        'v0 must never exceed SPRING_VELOCITY_CEILING_PX_MS'
    );

    // Zero distance → zero impulse (no phantom motion)
    assert.strictEqual(createSpring(0, 130).v0, 0, 'A zero-distance hop must not inject velocity');

    // Signed: negative hops get negative impulse
    assert.strictEqual(createSpring(-400, 130).v0 < 0, true, 'Negative hops must launch with negative velocity');
});

/**
 * ============================================================================
 * STEP INTEGRATION
 * ============================================================================
 */

test('springStep: pulls position toward the target and damps over time', () => {
    const { omega, zeta } = createSpring(400, 180);
    // Positive deficit (x=0, target=400) must accelerate forward
    const [, vForward] = springStep(0, 0, 400, omega, zeta, 8);
    assert.ok(vForward > 0, 'Spring force must accelerate toward the target');

    // Already at target with zero velocity → stays exactly there (no pumping)
    const [xStill, vStill] = springStep(400, 0, 400, omega, zeta, 8);
    assert.strictEqual(xStill, 400);
    assert.strictEqual(vStill, 0);

    // Sustained non-linear: damping term must dominate after passing the target
    let x = 400;
    let v = 0;
    for (let i = 0; i < 200; i++) {
        [x, v] = springStep(x, v, 400, omega, zeta, SPRING_SUBSTEP_MS);
    }
    assert.ok(Math.abs(x - 400) < 1, 'Oscillation must decay to sub-pixel residual within 200 substeps');
});

/**
 * ============================================================================
 * FULL TRAJECTORY SIMULATION (Apple-settle characteristics)
 * ============================================================================
 */

const HOP_GRID = [
    [60, 130],
    [200, 130],
    [400, 130],
    [400, 180],
    [800, 180],
    [1500, 180],
    [400, 240],
    [400, 340],
    [1500, 340]
];

test('simulateSpring: every hop in the navigation grid settles and terminates', () => {
    for (const [D, T] of HOP_GRID) {
        const r = simulateSpring(0, D, T);
        assert.equal(r.settled, true, `A ${D}px hop at ${T}ms budget must settle before the hard timeout`);
        assert.ok(
            r.durationMs <= SPRING_MAX_DURATION_MS,
            `Settle time (${r.durationMs}ms) must not exceed the timeout`
        );
        // Far from pathological: settle must not stall at the threshold far
        // below the natural envelope (i.e. unphysically instantaneous)
        assert.ok(r.durationMs >= T * 0.4, `Settle time must reflect the spring envelope, got ${r.durationMs}ms`);
    }
});

test('simulateSpring: critically damped Apple TV character — zero overshoot on every hop', () => {
    for (const [D, T] of HOP_GRID) {
        const r = simulateSpring(0, D, T);
        assert.ok(
            r.overshootPx < 0.5,
            `${D}px@${T}ms must land without bounce (overshoot ${r.overshootPx.toFixed(2)}px)`
        );
    }
    // Micro hops (typical same-row adjustments) must be strictly monotonic.
    for (const D of [6, 12, 25]) {
        const r = simulateSpring(0, D, 130);
        assert.ok(r.overshootPx < 0.01, `Micro hop of ${D}px must not bounce at all (got ${r.overshootPx}px)`);
    }
});

test('simulateSpring: trajectory is deterministic and directionally symmetric', () => {
    const a = simulateSpring(0, 400, 180);
    const b = simulateSpring(0, 400, 180);
    assert.strictEqual(a.durationMs, b.durationMs, 'Repeated simulations must be bit-identical (no Physics RNG)');

    const fwd = simulateSpring(0, 400, 180);
    const rev = simulateSpring(1200, 800, 180);
    assert.ok(
        Math.abs(fwd.durationMs - rev.durationMs) < 0.001 && Math.abs(fwd.overshootPx - rev.overshootPx) < 0.001,
        'A 400px hop must feel identical regardless of start offset or direction'
    );
});

test('simulateSpring: cannot produce NaN or runaway velocity', () => {
    for (const [D, T] of HOP_GRID) {
        const r = simulateSpring(0, D, T);
        assert.ok(Number.isFinite(r.durationMs) && Number.isFinite(r.overshootPx), `NaN in ${D}px@${T}ms`);
    }
    // Extreme parameters (asymptotic stress): minimum duration + maximum distance
    const stress = simulateSpring(0, 12000, SPRING_MIN_DURATION_MS);
    assert.ok(Number.isFinite(stress.durationMs), 'Stress parameters must not destabilize the integrator');
    assert.ok(stress.durationMs <= SPRING_MAX_DURATION_MS, 'Stress hop must be terminated by the timeout net');
});

/**
 * ============================================================================
 * SCROLLCONTROLLER INTEGRATION SURFACE
 * ============================================================================
 */

test('ScrollController: exposes a spring-ready integration surface with axis state isolation', () => {
    const controller = new ScrollController();

    // State slots must exist and be cleared after init
    assert.strictEqual(controller._verticalScrollState, null);
    assert.strictEqual(controller._horizontalScrollState, null);
    assert.strictEqual(controller._verticalScrollAnimationId, null);
    assert.strictEqual(controller._horizontalScrollAnimationId, null);

    // Spring engine methods must exist on the controller prototype
    assert.strictEqual(typeof controller._springScrollTo, 'function');
    assert.strictEqual(typeof controller._springTrackHorizontal, 'function');
    assert.strictEqual(typeof controller._runSpringLoop, 'function');
});

test('ScrollController: singleton keeps working when spring preference is stored but unused', () => {
    storage.setItem('pref:scrollPhysics', 'spring');
    const controller = new ScrollController();
    // Must not throw with nothing to animate
    controller.cancelAnimation('vertical');
    controller.cancelAnimation('horizontal');
    assert.strictEqual(scrollController.isAnimating, false);
    storage.removeItem('pref:scrollPhysics');
});

test('ScrollController: fresh instance wiring covers the physics attribute stamp', () => {
    let stamped = null;
    globalThis.document.documentElement.setAttribute = (k, v) => {
        if (k === 'data-scroll-physics') stamped = v;
    };

    storage.setItem('pref:scrollPhysics', 'spring');
    // eslint-disable-next-line no-new
    new ScrollController();
    assert.strictEqual(stamped, 'spring', 'data-scroll-physics must be stamped on <html> for CSS gating');

    storage.setItem('pref:scrollPhysics', 'easing');
    new ScrollController();
    assert.strictEqual(stamped, 'easing', 'data-scroll-physics must reflect easing mode too');
    storage.removeItem('pref:scrollPhysics');
});
