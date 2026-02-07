// javascript
const { expectValidJwt } = require('./index.js');
const request = require('supertest');
const app = require('../../service');
const { DB, Role } = require('../../database/database');

describe('franchiseRouter', () => {
    let testUser = {};
    let testToken = '';

    beforeEach(async () => {
        [testUser, testToken] = await randomRegisteredUser();
        expectValidJwt(testToken);
    });

    test('createFranchise success', async () => {
        const testAdmin = await createAdminUser();
        const adminToken = await loginUser(testAdmin);
        const testFranchise = {
            name: Math.random().toString(36).substring(2, 12) + 'TestFranchise',
            admins: [{ email: testUser.email }],
        };
        // create franchise with admin user with franchiseeUser as a franchise admin
        const createRes = await request(app)
            .post('/api/franchise')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send(testFranchise)
            .expect(200);
        expect(createRes.body).toMatchObject({
            name: testFranchise.name,
            admins: [
                {
                    email: testUser.email,
                    id: expect.any(Number),
                    name: testUser.name,
                },
            ],
        });
    });

    test('getUserFranchises success', async () => {
        const testAdmin = await createAdminUser();
        const adminToken = await loginUser(testAdmin);
        const testFranchises = [
            {
                name: Math.random().toString(36).substring(2, 12) + 'TestFranchise',
                admins: [{ email: testUser.email }],
            },
            {
                name: Math.random().toString(36).substring(2, 12) + 'TestFranchise2',
                admins: [{ email: testUser.email }],
            },
        ];
        for (let franchise of testFranchises) {
            await request(app)
                .post('/api/franchise')
                .set({ Authorization: `Bearer ${adminToken}` })
                .send(franchise)
                .expect(200);
        }

        const getFranchisesRes = await request(app)
            .get(`/api/franchise/${testUser.id}`)
            .set({ Authorization: `Bearer ${testToken}` })
            .expect(200);
        expect(getFranchisesRes.body).toMatchObject(testFranchises);
    });
});

// Create an admin user directly in DB
async function createAdminUser(email) {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
    user.name = 'testAdmin';
    user.email = email || Math.random().toString(36).substring(2, 12) + '@admin.com';

    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}

async function loginUser(user) {
    const res = await request(app)
        .put('/api/auth')
        .send({ email: user.email, password: user.password })
        .expect(200);
    return res.body.token;
}

async function register(user) {
    const res = await request(app).post('/api/auth').send(user).expect(200);
    return [res.body.user, res.body.token];
}

async function randomRegisteredUser() {
    const randomString = Math.random().toString(36).substring(2, 12);
    const randomDiner = {
        name: randomString + 'User',
        email: randomString + '@testUser.com',
        password: 'testPass',
    };
    return await register(randomDiner);
}
