import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "logindome/**",
      "uselessdoc/**",
      "scripts/**",
      "cloudbase-integration/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default config;
