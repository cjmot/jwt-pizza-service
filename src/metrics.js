const config = require('./config');

const os = require('os');
const METRIC_INTERVAL_MS = 15000;
const AUTHENTICATION_WINDOW_MS = 60000;
const ACTIVE_USER_WINDOW_MS = 300000;

function getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    return memoryUsage.toFixed(2);
}

// Metrics stored in memory
const requests = {};
const endpointLatencies = {};
const activeUsers = new Map();
let successfulAuthenticationEvents = 0;
let failedAuthenticationEvents = 0;
let pizzasSoldCount = 0;
let pizzaCreationFailuresCount = 0;
let pizzaCreationLatencyMs = 0;
let pizzaRevenue = 0;

// Middleware to track requests
function requestTracker(req, res, next) {
    const endpoint = `[${req.method}]`;
    requests[endpoint] = (requests[endpoint] || 0) + 1;
    next();
}

function requestLatencyTracker(req, res, next) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const endpoint = `[${req.method}] ${req.path}`;
        endpointLatencies[endpoint] =
            Number(process.hrtime.bigint() - start) / 1000000;
    });

    next();
}

function activeUserTracker(req, res, next) {
    if (req.user?.id) {
        activeUsers.set(req.user.id, Date.now());
    }

    next();
}

function pruneInactiveUsers(now = Date.now()) {
    for (const [userId, lastSeen] of activeUsers.entries()) {
        if (now - lastSeen >= ACTIVE_USER_WINDOW_MS) {
            activeUsers.delete(userId);
        }
    }
}

function recordSuccessfulAuthentication() {
    successfulAuthenticationEvents++;
}

function recordFailedAuthentication() {
    failedAuthenticationEvents++;
}

function recordPizzaCreation(success, durationMs, price) {
    pizzaCreationLatencyMs = durationMs;

    if (success) {
        pizzasSoldCount++;
        pizzaRevenue += Number(price ?? 0);
    } else {
        pizzaCreationFailuresCount++;
    }
}

// This will periodically send metrics to Grafana
const metricsReporter = setInterval(() => {
    pruneInactiveUsers();
    const metrics = [];
    Object.keys(requests).forEach((endpoint) => {
        metrics.push(
            createMetric('requests', requests[endpoint], '1', 'sum', 'asInt', {
                endpoint,
            })
        );
    });
    Object.keys(endpointLatencies).forEach((endpoint) => {
        metrics.push(
            createMetric(
                'endpointLatency',
                endpointLatencies[endpoint],
                'ms',
                'sum',
                'asDouble',
                { endpoint }
            )
        );
    });

    metrics.push(
        createMetric(
            'successfulAuthentication',
            successfulAuthenticationEvents,
            '1',
            'sum',
            'asInt',
            {}
        )
    );
    metrics.push(
        createMetric(
            'failedAuthentication',
            failedAuthenticationEvents,
            '1',
            'sum',
            'asInt',
            {}
        )
    );
    metrics.push(
        createMetric(
            'activeUsers5m',
            activeUsers.size,
            '1',
            'gauge',
            'asInt',
            {}
        )
    );
    metrics.push(
        createMetric('pizzasSold', pizzasSoldCount, '1', 'sum', 'asInt', {})
    );
    metrics.push(
        createMetric(
            'pizzaCreationFailures',
            pizzaCreationFailuresCount,
            '1',
            'sum',
            'asInt',
            {}
        )
    );
    metrics.push(
        createMetric('pizzaRevenue', pizzaRevenue, '1', 'sum', 'asDouble', {})
    );
    metrics.push(
        createMetric(
            'pizzaCreationLatency',
            pizzaCreationLatencyMs,
            'ms',
            'sum',
            'asDouble',
            {}
        )
    );
    metrics.push(
        createMetric(
            'cpuUsage',
            Number(getCpuUsagePercentage()),
            'percent',
            'gauge',
            'asDouble',
            {}
        )
    );
    metrics.push(
        createMetric(
            'memoryUsage',
            Number(getMemoryUsagePercentage()),
            'percent',
            'gauge',
            'asDouble',
            {}
        )
    );

    sendMetricToGrafana(metrics);
}, METRIC_INTERVAL_MS);

metricsReporter.unref?.();

function createMetric(
    metricName,
    metricValue,
    metricUnit,
    metricType,
    valueType,
    attributes
) {
    attributes = { ...attributes, source: config.metrics.source };

    const metric = {
        name: metricName,
        unit: metricUnit,
        [metricType]: {
            dataPoints: [
                {
                    [valueType]: metricValue,
                    timeUnixNano: Date.now() * 1000000,
                    attributes: [],
                },
            ],
        },
    };

    Object.keys(attributes).forEach((key) => {
        metric[metricType].dataPoints[0].attributes.push({
            key: key,
            value: { stringValue: attributes[key] },
        });
    });

    if (metricType === 'sum') {
        metric[metricType].aggregationTemporality =
            'AGGREGATION_TEMPORALITY_CUMULATIVE';
        metric[metricType].isMonotonic = true;
    }

    return metric;
}

function sendMetricToGrafana(metrics) {
    const body = {
        resourceMetrics: [
            {
                scopeMetrics: [
                    {
                        metrics,
                    },
                ],
            },
        ],
    };

    fetch(`${config.metrics.endpointUrl}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
            'Content-Type': 'application/json',
        },
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP status: ${response.status}`);
            }
        })
        .catch((error) => {
            console.error('Error pushing metrics:', error);
        });
}

function resetMetricsState() {
    Object.keys(requests).forEach((key) => delete requests[key]);
    Object.keys(endpointLatencies).forEach(
        (key) => delete endpointLatencies[key]
    );
    activeUsers.clear();
    successfulAuthenticationEvents = 0;
    failedAuthenticationEvents = 0;
    pizzasSoldCount = 0;
    pizzaCreationFailuresCount = 0;
    pizzaCreationLatencyMs = 0;
    pizzaRevenue = 0;
}

function getMetricsState() {
    return {
        requests: { ...requests },
        endpointLatencies: { ...endpointLatencies },
        activeUsers: Array.from(activeUsers.entries()),
        successfulAuthenticationEvents,
        failedAuthenticationEvents,
        pizzasSoldCount,
        pizzaCreationFailuresCount,
        pizzaCreationLatencyMs,
        pizzaRevenue,
    };
}

module.exports = {
    AUTHENTICATION_WINDOW_MS,
    ACTIVE_USER_WINDOW_MS,
    requestTracker,
    requestLatencyTracker,
    activeUserTracker,
    recordSuccessfulAuthentication,
    recordFailedAuthentication,
    recordPizzaCreation,
    pruneInactiveUsers,
    resetMetricsState,
    getMetricsState,
    sendMetricToGrafana,
    createMetric,
};
