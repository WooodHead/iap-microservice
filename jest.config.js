module.exports = {
  roots: ['<rootDir>/src'],
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
      '**/*{.js,.ts}',
      '!src/index.ts',
      '!**/test-data.ts',
      '!**/*.d.ts',
  ],
  // coverageThreshold: {
  //   global: {
  //     statements: 100,
  //     branches: 100,
  //     functions: 100,
  //     lines: 100,
  //   },
  // },
  verbose: true,
};
