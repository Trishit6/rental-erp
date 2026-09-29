import { z } from "zod";

/** Hero search schema — shared by the hero search and floating search. */
export const heroSearchSchema = z.object({
  q: z.string().trim().min(1, "Try a keyword like “camera”").max(120),
});

export type HeroSearchValues = z.infer<typeof heroSearchSchema>;
