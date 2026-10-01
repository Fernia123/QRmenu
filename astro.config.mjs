import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  site: /src/pages
  output: 'server',
  adapter: netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
});
