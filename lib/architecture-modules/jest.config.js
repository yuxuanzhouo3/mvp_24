module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: [
    "**/*.{ts,tsx}",
    "!**/__tests__/**",
    "!**/node_modules/**",
  ],
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.ts"],
};
