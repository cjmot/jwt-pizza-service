const config = require('./config');

class Logger {
    httpLogger = (req, res, next) => {
        let send = res.send;
        res.send = (resBody) => {
            const logData = {
                authorized: !!req.headers.authorization,
                path: req.originalUrl,
                method: req.method,
                statusCode: res.statusCode,
                reqBody: JSON.stringify(req.body),
                resBody: JSON.stringify(resBody),
            };
            const level = this.statusToLogLevel(res.statusCode);
            this.log(level, 'http', logData);
            res.send = send;
            return res.send(resBody);
        };
        next();
    };

    log(level, type, logData) {
        const labels = {
            component: config.logging.source,
            level: level,
            type: type,
        };
        const values = [this.nowString(), this.sanitize(logData)];
        const logEvent = { streams: [{ stream: labels, values: [values] }] };

        this.sendLogToGrafana(logEvent);
    }

    statusToLogLevel(statusCode) {
        if (statusCode >= 500) return 'error';
        if (statusCode >= 400) return 'warn';
        return 'info';
    }

    nowString() {
        return (Math.floor(Date.now()) * 1000000).toString();
    }

    sanitize(logData) {
        return JSON.stringify({
            ...logData,
            path: this.sanitizePath(logData.path),
            reqBody: this.sanitizeJsonString(logData.reqBody),
            resBody: this.sanitizeJsonString(logData.resBody),
        });
    }

    sanitizePath(path) {
        if (typeof path !== 'string') {
            return path;
        }

        return path.replace(
            /([?&](?:password|passwd|token|jwt|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)=)[^&\s]*/gi,
            '$1*****'
        );
    }

    sanitizeJsonString(value) {
        if (typeof value !== 'string') {
            return value;
        }

        try {
            return this.sanitizeJsonValue(JSON.parse(value));
        } catch {
            return value;
        }
    }

    sanitizeJsonValue(value, key = '') {
        if (value === null || value === undefined) {
            return value;
        }

        if (this.isSensitiveKey(key)) {
            return '*****';
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeJsonValue(item, key));
        }

        if (typeof value === 'object') {
            const sanitized = {};
            for (const [entryKey, entryValue] of Object.entries(value)) {
                sanitized[entryKey] = this.sanitizeJsonValue(entryValue, entryKey);
            }
            return sanitized;
        }

        return value;
    }

    isSensitiveKey(key) {
        return /(^|[-_])(password|passwd|token|jwt|secret|authorization|auth|api[-_]?key|cookie|session([-_]?id)?|refresh([-_]?token)?|access([-_]?token)?|id[-_]?token|client[-_]?secret|credential)([-_]|$)/i.test(
            key
        );
    }

    sendLogToGrafana(event) {
        const body = JSON.stringify(event);
        fetch(`${config.logging.endpointUrl}`, {
            method: 'post',
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
            },
        }).then((res) => {
            if (!res.ok) console.log('Failed to send log to Grafana');
        });
    }
}

module.exports = new Logger();
