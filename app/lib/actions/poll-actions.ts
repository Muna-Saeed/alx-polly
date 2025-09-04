"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// CREATE POLL
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
export async function deletePoll(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("polls").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/polls");
  return { error: null };
}

// UPDATE POLL
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
