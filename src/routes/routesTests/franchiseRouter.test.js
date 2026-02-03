const { expectValidJwt } = require('./index.js');
const request = require('supertest');
const app = require('../../service');
const { DB, Role } = require('../../database/database');

describe('franchiseRouter', () => {
    let testUser = {
        id: '',
        name: 'pizza diner',
        email: 'reg@test.com',
        password: 'a',
    };
    let testUserAuthToken;
    let testAuth;
    let testAdmin = createAdminUser();
    let testFranchise = {
        id: 0,
        name: 'testFranchise',
        admins: [{ id: 0, name: 'test franchisee', email: 'testEmail@jwt.com' }],
        stores: [{ id: 1, name: 'SLC', totalRevenue: 0 }],
    };

    beforeEach(async () => {
        testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
        const registerRes = await request(app).post('/api/auth').send(testUser);
        testUserAuthToken = registerRes.body.token;
        expectValidJwt(testUserAuthToken);
        testAuth = { Authorization: `Bearer ${testUserAuthToken}` };
        testUser.id = registerRes.body.user.id;
    });

    test();
});

async function createAdminUser() {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
    user.name = 'test admin';
    user.email = user.name + '@admin.com';

    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}
