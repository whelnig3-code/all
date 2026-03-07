import nextConfig from "eslint-config-next";
import prettierConfig from "eslint-config-prettier/flat";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextConfig,
  prettierConfig,
  {
    rules: {
      // 기존 코드베이스에 다수 존재 — 점진적 수정 예정
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
