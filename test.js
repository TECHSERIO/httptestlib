
const TestLib = require('./build/test-lib').default

const g = new TestLib({
    output: true,
    setupExpectations: true,
    failSilently: true
});

g.test('test1', 'A test', async c => {
    const o1 = {
        x: {
            y: { z: 'Package' },
            b: false
        }
    }
    const o2 = {
        x: { 
            y: { z: 20 },
            b: false
        }
    }
    c.expect('thing to be a thing', o1, o2, ['x.y.z'])
    c.phase('custom phase')
})

g.test('test2', 'A test', async c => {
    c.expect('to work hard', true, false)
})

const results = g.run()