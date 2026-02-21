const { expectValidJwt } = require('./testFunctions');
const request = require('supertest');
const app = require('../../service');

describe('authRouter', () => {
    const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
    let testUserAuthToken;

    beforeAll(async () => {
        testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
        const registerRes = await request(app).post('/api/auth').send(testUser);
        testUserAuthToken = registerRes.body.token;
        expectValidJwt(testUserAuthToken);
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

    test('logout', async () => {
        const testAuth = { Authorization: `Bearer ${testUserAuthToken}` };
        const logoutRes = await request(app).delete('/api/auth').set(testAuth);
        expect(logoutRes.status).toBe(200);
        expect(logoutRes.body).toMatchObject({ message: 'logout successful' });
    });
});
