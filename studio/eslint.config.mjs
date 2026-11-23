import globals from "globals";
import react from "eslint-plugin-react";
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "public/**",
      "data/**",
      "test-results/**",
      "preview/**",
    ],
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.es2024, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { "no-undef": "error" },
  },
  {
    files: ["web/**/*.js", "web/**/*.jsx", "shared/**/*.js", "shared/**/*.mjs"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { react },
    rules: { "react/jsx-no-undef": ["error", { allowGlobals: false }] },
  },
];
