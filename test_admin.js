
const { AppDataSource } = require('./src/config/data-source');
const { AdminController } = require('./src/controllers/AdminController');

async function test() {
    try {
        await AppDataSource.initialize();
        console.log('DB Initialized');
        const req = { session: { userId: 'test', userRole: 'admin' }, query: {} };
        const res = { 
            json: (data) => { console.log('RESPONSE DATA:', JSON.stringify(data, null, 2)); return res; },
            status: (code) => { console.log('RESPONSE STATUS:', code); return res; }
        };
        console.log('Calling getStats...');
        await AdminController.getStats(req, res);
        console.log('Calling getUsers...');
        await AdminController.getUsers(req, res);
        console.log('Done');
    } catch (err) {
        console.error('TEST ERROR:', err);
    } finally {
        await AppDataSource.destroy();
    }
}

test();
