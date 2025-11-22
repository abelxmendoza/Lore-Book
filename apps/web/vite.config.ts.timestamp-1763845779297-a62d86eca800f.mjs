// vite.config.ts
import { defineConfig } from "file:///Users/abel_elreaper/Desktop/projects/lorekeeper/apps/web/node_modules/vite/dist/node/index.js";
import react from "file:///Users/abel_elreaper/Desktop/projects/lorekeeper/apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "/Users/abel_elreaper/Desktop/projects/lorekeeper/apps/web";
var requiredEnvVars = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
var missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error("\u274C BUILD ERROR: Missing required environment variables:");
  missingEnvVars.forEach((envVar) => {
    console.error(`   - ${envVar}`);
  });
  console.error("   Set these in Vercel Dashboard \u2192 Settings \u2192 Environment Variables");
  process.exit(1);
}
console.log("\u2705 Environment variables validated");
console.log(`\u{1F4E6} Node version: ${process.version}`);
console.log(`\u{1F4C1} Working directory: ${process.cwd()}`);
var vite_config_default = defineConfig({
  plugins: [react({ typescript: { ignoreBuildErrors: true } })],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    port: 5173,
    host: true,
    // Allow external connections
    hmr: {
      overlay: true
      // Show error overlay
    },
    // Faster HMR in development
    watch: {
      usePolling: false,
      interval: 100
    }
  },
  build: {
    // Optimize for development builds
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV === "development",
    // Only in dev - protect source code in production
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "ui-vendor": ["@radix-ui/react-dialog", "@radix-ui/react-scroll-area"]
        }
      }
    },
    // Faster builds in development
    ...process.env.NODE_ENV === "development" && {
      minify: false,
      terserOptions: void 0
    }
  },
  optimizeDeps: {
    // Pre-bundle these for faster dev server startup
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@supabase/supabase-js"
    ],
    // Exclude these from pre-bundling (they're large)
    exclude: ["@tanstack/react-virtual"]
  },
  // Development-specific optimizations
  esbuild: {
    // Faster builds in development
    ...process.env.NODE_ENV === "development" && {
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvYWJlbF9lbHJlYXBlci9EZXNrdG9wL3Byb2plY3RzL2xvcmVrZWVwZXIvYXBwcy93ZWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9hYmVsX2VscmVhcGVyL0Rlc2t0b3AvcHJvamVjdHMvbG9yZWtlZXBlci9hcHBzL3dlYi92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvYWJlbF9lbHJlYXBlci9EZXNrdG9wL3Byb2plY3RzL2xvcmVrZWVwZXIvYXBwcy93ZWIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gVmFsaWRhdGUgZW52aXJvbm1lbnQgdmFyaWFibGVzIGF0IGJ1aWxkIHRpbWVcbmNvbnN0IHJlcXVpcmVkRW52VmFycyA9IFsnVklURV9TVVBBQkFTRV9VUkwnLCAnVklURV9TVVBBQkFTRV9BTk9OX0tFWSddO1xuY29uc3QgbWlzc2luZ0VudlZhcnMgPSByZXF1aXJlZEVudlZhcnMuZmlsdGVyKGVudlZhciA9PiAhcHJvY2Vzcy5lbnZbZW52VmFyXSk7XG5cbmlmIChtaXNzaW5nRW52VmFycy5sZW5ndGggPiAwKSB7XG4gIGNvbnNvbGUuZXJyb3IoJ1x1Mjc0QyBCVUlMRCBFUlJPUjogTWlzc2luZyByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXM6Jyk7XG4gIG1pc3NpbmdFbnZWYXJzLmZvckVhY2goZW52VmFyID0+IHtcbiAgICBjb25zb2xlLmVycm9yKGAgICAtICR7ZW52VmFyfWApO1xuICB9KTtcbiAgY29uc29sZS5lcnJvcignICAgU2V0IHRoZXNlIGluIFZlcmNlbCBEYXNoYm9hcmQgXHUyMTkyIFNldHRpbmdzIFx1MjE5MiBFbnZpcm9ubWVudCBWYXJpYWJsZXMnKTtcbiAgcHJvY2Vzcy5leGl0KDEpO1xufVxuXG5jb25zb2xlLmxvZygnXHUyNzA1IEVudmlyb25tZW50IHZhcmlhYmxlcyB2YWxpZGF0ZWQnKTtcbmNvbnNvbGUubG9nKGBcdUQ4M0RcdURDRTYgTm9kZSB2ZXJzaW9uOiAke3Byb2Nlc3MudmVyc2lvbn1gKTtcbmNvbnNvbGUubG9nKGBcdUQ4M0RcdURDQzEgV29ya2luZyBkaXJlY3Rvcnk6ICR7cHJvY2Vzcy5jd2QoKX1gKTtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCh7IHR5cGVzY3JpcHQ6IHsgaWdub3JlQnVpbGRFcnJvcnM6IHRydWUgfSB9KV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSxcbiAgICB9LFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIGhvc3Q6IHRydWUsIC8vIEFsbG93IGV4dGVybmFsIGNvbm5lY3Rpb25zXG4gICAgaG1yOiB7XG4gICAgICBvdmVybGF5OiB0cnVlLCAvLyBTaG93IGVycm9yIG92ZXJsYXlcbiAgICB9LFxuICAgIC8vIEZhc3RlciBITVIgaW4gZGV2ZWxvcG1lbnRcbiAgICB3YXRjaDoge1xuICAgICAgdXNlUG9sbGluZzogZmFsc2UsXG4gICAgICBpbnRlcnZhbDogMTAwLFxuICAgIH0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgLy8gT3B0aW1pemUgZm9yIGRldmVsb3BtZW50IGJ1aWxkc1xuICAgIG1pbmlmeTogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJyxcbiAgICBzb3VyY2VtYXA6IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnLCAvLyBPbmx5IGluIGRldiAtIHByb3RlY3Qgc291cmNlIGNvZGUgaW4gcHJvZHVjdGlvblxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICAncmVhY3QtdmVuZG9yJzogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3Qtcm91dGVyLWRvbSddLFxuICAgICAgICAgICd1aS12ZW5kb3InOiBbJ0ByYWRpeC11aS9yZWFjdC1kaWFsb2cnLCAnQHJhZGl4LXVpL3JlYWN0LXNjcm9sbC1hcmVhJ10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgLy8gRmFzdGVyIGJ1aWxkcyBpbiBkZXZlbG9wbWVudFxuICAgIC4uLihwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JyAmJiB7XG4gICAgICBtaW5pZnk6IGZhbHNlLFxuICAgICAgdGVyc2VyT3B0aW9uczogdW5kZWZpbmVkLFxuICAgIH0pLFxuICB9LFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICAvLyBQcmUtYnVuZGxlIHRoZXNlIGZvciBmYXN0ZXIgZGV2IHNlcnZlciBzdGFydHVwXG4gICAgaW5jbHVkZTogW1xuICAgICAgJ3JlYWN0JyxcbiAgICAgICdyZWFjdC1kb20nLFxuICAgICAgJ3JlYWN0LXJvdXRlci1kb20nLFxuICAgICAgJ0BzdXBhYmFzZS9zdXBhYmFzZS1qcycsXG4gICAgXSxcbiAgICAvLyBFeGNsdWRlIHRoZXNlIGZyb20gcHJlLWJ1bmRsaW5nICh0aGV5J3JlIGxhcmdlKVxuICAgIGV4Y2x1ZGU6IFsnQHRhbnN0YWNrL3JlYWN0LXZpcnR1YWwnXSxcbiAgfSxcbiAgLy8gRGV2ZWxvcG1lbnQtc3BlY2lmaWMgb3B0aW1pemF0aW9uc1xuICBlc2J1aWxkOiB7XG4gICAgLy8gRmFzdGVyIGJ1aWxkcyBpbiBkZXZlbG9wbWVudFxuICAgIC4uLihwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JyAmJiB7XG4gICAgICBtaW5pZnlJZGVudGlmaWVyczogZmFsc2UsXG4gICAgICBtaW5pZnlTeW50YXg6IGZhbHNlLFxuICAgICAgbWluaWZ5V2hpdGVzcGFjZTogZmFsc2UsXG4gICAgfSksXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlYsU0FBUyxvQkFBb0I7QUFDMVgsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUZqQixJQUFNLG1DQUFtQztBQUt6QyxJQUFNLGtCQUFrQixDQUFDLHFCQUFxQix3QkFBd0I7QUFDdEUsSUFBTSxpQkFBaUIsZ0JBQWdCLE9BQU8sWUFBVSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUM7QUFFNUUsSUFBSSxlQUFlLFNBQVMsR0FBRztBQUM3QixVQUFRLE1BQU0sNkRBQXdEO0FBQ3RFLGlCQUFlLFFBQVEsWUFBVTtBQUMvQixZQUFRLE1BQU0sUUFBUSxNQUFNLEVBQUU7QUFBQSxFQUNoQyxDQUFDO0FBQ0QsVUFBUSxNQUFNLCtFQUFxRTtBQUNuRixVQUFRLEtBQUssQ0FBQztBQUNoQjtBQUVBLFFBQVEsSUFBSSx3Q0FBbUM7QUFDL0MsUUFBUSxJQUFJLDJCQUFvQixRQUFRLE9BQU8sRUFBRTtBQUNqRCxRQUFRLElBQUksZ0NBQXlCLFFBQVEsSUFBSSxDQUFDLEVBQUU7QUFHcEQsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEtBQUssRUFBRSxDQUFDLENBQUM7QUFBQSxFQUM1RCxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUE7QUFBQSxJQUNOLEtBQUs7QUFBQSxNQUNILFNBQVM7QUFBQTtBQUFBLElBQ1g7QUFBQTtBQUFBLElBRUEsT0FBTztBQUFBLE1BQ0wsWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLElBQ1o7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUE7QUFBQSxJQUVMLFFBQVEsUUFBUSxJQUFJLGFBQWE7QUFBQSxJQUNqQyxXQUFXLFFBQVEsSUFBSSxhQUFhO0FBQUE7QUFBQSxJQUNwQyxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUEsVUFDWixnQkFBZ0IsQ0FBQyxTQUFTLGFBQWEsa0JBQWtCO0FBQUEsVUFDekQsYUFBYSxDQUFDLDBCQUEwQiw2QkFBNkI7QUFBQSxRQUN2RTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUVBLEdBQUksUUFBUSxJQUFJLGFBQWEsaUJBQWlCO0FBQUEsTUFDNUMsUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLElBQ2pCO0FBQUEsRUFDRjtBQUFBLEVBQ0EsY0FBYztBQUFBO0FBQUEsSUFFWixTQUFTO0FBQUEsTUFDUDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQTtBQUFBLElBRUEsU0FBUyxDQUFDLHlCQUF5QjtBQUFBLEVBQ3JDO0FBQUE7QUFBQSxFQUVBLFNBQVM7QUFBQTtBQUFBLElBRVAsR0FBSSxRQUFRLElBQUksYUFBYSxpQkFBaUI7QUFBQSxNQUM1QyxtQkFBbUI7QUFBQSxNQUNuQixjQUFjO0FBQUEsTUFDZCxrQkFBa0I7QUFBQSxJQUNwQjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
