import { z } from "zod";
import { BANDS, COUNTERPARTY_TYPES, RATINGS } from "@/mocks/reference";

/**
 * Client-side rules mirror the backend's (§3.4, Pydantic). The server stays
 * the authority: uniqueness and anything it rejects come back as field errors.
 */
export const counterpartySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Enter at least 2 characters" })
    .max(120, { error: "Keep the name under 120 characters" }),
  counterparty_type: z.enum(COUNTERPARTY_TYPES, { error: "Choose a type" }),
  country_code: z.string().min(1, { error: "Choose a country" }),
  credit_rating: z.enum(RATINGS, { error: "Choose a rating" }),
  risk_classification: z.enum(BANDS, { error: "Choose a classification" }),
  is_active: z.boolean(),
});

export type CounterpartyFormValues = z.infer<typeof counterpartySchema>;
