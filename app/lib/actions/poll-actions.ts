"use server";

/**
 * Poll CRUD + voting Server Actions for ALX Polly.
 *
 * WHAT
 * ----
 * Centralises all database interactions around polls so the UI remains a
 * thin view layer.  Every function is exported as a Next.js Server Action
 * and therefore executes **only on the server**, guaranteeing that the
 * Supabase service key never leaks to the browser.
 *
 * WHY
 * ---
 * Consolidating these operations in one file simplifies consistency and
 * enables us to apply cross-cutting concerns like rate-limiting and
 * validation in a single place.
 */

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// CREATE POLL
/**
 * Create a new poll document in Supabase.
 *
 * Steps performed:
 * 1. Extract and sanitise form inputs.
 * 2. Validate inputs (length, duplicate options, etc.).
 * 3. Enforce a **per-user rate-limit** of 5 polls / hour using a cheap
 *    `count` query instead of an external KV store.
 * 4. Insert the poll and trigger ISR revalidation so the poll list updates.
 *
 * @param formData - Data from the `CreatePoll` form.
 * @returns `{ error: string | null }` message indicating success or reason of failure.
 */
export async function createPoll(formData: FormData) {
  const supabase = await createClient();

  // Extract raw inputs
  const rawQuestion = formData.get("question") as string | null;
  const rawOptions = formData.getAll("options").filter(Boolean) as string[];

  // ---------- Input validation ----------
  const question = (rawQuestion ?? "").trim();
  const options = rawOptions.map((o) => o.trim()).filter(Boolean);

  if (question.length < 5) {
    return { error: "The question must be at least 5 characters long." };
  }
  if (question.length > 255) {
    return { error: "The question cannot exceed 255 characters." };
  }
  if (options.length < 2) {
    return { error: "Please provide at least two answer options." };
  }
  if (options.length > 10) {
    return { error: "You can provide at most 10 options." };
  }
  const normalized = options.map((o) => o.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return { error: "Answer options must be unique." };
  }

  // Get user from session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message };
  }
  if (!user) {
    return { error: "You must be logged in to create a poll." };
  }

  // ---------- Rate limiting ----------
  // Cheap implementation using a timestamp window query.  A real-world
  // production app should offload this concern to a purpose-built tool
  // like Upstash or a reverse-proxy limiter to avoid expensive COUNTs.
  // Limit: 5 polls per user per rolling 1-hour window.
  const RATE_LIMIT = 5;
  const WINDOW_MS = 60 * 60 * 1000;
  const windowStartIso = new Date(Date.now() - WINDOW_MS).toISOString();

  const {
    count: recentCount,
    error: countError,
  } = await supabase
    .from("polls")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", windowStartIso);

  if (countError) {
    return { error: countError.message };
  }
  if ((recentCount ?? 0) >= RATE_LIMIT) {
    return {
      error: `Rate limit exceeded. You can create up to ${RATE_LIMIT} polls per hour.`,
    };
  }

  // ---------- Insert poll ----------
  const { error } = await supabase.from("polls").insert([
    {
      user_id: user.id,
      question,
      options,
    },
  ]);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/polls");
  return { error: null };
}

// GET USER POLLS
/**
 * Fetch all polls authored by the currently logged-in user.
 *
 * @returns `{ polls: Poll[], error: string | null }` – empty array when unauthenticated.
 */
export async function getUserPolls() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { polls: [], error: "Not authenticated" };

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { polls: [], error: error.message };
  return { polls: data ?? [], error: null };
}

// GET POLL BY ID
/**
 * Retrieve a single poll by its UUID.
 */
export async function getPollById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return { poll: null, error: error.message };
  return { poll: data, error: null };
}

// SUBMIT VOTE
/**
 * Record a vote for a given poll option.
 *
 * Currently allows anonymous voting (user_id may be `null`).  Toggle the
 * commented guard below if you want to force authentication before voting.
 *
 * Edge-cases handled:
 * • Supabase row-level security will prevent double votes when a
 *   composite unique index `(poll_id, user_id)` exists.
 */
export async function submitVote(pollId: string, optionIndex: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Optionally require login to vote
  // if (!user) return { error: 'You must be logged in to vote.' };

  const { error } = await supabase.from("votes").insert([
    {
      poll_id: pollId,
      user_id: user?.id ?? null,
      option_index: optionIndex,
    },
  ]);

  if (error) return { error: error.message };
  return { error: null };
}

// DELETE POLL
/**
 * Permanently delete a poll by ID.
 *
 * Only the owner can delete thanks to RLS policies on Supabase plus the
 * `eq("user_id", user.id)` condition.
 */
export async function deletePoll(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("polls").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/polls");
  return { error: null };
}

// UPDATE POLL
/**
 * Update an existing poll's question or options.
 *
 * Re-runs the *same* validation logic used by `createPoll` so that updates
 * cannot introduce invalid state.
 */
export async function updatePoll(pollId: string, formData: FormData) {
  const supabase = await createClient();

  // Extract raw inputs
  const rawQuestion = formData.get("question") as string | null;
  const rawOptions = formData.getAll("options").filter(Boolean) as string[];

  // ---------- Input validation ----------
  const question = (rawQuestion ?? "").trim();
  const options = rawOptions.map((o) => o.trim()).filter(Boolean);

  if (question.length < 5) {
    return { error: "The question must be at least 5 characters long." };
  }
  if (question.length > 255) {
    return { error: "The question cannot exceed 255 characters." };
  }
  if (options.length < 2) {
    return { error: "Please provide at least two answer options." };
  }
  if (options.length > 10) {
    return { error: "You can provide at most 10 options." };
  }
  const normalized = options.map((o) => o.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return { error: "Answer options must be unique." };
  }

  // Get user from session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message };
  }
  if (!user) {
    return { error: "You must be logged in to update a poll." };
  }

  // Only allow updating polls owned by the user
  const { error } = await supabase
    .from("polls")
    .update({ question, options })
    .eq("id", pollId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
