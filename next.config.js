/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // O pdfjs-dist (ficha técnica do tecido no PDF) tem um require('canvas')
    // que só serve no Node. No navegador ele usa o <canvas> de verdade.
    config.resolve.alias.canvas = false;
    return config;
  },
};
module.exports = nextConfig;
