import { z } from "zod";

export const Classification = z.enum(["Public", "Restricted", "Confidential"]);
export type Classification = z.infer<typeof Classification>;
