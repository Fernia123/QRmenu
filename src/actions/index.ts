import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { createServerClient } from "../db/supabase";

export const server = {
  signIn: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().email(),
      password: z.string(),
    }),
    handler: async (input, context) => {
      const supabase = createServerClient(context.cookies, context.request);

      const { error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return { success: true };
    },
  }),

  signOut: defineAction({
    handler: async (_, context) => {
      const supabase = createServerClient(context.cookies, context.request);
      await supabase.auth.signOut();
      return { success: true };
    },
  }),
};