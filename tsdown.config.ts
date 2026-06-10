import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/stdio.ts", "src/http.ts"],
  format: "esm",
  platform: "node",
  dts: false,
  clean: true,
});
