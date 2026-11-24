const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/webhooks'),
    clean: true,
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      // Generates a pruned package.json + pnpm-lock.yaml in the dist dir,
      // containing only the runtime dependencies actually used. The runtime
      // Docker stage uses these to run `pnpm install --prod`.
      generatePackageJson: true,
      sourceMap: false,
    }),
  ],
};
