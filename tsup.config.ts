import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  minify: true,
  treeshake: true,
  sourcemap: true,
});
