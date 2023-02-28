
import c from 'chalk'

export interface TestContext {
    expect:             (expectation: string, value: any, expect: any, ignoreObjectKeys?: string[]) => void
    fail:               (error: Error | string, silent?: boolean) => void
    pass:               () => void,
    setup:              (setupFn: SetupInitiator) => Promise<void>
    cleanup:            (setupFn: CleanupInitiator) => Promise<void>
    phase:              (phase: string) => void
    keepSuccessfulLogs: (x: boolean) => void
}

export type SetupContext = Omit<TestContext, 'setup' | 'phase' | 'cleanup'>
export type SetupInitiator = (c: SetupContext) => Promise<any>

export type CleanupContext = Omit<TestContext, 'setup' | 'phase' | 'expect' | 'cleanup' | "keepSuccessfulLogs">
export type CleanupInitiator = (c: CleanupContext) => Promise<any>

export type TestInitiator = (c: TestContext) => Promise<any>

export interface TestObject {
    initiator: TestInitiator
    id: string
    description: string
    passed: boolean
    time: number
    error: Error | string | null
    expectationsMet: number
    expectations: Array<{
        description: string
        expected: any
        got: any
        met: boolean
        phase: string
    }>
    cleanups: CleanupInitiator[]
}

interface Config {
    output?: boolean
    setupExpectations?: boolean
    failSilently?: boolean
}

export default class TestLib {

    constructor(config: Config) {
        this.output = !!config.output
        this.setupExpectations = !!config.setupExpectations
        this.failSilently = !!config.failSilently
    }

    private output: boolean
    private tests: Record<string, TestObject> = {}
    private hasFailedTests = false
    private performedTests: TestObject[] = []
    private startedAt = 0
    private currentTestStart = 0
    private maxIdLength = 0
    private phase = "test"
    private currentSetup = ""
    private currentCleanup = ""
    private setupExpectations = false
    private failSilently = false

    public test(id: string, description: string, initiator: TestInitiator) {
        if (this.tests[id]) throw c.red(`[TestGroup] Duplicate test ID "${id}".`)
        this.tests[id] = {
            initiator,
            id,
            description,
            passed: true,
            time: Infinity,
            error: null,
            expectationsMet: 0,
            expectations: [],
            cleanups: []
        }
    }

    public async run(ids?: string[] | undefined) {

        ids = ids === undefined ? Object.keys(this.tests) : ids
        this.hasFailedTests = false
        this.performedTests = []
        this.startedAt = Date.now()
        this.maxIdLength = ids.reduce((a, b) => a.length > b.length ? a : b).length
        if (this.output) console.log() // padding

        for (let i = 0; i < ids.length; i++) {

            this.currentTestStart = Date.now()
            this.phase = "test"

            const id = ids[i]
            const test = this.tests[id]
            let _keepSuccessfulLogs = true
            this.performedTests.push(test)

            if (!this.tests[id]) throw c.red(`Unknown test ID "${id}"`)

            const pass = () => this.pass(test, Date.now() - this.currentTestStart)

            const fail = (error: Error | string, silent = false) => 
                this.fail(test, Date.now() - this.currentTestStart, error, silent)

            const expect = (expectation: string, value: any, expect: any, ignoreObjectKeys: string[] = []) => 
                this.expect(test, expectation, value, expect, ignoreObjectKeys, _keepSuccessfulLogs)

            const setPhase = ($phase: string) =>
                this.phase = $phase

            const keepSuccessfulLogs = (x: boolean) => _keepSuccessfulLogs = x

            const performCleanups = async () => {
                try {
                    for (let i = 0; i < test.cleanups.length; i++) 
                        await test.cleanups[i]({ pass, fail })
                } 
                catch (error) {
                    console.log('Cleanup error:', error)
                }
            }
        
            try {

                const setup = async (cb: SetupInitiator) => {
                    this.phase = "setup"
                    this.currentSetup = cb.name
                    try { 
                        await cb({ expect, pass, fail, keepSuccessfulLogs }) 
                        this.phase = "test"
                    } 
                    catch (error) { 
                        throw error 
                    }
                }

                const cleanup = async (cb: CleanupInitiator) => {
                    test.cleanups.push(async (c) => {
                        this.phase = "cleanup"
                        this.currentCleanup = cb.name
                        await cb(c) 
                    })
                }

                await test.initiator({ expect, pass, fail, setup, cleanup, phase: setPhase, keepSuccessfulLogs })
                if (test.error === null) this.pass(test, Date.now() - this.currentTestStart)

                await performCleanups()
            } 

            catch (error) {
                this.fail(test, Date.now() - this.currentTestStart, error as Error, this.failSilently)
                if (this.failSilently) await performCleanups()
                else break
            }
            
        }

        const timeTaken = Math.round(Date.now() - this.startedAt)
        const allPassed = !this.hasFailedTests
        const tests = this.performedTests
        const uptime = Math.round((process.uptime()*1000) - timeTaken)

        if (this.output) {
            console.log()
            console.log(c.grey(`Done in ${timeTaken}ms (+${uptime}ms) - ${allPassed ? "All tests passed." : "Some tests have failed."}`))
            console.log()
        }
        return { allPassed, timeTaken: Math.round((process.uptime()*1000)), tests }

    }

    private fail(test: TestObject, time: number, error: Error | string, silent = this.failSilently) {
        if (test.passed) {
            test.passed = false
            test.error = error
            test.time = time
            this.hasFailedTests = true
            if (this.output) {
                const l = this.maxIdLength
                console.log(
                    `Fail ${c.gray((time+'ms').padEnd(7, " "))} ${c.red(test.id.padEnd(l, " "))} ${c.grey('|')}`,
                    `${c.red('"'+test.description+'"')}`,
                    `[phase "${this.phase}"]` + (this.phase === 'setup' ? ` fn(callback "${this.currentSetup}")` : ''),
                    this.getFailReason(test.error)
                )
            }
            if (!silent) { throw error }
        }
    }

    private pass(test: TestObject, time: number) {
        test.passed = true
        test.time = time
        if (this.output) {
            const l = this.maxIdLength
            console.log(
                `Pass ${c.grey((time+'ms').padEnd(7, " "))} ${c.green(test.id.padEnd(l, " "))} ${c.grey('|')}`, 
                c.green('"'+test.description+'"')
            )
        }
    }

    private expect(test: TestObject, expectation: string, value: any, expect: any, ignoreObjectKeys: string[] = [], keepSuccessfulLogs: boolean) {
        
        const save = (passed: boolean) => {
            if (this.phase === 'setup' && !this.setupExpectations) return
            test.expectations.push({
                description: (expectation ? `Expect: ${expectation}` : ''),
                expected: expect, 
                got: value,
                met: passed,
                phase: this.phase
            })
        }

        const fail = () => this.fail(
            test,
            Date.now() - this.currentTestStart,
            (expectation ? `Expect ${expectation}` : '')
            + `. Expected "${['object', 'array'].includes(TestLib.typeOf(expect)) ? JSON.stringify(expect) : expect}" (${TestLib.typeOf(value)}), `
            + `got "${['object', 'array'].includes(TestLib.typeOf(value)) ? JSON.stringify(value) : value}" (${TestLib.typeOf(value)})`
        )

        if (TestLib.typeOf(expect) !== TestLib.typeOf(value)) {
            save(false)
            return fail()
        }
        else if (TestLib.typeOf(expect) === 'array') {
            if (!this.arrayDeepEqual(expect, value, ignoreObjectKeys)) {
                save(false)
                return fail()
            }
        }
        else if (TestLib.typeOf(expect) === 'object') {
            if (!this.deepEqual(expect, value, ignoreObjectKeys)) {
                save(false)
                return fail()
            }
        }
        else {
            if (expect !== value) {
                save(false)
                return fail()
            }
        }

        if (keepSuccessfulLogs) save(true)
        test.expectationsMet++
    }


    // Utilities

    private getFailReason(error: Error | string) {
        return (error as Error).name
            ? c.grey(`${(error as Error).stack}`)
            : c.grey(error)
        
    }

    public static typeOf(value: any) {
        if (Array.isArray(value)) return 'array'
        if (value === null)       return 'null'
        return typeof value
    }

    /**
     * Tests an object for deep equality - including nested properties. (Supports strings/numbers/boolean properties and etc)
     * @returns
     */
    private deepEqual = (expect: any, value: any, ignoreKeys: string[] = [], stack: string[] = []) => {

        const isObject = (item: any) => item != null && typeof item === 'object'

        const t1 = TestLib.typeOf(expect)
        const t2 = TestLib.typeOf(value)
        const prim = ["string", "number", "null"]

        if (prim.includes(t1) && prim.includes(t2))
            return expect === value

        const types = ['object', 'array']
        if (!types.includes(t1) || !types.includes(t2))
            return false

        const keys1 = Object.keys(expect)
        const keys2 = Object.keys(value)

        if (keys1.length !== keys2.length) {
            return false
        }

        for (const key of keys1) {
            if (ignoreKeys.length && ignoreKeys.includes([...stack, key].join('.')))
                continue
            const val1 = expect[key]
            const val2 = value[key]
            const areObjects = isObject(val1) && isObject(val2)
            if ((areObjects && !this.deepEqual(val1, val2, ignoreKeys, [...stack, key])) || (!areObjects && val1 !== val2)) {
                return false
            }
        }
        return true
    }
    
    private arrayDeepEqual = (array1: any[], array2: any[], ignoreKeys: string[]) => {
        if (array1.length !== array2.length) return false
        for (let i = 0; i < array1.length; i++)
            if (this.deepEqual(array1[i], array2[i], ignoreKeys) === false) return false
        return true
    }

}