const { expectValidJwt } = require('./testFunctions');
const request = require('supertest');
const app = require('../../service');

describe('userRouter success', () => {
    let testUser = {
        id: '',
        name: 'pizza diner',
        email: 'reg@test.com',
        password: 'a',
    };
    let testUserAuthToken;
    let testAuth;

    beforeEach(async () => {
        testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
        const registerRes = await request(app).post('/api/auth').send(testUser);
        testUserAuthToken = registerRes.body.token;
        expectValidJwt(testUserAuthToken);
        testAuth = { Authorization: `Bearer ${testUserAuthToken}` };
        testUser.id = registerRes.body.user.id;
    });

    test('getUser success', async () => {
        const getUserRes = await request(app).get('/api/user/me').set(testAuth);
        expect(getUserRes.status).toBe(200);
        expect(getUserRes.body.user).toMatchObject({ email: testUser.email, name: testUser.name });
    });

    test('updateUser success', async () => {
        const updateUserRes = await request(app)
            .put(`/api/user/${testUser.id}`)
            .set(testAuth)
            .send({ ...testUser, name: 'newName' });
        expect(updateUserRes.status).toBe(200);
        expectValidJwt(updateUserRes.body.token);

        const expectedUser = { name: 'newName', email: testUser.email, roles: [{ role: 'diner' }] };
        delete expectedUser.password;
        expect(updateUserRes.body.user).toMatchObject(expectedUser);
    });

    test('updateUser wrong id', async () => {
        const wrongId = '1234567890';
        const updateUserRes = await request(app)
            .put(`/api/user/${wrongId}`)
            .set(testAuth)
            .send({ ...testUser, name: 'newName' });
        expect(updateUserRes.status).toBe(403);
        expect(updateUserRes.body).toMatchObject({ message: 'unauthorized' });
    });

    test('deleteUser returns not implemented', async () => {
        const deleteUserRes = await request(app).delete(`/api/user/${testUser.id}`).set(testAuth);
        expect(deleteUserRes.status).toBe(401);
        expect(deleteUserRes.body).toMatchObject({ message: 'not implemented' });
    });

    test('listUsers returns not implemented', async () => {
        const listUsersRes = await request(app).get('/api/user/').set(testAuth);
        expect(listUsersRes.status).toBe(401);
        expect(listUsersRes.body).toMatchObject({
            message: 'not implemented',
            users: [],
            more: false,
        });
    });
});
