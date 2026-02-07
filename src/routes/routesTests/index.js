const request = require('supertest');
const app = require('../../service');
const { DB, Role } = require('../../database/database');

function expectValidJwt(potentialJwt) {
    expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

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
module.exports = { expectValidJwt, randomRegisteredUser, createAdminUser, loginUser };
