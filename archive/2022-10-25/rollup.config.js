import builtins from "rollup-plugin-node-builtins";
import resolve from "rollup-plugin-node-resolve";
import commonJS from "rollup-plugin-commonjs";
import json from "rollup-plugin-json";

const plugins = [
  json(),
  builtins(),
  resolve({
    browser: true,
  }),
  commonJS({
    include: ["node_modules/**", "config.js"],
  }),
];

export default ["lobby", "join"].map((namespace) => {
  return {
    input: `src/client/${namespace}.js`,
    output: [
      {
        file: `src/public/js/${namespace}-bundle.js`,
        name: namespace,
        format: "iife",
        sourcemap: "inline",
      },
    ],
    plugins,
  };
});
