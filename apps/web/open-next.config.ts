import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Defaults — incremental cache off for now (no R2 binding wired).
  // Add KV/R2 incremental cache later if you start using ISR.
});
