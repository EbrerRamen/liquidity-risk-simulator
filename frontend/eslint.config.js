import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      // `_`-prefixed names mark values that are deliberately unused (e.g. a destructured-away field).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      // React Compiler guidance. The app doesn't use the compiler: react-hook-form's watch() is
      // fine here, and the effects that set state keep a draft in step with its prop on purpose
      // (search box, number inputs, date popover). Revisit both if the compiler is adopted.
      "react-hooks/incompatible-library": "off",
      "react-hooks/set-state-in-effect": "off",
      // Hot-reload hint only: some modules deliberately keep hooks and helpers (buttonClass,
      // useCan) next to their components. Editing one reloads the page instead of hot-swapping.
      "react-refresh/only-export-components": "off",
    },
  },
);
