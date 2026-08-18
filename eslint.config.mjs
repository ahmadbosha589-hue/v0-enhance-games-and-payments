import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"

const ruleOverrides = {
  // Keep correctness and hook-order violations as errors.
  "react-hooks/rules-of-hooks": "error",
  "@next/next/no-assign-module-variable": "error",

  // These React 19 compiler diagnostics are useful migration guidance,
  // but the existing application intentionally uses these patterns in
  // many legacy screens. Keep them visible without blocking CI.
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/error-boundaries": "warn",
  "react-hooks/purity": "warn",
  "react-hooks/immutability": "warn",
  "react-hooks/refs": "warn",
  "react-hooks/preserve-manual-memoization": "warn",
  "react-hooks/incompatible-library": "warn",
  "react/no-unescaped-entities": "warn",
  "import/no-anonymous-default-export": "off",
  "@next/next/no-img-element": "warn",
  "@next/next/google-font-preconnect": "warn",
}

const configuredNextVitals = nextVitals.map((config) => {
  if (!config.rules) return config

  const scopedOverrides = Object.fromEntries(
    Object.entries(ruleOverrides).filter(([ruleName]) => {
      if (ruleName.startsWith("react-hooks/")) return Boolean(config.plugins?.["react-hooks"])
      if (ruleName.startsWith("react/")) return Boolean(config.plugins?.react)
      if (ruleName.startsWith("import/")) return Boolean(config.plugins?.import)
      if (ruleName.startsWith("@next/next/")) return Boolean(config.plugins?.["@next/next"])
      return true
    }),
  )

  return { ...config, rules: { ...config.rules, ...scopedOverrides } }
})

export default defineConfig([
  ...configuredNextVitals,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "dist/**",
    "build/**",
    "public/generated/**",
  ]),
])
