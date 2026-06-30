import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // The pre-built src/lib uses NodeNext-style import specifiers that end in
    // ".js" but actually point at ".ts" sources (e.g. `import ... from
    // "./w2-schema.js"`). tsc and tsx resolve these fine, but a bundler must be
    // told. We are NOT allowed to modify src/lib, so we map the extensions here.
    // (Turbopack doesn't expose an equivalent extensionAlias yet, so the app
    // builds with webpack — see the --webpack flag in package.json scripts.)
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
