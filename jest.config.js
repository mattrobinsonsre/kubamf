module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/backend/**/*.test.js',
  ],
  collectCoverageFrom: [
    'src/backend/**/*.js',
    '!src/backend/**/*.test.js',
    '!src/backend/server.js', // Skip main server file for unit tests
  ],
  coverageDirectory: 'coverage/backend',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  testTimeout: 10000,
  verbose: true,
}