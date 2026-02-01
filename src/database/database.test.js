// src/database/database.test.js

jest.mock('mysql2/promise', () => ({
    createConnection: jest.fn(),
}));

jest.mock('../config.js', () => ({
    db: {
        connection: {
            host: 'localhost',
            user: 'test',
            password: 'test',
            database: 'test',
            connectTimeout: 1000,
        },
        listPerPage: 10,
    },
}));

const mysql = require('mysql2/promise');

describe('DB.getMenu', () => {
    let DBClass;
    let StatusCodeError;
    let connection;

    beforeEach(() => {
        jest.resetModules();

        // Connection used during module import (singleton db init) AND during tests
        connection = {
            query: jest.fn().mockResolvedValue([]),
            execute: jest.fn().mockImplementation(async (sql) => {
                // Used by checkDatabaseExists():
                // SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ...
                if (String(sql).includes('INFORMATION_SCHEMA.SCHEMATA')) {
                    return [[{ SCHEMA_NAME: 'test' }]]; // rows.length > 0 => dbExists = true
                }
                return [[]];
            }),
            end: jest.fn(),
        };

        mysql.createConnection.mockResolvedValue(connection);

        // Import AFTER mocks + createConnection implementation are set
        jest.isolateModules(() => {
            const mod = require('./database.js');
            DBClass = mod.DBClass;
            StatusCodeError = require('../endpointHelper.js').StatusCodeError;
        });
    });

    test('getMenu returns rows and closes connection', async () => {
        const fakeRows = [
            { id: 1, title: 'Burger', description: 'Yum', image: 'x.png', price: 9.99 },
            { id: 2, title: 'Fries', description: 'Crispy', image: 'y.png', price: 3.5 },
        ];

        const db = new DBClass();

        // For *this* getMenu call, control behavior directly
        db.getConnection = jest.fn().mockResolvedValue(connection);
        db.query = jest.fn().mockResolvedValue(fakeRows);

        const result = await db.getMenu();

        expect(db.query).toHaveBeenCalledWith(connection, 'SELECT * FROM menu');
        expect(connection.end).toHaveBeenCalledTimes(1);
        expect(result).toEqual(fakeRows);
    });

    test('getMenu throws StatusCodeError("unable to get menu", 500) and closes connection on failure', async () => {
        const db = new DBClass();

        db.getConnection = jest.fn().mockResolvedValue(connection);
        db.query = jest.fn().mockRejectedValue(new Error('db blew up'));

        await expect(db.getMenu()).rejects.toBeInstanceOf(StatusCodeError);
        await expect(db.getMenu()).rejects.toMatchObject({
            message: 'unable to get menu',
            statusCode: 500,
        });

        expect(connection.end).toHaveBeenCalled();
    });
});
