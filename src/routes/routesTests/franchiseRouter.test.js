// javascript
const { expectValidJwt, createAdminUser, loginUser, randomRegisteredUser } = require('./index.js');
const request = require('supertest');
const app = require('../../service');
const { DB } = require('../../database/database');

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
        // create franchise with admin user with testUser as an admin
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
        // create franchises as admin user with testUser as an admin
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
        // returned franchises should match the created franchises
        expect(getFranchisesRes.body).toMatchObject(testFranchises);
    });

    test('deleteFranchise success', async () => {
        const testAdmin = await createAdminUser();
        const adminToken = await loginUser(testAdmin);
        const testFranchise = {
            name: Math.random().toString(36).substring(2, 12) + 'TestFranchise',
            admins: [{ email: testAdmin.email }],
        };
        const createRes = await request(app)
            .post('/api/franchise')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send(testFranchise)
            .expect(200);

        expect(await DB.getUserFranchises(testAdmin.id)).toMatchObject([createRes.body]);

        const deleteRes = await request(app)
            .delete(`/api/franchise/${createRes.body.id}`)
            .set({ Authorization: `Bearer ${adminToken}` });
        expect(deleteRes.body).toStrictEqual({ message: 'franchise deleted' });
        expect(await DB.getUserFranchises(testAdmin.id)).toEqual([]);
    });

    test('createStore success', async () => {
        // Create franchise with testAdmin as admin
        const testAdmin = await createAdminUser();
        const adminToken = await loginUser(testAdmin);
        const testFranchise = {
            name: Math.random().toString(36).substring(2, 12) + 'TestFranchise',
            admins: [{ email: testAdmin.email }],
        };
        const createFranchiseRes = await request(app)
            .post('/api/franchise')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send(testFranchise);
        expect(createFranchiseRes.status).toBe(200);
        const franchiseId = createFranchiseRes.body.id;
        const testStore = { franchiseId: franchiseId, name: testFranchise.name + 'TestStore' };
        const createStoreRes = await request(app)
            .post(`/api/franchise/${franchiseId}/store`)
            .set({ Authorization: `Bearer ${adminToken}` })
            .send(testStore);
        expect(createStoreRes.status).toBe(200);
        expect(createStoreRes.body).toMatchObject({ name: testStore.name, franchiseId });
    });

    test('deleteStore success', async () => {
        const testAdmin = await createAdminUser();
        const adminToken = await loginUser(testAdmin);
        const testFranchise = {
            name: Math.random().toString(36).substring(2, 12) + 'TestFranchise',
            admins: [{ email: testAdmin.email }],
        };
        const createFranchiseRes = await request(app)
            .post('/api/franchise')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send(testFranchise);
        expect(createFranchiseRes.status).toBe(200);
        const franchiseId = createFranchiseRes.body.id;
        const testStore = { franchiseId: franchiseId, name: testFranchise.name + 'TestStore' };
        const createStoreRes = await request(app)
            .post(`/api/franchise/${franchiseId}/store`)
            .set({ Authorization: `Bearer ${adminToken}` })
            .send(testStore)
            .expect(200);

        const deleteStoreRes = await request(app)
            .delete(`/api/franchise/${franchiseId}/store/${createStoreRes.body.id}`)
            .set({ Authorization: `Bearer ${adminToken}` });
        expect(deleteStoreRes.status).toBe(200);
        expect(deleteStoreRes.body).toMatchObject({ message: 'store deleted' });
    });
});
