module.exports = {
  displayName: 'Integration Tests',
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  testEnvironment: 'node',
  setupFilesAfterEnv: [],
  testTimeout: 30000,
  maxWorkers: 1, // Run integration tests sequentially
  verbose: true,
  collectCoverage: false, // Integration tests don't need coverage
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/'
  ],
  globalSetup: undefined,
  globalTeardown: undefined,
  testSequencer: '@jest/test-sequencer'
}