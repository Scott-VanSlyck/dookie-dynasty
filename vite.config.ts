import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // GitHub Pages serves the site at https://scott-vanslyck.github.io/dookie-dynasty/
  // (npm run dev stays at http://localhost:5173/)
  base: command === 'build' || isPreview ? '/dookie-dynasty/' : '/',
}))
