// Bundles the game into web/dist (which the Android project uses as its assets folder).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';

const dev = process.argv.includes('--dev');
rmSync('dist/app', { recursive: true, force: true });
mkdirSync('dist/app', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome70'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  outfile: 'dist/app/game.js',
  logLevel: 'warning',
  legalComments: 'none',
});
cpSync('public', 'dist/app', { recursive: true });
console.log('built dist/app: game.js', Math.round(statSync('dist/app/game.js').size / 1024), 'KB');
