import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", ".yarn/**"]
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  }
)
