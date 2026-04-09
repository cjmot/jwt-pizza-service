const { expectValidJwt } = require('./testFunctions');
const request = require('supertest');
const app = require('../../service');
const { clearAllLoginAttemptState } = require('../authRouter');

describe('authRouter', () => {
    const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
    let testUserAuthToken;

    beforeAll(async () => {
        testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
        const registerRes = await request(app).post('/api/auth').send(testUser);
        testUserAuthToken = registerRes.body.token;
        expectValidJwt(testUserAuthToken);
    });

    beforeEach(() => {
        clearAllLoginAttemptState();
    });

    test('login', async () => {
        const loginRes = await request(app).put('/api/auth').send(testUser);
        expect(loginRes.status).toBe(200);
        expectValidJwt(loginRes.body.token);

        const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
        delete expectedUser.password;
        expect(loginRes.body.user).toMatchObject(expectedUser);
    });

    test('login wrong email', async () => {
        const loginRes = await request(app)
            .put('/api/auth')
            .send({ email: `missing-${Date.now()}@test.com`, password: testUser.password });

        expect(loginRes.status).toBe(401);
        expect(loginRes.body).toMatchObject({ message: 'unauthorized' });
    });

    test('login throttles after repeated failures', async () => {
        const missingEmail = `missing-${Date.now()}@test.com`;
        for (let i = 0; i < 5; i++) {
            const res = await request(app)
                .put('/api/auth')
                .send({ email: missingEmail, password: 'wrong-password' });
            expect(res.status).toBe(401);
        }

        const throttledRes = await request(app)
            .put('/api/auth')
            .send({ email: missingEmail, password: 'wrong-password' });

        expect(throttledRes.status).toBe(429);
        expect(throttledRes.body).toMatchObject({
            message: 'too many login attempts',
        });
    });

    test('successful login resets failed-attempt counter', async () => {
        for (let i = 0; i < 4; i++) {
            const res = await request(app)
                .put('/api/auth')
                .send({ email: testUser.email, password: 'wrong-password' });
            expect(res.status).toBe(401);
        }

        const successfulLogin = await request(app).put('/api/auth').send(testUser);
        expect(successfulLogin.status).toBe(200);

        const firstFailedAfterSuccess = await request(app)
            .put('/api/auth')
            .send({ email: testUser.email, password: 'wrong-password' });
        expect(firstFailedAfterSuccess.status).toBe(401);

        const secondFailedAfterSuccess = await request(app)
            .put('/api/auth')
            .send({ email: testUser.email, password: 'wrong-password' });
        expect(secondFailedAfterSuccess.status).toBe(401);
    });

    test('logout', async () => {
        const testAuth = { Authorization: `Bearer ${testUserAuthToken}` };
        const logoutRes = await request(app).delete('/api/auth').set(testAuth);
        expect(logoutRes.status).toBe(200);
        expect(logoutRes.body).toMatchObject({ message: 'logout successful' });
    });
});
