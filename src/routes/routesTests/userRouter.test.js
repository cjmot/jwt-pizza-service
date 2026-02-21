const { expectValidJwt, createAdminUser, loginUser } = require('./testFunctions');
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

    test('list users unauthorized', async () => {
        const listUsersRes = await request(app).get('/api/user');
        expect(listUsersRes.status).toBe(401);
    });

    test('list users supports page, limit, and name filter', async () => {
        const namePrefix = `paged-${Math.random().toString(36).substring(2, 10)}`;

        await request(app)
            .post('/api/auth')
            .send({
                name: `${namePrefix}-one`,
                email: `${namePrefix}-one@test.com`,
                password: 'testPass',
            });
        await request(app)
            .post('/api/auth')
            .send({
                name: `${namePrefix}-two`,
                email: `${namePrefix}-two@test.com`,
                password: 'testPass',
            });

        const adminUser = await createAdminUser();
        const adminToken = await loginUser(adminUser);
        const adminAuth = { Authorization: `Bearer ${adminToken}` };

        const page1Res = await request(app)
            .get('/api/user')
            .query({ page: 1, limit: 1, name: `${namePrefix}*` })
            .set(adminAuth)
            .expect(200);

        expect(page1Res.body.page).toBe(1);
        expect(page1Res.body.more).toBe(true);
        expect(page1Res.body.users).toHaveLength(1);
        expect(page1Res.body.users[0].name.startsWith(namePrefix)).toBe(true);
        expect(page1Res.body.users[0].roles.length).toBeGreaterThan(0);

        const page2Res = await request(app)
            .get('/api/user')
            .query({ page: 2, limit: 1, name: `${namePrefix}*` })
            .set(adminAuth)
            .expect(200);

        expect(page2Res.body.page).toBe(2);
        expect(page2Res.body.more).toBe(false);
        expect(page2Res.body.users).toHaveLength(1);
        expect(page2Res.body.users[0].name.startsWith(namePrefix)).toBe(true);
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

    test('deleteUser success', async () => {
        const deleteUserRes = await request(app).delete(`/api/user/${testUser.id}`).set(testAuth);
        expect(deleteUserRes.status).toBe(200);
        expect(deleteUserRes.body).toMatchObject({ message: 'delete successful' });

        const getUserRes = await request(app).get('/api/user/me').set(testAuth);
        expect(getUserRes.status).toBe(401);
    });

    test('deleteUser wrong id', async () => {
        const wrongId = '1234567890';
        const deleteUserRes = await request(app).delete(`/api/user/${wrongId}`).set(testAuth);
        expect(deleteUserRes.status).toBe(403);
        expect(deleteUserRes.body).toMatchObject({ message: 'unauthorized' });
    });
});
