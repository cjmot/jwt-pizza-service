const metrics = require('./metrics');

describe('metrics', () => {
    beforeEach(() => {
        metrics.resetMetricsState();
    });

    test('requestTracker increments requests by method', () => {
        const next = jest.fn();

        metrics.requestTracker({ method: 'GET', path: '/api/order/menu' }, {}, next);
        metrics.requestTracker({ method: 'GET', path: '/api/docs' }, {}, next);
        metrics.requestTracker({ method: 'POST', path: '/api/order' }, {}, next);

        expect(metrics.getMetricsState().requests).toEqual({
            '[GET]': 2,
            '[POST]': 1,
        });
        expect(next).toHaveBeenCalledTimes(3);
    });

    test('requestLatencyTracker records endpoint latency on finish', () => {
        const finishHandlers = {};
        const res = {
            on: jest.fn((event, handler) => {
                finishHandlers[event] = handler;
            }),
        };

        metrics.requestLatencyTracker(
            { method: 'GET', path: '/api/order/menu' },
            res,
            jest.fn()
        );

        finishHandlers.finish();

        const { endpointLatencies } = metrics.getMetricsState();

        expect(Object.keys(endpointLatencies)).toContain('[GET] /api/order/menu');
        expect(endpointLatencies['[GET] /api/order/menu']).toBeGreaterThanOrEqual(0);
    });

    test('activeUserTracker records authenticated users and pruneInactiveUsers removes stale users', () => {
        const now = Date.now();

        metrics.activeUserTracker({ user: { id: 7 } }, {}, jest.fn());
        metrics.activeUserTracker({ user: { id: 9 } }, {}, jest.fn());
        metrics.activeUserTracker({ user: null }, {}, jest.fn());

        expect(metrics.getMetricsState().activeUsers).toEqual([
            [7, expect.any(Number)],
            [9, expect.any(Number)],
        ]);

        metrics.pruneInactiveUsers(now + metrics.ACTIVE_USER_WINDOW_MS + 1);

        expect(metrics.getMetricsState().activeUsers).toEqual([]);
    });

    test('auth counters increment separately', () => {
        metrics.recordSuccessfulAuthentication();
        metrics.recordSuccessfulAuthentication();
        metrics.recordFailedAuthentication();

        expect(metrics.getMetricsState()).toMatchObject({
            successfulAuthenticationEvents: 2,
            failedAuthenticationEvents: 1,
        });
    });

    test('recordPizzaCreation updates sold, failures, latency, and revenue', () => {
        metrics.recordPizzaCreation(true, 120.5, 0.05);
        metrics.recordPizzaCreation(true, 90, 0.1);
        metrics.recordPizzaCreation(false, 250, 0);

        expect(metrics.getMetricsState()).toMatchObject({
            pizzasSoldCount: 2,
            pizzaCreationFailuresCount: 1,
            pizzaCreationLatencyMs: 250,
            pizzaRevenue: 0.15000000000000002,
        });
    });
});
