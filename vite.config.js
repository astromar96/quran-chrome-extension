import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';

// Plugin to rename index.html to popup.html and fix paths after build
const renameHtmlPlugin = () => {
  return {
    name: 'rename-html',
    closeBundle() {
      const distPath = resolve(__dirname, 'dist');
      const indexHtml = resolve(distPath, 'index.html');
      const popupHtml = resolve(distPath, 'popup.html');
      if (existsSync(indexHtml)) {
        let content = readFileSync(indexHtml, 'utf-8');
        // Replace absolute paths with relative paths
        content = content.replace(/src="\/assets\//g, 'src="./assets/');
        content = content.replace(/href="\/assets\//g, 'href="./assets/');
        writeFileSync(popupHtml, content);
        // Remove the original index.html
        unlinkSync(indexHtml);
      }
    }
  };
};

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: '.'
        },
        {
          src: 'icons',
          dest: '.'
        }
      ]
    }),
    renameHtmlPlugin()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'background' ? 'background.js' : 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'index.html') {
            return 'popup.html';
          }
          return 'assets/[name].[ext]';
        }
      }
    },
    base: './'
  }
});

