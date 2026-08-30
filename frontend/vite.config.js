import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Vite is the tool that runs the development server and builds the site for
// production. A "plugin" is something that teaches Vite to understand an extra
// kind of file.
//
//   react()      lets Vite understand .jsx files, and reloads the browser the
//                moment you save one.
//   tailwindcss() scans your files for Tailwind class names and generates the
//                real CSS for exactly the ones you used, and nothing else.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
