// Imported FIRST by tests that need it, so a dummy key exists before config.ts reads TE_API_KEY at
// module-load time. Node's test runner runs each file in its own process, so this does not leak.
process.env.TE_API_KEY ||= "test:key";
