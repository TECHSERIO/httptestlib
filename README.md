# httptestlib
It's a lightweight testing library built for company's internal purposes.

# Methods

## Initialization
To add test cases, you must first create a new http-test-lib instance.
The instance will work similarily to a group. There can be any number of instances, each one holding different tests.
```js
import TestLib from 'http-test-lib'
const g = new TestLib({
    output: true,
    setupExpectations: true,
    failSilently: true
});
```
### Parameters:
- `output: boolean` - Specifies whether to print out information messages about test cases as they happen.
- `setupExpectations: boolean` - Specifies whether to include expectations made in test setup functions to appear in the expectations list of the test itself. If disabled, the `expectations` array wioll only contain those made within the test phase.
- `failSilently: boolean` - If set to `false` performing tests will be halted if any error is found, if set to `true` and a particular test fails, the program will wait until all the other ones have also finished or failed.

## `.run()`
```typescript
.run(ids?: string[]): Promise
```
Runs all the test cases specified using `.test()` methods, or only the ones of matching IDs.  
Usage:
```js
const results = await testlib.run(["test1", "test2", ...])
```
Returns:
```typescript
{
  allPassed: boolean,
  timeTaken: number,
  tests: [
    {
        id: string,
        description: string,
        passed: boolean,
        time: number,
        error: Error | null,
        expectationsMet: number,
        expectations: [
            {
                description: string,
                expected: any,
                got: any,
                met: boolean,
                phase: string
            },
            ...
        ]
    },
    ...
  ]
}
```

## `.test()`
```typescript
.test(id: string, description: string, initiator: (context) => Promise<any>): void
```
The `test()` method is used to create test cases in a particular instance of the test lib. It requires an `id` to identify the particular test, a `description` describing the test briefly and the initiator function.

Example:
```typescript
testlib.test("ping_local", "Ping localhost (127.0.0.1:80)", async (context) => {
    const res = await fetch('127.0.0.1:80')
    context.expect("200 response code", res.status, 200)
})
```
## `.test() > context`
The test context contains a few methods to perform checks, prepare environment and clean things up afterwards.
- `pass()` - Used to mark the test as **passed**.
- `fail()` - Used to mark the test as **failed**.
- `expect(description, var, expectedVat)` - Used to perform checks on variables during tests.
   ```typescript
   context.expect("description", testedValue, expectedValue, ignoredKeys?)
   ```
   This method can perform comparisons on multiple variable types, including objects:
   ```typescript
   let object1 = { x: true, y: { z: false } }
   let object2 = { x: true }
   context.expect("Compare object1 against object2", object1, object2) // => pass
   context.expect("Compare object2 against object1", object2, object1) // => fail
   ```
   You can also ignore nested object props while performing object checks:
   ```typescript
   context.expect("Compare object2 against object1", object2, object1, ["x.y"]) // => pass
   ```
- `phase(string)` - Sets the "phase" displayed in test case errors and the object returned by the `run()` method. The phase name is there to quickly identify where an error had accured. `context.setup()` and `context.cleanup()` automatically set `setup` and `cleanup` phases respectively inside their scope. The scope can be changed multiple times during one test case.
   ```typescript
   context.phase("get")
   const var1 = getVar1()

   context.phase("test")
   context.expect("var1 to be boolean", typeof var1, 'boolean')
   ```
- `setup(callback)` - By convention specified at the top of the test case, used to set things up before the main test, like opening a database connection, writing to a file, etc. The setup callback has access most of the methods from the test case context object. These are: `expect`, `keepSuccessfulLogs`, `pass`, `fail`.
It can not set phases or have own setup functions.
It is prefered that the callback passed to the setup method is defined as a reusable (global) function as it might be used by multiple tests.
   ```typescript
   context.setup(async (context) => {
       // Create a database, write initial values to some files, etc...
   })
   ```
- `cleanup(callback)` - Specified at the top of the test case, used to perform cleanups after the test. If specified, a callback provided to it will always run, whether the test had failed or not. Useful to clean up leftover files, configuration or DB entries after the test to ensure the test environment is left the same way it was before testing.
`cleanup`, similarily to `setup` has a context of it's own, but only with access to `fail` and `pass` methods.
Note that if a test fails, for example when a `expect()` call catches an error, that expectation will still be logged to the expectations array. 
   ```typescript
   context.cleanup(async (context) => {
       // Clean database entries, delete files, etc...
   })
   ```
- `keepSuccessfulLogs(boolean)` - Sometimes logs from expectations made inside of tests can pile up, especially with repetitive setup/cleanup calls. You can use this method to disable successful expectation logs from being written to the test expectations array inside of the object returned by the `testlib.run()` method.
   ```typescript
   context.keepSuccessfulLogs(false)
   ```