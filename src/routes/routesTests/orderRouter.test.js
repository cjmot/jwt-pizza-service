const {
    expectValidJwt,
    createAdminUser,
    loginUser,
    randomRegisteredUser,
} = require('./testFunctions');
const request = require('supertest');
const app = require('../../service');
const { DB } = require('../../database/database');

describe('orderRouter', () => {
    let testUser = {};
    let testToken = '';
    let testAdmin = {};
    let testAdminToken = '';
    let menuItems = [];

    beforeAll(async () => {
        menuItems = await createDBMenuItems();
    });

    beforeEach(async () => {
        [testUser, testToken] = await randomRegisteredUser();
        testAdmin = await createAdminUser();
        testAdminToken = await loginUser(testAdmin);
        expectValidJwt(testToken);
    });

    test('getMenu success', async () => {
        const menuRes = await request(app).get('/api/order/menu').expect(200);
        expect(menuRes.body.length).toBeGreaterThanOrEqual(menuItems.length);
    });
    test('addMenuItem success', async () => {
        const newMenuItem = {
            title: Math.random().toString(36).substring(2, 12) + 'TestMenuItem',
            image: 'pizzaPizza4.svg',
            price: 0.004,
            description: 'testMenuItem',
        };
        const addMenuItemRes = await request(app)
            .put('/api/order/menu')
            .send(newMenuItem)
            .set({ Authorization: `Bearer ${testAdminToken}` })
            .expect(200);
        expect(
            addMenuItemRes.body.filter((item) => item.title === newMenuItem.title)
        ).toMatchObject([newMenuItem]);
    });

    test('createOrder success', async () => {
        const factoryResponse = { reportUrl: 'http://factory/report/1', jwt: 'factory-jwt' };
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => factoryResponse,
        });
        const randomName = Math.random().toString(36).substring(2, 12);
        const franchise = await DB.createFranchise({
            name: randomName + 'TestFranchise',
            admins: [{ email: testAdmin.email }],
        });
        const store = await DB.createStore(franchise.id, {
            name: randomName + 'Store',
        });

        const orderPayload = {
            franchiseId: franchise.id,
            storeId: store.id,
            items: [
                {
                    menuId: menuItems[0].id,
                    description: menuItems[0].description,
                    price: menuItems[0].price,
                },
            ],
        };
        const res = await request(app)
            .post('/api/order')
            .set('Authorization', `Bearer ${testAdminToken}`)
            .send(orderPayload)
            .expect(200);
        expect(res.body.jwt).toBe(factoryResponse.jwt);
        expect(res.body.followLinkToEndChaos).toBe(factoryResponse.reportUrl);
        expect(res.body.order).toMatchObject({
            franchiseId: franchise.id,
            storeId: store.id,
            items: orderPayload.items,
        });

        expect(global.fetch).toHaveBeenCalled();
        global.fetch = originalFetch;
    });

    test('getOrders success', async () => {
        const randomName = Math.random().toString(36).substring(2, 12);
        const franchise = await DB.createFranchise({
            name: randomName + 'TestFranchise',
            admins: [{ email: testUser.email }],
        });
        const store = await DB.createStore(franchise.id, {
            name: randomName + 'TestStore',
        });
        const orders = [];
        for (let item of menuItems) {
            const order = {
                franchiseId: franchise.id,
                storeId: store.id,
                items: [{ menuId: item.id, description: item.description, price: item.price }],
            };
            orders.push(order);
            await DB.addDinerOrder(testUser, order);
        }

        const getOrdersRes = await request(app)
            .get('/api/order')
            .set({ Authorization: `Bearer ${testToken}` })
            .expect(200);
        expect(getOrdersRes.body.orders).toHaveLength(orders.length);
        expect(getOrdersRes.body.dinerId).toBe(testUser.id);
    });
});

async function createDBMenuItems() {
    const random = Math.random().toString(36).substring(2, 12);
    const menuItems = [
        {
            title: random + 'testMenuItem1',
            image: 'pizzaPizza1.svg',
            price: 0.001,
            description: 'testMenuItem1',
        },
        {
            title: random + 'testMenuItem2',
            image: 'pizzaPizza2.svg',
            price: 0.002,
            description: 'testMenuItem2',
        },
        {
            title: random + 'testMenuItem3',
            image: 'pizzaPizza3.svg',
            price: 0.003,
            description: 'testMenuItem3',
        },
    ];
    for (let item of menuItems) {
        await DB.addMenuItem(item);
    }
    const menu = await DB.getMenu();
    return menu.filter((item) => item.title.includes(random));
}
