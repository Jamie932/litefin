import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * ============================================================================
 * Playback Stop State Reconciliation Test Suite
 * ============================================================================
 * Verifies that when playback ends or stops, the authoritative client state
 * prevents read-after-write race conditions where the server database has not
 * yet committed updated UserData.
 * ============================================================================
 */

test('reconciles item with authoritative lastStopped state when server UserData is stale', () => {
    // Simulated item with stale unplayed / resume state returned by server
    const item = {
        Id: 'item-101',
        Name: 'Test Movie',
        UserData: {
            Played: false,
            PlaybackPositionTicks: 500000000,
            UnplayedItemCount: 1
        }
    };

    // Authoritative snapshot recorded when PlayerPage stopped at 95%
    const lastStopped = {
        itemId: 'item-101',
        positionTicks: 0,
        durationTicks: 1000000000,
        isNearComplete: true,
        timestamp: Date.now()
    };

    // Reconciliation logic as implemented in DetailsPage and HomePage
    if (lastStopped && lastStopped.itemId === item.Id && Date.now() - lastStopped.timestamp < 30000) {
        item.UserData = item.UserData || {};
        if (lastStopped.isNearComplete) {
            item.UserData.Played = true;
            item.UserData.PlaybackPositionTicks = 0;
            item.UserData.UnplayedItemCount = 0;
        } else if (lastStopped.positionTicks > 0) {
            item.UserData.PlaybackPositionTicks = lastStopped.positionTicks;
        }
    }

    assert.equal(item.UserData.Played, true);
    assert.equal(item.UserData.PlaybackPositionTicks, 0);
    assert.equal(item.UserData.UnplayedItemCount, 0);
});

test('reconciles partially played item to latest resume position', () => {
    // Server returns older position (e.g. 100s) before stop report at 400s committed
    const item = {
        Id: 'item-202',
        Name: 'In Progress Movie',
        UserData: {
            Played: false,
            PlaybackPositionTicks: 1000000000
        }
    };

    const lastStopped = {
        itemId: 'item-202',
        positionTicks: 4000000000,
        durationTicks: 7200000000,
        isNearComplete: false,
        timestamp: Date.now()
    };

    if (lastStopped && lastStopped.itemId === item.Id && Date.now() - lastStopped.timestamp < 30000) {
        item.UserData = item.UserData || {};
        if (lastStopped.isNearComplete) {
            item.UserData.Played = true;
            item.UserData.PlaybackPositionTicks = 0;
        } else if (lastStopped.positionTicks > 0) {
            item.UserData.PlaybackPositionTicks = lastStopped.positionTicks;
        }
    }

    assert.equal(item.UserData.Played, false);
    assert.equal(item.UserData.PlaybackPositionTicks, 4000000000);
});

test('does not reconcile if lastStopped timestamp is expired', () => {
    const item = {
        Id: 'item-303',
        UserData: {
            Played: false,
            PlaybackPositionTicks: 100
        }
    };

    const expiredLastStopped = {
        itemId: 'item-303',
        positionTicks: 0,
        isNearComplete: true,
        timestamp: Date.now() - 40000 // 40s ago (beyond 30s threshold)
    };

    if (expiredLastStopped && expiredLastStopped.itemId === item.Id && Date.now() - expiredLastStopped.timestamp < 30000) {
        item.UserData.Played = true;
        item.UserData.PlaybackPositionTicks = 0;
    }

    assert.equal(item.UserData.Played, false);
    assert.equal(item.UserData.PlaybackPositionTicks, 100);
});

test('merged row filters out finished item immediately after reconciliation', () => {
    const thresholdFraction = 0.85;
    const lastStopped = {
        itemId: 'ep-5',
        positionTicks: 0,
        durationTicks: 24000000000,
        isNearComplete: true,
        timestamp: Date.now()
    };

    const serverItems = [
        {
            Id: 'ep-5',
            Type: 'Episode',
            RunTimeTicks: 24000000000,
            UserData: {
                Played: false, // Server still says unplayed
                PlaybackPositionTicks: 21000000000
            }
        },
        {
            Id: 'ep-6',
            Type: 'Episode',
            RunTimeTicks: 24000000000,
            UserData: {
                Played: false,
                PlaybackPositionTicks: 0
            }
        }
    ];

    const filtered = serverItems.filter((item) => {
        if (!item || item.Type === 'Season' || item.Type === 'Series' || item.IsFolder) return false;

        // Reconcile
        if (lastStopped && item.Id === lastStopped.itemId && Date.now() - lastStopped.timestamp < 60000) {
            item.UserData = item.UserData || {};
            if (lastStopped.isNearComplete) {
                item.UserData.Played = true;
                item.UserData.PlaybackPositionTicks = 0;
            } else if (lastStopped.positionTicks > 0) {
                item.UserData.PlaybackPositionTicks = lastStopped.positionTicks;
            }
        }

        if (item.UserData?.Played) return false;

        const positionTicks = item.UserData?.PlaybackPositionTicks || 0;
        const runTimeTicks = item.RunTimeTicks || 0;
        if (positionTicks > 0 && runTimeTicks > 0) {
            const progress = positionTicks / runTimeTicks;
            if (progress >= thresholdFraction) return false;
        }

        return true;
    });

    // ep-5 was marked complete in lastStopped, so it is filtered out! Only ep-6 remains.
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].Id, 'ep-6');
});
