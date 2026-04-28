import type { NextConfig } from "next";

// AUDIT FIX 2026-04-28 (TS-1): la prop `eslint` ya no existe en NextConfig de
// Next 16 — los flags de ESLint ahora se manejan vía CLI o `.eslintrc`. Se
// remueve para que el typecheck pase. Si hace falta saltar lint en build,
// usar `next build --no-lint` o configurar eslint-config-next directamente.
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
