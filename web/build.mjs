// Bundles the game into web/dist (which the Android project uses as its assets folder).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';

const dev = process.argv.includes('--dev');
rmSync('dist/www', { recursive: true, force: true });
mkdirSync('dist/www/app', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome70'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  outfile: 'dist/www/app/game.js',
  logLevel: 'warning',
  legalComments: 'none',
});
cpSync('public', 'dist/www/app', { recursive: true });
console.log('built dist/www/app: game.js', Math.round(statSync('dist/www/app/game.js').size / 1024), 'KB');
