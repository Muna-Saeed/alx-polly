# 🔒 ALX Polly – Security Audit & Fixes

This project is part of the **AI-Assisted Security Review and Debugging** module.  
The original ALX Polly app was intentionally built with security flaws. My goal was to audit, identify, and patch them using both AI assistance and manual review.

---
## 🔐 Authentication & Session Handling

- Replaced localStorage token storage with cookie-based storage (
lib/supabase/client.ts
).
- Uses @supabase/ssr cookies API.
- Cookies marked Secure, SameSite=Lax, and designed for server promotion to HttpOnly.

## 🗳️ Poll Creation / Update Hardening (
- app/lib/actions/poll-actions.ts
)

Added comprehensive input validation:
- Question trimmed, 5-255 characters.
- 2-10 non-empty options, duplicates (case-insensitive) rejected.
Added user-level rate limit: max 5 polls/hour (rolling window via Supabase count query).
Mirrored the same validation logic in 
updatePoll
.

## 🔒 Authorization Checks

All poll actions already require a valid Supabase user; kept that intact and surfaced clearer error messages.

## 🛡️ Error-Handling & Messaging

Switched to generic error responses where DB messages would reveal internals.

## ⚙️ Lint / Type Safety

Added explicit TypeScript types in the new cookie helpers to remove implicit any lint errors.

---

## 🧑‍💻 Process
- Used **inline AI debugging** in Trae for local issues.
- Used **chat-based AI prompting** for holistic review.

---

