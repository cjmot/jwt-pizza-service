const logger = require('./logger');

describe('logger sanitization', () => {
    test('sanitize redacts sensitive fields from reqBody and resBody JSON', () => {
        const sanitized = JSON.parse(
            logger.sanitize({
                path: '/api/auth',
                reqBody: JSON.stringify({
                    email: 'user@example.com',
                    password: 'secret',
                    nested: { accessToken: 'abc123' },
                }),
                resBody: JSON.stringify({
                    token: 'jwt-token',
                    user: { name: 'user' },
                }),
            })
        );

        expect(sanitized.reqBody).toEqual({
            email: 'user@example.com',
            password: '*****',
            nested: { accessToken: '*****' },
        });
        expect(sanitized.resBody).toEqual({
            token: '*****',
            user: { name: 'user' },
        });
    });

    test('sanitize redacts sensitive query params from path', () => {
        const sanitized = JSON.parse(
            logger.sanitize({
                path: '/api/order?jwt=abc123&x=1&password=secret',
            })
        );

        expect(sanitized.path).toBe('/api/order?jwt=*****&x=1&password=*****');
    });

    test('sanitizeSql redacts only password and token literals', () => {
        const sql =
            "  UPDATE user SET email='a@jwt.com', password='secret', token='abc123', note=\"hello\" WHERE id=1  ";
        const sanitizedSql = logger.sanitizeSql(sql);

        expect(sanitizedSql).toBe(
            'UPDATE user SET email=\'a@jwt.com\', password=\'***\', token=\'***\', note="hello" WHERE id=1'
        );
    });

    test('logQuery logs sanitized SQL only', () => {
        const logSpy = jest.spyOn(logger, 'log').mockImplementation(() => {});
        const sql = "UPDATE auth SET token='abc123' WHERE userId=1";

        logger.logQuery(sql);

        expect(logSpy).toHaveBeenCalledWith('info', 'sql', {
            sql: "UPDATE auth SET token='***' WHERE userId=1",
        });

        logSpy.mockRestore();
    });
});
