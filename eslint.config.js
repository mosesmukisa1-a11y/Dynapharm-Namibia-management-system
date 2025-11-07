import js from "@eslint/js";
import pluginHtml from "eslint-plugin-html";
import globals from "globals";

export default [
  {
    ignores: [
      "assets/css/**",
      "node_modules/**",
      "dist/**",
      "coverage/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
      "import/no-unresolved": "off"
    }
  },
  {
    files: ["**/*.html"],
    plugins: {
      html: pluginHtml
    },
    languageOptions: {
      globals: globals.browser
    }
  }
];

