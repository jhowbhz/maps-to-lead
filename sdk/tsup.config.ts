import { defineConfig } from 'tsup';

// Build dual ESM + CJS com declarações de tipo. O SDK não tem dependências de
// runtime (usa o `fetch` global), então nada é embutido além do próprio código.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  target: 'es2022',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
