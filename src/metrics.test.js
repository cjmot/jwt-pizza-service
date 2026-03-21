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

        metrics.requestLatencyTracker({ method: 'GET', path: '/api/order/menu' }, res, jest.fn());

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

    test('createMetric creates sum metric', () => {
        const metric = metrics.createMetric('requests', 42, '1', 'sum', 'asInt', {});
        expect(metric.name).toBe('requests');
        expect(metric.sum.dataPoints[0].asInt).toBe(42);
        expect(metric.sum.isMonotonic).toBe(true);
    });

    test('createMetric creates gauge metric', () => {
        const metric = metrics.createMetric('cpuUsage', 75.5, 'percent', 'gauge', 'asDouble', {});
        expect(metric.name).toBe('cpuUsage');
        expect(metric.gauge.dataPoints[0].asDouble).toBe(75.5);
        expect(metric.gauge.isMonotonic).toBeUndefined();
    });

    test('createMetric includes custom attributes', () => {
        const metric = metrics.createMetric('test', 1, '1', 'sum', 'asInt', { endpoint: '/api' });
        const attrs = metric.sum.dataPoints[0].attributes;
        expect(attrs.some((a) => a.key === 'endpoint')).toBe(true);
    });

    test('sendMetricToGrafana sends to endpoint', () => {
        global.fetch = jest.fn().mockResolvedValueOnce({ ok: true });
        const testMetrics = [metrics.createMetric('test', 10, '1', 'sum', 'asInt', {})];
        metrics.sendMetricToGrafana(testMetrics);
        expect(global.fetch).toHaveBeenCalled();
        expect(global.fetch.mock.calls[0][1].method).toBe('POST');
    });

    test('sendMetricToGrafana includes authorization', () => {
        global.fetch = jest.fn().mockResolvedValueOnce({ ok: true });
        metrics.sendMetricToGrafana([]);
        const authHeader = global.fetch.mock.calls[0][1].headers.Authorization;
        expect(authHeader).toMatch(/^Bearer/);
    });

    test('sendMetricToGrafana handles error', () => {
        global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        metrics.sendMetricToGrafana([]);
        setTimeout(() => {
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        }, 10);
    });
});
