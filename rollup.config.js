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

const createOutput = (filename) => {
  return {
    file: `src/public/js/${filename}-bundle.js`,
    name: "Client",
    format: "iife",
    sourcemap: "inline",
  };
};

export default [
  {
    input: "src/client/lobby.js",
    output: [createOutput("lobby")],
    plugins,
  },
  {
    input: "src/client/main.js",
    output: [createOutput("client")],
    plugins,
  },
];
