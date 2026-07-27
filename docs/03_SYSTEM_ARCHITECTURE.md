# JELET AI Learning OS
## System Architecture Design Document

**Document Type:** Software Architecture Specification
**Audience:** Senior Engineering Team
**Status:** Ready for Implementation Planning
**Scope:** Architecture only — no source code, no database schema, no UI mockups

---

## 1. Executive Summary

JELET AI Learning OS is a single-student, AI-powered personal learning operating system designed to take one learner from Foundation level through Basic Concepts, JELET-level material, JEE Main concepts, and ultimately JEE Advanced mastery. Unlike a conventional e-learning app — which is typically a content delivery shell around a video/quiz library — this system is architected as an **operating system for learning**: a set of cooperating engines (concept graph, mastery tracking, weakness detection, adaptive sequencing, PDF intelligence, mock testing) that continuously observe the student, update an internal model of their knowledge state, and decide what the student should see next.

The architecture prioritizes **modularity over cleverness**. Every capability — Question Bank, PDF Intelligence, Adaptive Learning, Mock Tests, Revision — is built as an independently deployable, independently testable module communicating through well-defined contracts. This is what allows the system to add WBJEE, GATE, NEET, or arbitrary custom courses later as **plugins**, without rewriting the learning core.

Three architectural decisions define the system:

1. **A Concept Graph is the source of truth for pedagogy.** All sequencing, gating, and recommendation logic is derived from graph traversal, not hardcoded curricula.
2. **AI is a set of stateless reasoning services, not a black box.** Every AI capability (tutor, mentor, question generation, weakness detection) is a bounded service that reads from and writes to explicit state stores — the "AI Context Strategy" (Section 18) — so behavior is inspectable, testable, and reproducible.
3. **The system is exam-agnostic at the core, exam-specific at the edges.** JELET is the first "exam pack" plugin; the core engines have no JELET-specific logic baked in.

This document defines the module boundaries, interaction contracts, data flows, and cross-cutting strategies (scalability, reliability, security, offline, extensibility) required for a senior engineering team to begin detailed design and implementation.

---

## 2. Architectural Vision

The long-term vision is a **personal learning kernel** surrounded by **exam packs** and **subject packs**, much like an OS kernel surrounded by installable applications.

- The **kernel** owns: identity of the student, the concept graph, mastery state, memory/spaced-repetition scheduling, content indexing, and the AI reasoning contracts.
- **Exam packs** (JELET, JEE Main, JEE Advanced, WBJEE, GATE, NEET) are plugins that supply: syllabus mappings onto the concept graph, exam-specific question patterns, mock test blueprints, and scoring/marking schemes.
- **Content packs** (a specific PDF, a specific textbook, a specific problem set) are ingested through PDF Intelligence and normalized into the same concept-graph-linked representation regardless of source.

Because the student is preparing specifically for **JELET 2027**, the system is delivered today with a single exam pack active, but every module is designed so that a second exam pack can be registered without touching the kernel's code.

The vision is evolutionary, not big-bang: the system should be usable end-to-end (upload a PDF → get taught → get tested → get revised) with only the JELET pack installed, while the seams for future packs are already load-bearing architecture, not an afterthought.

---

## 3. Core Design Principles

1. **Modularity by contract, not by convenience.** Every module exposes a versioned interface (event schema + request/response contract). Internal implementation is free to change; the contract is the stable surface.
2. **Single source of truth per concern.** The Concept Graph owns pedagogy. The Mastery Store owns "what the student knows." The Content Index owns "what material exists." No module duplicates another's authority.
3. **AI as a service, not as glue code.** AI calls (tutoring, generation, recommendation) are routed through an AI Orchestration Layer with explicit prompt/context assembly, not scattered ad hoc calls from feature modules.
4. **Deterministic gating, probabilistic recommendation.** Whether the student is *allowed* to move to a concept is a deterministic rule (mastery threshold + prerequisite graph). *Which* content to show next within what's allowed is where AI/ranking models operate. This separation keeps the safety-critical pedagogical guarantee ("never teach advanced before prerequisite") outside of AI variance.
5. **Offline-first data plane, online-enhanced intelligence plane.** Core study activity (reading, flashcards, attempting cached questions) must work offline. AI generation, semantic search, and sync require connectivity but degrade gracefully.
6. **Everything is an event.** Student actions (answered a question, opened a note, completed a mock test) are emitted as events. Analytics, Mastery Tracking, Weakness Detection, and Revision Scheduling are all *consumers* of the same event stream, not bespoke integrations with each other.
7. **Plugin isolation.** Exam packs and future subject packs cannot introduce breaking changes to the kernel. They declare capabilities through a manifest and are loaded, versioned, and sandboxed independently.
8. **Design for one user, architect for many.** The product is single-student today, but the module boundaries assume a future multi-tenant deployment, so no module hardcodes single-user assumptions into its contracts (even though the initial implementation may take shortcuts internally).

---

## 4. System Context Diagram

At the highest level, the system sits between the student, external content sources, and the AI reasoning provider.

```
                     ┌─────────────────────────────┐
                     │          STUDENT             │
                     │  (single user, JELET 2027)   │
                     └───────────────┬───────────────┘
                                     │ interacts via
                                     ▼
                     ┌─────────────────────────────┐
        Uploads PDFs │      JELET AI LEARNING OS    │  Notifications,
        Textbooks,   │        (this system)         │  Study Plan,
        PYQs   ─────▶│                               │◀─ Reports
                     └───────┬───────────────┬───────┘
                             │               │
                 AI requests │               │ Sync / backup
                             ▼               ▼
                  ┌────────────────┐ ┌────────────────────┐
                  │  AI Reasoning   │ │  Cloud Storage /    │
                  │  Provider (LLM  │ │  Object Store /     │
                  │  + OCR + Embed) │ │  Backup Service      │
                  └────────────────┘ └────────────────────┘
```

External actors:
- **Student** — the sole end user; source of all learning events and content uploads.
- **AI Reasoning Provider** — external LLM/embedding/OCR services accessed through the AI Orchestration Layer.
- **Cloud Storage/Sync Provider** — durable storage for content, state snapshots, and cross-device sync.

Everything inside the boundary is the responsibility of this architecture.

---

## 5. High-Level Architecture

The system is organized into five layers. Layers communicate downward through calls and upward through events; lateral communication within a layer happens through the Module Communication Bus (Section 7).

```
┌───────────────────────────────────────────────────────────────────┐
│ L1. EXPERIENCE LAYER                                                │
│   Dashboard · Study Planner UI · Mock Test UI · Notes/Flashcards UI │
├───────────────────────────────────────────────────────────────────┤
│ L2. ORCHESTRATION LAYER                                             │
│   Learning Orchestrator · AI Orchestration Layer · Test Orchestrator│
│   Notification System                                               │
├───────────────────────────────────────────────────────────────────┤
│ L3. DOMAIN ENGINE LAYER                                             │
│   Adaptive Learning Engine · Concept Dependency Engine ·             │
│   Mastery Tracking Engine · Weakness Detection Engine ·              │
│   Revision Recommendation Engine · Question Recommendation Engine ·  │
│   Learning Path Generator · Mock Test Engine · Analytics Engine      │
├───────────────────────────────────────────────────────────────────┤
│ L4. CONTENT & KNOWLEDGE LAYER                                       │
│   Knowledge Base · Concept Graph · PDF Intelligence · OCR Engine ·   │
│   Formula Engine · Question Bank · PYQ Engine · Search               │
├───────────────────────────────────────────────────────────────────┤
│ L5. PLATFORM LAYER                                                   │
│   Authentication · User Profile · Storage Strategy · Offline Engine ·│
│   Sync Engine · Settings · Event Bus · Plugin Registry               │
└───────────────────────────────────────────────────────────────────┘
```

**Rationale for layering:**
- L5 (Platform) has zero knowledge of pedagogy — it could run any kind of app.
- L4 (Content & Knowledge) knows about concepts, formulas, and questions, but not about *this specific student's* progress.
- L3 (Domain Engines) is where the student model lives and where "what should happen next" is decided.
- L2 (Orchestration) sequences calls across L3/L4 engines to fulfill a use case (e.g., "start a study session") and is the only layer allowed to call the AI Orchestration Layer.
- L1 (Experience) only ever talks to L2, never directly to L3/L4/L5. This keeps UI decoupled from domain logic and enables future UI surfaces (mobile, voice, a tutor widget) without duplicating orchestration logic.

**Trade-off acknowledged:** Five layers add indirection for a single-user app where a simpler 2-tier design would ship faster. The layering is deliberately chosen to pay down the stated requirement of plugin-style, multi-exam expansion — removing a layer later is far more expensive than carrying it now.

---

## 6. Module Breakdown

Each module below is described by **responsibility**, **owns (state)**, and **does not own** (to make boundaries explicit).

| Module | Responsibility | Owns | Does Not Own |
|---|---|---|---|
| **Dashboard** | Aggregate view of study status, next actions | View composition only | Any domain state |
| **Authentication** | Identity, session, device binding | Credentials, sessions, tokens | Profile data, progress |
| **User Profile** | Preferences, exam target, goals | Profile attributes, target exam config | Mastery data |
| **Knowledge Base** | Canonical store of concepts, chapters, topics | Concept metadata, taxonomy | Concept *relationships* (owned by Concept Graph) |
| **PDF Intelligence** | Orchestrates ingestion pipeline for uploaded PDFs | Ingestion job state | Raw OCR (delegates to OCR Engine) |
| **OCR Engine** | Text/formula/diagram extraction from scanned pages | Raw extraction artifacts | Semantic meaning of extracted text |
| **Concept Graph** | Prerequisite relationships between concepts | Directed graph edges, dependency weights | Student mastery of nodes |
| **Formula Engine** | Canonical formula repository, symbolic linking to concepts | Formula definitions, derivations, usage links | Question content |
| **Question Bank** | Canonical repository of all questions (generated + extracted) | Question metadata, difficulty tags, concept tags | Selection logic for tests |
| **PYQ Engine** | Previous Year Question repository and pattern analysis | PYQ metadata, year/frequency stats | General question generation |
| **Adaptive Learning Engine** | Decides next learning unit for the student | Session-level sequencing decisions | Long-term mastery state (reads from Mastery Tracking) |
| **AI Tutor** | Real-time explanation, Socratic Q&A during study | Conversation context (session-scoped) | Persistent student model |
| **AI Mentor** | Longer-horizon coaching: motivation, plan adjustments | Mentor interaction log | Study plan itself (owned by Study Planner) |
| **Revision Engine** | Spaced repetition scheduling | Revision schedule state | Flashcard content (owned by Flashcards) |
| **Flashcards** | Flashcard content and review UI logic | Flashcard decks | Scheduling (delegates to Revision Engine) |
| **Notes** | Student-authored and AI-assisted notes | Note content, links to concepts | — |
| **Bookmarks** | Saved references across content types | Bookmark index | — |
| **Search** | Full-text + semantic search across all content | Search index | Source content |
| **Analytics** | Aggregated performance metrics, trend reporting | Derived metrics/rollups | Raw event log (owned by Event Bus/Storage) |
| **Mock Test Engine** | Test construction, delivery, scoring | Test blueprints, attempts, results | Question authoring |
| **Study Planner** | Calendar-based plan generation and tracking | Plan schedule | Mastery decisions (consumes from Adaptive Learning Engine) |
| **Settings** | App configuration, notification prefs | Config state | — |
| **Notification System** | Reminders, nudges, alerts | Notification queue/state | Triggers are computed elsewhere and published as events |
| **Offline Engine** | Local cache management, offline capability detection | Local cache manifest | Conflict resolution (delegates to Sync Engine) |
| **Sync Engine** | Cross-device / cloud synchronization, conflict resolution | Sync state, vector clocks/versioning | Business logic of the data it syncs |

---

## 7. Component Interaction

Modules interact through three mechanisms, chosen deliberately per interaction type:

1. **Synchronous request/response (internal API calls)** — used when the caller needs an answer to proceed (e.g., Mock Test Engine calling Question Recommendation Engine to build a test).
2. **Asynchronous events (pub/sub via the Module Communication Bus)** — used for anything that other modules *may* want to react to, but the emitter doesn't need to know who's listening (e.g., "QuestionAnswered" event consumed by Mastery Tracking, Analytics, and Revision Engine simultaneously).
3. **Shared read-only views** — a small number of modules (Concept Graph, Mastery Store) expose read-optimized views that many modules query directly rather than round-tripping through orchestration, to avoid chatty call chains for hot-path reads.

**Example interaction — student answers a practice question:**

```
Experience Layer (Mock Test UI)
   │  submitAnswer(questionId, response)
   ▼
Test Orchestrator (L2)
   │  1. validateAnswer() → Question Bank
   │  2. emit(QuestionAnswered) → Event Bus
   ▼
Event Bus fans out to:
   ├─▶ Mastery Tracking Engine   (updates concept mastery estimate)
   ├─▶ Weakness Detection Engine (checks for repeated-error pattern)
   ├─▶ Revision Engine           (schedules/reschedules spaced repetition)
   └─▶ Analytics Engine          (rolls up into performance metrics)
```

No module in the fan-out calls another directly — this is what allows Revision Engine or Weakness Detection to be modified, replaced, or extended (e.g., a smarter weakness model later) without touching Test Orchestrator or each other.

**Governing rule:** synchronous calls are only allowed *downward* within a layer or from a higher layer to a lower one (Section 5). A lower-layer engine must never synchronously call upward into Orchestration or Experience — it can only publish events.

---

## 8. Data Flow

At a system level, three data flows dominate:

**A. Content Flow (write path for knowledge):**
`PDF Upload → PDF Intelligence → OCR Engine → Concept/Chapter/Topic Detection → Knowledge Base + Concept Graph enrichment → Question/Formula Extraction → Question Bank / Formula Engine → Search Index`

**B. Learning Flow (the core read/decide loop):**
`Student requests to study → Adaptive Learning Engine queries Mastery Store + Concept Graph → Learning Path Generator proposes next unit → AI Tutor renders/explains → Student engages → events emitted → Mastery Tracking updates state → loop`

**C. Assessment Flow:**
`Mock Test requested → Mock Test Engine queries Question Recommendation Engine → Question Recommendation Engine queries Mastery Store + PYQ Engine + Question Bank → Test assembled → delivered → scored → results feed Analytics + Mastery Tracking + Revision Engine`

All three flows converge on the same two state stores — **Concept Graph** and **Mastery Store** — which is intentional: it guarantees that content ingestion, learning, and assessment are always reasoning about the same model of "what exists" and "what the student knows," preventing the classic failure mode of quiz engines and learning engines drifting out of sync.

---

## 9. AI Workflow

All AI usage flows through a single **AI Orchestration Layer** (part of L2). This layer is responsible for:

1. **Context assembly** — pulling the minimum necessary state (current concept, recent mastery signals, relevant question history) from L3/L4 stores per the AI Context Strategy (Section 18).
2. **Task routing** — dispatching to the correct AI capability: explanation generation (AI Tutor), question generation (Question Bank enrichment), weakness diagnosis (Weakness Detection Engine), coaching (AI Mentor).
3. **Provider abstraction** — the layer talks to an abstract "reasoning provider" interface (completion, embedding, OCR-assist) so the underlying model/vendor can change without touching any domain engine.
4. **Guardrails** — every AI response affecting pedagogy (e.g., "mark this concept as mastered") is treated as a *recommendation*, validated against deterministic rules (Section "Learning Engine") before being committed to state. AI never writes directly to the Mastery Store.
5. **Caching and cost control** — repeated or similar requests (e.g., re-explaining a common misconception) are cached at the semantic level using embeddings, reducing redundant model calls.

```
Domain Engine (e.g., AI Tutor)
   │ request(taskType, entityRefs)
   ▼
AI Orchestration Layer
   │ 1. Context Assembler → pulls bounded context
   │ 2. Prompt Builder → task-specific template
   │ 3. Provider Adapter → external AI Reasoning Provider
   │ 4. Response Validator → schema + guardrail checks
   ▼
Domain Engine receives structured, validated result
```

---

## 10. Learning Workflow

1. Student opens a study session (or one is proactively suggested by the Study Planner/Notification System).
2. **Adaptive Learning Engine** asks the **Concept Dependency Engine**: "given current mastery state, what is the set of eligible next concepts?"
3. **Learning Path Generator** ranks eligible concepts using student goals (target exam pack, time remaining, weak areas from Weakness Detection Engine).
4. The chosen concept's material (explanation, worked examples, formulas) is assembled from **Knowledge Base**, **Formula Engine**, and linked **Question Bank** items.
5. **AI Tutor** presents the material and handles clarifying Q&A.
6. Student attempts embedded practice questions; each answer emits `QuestionAnswered`.
7. **Mastery Tracking Engine** updates the concept's mastery score in real time.
8. At session end (or threshold crossing), the **Concept Dependency Engine** re-evaluates eligibility for the *next* concept — this is the core gating loop that guarantees correct sequencing.

---

## 11. PDF Processing Workflow

```
Upload
   ▼
PDF Intelligence (job orchestrator)
   ▼
OCR Engine ──▶ raw text + layout + image regions
   ▼
Formula Extraction ──▶ formula candidates → Formula Engine (dedupe/link)
   ▼
Diagram Detection ──▶ image regions classified (graph, circuit, geometry, etc.)
   ▼
Chapter Detection ──▶ document structure (TOC, headings) → Knowledge Base
   ▼
Topic Detection ──▶ topic segmentation within chapters → Knowledge Base
   ▼
Concept Detection ──▶ maps topics to Concept Graph nodes (creates new nodes if novel)
   ▼
Question Extraction ──▶ isolates question blocks → Question Bank (tagged "extracted")
   ▼
Solution Extraction ──▶ links solutions to extracted questions
   ▼
Semantic Indexing ──▶ embeddings generated → Search index
   ▼
Citation Support ──▶ every extracted artifact retains page/source reference for traceability
```

Each stage is an independent, retryable pipeline step (not a monolithic function), so a failure in Diagram Detection does not block Chapter Detection or downstream stages that don't depend on it. Stage outputs are versioned so re-processing a PDF (e.g., after an OCR model upgrade) does not silently overwrite prior extractions without an audit trail.

---

## 12. Question Generation Workflow

Two sources feed the Question Bank: **extracted** (from PDF Intelligence) and **generated** (AI-authored). The generation workflow:

1. Trigger: Adaptive Learning Engine or Mock Test Engine requests coverage for a concept with insufficient question density.
2. AI Orchestration Layer assembles context: concept definition, related formulas, difficulty target, examples of existing questions for style consistency, and — critically — PYQ patterns from **PYQ Engine** so generated questions match real exam style.
3. AI Reasoning Provider generates candidate question(s) + solution + difficulty estimate.
4. **Response Validator** checks structural validity (well-formed, has a solvable solution, tagged to correct concept).
5. Candidate is stored in Question Bank as `status: pending_review` (or auto-approved for low-stakes practice use, per configurable policy) and becomes eligible for use in practice sessions and, once sufficiently vetted, mock tests.

---

## 13. Mock Test Workflow

```
Test requested (mode: JELET / JEE Main / JEE Advanced / Custom / Adaptive / Weak-Topic /
                Formula / Revision / Full Mock)
   ▼
Mock Test Engine → Test Orchestrator
   ▼
Question Recommendation Engine selects questions using:
   - Difficulty         (target distribution per exam pack blueprint)
   - Concept Coverage    (ensures blueprint's syllabus weightage is respected)
   - Student Weakness    (over-samples from Weakness Detection Engine output)
   - Previous Performance (avoids over-repeating recently-mastered items;
                            deliberately re-includes recently-missed items)
   - Time Allocation      (question count × average solve time ≤ target duration)
   ▼
Test assembled → delivered to Experience Layer
   ▼
Student completes → scored (exam-pack-specific marking scheme applied)
   ▼
Results → Analytics, Mastery Tracking, Revision Engine (schedules follow-up), Weakness Detection
```

Each mock mode is a **blueprint** (a declarative spec: question count, difficulty mix, time limit, concept weightage, negative marking rules) supplied by the active exam pack. The Mock Test Engine itself contains no JELET- or JEE-specific logic; it only executes blueprints. This is the key mechanism by which "add WBJEE mode" becomes "register a new blueprint," not "modify the engine."

---

## 14. Revision Workflow

1. Every mastery-relevant event (question answered, concept completed, mock test taken) is evaluated by the **Revision Engine** using a spaced-repetition model (e.g., a variant of SM-2/leitner-style scheduling, tunable per content type).
2. Each concept/flashcard/question gets a **next-due timestamp** and a **strength score**, updated on every review based on correctness and response confidence.
3. The Revision Engine publishes a daily/session-level "due for revision" set, consumed by the Study Planner and Notification System.
4. Revision items are prioritized: overdue > weak-flagged (from Weakness Detection Engine) > due-today > upcoming.
5. Revision sessions are lightweight — no new AI tutoring context assembly required unless the student explicitly asks for re-explanation, which routes back into the AI Workflow.

---

## 15. Analytics Workflow

Analytics is a **pure consumer** of the event stream — it never triggers domain decisions, only observes and aggregates.

1. All events (from Section 8's three flows) land on the Event Bus.
2. Analytics Engine subscribes to relevant event types and maintains rolling aggregates: time-on-concept, accuracy trends, velocity (concepts mastered/week), mock test score trajectory, weak-topic heatmaps.
3. Aggregates are computed incrementally (streaming rollups), not via full recomputation, to keep the Dashboard responsive.
4. Analytics exposes read-only query APIs consumed by Dashboard, Study Planner (for pacing decisions), and AI Mentor (for coaching context).

---

## 16. Authentication Workflow

Even for a single-student deployment, Authentication is architected as a standard, replaceable module:

1. Credential/session issuance is isolated in the **Authentication** module; no other module stores or validates credentials.
2. Session tokens are short-lived and refreshed; device binding supports the multi-device sync scenario (student on laptop and phone).
3. **User Profile** is a separate module that Authentication hands off to post-login — Authentication only ever answers "who is this and are they valid," never "what does this student prefer."
4. Because this is a single-user product today, Authentication can be implemented simply (e.g., local device auth + optional cloud account for sync), but the module boundary is kept identical to what a multi-user version would need, so introducing real multi-tenant auth later doesn't ripple into other modules.

---

## 17. Storage Strategy

Storage is split by **access pattern**, not by module, to avoid one-size-fits-all compromises:

| Data Category | Characteristics | Storage Approach |
|---|---|---|
| Structured domain state (profile, mastery scores, plans) | Small, relational, transactional | Local embedded relational store + cloud-synced replica |
| Concept Graph | Graph-shaped, read-heavy, small | In-memory graph representation, persisted structured store |
| Content artifacts (PDFs, extracted images) | Large binary blobs | Object storage (local cache + cloud object store) |
| Search/semantic index | Vector + inverted index | Dedicated embedding index, rebuildable from source of truth |
| Event log | Append-only, high write volume | Append-only log store, periodically compacted into Analytics rollups |

**Principle:** every derived store (search index, analytics rollups) must be rebuildable from a durable source of truth (Knowledge Base, Question Bank, Event Log). Derived stores are caches of computation, never the sole record.

---

## 18. AI Context Strategy

The single biggest risk in an AI-driven learning system is **context bloat and drift** — sending the model too much (cost, latency, noise) or too little (bad answers) or *inconsistent* context (non-reproducible behavior).

Strategy:

1. **Bounded, typed context objects.** Each AI task type (tutoring, generation, weakness diagnosis, mentoring) has a defined context schema — a fixed set of fields it is allowed to request, not an open-ended dump of student history.
2. **Layered context assembly:**
   - *Immediate context* — current concept, current question, immediate conversation turn.
   - *Session context* — this session's activity so far.
   - *Long-horizon context* — summarized (not raw) mastery trends and weakness patterns, refreshed periodically rather than recomputed per call.
3. **Summarization over accumulation.** Long-horizon student history is never passed raw; it is periodically compressed into structured summaries (e.g., "weak in: rotational dynamics, strong in: kinematics") by the Mastery Tracking and Weakness Detection engines, and *those summaries* are what the AI Orchestration Layer includes.
4. **Deterministic context, non-deterministic generation.** The context assembly step is deterministic and testable independent of the AI model — this makes it possible to unit test "does the Tutor get the right facts" separately from "is the explanation good."

---

## 19. Memory Strategy

Distinct from AI context (which is per-call), Memory Strategy concerns how the system retains knowledge about the student across the entire journey:

1. **Mastery Store** — the durable, authoritative record of per-concept mastery, updated incrementally, never fully recomputed from scratch (recomputation is only used for backfill/migration).
2. **Episodic memory** — a bounded, queryable history of significant learning events (concept completions, major test results, AI Mentor conversations) retained for coaching continuity, distinct from the full raw event log (which is retained for analytics but not surfaced to AI directly).
3. **Forgetting curve modeling** — Revision Engine's spaced-repetition state is itself a memory model of *retention*, separate from mastery (a concept can be "mastered" but "due for revision" if the forgetting curve predicts decay).
4. **Privacy-conscious retention** — raw AI conversation transcripts (AI Tutor/Mentor) are retained only as long as needed for continuity and are summarized-and-discarded on a rolling window, per the Security Strategy (Section 22).

---

## 20. Scalability Strategy

Although the initial deployment is single-student, the architecture anticipates two scaling dimensions:

1. **Content scale** — a student may upload hundreds of PDFs across five exam levels over multiple years. PDF Intelligence and Search are designed as horizontally scalable pipelines (stateless workers pulling from a job queue) even if the initial deployment runs them on modest infrastructure.
2. **User scale** — if the product later serves many students, the layering in Section 5 already isolates per-student state (Mastery Store, Concept Graph *instance*, Event Log) such that "add a tenant" is "provision a new instance of L3/L4/L5 state," not an architecture change. The Concept Graph *schema/taxonomy* can be shared across students while *edges representing mastery-relevant weighting* remain per-student where applicable.

**Trade-off:** building for multi-user scale on day one would slow initial delivery. The chosen approach — single-tenant implementation behind multi-tenant-shaped module contracts — defers the cost without foreclosing the option.

---

## 21. Reliability Strategy

1. **Idempotent event processing** — every consumer of the Event Bus (Mastery Tracking, Analytics, Revision) processes events idempotently, so replays (after a crash or during migration) don't corrupt state.
2. **Pipeline checkpointing** — PDF Intelligence stages checkpoint their progress; a failure mid-pipeline resumes rather than restarts.
3. **Graceful AI degradation** — if the AI Reasoning Provider is unavailable, AI Tutor falls back to static explanations already present in Knowledge Base; Question Generation simply pauses (Question Bank still serves extracted/cached questions).
4. **State snapshots** — Mastery Store and Concept Graph support point-in-time snapshots, enabling rollback if a bad AI-driven update or bug corrupts student state.

---

## 22. Security Strategy

1. **Least-privilege module access** — modules only get read/write access to the state stores they own; cross-module state access goes through defined APIs, never direct data-store access, enforced architecturally even in a single-process deployment.
2. **Content provenance** — every ingested PDF and every AI-generated artifact is tagged with its origin (Section 11's Citation Support), preventing ambiguity about what's authoritative source material vs. AI-generated content.
3. **AI output validation** — as noted in Section 9, AI never writes directly to authoritative state (Mastery Store, Concept Graph); all AI outputs pass through a Response Validator.
4. **Data-at-rest protection** — local cache and cloud-synced stores are encrypted at rest; sync transport is encrypted in transit.
5. **Minimal retention of sensitive conversational data**, per Section 19.

---

## 23. Offline Strategy

1. **Offline Engine** maintains a local cache manifest describing what content, questions, and flashcards are available without connectivity, prioritized by the Study Planner's near-term schedule (i.e., pre-fetch what the student is likely to need in the next few days).
2. **Core loop works offline:** reading cached material, attempting cached questions, reviewing flashcards, and taking previously-downloaded mock tests all function without connectivity; results are queued locally.
3. **AI-dependent features degrade gracefully offline:** AI Tutor falls back to static Knowledge Base content; new Question Generation and Search-by-semantic-meaning are unavailable (basic keyword search over the local index still works).
4. **Sync Engine reconciles on reconnect** — queued events (answers, completions) are replayed into the Event Bus; conflicts (e.g., state changed on two devices) are resolved via a last-write-wins-with-audit-trail policy for simple preferences and a merge policy for additive state like event logs (which are inherently append-only and don't conflict).

---

## 24. Future Expansion Strategy

The architecture's central bet is that **expansion happens through the Plugin Registry, not through core module changes.** An exam pack (WBJEE, GATE, NEET, Custom Course) is a manifest declaring:

- Syllabus mapping onto (and extension of) the shared Concept Graph taxonomy.
- Mock test blueprints (Section 13).
- Marking/scoring scheme.
- Exam-specific question style/difficulty calibration used by the Question Generation Workflow.
- Optional exam-specific UI configuration (consumed by the Experience Layer, not by domain engines).

Adding a new pack is therefore an **additive, declarative operation**: register a manifest, extend the Concept Graph with any net-new nodes the new syllabus requires, and supply blueprints. No module in L2–L5 requires code changes to support a syllabus it didn't originally ship with, *provided* the new syllabus's concepts can be expressed within the existing graph/mastery/question data model — which is the key assumption this architecture makes and the one most worth validating early with a second pack (e.g., a lightweight JEE Main pack) before committing further.

---

## AI Design: Reasoning Engines

### Concept Dependency Engine
**Architecture:** A directed acyclic graph (DAG) service sitting on top of the Concept Graph's edge data. Each edge represents "prerequisite-of" with an associated weight (how strongly B depends on mastering A). The engine's sole exposed capability is `getEligibleConcepts(studentMasteryState) → [conceptId]`: it performs a graph traversal that only returns nodes whose prerequisite mastery thresholds are satisfied. This engine is **deterministic and rule-based**, deliberately excluded from AI variance, because it enforces the hard product guarantee that advanced material is never taught before prerequisites.

### Weakness Detection Engine
**Architecture:** A streaming consumer of `QuestionAnswered` and `MockTestCompleted` events. Maintains a rolling error-pattern model per concept (e.g., error rate, error *type* clustering — careless vs. conceptual vs. time-pressure, inferred from response-time and error metadata). Surfaces a ranked `weakConcepts` list consumed by Question Recommendation Engine, Mock Test Engine, and Revision Engine. Uses lightweight statistical models for the always-on signal, with optional AI-assisted qualitative diagnosis ("this student consistently confuses X and Y") available on demand rather than computed continuously, to control cost.

### Mastery Tracking Engine
**Architecture:** The authoritative, incrementally-updated per-concept mastery score (e.g., a Bayesian knowledge-tracing-style model, or a simpler weighted-recency accuracy model — an implementation decision left open, but the *interface* is fixed: `updateMastery(event) → newScore`, `getMastery(conceptId) → score`). This is the single most-read store in the system and is optimized for fast reads via an in-memory view backed by durable storage.

### Revision Recommendation Engine
**Architecture:** Wraps the Revision Engine's spaced-repetition scheduler with prioritization logic that blends due-date, Weakness Detection signals, and upcoming Mock Test schedule (surfacing revision for concepts about to be tested). Exposes `getRevisionQueue(date) → [items]`.

### Question Recommendation Engine
**Architecture:** A ranking service that takes a *pool* (from Question Bank + PYQ Engine, filtered by concept/difficulty) and ranks/selects based on the five factors in Section 13. Stateless with respect to the pool; reads Mastery Store and Weakness Detection Engine per call.

### Learning Path Generator
**Architecture:** Sits above the Concept Dependency Engine; takes the *eligible set* and orders it into a session/week/month plan, weighted by target exam date (from User Profile), pacing data (from Analytics), and weakness signals. Produces the plan consumed by the Study Planner.

**Inter-engine communication:** All six engines communicate exclusively through the Event Bus (for state-changing signals) and through direct read-only queries to shared stores (Mastery Store, Concept Graph) — never through direct calls to each other's internals. This means, for example, Question Recommendation Engine depends on the *existence* of Weakness Detection's output contract, not on its implementation, so the weakness model can be swapped (e.g., simple heuristic → ML model) without touching the recommender.

---

## Learning Engine: Gating and Remediation Logic

The product requirement — *"the AI must never teach advanced concepts before prerequisite mastery"* — is enforced as follows:

1. Each concept in the Concept Graph declares a **mastery threshold** (e.g., 80% weighted accuracy over a minimum sample of attempts, with a recency-weighting to discount stale performance).
2. The **Concept Dependency Engine** only marks a concept "eligible" when *all* of its direct prerequisites meet their thresholds.
3. When a student attempts to access a concept that is not yet eligible (whether through direct navigation or an AI suggestion), the **Adaptive Learning Engine intercepts the request** and substitutes a **remediation path**: the highest-priority unmet prerequisite becomes the actual next unit, with an explanation surfaced to the student ("Before Rotational Dynamics, let's strengthen Torque — you're at 62%, target is 80%").
4. **Forward vs. remediation decision** is therefore not probabilistic — it's a threshold comparison. What *is* adaptive/AI-driven is *how* remediation is delivered (which sub-topic within the weak prerequisite, what explanation style, what practice questions) — this is where the AI Tutor and Question Recommendation Engine add value within a guaranteed-safe envelope.
5. Thresholds are configurable per exam pack (JEE Advanced may demand a stricter threshold than JELET for the same underlying concept), stored in the pack manifest, not hardcoded in the engine.

---

## Quality Attributes

**Maintainability** — Enforced by the strict module contract discipline (Section 3, Principle 1) and the layering in Section 5; a change to how Mastery is computed touches one module's internals, not its callers.

**Performance** — Hot-path reads (Concept Graph, Mastery Store) are served from in-memory/cached views (Section 17); AI calls are the only inherently high-latency path and are isolated behind the AI Orchestration Layer so UI can show progressive/streaming results rather than blocking.

**Reliability** — Idempotent event processing, pipeline checkpointing, and graceful AI degradation (Section 21) ensure the core study loop survives partial failures.

**Security** — Least-privilege module boundaries, AI output validation, and encryption at rest/in transit (Section 22) protect both content and student data.

**Testability** — Because AI context assembly is deterministic and separated from generation (Section 18), and because gating logic is rule-based (Learning Engine section), the majority of pedagogically-critical logic is unit-testable without mocking an LLM. AI-dependent behavior is tested via contract tests against the Response Validator's schema, not against specific model outputs.

**Extensibility** — The Plugin Registry and manifest-driven exam packs (Section 24) are the primary extensibility mechanism; the Mock Test Engine's blueprint model (Section 13) is a second, narrower example of the same pattern applied within a single module.

**Observability** — The Event Bus (Section 7) doubles as an observability backbone: every meaningful state transition is an event, which can be tapped for logging/tracing/metrics without adding instrumentation to each domain engine individually.

---

## Assumptions

1. A single AI Reasoning Provider (or a small set behind a common adapter) is available with sufficient capability for tutoring-quality explanation and question generation.
2. The student has at least intermittent internet connectivity for sync and AI features; fully air-gapped operation is out of scope beyond the Offline Strategy's degraded-mode support.
3. Initial content volume (PDFs, PYQs) is within the range processable by a single-node ingestion pipeline; true horizontal scaling of PDF Intelligence is a Section 20 future concern, not a day-one requirement.
4. Exam pack manifests for JEE Main/Advanced/WBJEE/GATE/NEET will require a shared-but-extensible Concept Graph taxonomy; the degree of syllabus overlap across these exams has not been formally validated and should be a first follow-up analysis before building the second pack.

## Open Questions for Follow-Up Design Phases

1. Exact mastery-scoring model (Bayesian Knowledge Tracing vs. simpler weighted accuracy) — deferred to a focused design spike, as it affects both Mastery Tracking Engine and threshold calibration across exam packs.
2. Degree of AI-generated question auto-approval vs. mandatory human/AI double-check before use in scored Mock Tests.
3. Cross-device sync conflict policy for genuinely concurrent edits to Notes (append-only merge vs. manual resolution UI).

---

*End of Architecture Design Document.*
