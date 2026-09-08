import assert from 'node:assert/strict';

import {
    nextNodeRepairBackoff,
    shouldEscalateNodeHealthFailure,
    shouldRestoreNodeHealth,
} from './node-health-policy.util';

assert.equal(shouldEscalateNodeHealthFailure(1), false);
assert.equal(shouldEscalateNodeHealthFailure(2), false);
assert.equal(shouldEscalateNodeHealthFailure(3), true);
assert.equal(shouldRestoreNodeHealth(1), false);
assert.equal(shouldRestoreNodeHealth(2), true);

const first = nextNodeRepairBackoff(null, 1_000);
assert.deepEqual(first, { attempts: 1, nextAttemptAt: 31_000 });
assert.equal(nextNodeRepairBackoff(first, 30_999), null);
assert.deepEqual(nextNodeRepairBackoff(first, 31_000), {
    attempts: 2,
    nextAttemptAt: 91_000,
});

let state = first!;
let previousAttemptAt = state.nextAttemptAt;
for (let index = 0; index < 10; index++) {
    const next = nextNodeRepairBackoff(state, state.nextAttemptAt);
    assert.ok(next);
    state = next;
    if (index === 9) {
        assert.equal(state.nextAttemptAt - previousAttemptAt, 300_000);
    }
    previousAttemptAt = state.nextAttemptAt;
}
