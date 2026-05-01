/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  transpilePackages: ["@scopium/ontology", "@scopium/query", "@scopium/connectors"],
};
export default nextConfig;
