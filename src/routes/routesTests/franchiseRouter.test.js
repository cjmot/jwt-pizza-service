// javascript
const {
    expectValidJwt,
    createAdminUser,
    loginUser,
    randomRegisteredUser,
} = require('./testFunctions');
const request = require('supertest');
const app = require('../../service');
const { DB } = require('../../database/database');

describe('franchiseRouter', () => {
    let testUser = {};
    let testToken = '';
    let testAdmin = {};
    let adminToken = '';

    beforeEach(async () => {
        [testUser, testToken] = await randomRegisteredUser();
        testAdmin = await createAdminUser();
        adminToken = await loginUser(testAdmin);
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
        expect(getFranchisesRes.body.map((f) => f.name)).toEqual(
            expect.arrayContaining([...testFranchises.map((f) => f.name)])
        );
    });

    test('deleteFranchise success', async () => {
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

    test('getFranchises success', async () => {
        const franchiseName = Math.random().toString(36).substring(2, 12) + 'ListedFranchise';
        const createRes = await request(app)
            .post('/api/franchise')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send({
                name: franchiseName,
                admins: [{ email: testUser.email }],
            })
            .expect(200);

        const storeName = franchiseName + 'Store';
        await request(app)
            .post(`/api/franchise/${createRes.body.id}/store`)
            .set({ Authorization: `Bearer ${adminToken}` })
            .send({ franchiseId: createRes.body.id, name: storeName })
            .expect(200);

        const getFranchisesRes = await request(app)
            .get(
                `/api/franchise?page=0&limit=10&name=${encodeURIComponent(franchiseName)}`
            )
            .expect(200);

        expect(getFranchisesRes.body.franchises).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: createRes.body.id,
                    name: franchiseName,
                    stores: expect.arrayContaining([
                        expect.objectContaining({ name: storeName }),
                    ]),
                }),
            ])
        );
    });

    test('getUserFranchises unauthorized', async () => {
        const getFranchisesRes = await request(app).get(`/api/franchise/${testUser.id}`);

        expect(getFranchisesRes.status).toBe(401);
        expect(getFranchisesRes.body).toMatchObject({ message: 'unauthorized' });
    });

    test('createFranchise unauthorized for non-admin user', async () => {
        const createRes = await request(app)
            .post('/api/franchise')
            .set({ Authorization: `Bearer ${testToken}` })
            .send({
                name: Math.random().toString(36).substring(2, 12) + 'ForbiddenFranchise',
                admins: [{ email: testUser.email }],
            });

        expect(createRes.status).toBe(403);
        expect(createRes.body).toMatchObject({ message: 'unable to create franchise' });
    });

    test('createStore unauthorized for non-admin non-franchise-admin user', async () => {
        const franchiseRes = await request(app)
            .post('/api/franchise')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send({
                name: Math.random().toString(36).substring(2, 12) + 'ProtectedFranchise',
                admins: [{ email: testAdmin.email }],
            })
            .expect(200);

        const createStoreRes = await request(app)
            .post(`/api/franchise/${franchiseRes.body.id}/store`)
            .set({ Authorization: `Bearer ${testToken}` })
            .send({ franchiseId: franchiseRes.body.id, name: 'ForbiddenStore' });

        expect(createStoreRes.status).toBe(403);
        expect(createStoreRes.body).toMatchObject({ message: 'unable to create a store' });
    });
});
