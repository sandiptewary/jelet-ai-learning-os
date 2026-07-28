# JELET AI Learning Operating System — Development Blueprint

**Document Type:** Engineering Development Blueprint
**Scope:** Implementation planning only (folder structures, build order, versioning, AI build strategy, coding standards)
**Explicitly Out of Scope:** Source code, SQL, ORM/Prisma schema, UI mockups
**Prerequisite Documents (already exist, not recreated here):** PRD, SRS, System Architecture, Database Design, AI Brain Design

**Product Identity — read this before anything else:**
JELET AI Learning OS is a single-student AI mentor system built for one purpose: taking one learner from foundational to advanced mastery for JELET 2027 (with JEE Main/Advanced question exposure). It is **not** a course marketplace, not multi-tenant, not instructor-facing. Every module below exists to serve one student's mastery loop: **learn → practice → get tested → get diagnosed → revise → improve**. If a proposed feature does not serve that loop, it does not belong in this system (no courses, lessons, enrollment, instructors, student management, admin teaching tools, marketplace, payments, or certification).

---

## 1. Complete Project Folder Structure

```
jelet-ai-os/
├── apps/
│   ├── frontend/                  # Student-facing web app (see §2)
│   └── backend/                   # API + orchestration services (see §3)
├── database/                      # Migrations, seed data, backup scripts (see §4)
├── ai/                            # AI Brain: tutor, mentor, coach, engines (see §5)
├── pdf-processing/                # Ingestion pipeline for PYQs, notes, books (see §6)
├── rag/                           # Retrieval layer for the knowledge base (see §7)
├── knowledge-graph/                # Concept graph engine (see §8)
├── testing/                       # All test suites (see §9)
├── deployment/                    # Infra, CI/CD, environments (see §10)
├── docs/
│   ├── prd/                       # Existing PRD (reference only)
│   ├── srs/                       # Existing SRS (reference only)
│   ├── architecture/              # Existing System Architecture (reference only)
│   ├── database-design/           # Existing DB Design (reference only)
│   ├── ai-brain-design/           # Existing AI Brain Design (reference only)
│   └── blueprint/                 # This document + version history
├── scripts/                       # One-off dev/ops scripts (shared, non-module-specific)
├── .env.example
├── .gitignore
├── README.md
└── package.json (workspace root, if monorepo tooling is used)
```

**Design principle:** the repo is organized as a set of independently testable modules, not as a single tangled service. Every top-level folder should be buildable and testable in isolation.

---

## 2. Frontend Folder Structure

```
apps/frontend/
├── src/
│   ├── modules/
│   │   ├── dashboard/
│   │   ├── subjects/               # Subject Manager UI
│   │   ├── chapters/                # Chapter Manager UI
│   │   ├── topics/                  # Topic Manager UI
│   │   ├── concepts/                # Concept Manager UI
│   │   ├── formulas/                # Formula Engine UI
│   │   ├── knowledge-graph/         # Concept map visualization
│   │   ├── pdf-intelligence/        # Upload + processed-doc viewer
│   │   ├── question-bank/
│   │   ├── jelet-pyq/               # JELET PYQ Engine UI
│   │   ├── jee-main/                # JEE Main Engine UI
│   │   ├── jee-advanced/            # JEE Advanced Engine UI
│   │   ├── adaptive-learning/
│   │   ├── revision/                # Revision Engine UI
│   │   ├── flashcards/
│   │   ├── notes/
│   │   ├── bookmarks/
│   │   ├── analytics/
│   │   ├── study-planner/
│   │   ├── mock-test/               # Mock Test Engine UI
│   │   ├── performance-tracker/
│   │   ├── search/
│   │   ├── ai-tutor/                # Chat/teaching interface
│   │   ├── ai-mentor/               # Guidance/check-in interface
│   │   ├── ai-coach/                # Motivation/strategy interface
│   │   ├── offline/                 # Offline Engine UI (sync status, caching controls)
│   │   └── settings/
│   ├── shared/
│   │   ├── components/              # Reusable UI primitives
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── state/                   # Global state (auth-of-one-user, session, cache)
│   │   ├── api-client/              # Typed API clients per backend module
│   │   ├── utils/
│   │   └── types/
│   ├── routes/                      # Route definitions/navigation tree
│   ├── assets/
│   ├── styles/
│   └── app-entry (main/root files)
├── public/
├── tests/                           # Mirrors modules/ (unit + component tests)
└── config files (bundler, lint, env)
```

**Rule:** each `modules/<x>` folder is self-contained — its own components, hooks, and API calls. Shared code only goes in `shared/`. This keeps modules independently shippable, matching the phased build principle.

---

## 3. Backend Folder Structure

```
apps/backend/
├── src/
│   ├── modules/
│   │   ├── dashboard/
│   │   ├── subjects/
│   │   ├── chapters/
│   │   ├── topics/
│   │   ├── concepts/
│   │   ├── formulas/
│   │   ├── knowledge-graph/          # API layer over /knowledge-graph engine
│   │   ├── pdf-intelligence/         # API layer over /pdf-processing pipeline
│   │   ├── ocr/                       # OCR Engine service interface
│   │   ├── question-bank/
│   │   ├── jelet-pyq/
│   │   ├── jee-main/
│   │   ├── jee-advanced/
│   │   ├── adaptive-learning/        # API layer over /ai adaptive engine
│   │   ├── revision/
│   │   ├── flashcards/
│   │   ├── notes/
│   │   ├── bookmarks/
│   │   ├── analytics/
│   │   ├── study-planner/
│   │   ├── mock-test/
│   │   ├── performance-tracker/
│   │   ├── search/                    # Search Engine service
│   │   ├── ai-tutor/                  # API layer over /ai tutor engine
│   │   ├── ai-mentor/
│   │   ├── ai-coach/
│   │   ├── offline-sync/              # Sync/conflict resolution for Offline Engine
│   │   └── settings/
│   ├── shared/
│   │   ├── middleware/
│   │   ├── auth/                      # Single-user auth/session (not multi-tenant)
│   │   ├── validation/
│   │   ├── error-handling/
│   │   ├── logging/
│   │   ├── config/
│   │   └── types/
│   ├── jobs/                          # Background jobs (indexing, mastery recompute, etc.)
│   ├── events/                        # Internal event bus (e.g., "test-submitted" → analytics)
│   └── server-entry
├── tests/                             # Mirrors modules/
└── config files
```

**Rule:** backend modules mirror frontend modules 1:1 by name. A developer should always be able to guess where an API for a given frontend module lives.

---

## 4. Database Folder Structure

```
database/
├── migrations/                        # Ordered, timestamped schema migrations
├── seeds/
│   ├── subjects-chapters-topics/      # JELET syllabus seed data
│   ├── formulas/
│   └── sample-pyqs/
├── backups/                           # Backup scripts + retention policy (not raw dumps)
├── indexes/                           # Index definitions/rationale docs
└── docs/
    └── schema-change-log.md
```

*(No SQL or schema content is generated here — this is structure and process only, per the Database Design document already produced.)*

---

## 5. AI Folder Structure

```
ai/
├── tutor/                             # AI Tutor: concept explanation, Socratic dialogue
├── mentor/                            # AI Mentor: progress check-ins, plan adjustments
├── coach/                             # AI Coach: motivation, exam strategy, pacing
├── knowledge-graph-engine/            # Concept dependency + prerequisite logic
├── weakness-detection/
├── mastery-tracking/
├── memory-engine/                     # Long-term learner memory (see §12)
├── adaptive-learning-engine/
├── mock-intelligence/                 # Adaptive mock generation + result analysis
├── revision-engine/
├── prompts/                           # Prompt templates per engine, versioned
├── evaluation/                        # AI output quality checks, regression tests
└── shared/
    ├── model-clients/                 # LLM/provider client wrappers
    ├── context-builders/              # Assemble student context for each call
    └── types/
```

---

## 6. PDF Processing Folder

```
pdf-processing/
├── ingestion/                         # File intake, validation, queueing
├── ocr/                               # OCR Engine core (scanned PDFs, handwritten notes)
├── extraction/
│   ├── text/
│   ├── formulas/                      # Math/formula-aware extraction
│   ├── diagrams-images/
│   └── tables/
├── classification/                    # Tag extracted content → subject/chapter/topic
├── chunking/                          # Prepares content for RAG ingestion
├── quality-checks/                    # OCR confidence scoring, manual-review flagging
└── pipelines/                         # Orchestration of the above as a pipeline
```

---

## 7. RAG Folder

```
rag/
├── indexing/                          # Embedding + index build from processed PDFs
├── retrieval/                         # Query-time retrieval logic
├── ranking/                           # Re-ranking retrieved chunks by relevance/recency
├── context-assembly/                  # Builds final context window for AI Tutor/Mentor/Coach
├── evaluation/                        # Retrieval quality tests (precision/recall on known Qs)
└── config/                            # Embedding model config, chunk size policy, etc.
```

---

## 8. Knowledge Graph Folder

```
knowledge-graph/
├── graph-model/                       # Node/edge definitions: Subject→Chapter→Topic→Concept
├── dependency-engine/                 # Prerequisite relationships between concepts
├── traversal/                         # Path queries (e.g., "what must I know before X")
├── visualization-data/                # Prepares graph data for frontend rendering
├── sync/                              # Keeps graph consistent with Subject/Chapter/Topic/Concept Managers
└── evaluation/                        # Graph consistency checks (no orphan nodes, no cycles)
```

---

## 9. Testing Folder

```
testing/
├── unit/                              # Mirrors ai/, apps/backend/src/modules, apps/frontend/src/modules
├── integration/                       # Cross-module flows (e.g., PDF upload → OCR → RAG index)
├── e2e/                               # Full user journeys (e.g., mock test start → submit → analytics)
├── ai-evaluation/                     # AI-specific: hallucination checks, answer-correctness sampling
├── performance/                       # Load/latency tests for search, mock generation, OCR
├── fixtures/                          # Shared test data (sample PYQs, sample student history)
└── reports/                           # Test run artifacts (CI-generated, not hand-edited)
```

---

## 10. Deployment Folder

```
deployment/
├── environments/
│   ├── local/
│   ├── staging/
│   └── production/
├── ci-cd/
│   ├── pipelines/                     # Build/test/deploy pipeline definitions
│   └── quality-gates/                 # Lint, test-coverage, security-scan gate configs
├── infra/
│   ├── compute/
│   ├── storage/                       # PDF storage, backups
│   └── networking/
├── monitoring/
│   ├── logging/
│   ├── alerts/
│   └── dashboards/
└── release/
    ├── changelogs/
    └── rollback-plans/
```

---

## 11. Implementation Order (Week-by-Week)

This is a **single-developer-paced** plan (adjust pacing, not order, if more hands are available). Each week must end with something runnable — never a half-wired feature.

| Week | Focus | Ends With |
|---|---|---|
| 1 | Project Setup (repo, folder scaffolding, CI skeleton, env config) | Empty app boots locally, CI runs a placeholder test |
| 2 | Authentication (single-user session, not multi-tenant) | Student can log in/stay logged in across sessions |
| 3 | Dashboard shell + Subject/Chapter/Topic/Concept Managers | Student can browse syllabus structure |
| 4 | PDF Upload + Ingestion pipeline skeleton | Student can upload a PDF and see it queued/stored |
| 5 | OCR Engine + text/formula extraction | Uploaded scanned PDFs produce readable extracted text |
| 6 | Knowledge Base: RAG indexing + Knowledge Graph v1 | Extracted content is searchable and linked to topics |
| 7 | AI Tutor (chat grounded in RAG + Knowledge Graph) | Student can ask a concept question and get a grounded answer |
| 8 | Question Bank + JELET PYQ Engine | Student can browse/practice real PYQs by topic |
| 9 | Mock Test Engine v1 | Student can take a timed mock and get a score |
| 10 | Analytics + Performance Tracker | Student sees strengths/weaknesses from mock + practice data |
| 11 | Adaptive Learning + Revision Engine + Study Planner | System recommends what to study next and when to revise |
| 12 | Deployment (staging → production) + monitoring | Live app, usable daily, monitored |

Weeks 13+ (post-MVP, mapped to Version 2–4 in §13): Formula Engine depth, Flashcards, Notes, Bookmarks, JEE Main/Advanced Engines, AI Mentor/Coach depth, Mastery Tracking, Memory Engine, Mock Intelligence, Offline Engine, Search Engine hardening, Settings depth.

---

## 12. MVP Definition

**Principle:** the MVP is not "a small demo." It is the smallest version of the system that the student can rely on **every single day** between now and JELET 2027 without switching to another tool.

### MVP Must Include
- **Dashboard** — today's plan, quick status, entry point to everything else
- **Subjects / Chapters / Topics** — browsable syllabus structure (Concept Manager can trail slightly behind, but Subject→Chapter→Topic must exist)
- **PDF Upload** — student can add their own study material (notes, PYQ sets, textbooks)
- **AI Tutor** — grounded Q&A over uploaded/seeded content (even if Mentor/Coach personas are basic in v1)
- **Notes** — capture thoughts while studying/chatting with the Tutor
- **Formula Library** — a browsable, searchable reference (Formula Engine's authoring/derivation tooling can come later)
- **Question Practice** — practice questions by topic, with basic correctness feedback
- **Progress** — a simple, honest view of what's been covered and what's weak (full Analytics/Performance Tracker depth comes post-MVP)
- **Study Planner** — a daily/weekly plan the student can follow and check off

### Explicitly Deferred Past MVP
Knowledge Graph visualization, Flashcards, Bookmarks, full Analytics dashboards, Mock Test Engine, JEE Main/Advanced Engines, Adaptive Learning automation, Revision Engine automation, Offline Engine, AI Mentor/Coach as distinct personas (Tutor can absorb basic mentoring tone), Search Engine as a dedicated module (basic in-page filtering suffices), Settings beyond the essentials.

**MVP acceptance test:** the student can, on day one, upload a real PDF, ask the Tutor a real question about it, get a correct grounded answer, take some practice questions, jot a note, and see a plan for tomorrow — without needing any other tool.

---

## 13. Version Roadmap

### Version 1 — "Usable Foundation" (MVP, Weeks 1–12)
- **Features:** Everything listed in §12 MVP.
- **Dependencies:** None beyond core infra (auth, storage, one LLM provider, one OCR provider).
- **Complexity:** Medium. Most complexity is in PDF→OCR→RAG→Tutor grounding, not in UI breadth.
- **Risk:** OCR quality on handwritten/scanned material; LLM grounding accuracy (hallucination risk if RAG retrieval is weak). Mitigate with quality-check gates in `pdf-processing/quality-checks/` and AI evaluation sampling before shipping the Tutor.
- **Acceptance Criteria:** MVP acceptance test in §12 passes; system is used daily for at least 2 consecutive weeks without the student reverting to another tool.

### Version 2 — "Practice & Feedback Loop" (approx. Weeks 13–20)
- **Features:** Mock Test Engine, JELET PYQ Engine depth, Question Bank depth, Analytics v1, Performance Tracker v1, Bookmarks, Flashcards.
- **Dependencies:** Requires V1's Question Practice + Progress data as the seed for analytics; requires Knowledge Graph v1 from V1's Knowledge Base work to tag mock questions by topic.
- **Complexity:** Medium-High. Mock generation logic and analytics correctness are the hard parts.
- **Risk:** Analytics that mislead (wrong weak-topic attribution) actively hurt prep — riskier than a missing feature. Mitigate with `ai-evaluation/` sampling against known-answer test sets before enabling adaptive recommendations.
- **Acceptance Criteria:** Student can take a full-length mock, get topic-wise breakdown, and the breakdown matches manual review on a sample of ≥20 questions.

### Version 3 — "Adaptive Intelligence" (approx. Weeks 21–28)
- **Features:** Adaptive Learning Engine (live), Revision Engine (spaced repetition scheduling), Mastery Tracking, Weakness Detection, Memory Engine v1, Study Planner v2 (auto-adjusting), JEE Main Engine, JEE Advanced Engine.
- **Dependencies:** Requires V2's Analytics/Performance data as training signal; requires Knowledge Graph dependency edges (§8) to be reasonably complete for the syllabus.
- **Complexity:** High. This is the core "AI Brain" layer — mastery modeling and adaptive sequencing are the hardest engineering problems in the whole system.
- **Risk:** Over-automating study decisions can erode student trust or push a bad plan silently. Mitigate by always showing the *reason* for a recommendation and letting the student override it.
- **Acceptance Criteria:** Adaptive Learning correctly resequences at least one real weak topic ahead of schedule, verified by student confirmation; Revision Engine surfaces the right items at the right spaced intervals in a 2-week pilot.

### Version 4 — "Full Mentor System" (approx. Weeks 29–36)
- **Features:** AI Mentor and AI Coach as distinct, fully realized personas (check-ins, motivation, exam-day strategy), Mock Intelligence (deep post-mock diagnostic reasoning), Offline Engine, Search Engine hardening (cross-module semantic search), Settings depth (personalization, notification preferences, data export), Formula Engine depth (derivations, worked examples), Knowledge Graph visualization in-app.
- **Dependencies:** Requires Memory Engine (V3) to give Mentor/Coach continuity across sessions; requires stable Mastery Tracking (V3) for Mock Intelligence's diagnostic depth.
- **Complexity:** Medium-High, but lower engineering risk than V3 since it builds on proven V1–V3 data models.
- **Risk:** Persona proliferation (Tutor/Mentor/Coach feeling redundant or inconsistent). Mitigate with a shared `ai/memory-engine` and `ai/shared/context-builders` so all three personas draw from one consistent picture of the student.
- **Acceptance Criteria:** Student reports (via simple in-app feedback) that Mentor/Coach interactions feel distinct and useful from Tutor; offline mode survives a full day without connectivity with no data loss on reconnect.

---

## 14. Implementation Strategy

### Build Order Logic
1. **Data structure before intelligence.** Subject/Chapter/Topic/Concept Managers and the Knowledge Graph skeleton must exist before any AI engine, because every AI engine (Tutor, Adaptive Learning, Revision) needs something to attach its reasoning to.
2. **Ingestion before retrieval.** PDF Upload → OCR → Extraction must be functional before RAG indexing, and RAG indexing must exist before the AI Tutor can be grounded (ungrounded tutoring risks hallucination and is explicitly avoided).
3. **Practice before analytics.** Question Bank/PYQ practice must generate real usage data before Analytics/Performance Tracker are built, or analytics will have nothing honest to analyze.
4. **Analytics before adaptivity.** Adaptive Learning and Revision Engine consume Analytics/Mastery data as input — building them first would mean guessing at signal shape.
5. **Core AI before persona depth.** AI Tutor (grounded Q&A) ships before AI Mentor/Coach depth, because Tutor validates the RAG + Knowledge Graph pipeline that Mentor/Coach will also depend on.

### Dependency Map (module → what it needs to exist first)
- **AI Tutor** → RAG indexing, Knowledge Graph v1
- **Question Bank / PYQ / JEE Engines** → Subject/Chapter/Topic structure, PDF Intelligence (for sourcing questions)
- **Mock Test Engine** → Question Bank
- **Analytics / Performance Tracker** → Mock Test Engine + Question Practice usage data
- **Adaptive Learning** → Analytics, Knowledge Graph dependency edges
- **Revision Engine** → Mastery Tracking, Analytics
- **AI Mentor / AI Coach** → Memory Engine, Analytics, Study Planner
- **Mock Intelligence** → Mastery Tracking, Mock Test Engine
- **Offline Engine** → stable API contracts across all modules it caches (build last, since it touches everything)

### What Can Be Parallelized
- Frontend module UI shells can be built in parallel with backend module APIs once the API contract is agreed (contract-first development).
- Flashcards, Notes, Bookmarks are low-dependency utility modules — can be built in parallel with almost anything once auth + Subject/Chapter/Topic exist.
- Formula Engine (basic library view) can be built in parallel with PDF/OCR work, since it can start from seeded/manual data before PDF-sourced formulas are extracted.
- Frontend polish/design system work can run in parallel with any backend-heavy week.

### What Should Never Be Parallelized
- **Knowledge Graph schema changes** must never happen in parallel with active Adaptive Learning or Revision Engine development — both read the graph structure directly, and concurrent schema changes will silently corrupt recommendations.
- **RAG indexing pipeline changes** must never happen in parallel with AI Tutor prompt/context-builder changes — you cannot tell whether a bad answer is a retrieval bug or a prompting bug if both are moving at once.
- **Auth/session changes** must never be parallelized with anything else — this is single-user infrastructure that everything else depends on; treat it as a hard checkpoint, not an ongoing workstream.
- **Database migrations** affecting tables that Analytics or Mastery Tracking read must never ship in parallel with those engines' logic changes — sequence them (migration → verify → then logic change).

---

## 15. AI Development

### Knowledge Graph
Model the syllabus as a directed graph: `Subject → Chapter → Topic → Concept`, plus **cross-cutting prerequisite edges** between Concepts (e.g., "Rotational Dynamics" depends on "Torque" depends on "Force Vectors"). Build this in two passes: (1) structural pass — the hierarchy, sourced from the syllabus, done manually/seeded for accuracy; (2) dependency pass — prerequisite edges, built semi-automatically from PDF-extracted content and refined manually since incorrect prerequisites silently corrupt Adaptive Learning downstream. Keep the graph queryable for both "what comes before X" and "what depends on X" traversals.

### Concept Dependency Engine
Sits directly on the Knowledge Graph's prerequisite edges. Its job is singular: given a target Concept, return the ordered prerequisite chain. Used by Adaptive Learning (to resequence), AI Tutor (to explain "why you need to know Y first"), and Study Planner (to sequence daily plans). Build it as a pure traversal service with no side effects — it should be trivially unit-testable against a fixed graph fixture.

### Weakness Detection
Consumes Performance Tracker data (question-level correctness, time-to-answer, retry patterns) and Mock Test results, mapped through the Knowledge Graph to specific Concepts. A "weakness" should require corroborating signal (e.g., low accuracy across multiple questions on the same Concept, not a single wrong answer) before being surfaced — this avoids false-positive weakness flags that would misdirect the Adaptive Learning Engine. Output: a ranked list of Concepts with a confidence score, not a binary flag.

### Mastery Tracking
A per-Concept mastery score, updated incrementally from every practice question, mock test item, and revision session touching that Concept. Recommend a decaying-confidence model (mastery isn't just "% correct ever" — it should account for recency and spacing, since forgetting is real). This score is the primary input to both Weakness Detection and the Revision Engine's spacing schedule.

### Memory Engine
Long-term, cross-session memory of the student: what they've struggled with, what explanations worked, tone preferences, past plan adjustments and why. This is what lets AI Mentor and AI Coach feel continuous rather than stateless. Build it as a structured store (not just raw chat logs) — extract discrete "memory facts" (e.g., "prefers geometric intuition over pure algebra for calculus") that any AI engine can query, rather than re-summarizing entire chat histories on every call.

### Adaptive Learning
Consumes Mastery Tracking + Weakness Detection + Concept Dependency Engine to decide what the student should study next and in what order, resequencing the Study Planner accordingly. Always attach a human-readable reason to every resequencing decision (traceable to the specific weak Concept and the specific data behind it) — this is both a trust requirement (§13 V3 risk) and a debugging requirement.

### Mock Intelligence
Post-mock diagnostic reasoning: not just a score, but *why* the score happened (careless errors vs. conceptual gaps vs. time pressure vs. untouched topics). Built on top of Mastery Tracking and Mock Test Engine's item-level result data. This is intelligence layered on existing data, not a new data source — build it after Mastery Tracking is trustworthy, not before.

### Revision Engine
Spaced-repetition scheduling over Concepts and Flashcards, driven by Mastery Tracking's decay model. Standard spaced-repetition scheduling logic (interval growth on success, interval reset on failure) applied at the Concept level, not just the flashcard level, so revision extends to full topics/questions, not only flashcards.

**Build order for this section, restated:** Knowledge Graph → Concept Dependency Engine → Mastery Tracking → Weakness Detection → Memory Engine → Adaptive Learning → Revision Engine → Mock Intelligence. Each step's output is the next step's required input.

---

## 16. Coding Standards

### Folder Naming
- All lowercase, kebab-case: `question-bank/`, `ai-tutor/`, `knowledge-graph/`.
- Module folder names must match exactly between frontend and backend (§2/§3 rule).
- No abbreviations that aren't already established in the docs (use `pyq`, not `prevyrq`; use `ocr`, not `optchar`).

### File Naming
- Components (frontend): `PascalCase.tsx` (or framework equivalent), one primary export per file.
- Services/utilities (backend): `kebab-case.ts` (e.g., `mastery-score-calculator.ts`).
- Tests: mirror the source file name with a `.test.` or `.spec.` infix, in the mirrored `testing/` path.
- AI prompt templates: `<engine>-<purpose>-v<N>.prompt` (e.g., `tutor-concept-explain-v2.prompt`) — versioned explicitly since prompt changes affect behavior like code changes.

### Git Strategy
- Trunk-based with short-lived feature branches; no long-running parallel branches per module (avoids the "never parallelize" risks in §14 turning into merge conflicts).
- `main` is always deployable — every merge to `main` must pass CI (§10 quality gates).

### Branch Strategy
- `feature/<module>-<short-description>` (e.g., `feature/mock-test-timer`)
- `fix/<module>-<short-description>`
- `chore/<short-description>` for non-feature work (deps, config, docs)
- One module per branch where possible — reinforces the module-isolation principle from §2/§3.

### Commit Strategy
- Conventional commits: `feat(mock-test): add timer pause on tab blur`, `fix(ocr): correct rotation detection for scanned PDFs`, `docs(blueprint): update version roadmap`.
- Each commit should represent one logical change; avoid bundling unrelated module changes in one commit.

### Documentation Rules
- Every module folder gets a `README.md` stating: purpose, what it depends on, what depends on it, and how to run its tests in isolation.
- AI engines additionally document their input data shape and output contract (not internal prompt logic, but the interface).
- Update `docs/blueprint/` version history whenever the roadmap in §13 changes materially.

### Code Review Rules
- No self-merges to `main`.
- Any change touching Knowledge Graph schema, Auth, or DB migrations requires explicit review sign-off before merge, regardless of change size (matches §14's "never parallelize" list — these need the same seriousness in review).
- AI engine changes require a reviewer to check the `ai-evaluation/` test results attached to the PR, not just the code diff.

### Definition of Done
A task is done only when:
1. Code is merged to `main` via reviewed PR.
2. Unit tests exist and pass for new logic.
3. If touching an AI engine: evaluation tests in `ai-evaluation/` pass against the fixture set.
4. Module `README.md` updated if the interface changed.
5. Feature is verified against the acceptance criteria for its Version (§13), not just "it runs."

### Testing Checklist
- [ ] Unit tests for new/changed logic
- [ ] Integration test if the change crosses module boundaries
- [ ] E2E test updated if a user-facing flow changed
- [ ] AI evaluation sample run if an AI engine or prompt changed
- [ ] No regression in previous Version's acceptance criteria

### Release Checklist
- [ ] All Definition of Done items met for included work
- [ ] Staging deploy verified against current Version's acceptance criteria (§13)
- [ ] Rollback plan documented in `deployment/release/rollback-plans/`
- [ ] Monitoring/alerts confirmed active for any new module
- [ ] Changelog entry added

---

## 17. How to Use This Blueprint

Build strictly in the order laid out in §11 (weeks) and §13 (versions). Before starting any module, re-check §14's dependency map to confirm its inputs already exist. Before shipping any Version, verify against that Version's acceptance criteria in §13 — not against "the feature technically runs." Never build two items from the "never parallelize" list (§14) at the same time. This document is the execution layer on top of the existing PRD, SRS, System Architecture, Database Design, and AI Brain Design — it does not replace them.
