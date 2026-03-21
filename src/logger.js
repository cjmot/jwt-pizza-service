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
        return JSON.stringify(this.sanitizeValue(logData));
    }

    sanitizeValue(value, key = '') {
        if (value === null || value === undefined) {
            return value;
        }

        if (this.isSensitiveKey(key)) {
            return '*****';
        }

        if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (this.looksLikeJson(trimmedValue)) {
                try {
                    return this.sanitizeValue(JSON.parse(trimmedValue), key);
                } catch {
                    return this.sanitizeString(value, key);
                }
            }

            return this.sanitizeString(value, key);
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeValue(item, key));
        }

        if (typeof value === 'object') {
            const sanitized = {};
            for (const [entryKey, entryValue] of Object.entries(value)) {
                sanitized[entryKey] = this.isSensitiveKey(entryKey)
                    ? '*****'
                    : this.sanitizeValue(entryValue, entryKey);
            }
            return sanitized;
        }

        return value;
    }

    looksLikeJson(value) {
        return (
            (value.startsWith('{') && value.endsWith('}')) ||
            (value.startsWith('[') && value.endsWith(']'))
        );
    }

    sanitizeString(value, key = '') {
        if (this.isSensitiveKey(key)) {
            return '*****';
        }

        let sanitized = value;
        sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1*****');
        sanitized = sanitized.replace(
            /([?&](?:password|passwd|token|jwt|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)=)[^&\s]*/gi,
            '$1*****'
        );
        sanitized = sanitized.replace(
            /((?:password|passwd|token|jwt|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)\s*[:=]\s*)([^,&\s;]+)/gi,
            '$1*****'
        );
        sanitized = sanitized.replace(/((?:cookie|set-cookie)\s*:\s*)[^;\n]+/gi, '$1*****');
        return sanitized;
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
