# Mayobuild Studio — v1 Plan

A multi-user web platform on TanStack Start that routes prompts across 8 LLM providers, lets you build websites by prompt, generates downloadable Expo/React Native starters for native Android apps, transcribes voice prompts, and reads PDFs. Backed by your own Supabase project.

## 1. Backend — your Supabase

You'll paste these as secrets:

- `MY_SUPABASE_URL`, `MY_SUPABASE_ANON_KEY`, `MY_SUPABASE_SERVICE_ROLE_KEY`

A thin client wrapper (`src/integrations/mysupabase/*`) creates browser + admin clients pointing at your project — independent of Lovable Cloud. You'll run a one-time SQL snippet (I'll give it to you) in your Supabase dashboard to create:

- `workspaces`, `projects`, `project_collaborators`, `project_viewers` (live counter), `generations`, `mobile_builds`
- RLS policies scoped to `auth.uid()`
- `app_role` enum + `user_roles` + `has_role()` security-definer

## 2. Smart Router (server-only)

`src/lib/router/*` — single `routePrompt({task, prompt, ...})` server function.

Routing rules (your spec):

- `complex_app` / `mobile_code` → DeepSeek → OpenAI → Groq → Gemini 2.5 (failover order)
- `website` → OpenRouter → Mistral → Hugging Face → Cerebras
- `image` → Hugging Face Inference (FLUX/SDXL)

Each provider gets a thin adapter behind a common `chat({messages, model})` interface. Failover on 429/5xx. Per-request log row in `generations`.

Secrets requested via the secrets tool: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`.

## 3. Dashboard

- `/auth` — email/password sign-in/up against your Supabase
- `/` — workspace landing (project grid, live viewer counts via Supabase Realtime presence)
- `/projects/$id` — project workspace: prompt input, generated preview, collaborators panel, invite-by-email, viewer/editor presence chips
- `/projects/new` — type picker: Website | Mobile App

## 4. Website builder surface

Prompt → router (`website` task) → returns HTML/JSX preview rendered in a sandboxed iframe. Image placeholders resolved via `image` task (Hugging Face). Output saved to `generations`.

## 5. Mobile app builder (honest path)

A generator that produces a **downloadable zip** of an Expo (React Native) project with:

- `expo-notifications` (push + local), `expo-task-manager` + `expo-background-fetch` (background tasks), `expo-alarm-module` (native alarms), permissions pre-declared in `app.json`
- Screens scaffolded from the prompt via router (`mobile_code` task)
- README with the exact `eas build -p android --profile production` command to produce an `.aab` for Play Store

The web app cannot itself install APKs or set device alarms — that's an OS boundary. The generated app can, once you build & install it.

## 6. Voice prompting

Mic button on every prompt input. Uses Web Speech API (`SpeechRecognition`) for zero-key transcription; falls back to a server route that proxies to Groq Whisper if Web Speech is unavailable.

## 7. PDF tool

Drop a PDF anywhere → opens in a `react-pdf` viewer with page nav, search, and a "Summarize" button that pipes extracted text through the router.

## 8. Collaboration

- `project_collaborators` (role: viewer | editor | admin)
- Invite-by-email writes a pending row; on signup it links by email
- Live presence (viewers/editors currently on the project) via Supabase Realtime channels, shown as avatar chips + counter

## Technical notes

- All provider calls live in `src/lib/router/providers/*.server.ts` and are only called from server functions. Keys never reach the browser.
- Hugging Face image generation streams the binary back and is cached to your Supabase Storage bucket `generated-images`.
- Web Speech API runs client-side; no key needed.
- `react-pdf` + `pdfjs-dist` for the reader; worker loaded from CDN.
- Mobile zip built in-memory with `jszip` inside a server function; user downloads via signed URL.

## Out of scope for v1 (explicit)

- No in-browser Android compilation (impossible in a web sandbox; you run `eas build` locally or in EAS cloud).
- No Make.com or other middleware.
- No Lovable Cloud — uses your Supabase only.

## Build order

1. Supabase wiring + auth + SQL snippet for you to run
2. Secrets intake for all 9 keys (8 providers + 3 Supabase)
3. Smart router + provider adapters
4. Dashboard + projects + collaboration + presence
5. Website builder surface
6. Voice + PDF
7. Mobile starter generator
8. Self-review pass against your checklist