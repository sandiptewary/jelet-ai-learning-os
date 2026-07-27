# Software Requirements Specification
## AI-Powered Learning Operating System for JELET 2027 Preparation

**Document Type:** Software Requirements Specification (SRS)
**Source Document:** Approved Product Requirements Document (PRD)
**Prepared By:** Lead Systems Engineering Team
**Target System:** Single-User AI Learning Operating System
**Target User:** One diploma-holder student preparing for JELET 2027
**Document Status:** Draft for Engineering Implementation

---

## Document Conventions

- **Priority levels:** P0 (must-have, blocks release), P1 (high, required for MVP completeness), P2 (important, can follow shortly after MVP), P3 (nice-to-have, backlog).
- **Requirement IDs:** Format `SUBSYS-NNN` (e.g., `AUTH-001`). IDs are stable identifiers for traceability into test plans and future ADRs (Architecture Decision Records).
- Requirements use RFC-2119-style language: **must** / **must not** = mandatory; **should** = strongly recommended, deviation requires justification; **may** = optional.
- This document intentionally excludes source code, database schema, and UI mockups per engineering directive. It specifies *what* the system must do and *how it must behave*, not *how it is implemented at the code level*.

---

## 1. Executive Summary

This SRS defines the engineering blueprint for a single-user, AI-powered Learning Operating System ("the System") built exclusively to prepare one student — a diploma holder — for the JELET 2027 lateral-entry engineering entrance examination.

Because the System has exactly one user, the engineering strategy inverts the usual priorities of consumer software. Horizontal scalability, multi-tenant isolation, and growth-oriented infrastructure are explicitly **not** goals. Instead, the System is engineered for:

- **Depth of personalization** — every subsystem should be able to reason about this one student's mastery, pace, and error patterns with high fidelity.
- **Reliability over time** — the System will be used daily for many months; data integrity and availability matter more than throughput.
- **Maintainability by a small (possibly single-person) engineering team** — architecture should minimize operational burden.
- **Long-term learning fidelity** — the System's spaced repetition, mastery, and analytics data must remain coherent and trustworthy across a multi-month study arc, since decisions (what to study next) compound on this data.

This document translates the PRD's product-level goals into testable, implementation-ready engineering requirements across 28 functional subsystems, the AI/ML engine, the PDF/OCR intelligence pipeline, the question and mock-test systems, analytics, and all applicable non-functional constraints (security, performance, accessibility, reliability).

---

## 2. System Purpose

The System exists to function as a single coherent "learning operating system" — not a bundle of disconnected study tools — that:

1. Ingests the student's raw study materials (PYQs, textbooks, personal notes) as PDFs and converts them into structured, searchable, taggable knowledge.
2. Models the student's mastery of every concept in the JELET syllabus at a granular level.
3. Uses that mastery model to personalize what the student studies next, in what order, and how often it is revised.
4. Provides AI tutoring and mentoring that is grounded in the ingested syllabus and question bank, not generic explanation.
5. Simulates real exam conditions through a configurable mock test engine.
6. Surfaces analytics that answer the student's real question: *"Am I actually going to be ready by exam day?"*

The System is the operating layer that coordinates content, cognition, and time — the way an OS coordinates processes, memory, and I/O — hence "Learning Operating System."

---

## 3. Business Goals

| ID | Goal | Rationale |
|---|---|---|
| BG-1 | Maximize the probability the student clears JELET 2027 with a competitive rank | Sole reason the System exists |
| BG-2 | Minimize wasted study time on already-mastered or low-yield material | Diploma holders preparing for lateral entry typically have limited runway; time is the scarcest resource |
| BG-3 | Keep the System operable by a single maintainer with minimal ongoing cost | No dedicated ops team; must not require infrastructure the student/maintainer cannot sustain |
| BG-4 | Preserve all study data with zero tolerance for silent loss | Months of mastery/analytics history are irreplaceable and directly inform exam-readiness decisions |
| BG-5 | Keep the System usable with unreliable or intermittent internet | Realistic usage includes offline study sessions, travel, and variable connectivity |

---

## 4. Educational Goals

| ID | Goal | Rationale |
|---|---|---|
| EG-1 | Enforce prerequisite-first learning | Advanced concepts taught before foundational mastery produce fragile, false confidence |
| EG-2 | Prioritize retrieval practice over passive re-reading | Retrieval practice has stronger evidence for long-term retention than review-only study |
| EG-3 | Apply spaced repetition tuned to individual forgetting curves, not fixed intervals | A single student's forgetting curve can be measured directly instead of assumed from population averages |
| EG-4 | Diagnose *why* a question was missed, not just *that* it was missed | Error classification (conceptual, careless, time-pressure, misread) drives different remediation |
| EG-5 | Calibrate confidence against actual accuracy | Overconfidence and underconfidence are both failure modes the System should detect and correct |
| EG-6 | Simulate real exam constraints (time, negative marking, question mix) before exam day | Reduces exam-day surprise and builds pacing skill, not just content knowledge |

---

## 5. Scope

### 5.1 In Scope

- Single-user account and profile management (no multi-tenant concerns).
- Ingestion, OCR, and structuring of PDF study materials (JELET PYQs, JEE Main PYQs, Mathematics/Physics/Chemistry/Engineering subject material, personal notes).
- A concept graph covering the JELET syllabus with prerequisite relationships.
- AI Tutor (on-demand concept explanation) and AI Mentor (proactive guidance, planning, motivation framing) as **distinct** subsystems with distinct responsibilities (see §8.4–8.5).
- Adaptive study planning, spaced repetition, and mastery tracking.
- A question bank with rich metadata (difficulty, concept mapping, formula mapping, solve-time estimates).
- A mock test engine supporting multiple test modes including full JELET simulation.
- Analytics covering mastery, retention, velocity, accuracy, and readiness.
- Offline mode with a sync engine for reconciliation when connectivity returns.
- Backup & restore of all user data.
- Accessibility features appropriate to sustained daily study use (dark mode, keyboard navigation, readable typography).

### 5.2 Out of Scope

- Multi-user support, classrooms, or social/collaborative features.
- Payment, billing, or subscription systems.
- Content marketplace or sharing of the student's materials with other users.
- Support for exams other than JELET (JEE Main content is used only as a supplementary question source, not a separate exam mode) — this may be revisited post-JELET 2027 as a future scalability item (§13).
- General-purpose horizontal scaling, load balancing, or multi-tenant data isolation. These are explicitly rejected as engineering goals (see §10, Constraints).

---

## 6. Stakeholders

| Stakeholder | Role | Primary Concerns |
|---|---|---|
| The Student | Sole end user | Exam readiness, trust in the System's recommendations, low-friction daily use |
| Engineering Team / Maintainer | Builds and operates the System | Maintainability, low operational overhead, clear architecture |
| Product Owner | Defines priorities against the PRD | Feature completeness vs. timeline before JELET 2027 |
| (Implicit) Future Maintainers | May extend the System after JELET 2027 or for other exams | Code and data model clarity, documented assumptions |

Note: There are no institutional, advertiser, or third-party data stakeholders. This materially simplifies privacy and compliance requirements versus a typical EdTech product, but the System must still treat the student's data with the rigor of personal, sensitive data (see §9.5, Security).

---

## 7. User Profile

The System has exactly **one** user profile, with these characteristics driving design decisions throughout this document:

- **Background:** Diploma holder (not a fresh 10+2 student); has prior exposure to some engineering mathematics/science but with a different depth/sequencing than JELET expects. The concept graph and prerequisite model **must not assume** a standard 10+2 learning path — gaps and non-standard prior knowledge are expected and must be diagnosable rather than assumed away.
- **Study pattern:** Sustained, multi-month daily use, likely across multiple devices (implies sync engine is not optional) and with variable internet access (implies offline mode is not optional).
- **Primary risk to mitigate:** Time scarcity and misallocation of study effort, not lack of access to content.
- **Trust requirement:** Because the AI Tutor/Mentor and Adaptive Engine will directly shape what the student studies, the student must be able to see *why* a recommendation was made (see AI Explainability, §8.29.9) — a black-box recommendation is not acceptable for a high-stakes, time-constrained exam context.

Because there is one user, requirements that would normally address "user segmentation," "cohort analysis," or "personalization at scale" are replaced throughout this document with "personalization depth" — i.e., the System should know more about this one student over time, not generalize across a population.

---

## 8. Functional Requirements

Each subsystem below is specified in terms of Purpose, Inputs, Outputs, Dependencies, Failure Cases, Validation Rules, Business Rules, Priority, and Acceptance Criteria, per the mandated format.

### 8.1 User Profile

| Field | Specification |
|---|---|
| **Purpose** | Maintain the single student's identity, preferences, exam target date, and syllabus configuration as the anchor object other subsystems reference. |
| **Inputs** | Name, exam target (JELET 2027), diploma branch/background, syllabus edition, study-hour availability per day, timezone. |
| **Outputs** | A persisted profile object consumed by Dashboard, Study Planner, Analytics, and Notifications. |
| **Dependencies** | Authentication (profile is bound to the single authenticated identity); Backup & Restore. |
| **Failure Cases** | Profile corruption; missing required fields blocking downstream subsystems; conflicting edits from two devices before sync. |
| **Validation Rules** | Exam date must be a real future date; study-hour availability must be > 0; branch/background must map to a known syllabus configuration or fall back to a manual concept-graph override. |
| **Business Rules** | There is exactly one profile; the System must refuse to create a second profile (this is an explicit constraint, not an oversight — see §10). |
| **Priority** | P0 |
| **Acceptance Criteria** | Given a fresh install, the student can create exactly one profile; profile data survives app restart, device change (via sync), and is included in every backup. |

### 8.2 Authentication

| Field | Specification |
|---|---|
| **Purpose** | Protect access to the student's personal study data across devices without imposing multi-user complexity. |
| **Inputs** | Credential (password / passphrase / device biometric, per platform), optional recovery mechanism. |
| **Outputs** | An authenticated session token scoped to local device + sync channel. |
| **Dependencies** | Security Architecture (§9.5); Sync Engine (session must be valid across devices sharing one account). |
| **Failure Cases** | Forgotten credential with no recovery path (must not result in permanent data loss — recovery must be decoupled from data encryption keys, or the student must be warned explicitly at setup); brute-force attempts; expired/corrupted session token. |
| **Validation Rules** | Minimum credential strength enforced at setup; session tokens expire and require silent refresh, not silent indefinite validity. |
| **Business Rules** | Single-user means no role-based access control is needed; the only authorization boundary is "authenticated device" vs. "not authenticated." |
| **Priority** | P0 |
| **Acceptance Criteria** | Student can log in on a new device and, after sync, see identical data; an invalid credential is rejected with no partial session created; a documented recovery flow exists and is tested. |

### 8.3 Dashboard

| Field | Specification |
|---|---|
| **Purpose** | Single-glance summary of today's plan, overall readiness, and urgent items (weak topics, overdue revisions). |
| **Inputs** | Aggregated data from Study Planner, Mastery Tracking, Revision Engine, Notifications. |
| **Outputs** | A composed view model: today's tasks, readiness score, streak, weak-topic alerts. |
| **Dependencies** | Every core subsystem feeds the Dashboard; it must degrade gracefully if any one feed is unavailable (offline mode). |
| **Failure Cases** | Partial data availability (e.g., Analytics unavailable offline) must show stale-but-labeled data, never a blank or crashed screen. |
| **Validation Rules** | Readiness score must always be computed from the most recent successfully synced data, with a visible "as of" timestamp when offline. |
| **Business Rules** | Dashboard must never silently hide overdue revisions — surfacing overdue spaced-repetition items takes priority over showing new content. |
| **Priority** | P0 |
| **Acceptance Criteria** | Dashboard loads in under 1s from cached state (see Performance §9.2); reflects a plan change made in Study Planner within one refresh cycle; remains usable fully offline. |

### 8.4 AI Tutor

| Field | Specification |
|---|---|
| **Purpose** | On-demand, reactive concept explanation and question-solving help, initiated by the student ("explain this," "why is my answer wrong," "show a similar solved example"). |
| **Inputs** | Student query (text/voice-to-text), current context (question being viewed, concept node, or PDF passage), student's mastery state for referenced concepts. |
| **Outputs** | Grounded explanation, referencing the Concept Graph and Knowledge Base rather than free-form generation; follow-up question suggestions. |
| **Dependencies** | Concept Graph, Knowledge Base, Formula Library, PDF Intelligence (for citing source material), Mastery Tracking (to calibrate explanation depth). |
| **Failure Cases** | AI Timeout (see Error Handling §9.6); hallucinated explanation not grounded in ingested material — **must** be prevented via retrieval-grounding, not merely discouraged by prompting; explanation pitched above/below the student's current mastery level. |
| **Validation Rules** | Every explanation referencing a formula or fact **must** be traceable to either the Concept Graph, Formula Library, or a specific ingested PDF passage (citation support, §8.30). Free-floating unsourced claims on core syllabus content are not acceptable. |
| **Business Rules** | AI Tutor is reactive only — it does not decide *what* the student should study next (that is AI Mentor / Adaptive Engine's responsibility). This separation of concerns must be preserved so responsibilities don't blur across subsystems. |
| **Priority** | P0 |
| **Acceptance Criteria** | Given a question the student got wrong, AI Tutor produces an explanation citing the relevant concept node and, where applicable, the source PDF passage; response time meets AI performance targets (§9.2); explanation depth visibly adapts between a concept at 20% vs. 80% mastery. |

### 8.5 AI Mentor

| Field | Specification |
|---|---|
| **Purpose** | Proactive, longitudinal guidance: interprets analytics and mastery trends to tell the student what to do next and why, and provides pacing/motivational framing grounded in real data (not generic encouragement). |
| **Inputs** | Analytics trends, Mastery Tracking, Study Planner state, days remaining to exam, recent mock test performance. |
| **Outputs** | Proactive recommendations ("You're falling behind on Thermodynamics relative to plan — recommend reallocating 2 hrs this week"), delivered via Dashboard/Notifications, not just on request. |
| **Dependencies** | Analytics, Adaptive Learning Engine, Study Planner, Notifications. |
| **Failure Cases** | Recommending action based on stale/incomplete synced data; over-triggering notifications (see Notifications §8.22) causing alert fatigue; giving generic advice not actually grounded in this student's data. |
| **Validation Rules** | Every proactive recommendation **must** cite the specific data point that triggered it (e.g., "3 consecutive mock tests show declining accuracy in Organic Chemistry"). |
| **Business Rules** | AI Mentor recommendations are advisory, never auto-applied — the student must explicitly accept a re-plan before Study Planner changes. |
| **Priority** | P1 |
| **Acceptance Criteria** | Given a synthetic trend of declining performance in one topic over 3 mock tests, AI Mentor surfaces a specific, data-cited recommendation within one Dashboard refresh; no recommendation is issued without a traceable data trigger. |

### 8.6 AI Study Planner

| Field | Specification |
|---|---|
| **Purpose** | Converts syllabus + mastery state + days-to-exam into a concrete daily/weekly study plan. |
| **Inputs** | Concept Graph (with prerequisites), Mastery Tracking, available study hours (§8.1), Revision Engine's due items, exam date. |
| **Outputs** | Ordered daily task list (new concept study, practice sets, revision items, mock tests) with time estimates. |
| **Dependencies** | Adaptive Learning Engine (prioritization logic), Prerequisite Detection, Revision Engine. |
| **Failure Cases** | Plan that violates prerequisite ordering; plan that ignores overdue spaced-repetition items in favor of new content; plan that doesn't fit in the student's declared available hours. |
| **Validation Rules** | Total planned time per day **must not** exceed declared availability by more than a configurable buffer (default 10%); overdue revision items **must** be scheduled before new concept introduction, per EG-1/EG-3. |
| **Business Rules** | Prerequisite mastery threshold gating (see §8.29 rule) is a hard constraint on plan generation, not a soft preference. |
| **Priority** | P0 |
| **Acceptance Criteria** | Given a mastery snapshot with an overdue revision item and a new-concept candidate whose prerequisite is below threshold, the Planner schedules the revision item and defers the new concept, and this is verifiable in a generated plan trace. |

### 8.7 Knowledge Base

| Field | Specification |
|---|---|
| **Purpose** | Central structured store of syllabus content (definitions, explanations, worked examples) derived from ingested PDFs and curated content, addressable by concept. |
| **Inputs** | Structured output of PDF Intelligence pipeline; manual curation/edits by the student. |
| **Outputs** | Concept-addressable content used by AI Tutor, Search, Flashcards. |
| **Dependencies** | PDF Intelligence, Concept Graph (for addressing), Search. |
| **Failure Cases** | Duplicate or conflicting content for the same concept from different sources; orphaned content not linked to any concept node. |
| **Validation Rules** | Every Knowledge Base entry must link to at least one Concept Graph node; duplicate content (see Duplicate Detection §8.30) must be flagged, not silently merged. |
| **Business Rules** | Source PDF provenance must be retained for every entry (supports citation support, §8.30). |
| **Priority** | P0 |
| **Acceptance Criteria** | Ingesting two PDFs covering the same concept produces two provenance-tagged entries with a duplicate/near-duplicate flag surfaced to the student, not a silent overwrite. |

### 8.8 Concept Graph

| Field | Specification |
|---|---|
| **Purpose** | Directed graph of JELET syllabus concepts with prerequisite ("depends-on") edges, the backbone for sequencing, gating, and mastery propagation. |
| **Inputs** | Curated syllabus taxonomy (seed data); Prerequisite Detection outputs from ingested content; manual student/maintainer edits. |
| **Outputs** | Queryable graph: concept nodes, prerequisite edges, mastery-weighted traversal order. |
| **Dependencies** | Prerequisite Detection, Concept Dependency Engine (§8.29). |
| **Failure Cases** | Cyclic dependency introduced by automated detection (must be rejected — a prerequisite graph must be a DAG); orphan concept with no edges, silently unreachable by the Planner. |
| **Validation Rules** | Graph mutations **must** be validated to preserve acyclicity before commit; every concept must be reachable from at least one syllabus root. |
| **Business Rules** | The graph is the single source of truth for "what must be mastered before what" — no subsystem may hardcode its own ordering logic that bypasses the graph. |
| **Priority** | P0 |
| **Acceptance Criteria** | Attempting to add an edge that would create a cycle is rejected with a clear error; Planner and Adaptive Engine queries against the graph return consistent prerequisite chains. |

### 8.9 Formula Library

| Field | Specification |
|---|---|
| **Purpose** | Structured, searchable store of formulas extracted from ingested material, linked to concepts and questions. |
| **Inputs** | Formula Extraction output from PDF Intelligence; manual entries. |
| **Outputs** | Concept- and question-linked formula records with rendered notation. |
| **Dependencies** | PDF Intelligence (Formula Extraction), Concept Graph, Question Bank (Formula Mapping). |
| **Failure Cases** | Malformed/garbled OCR of mathematical notation; duplicate formulas under different notations (e.g., different variable naming) not recognized as equivalent. |
| **Validation Rules** | Extracted formulas must be flagged for student review if OCR confidence is below threshold, rather than silently trusted. |
| **Business Rules** | Formula Library entries are reference-only; the AI Tutor must cite from this library rather than generating formulas from model memory when a library entry exists. |
| **Priority** | P1 |
| **Acceptance Criteria** | A low-confidence OCR'd formula is visibly flagged for review; a confirmed formula is retrievable via Search and linked from every question that uses it. |

### 8.10 PDF Intelligence

(High-level subsystem entry; detailed sub-requirements in §8.30.)

| Field | Specification |
|---|---|
| **Purpose** | Orchestrates OCR, extraction, and structuring of all uploaded PDFs into Knowledge Base, Formula Library, and Question Bank entries. |
| **Inputs** | Raw PDF files. |
| **Outputs** | Structured, indexed, concept-tagged content. |
| **Dependencies** | OCR Processing, Formula Extraction, Chapter/Topic Detection, Semantic Indexing, Duplicate Detection. |
| **Failure Cases** | See §8.30 and §9.6 (Corrupted PDF, OCR Failure). |
| **Validation Rules** | See §8.30. |
| **Business Rules** | Ingestion is a pipeline with resumable stages — a failure at OCR must not require re-uploading the file. |
| **Priority** | P0 |
| **Acceptance Criteria** | See §8.30. |

### 8.11 OCR Processing

| Field | Specification |
|---|---|
| **Purpose** | Convert scanned/image-based PDF pages into machine-readable text. |
| **Inputs** | PDF page images. |
| **Outputs** | Extracted text with per-region confidence scores. |
| **Dependencies** | PDF Intelligence pipeline orchestration. |
| **Failure Cases** | Low-quality scans producing garbled text; handwritten personal notes with poor OCR accuracy; mixed-language (English/regional script) pages. |
| **Validation Rules** | Pages below a confidence threshold **must** be flagged for manual review, not silently included in the Knowledge Base as if fully trusted. |
| **Business Rules** | OCR output is versioned — re-running OCR (e.g., after a pipeline upgrade) must not destroy prior manually-corrected text. |
| **Priority** | P0 |
| **Acceptance Criteria** | A test set of scanned JELET PYQ pages achieves a defined minimum extraction accuracy; low-confidence pages are queued in a visible review list. |

### 8.12 Question Bank

(Cross-reference: detailed in §8.31.)

| Field | Specification |
|---|---|
| **Purpose** | Central store of all questions (from PYQs and other sources) with rich metadata for retrieval, tagging, and mock-test assembly. |
| **Inputs** | Extracted questions from PDF Intelligence; manually entered questions. |
| **Outputs** | Queryable question records consumed by Mock Test Engine, Adaptive Learning Engine, Revision Engine. |
| **Dependencies** | PDF Intelligence, Concept Graph, Formula Library. |
| **Failure Cases** | Duplicate questions across PYQ years; questions extracted without a valid answer/solution. |
| **Validation Rules** | Every question must have at least one concept tag before it is eligible for adaptive selection or mock-test inclusion. |
| **Business Rules** | Untagged/unverified questions are quarantined from the "eligible pool" used by Adaptive Engine and Mock Test Engine until validated. |
| **Priority** | P0 |
| **Acceptance Criteria** | A newly ingested but untagged question does not appear in a generated mock test until tagged. |

### 8.13 PYQ Manager

| Field | Specification |
|---|---|
| **Purpose** | Organize Previous Year Questions (JELET and supplementary JEE Main) by year, subject, and topic, distinct from the general Question Bank view. |
| **Inputs** | PYQ-tagged questions from Question Bank. |
| **Outputs** | Year/subject/topic-filterable PYQ views; PYQ-specific analytics (e.g., topic frequency across years). |
| **Dependencies** | Question Bank, Analytics. |
| **Failure Cases** | Year metadata missing or ambiguous during extraction. |
| **Validation Rules** | A question must carry a verified source year before being counted in PYQ frequency analytics. |
| **Business Rules** | JEE Main PYQs are tagged distinctly from JELET PYQs and must never be silently conflated in "JELET frequency" analytics, since exam patterns differ. |
| **Priority** | P1 |
| **Acceptance Criteria** | Filtering by "JELET only, last 5 years" returns only correctly source-tagged questions; JEE Main-derived questions are excluded from that view by default. |

### 8.14 Mock Test Engine

(Cross-reference: detailed in §8.32.)

| Field | Specification |
|---|---|
| **Purpose** | Assemble and administer timed tests across multiple modes, from a single chapter test to a full JELET simulation. |
| **Inputs** | Test mode selection, Question Bank eligible pool, timer configuration. |
| **Outputs** | Scored test session, per-question review, performance report. |
| **Dependencies** | Question Bank, Analytics, Adaptive Learning Engine (for Adaptive/Weak-Topic test modes). |
| **Failure Cases** | Interrupted test session (app closed, connectivity lost) must be resumable without losing progress or corrupting the timer state. |
| **Validation Rules** | See §8.32. |
| **Business Rules** | Negative marking and timing rules must exactly match current official JELET pattern for simulation-mode tests; other modes may relax these. |
| **Priority** | P0 |
| **Acceptance Criteria** | See §8.32. |

### 8.15 Adaptive Learning Engine

(Cross-reference: detailed AI behavior in §8.29.)

| Field | Specification |
|---|---|
| **Purpose** | Continuously decide what the student should practice next based on mastery, error patterns, and spaced-repetition due-state. |
| **Inputs** | Mastery Tracking, Mistake Notebook, Revision Engine due-queue, Question Bank eligible pool. |
| **Outputs** | Prioritized practice recommendations consumed by Study Planner and directly by the student via Dashboard. |
| **Dependencies** | Concept Dependency Engine, Difficulty Adjustment, Question Recommendation. |
| **Failure Cases** | Recommending content above the student's readiness (prerequisite gate not enforced) or content already well-mastered (wasted time, violates BG-2). |
| **Validation Rules** | See §8.29 gating rule. |
| **Business Rules** | See §8.29. |
| **Priority** | P0 |
| **Acceptance Criteria** | See §8.29. |

### 8.16 Revision Engine

| Field | Specification |
|---|---|
| **Purpose** | Schedule spaced-repetition revision of previously studied concepts and previously missed questions. |
| **Inputs** | Mastery Tracking history, Mistake Notebook, per-item review intervals. |
| **Outputs** | Due-today revision queue, forward-looking revision calendar. |
| **Dependencies** | Spaced Repetition algorithm (§8.29), Mastery Tracking. |
| **Failure Cases** | Backlog of overdue items growing unbounded without surfacing to the student or Planner; interval calculation drifting after an offline period without correction on resync. |
| **Validation Rules** | Revision intervals must be recalculated (not just delayed) when a sync reconciles offline study activity, per §8.28. |
| **Business Rules** | Overdue items always take priority over new content in the due-queue ordering (ties to EG-3). |
| **Priority** | P0 |
| **Acceptance Criteria** | A concept marked "mastered" 10 days ago with a 3-day interval and no review appears at the top of the due-queue as overdue, with visible overdue duration. |

### 8.17 Mistake Notebook

| Field | Specification |
|---|---|
| **Purpose** | Persistent, structured log of every incorrect answer with classified error type, for targeted remediation. |
| **Inputs** | Incorrect answers from practice sessions and mock tests; Error Classification output (§8.29). |
| **Outputs** | Filterable mistake log; feeds Revision Engine and Analytics (Mistake Types). |
| **Dependencies** | Error Classification, Question Bank, Revision Engine. |
| **Failure Cases** | Duplicate mistake entries for retries of the same question without linking them as a sequence (loses the "did the student actually improve" signal). |
| **Validation Rules** | Repeated mistakes on the same question/concept must be linked as a chain, not recorded as unrelated events. |
| **Business Rules** | An entry is only cleared from "active" status after a defined number of correct spaced repetitions, not after a single correct retry. |
| **Priority** | P0 |
| **Acceptance Criteria** | Missing the same question twice, then answering correctly twice on later spaced reviews, transitions the entry from active to resolved, visible in the log's status history. |

### 8.18 Flashcards

| Field | Specification |
|---|---|
| **Purpose** | Lightweight, spaced-repetition-driven recall practice for definitions, formulas, and quick facts. |
| **Inputs** | Auto-generated candidates from Knowledge Base/Formula Library; manually authored cards. |
| **Outputs** | Due-today flashcard queue integrated with Revision Engine. |
| **Dependencies** | Spaced Repetition, Knowledge Base, Formula Library. |
| **Failure Cases** | Auto-generated cards that are low quality (too vague, ambiguous answer) — must be reviewable/editable, not just accepted verbatim. |
| **Validation Rules** | Auto-generated cards are marked as such and queued for optional student review before entering the active spaced-repetition pool. |
| **Business Rules** | Flashcard review outcomes feed the same Mastery Tracking model as other practice — flashcards are not a separate, disconnected mastery signal. |
| **Priority** | P1 |
| **Acceptance Criteria** | A flashcard review (pass/fail) updates the linked concept's mastery score using the same update rule as a question attempt. |

### 8.19 Bookmarks

| Field | Specification |
|---|---|
| **Purpose** | Let the student manually flag questions, concepts, or PDF passages for later attention outside the automated queues. |
| **Inputs** | Student action on any bookmarkable object. |
| **Outputs** | A bookmarks list, filterable by type. |
| **Dependencies** | Question Bank, Knowledge Base, PDF Intelligence. |
| **Failure Cases** | Bookmarked source deleted/duplicated-merged, leaving a dangling reference. |
| **Validation Rules** | Bookmark references must be validated on access; a dangling bookmark is shown as such, not silently dropped. |
| **Business Rules** | Bookmarks are informational only — they do not affect Adaptive Engine prioritization automatically, to keep the two mental models (manual curation vs. automated recommendation) distinct and trustworthy. |
| **Priority** | P2 |
| **Acceptance Criteria** | Bookmarking a question, then later merging a duplicate question record, preserves a valid (re-pointed) bookmark. |

### 8.20 Notes

| Field | Specification |
|---|---|
| **Purpose** | Student-authored notes attachable to concepts, questions, or PDF passages. |
| **Inputs** | Free text (and optionally formula/markdown formatting) from the student. |
| **Outputs** | Concept/question/passage-linked notes, searchable. |
| **Dependencies** | Search, Knowledge Base linkage. |
| **Failure Cases** | Note loss due to unsynced local edit conflict (two devices editing the same note offline). |
| **Validation Rules** | Conflicting concurrent edits must be surfaced for manual merge, never silently overwritten (ties to Sync Engine §8.28). |
| **Business Rules** | Notes are private, student-authored content; never auto-modified by AI subsystems. |
| **Priority** | P1 |
| **Acceptance Criteria** | Editing the same note offline on two devices, then syncing both, presents a conflict resolution prompt rather than silently discarding one version. |

### 8.21 Search

| Field | Specification |
|---|---|
| **Purpose** | Fast retrieval across Knowledge Base, Question Bank, Notes, and PDFs by keyword and semantic similarity. |
| **Inputs** | Query text. |
| **Outputs** | Ranked, source-labeled results (concept / question / note / PDF passage). |
| **Dependencies** | Semantic Indexing (§8.30), Knowledge Base, Question Bank, Notes. |
| **Failure Cases** | Stale index after new ingestion (search returns outdated result set); ambiguous queries returning irrelevant top results. |
| **Validation Rules** | Index update must be triggered synchronously (or near-synchronously, within a defined SLA) on any new/edited content commit. |
| **Business Rules** | Search must work fully offline against the local index; semantic (embedding-based) search may degrade to keyword-only offline if the embedding model requires network, but this degradation must be explicit to the student. |
| **Priority** | P1 |
| **Acceptance Criteria** | Search meets performance targets (§9.2); a newly ingested PDF's content is searchable within the defined index-update SLA. |

### 8.22 Analytics

(Cross-reference: detailed in §8.33.)

| Field | Specification |
|---|---|
| **Purpose** | Aggregate and surface trends across mastery, time, accuracy, and readiness. |
| **Inputs** | Mastery Tracking, Mock Test results, Study Planner activity logs. |
| **Outputs** | Dashboards/reports consumed by Dashboard and AI Mentor. |
| **Dependencies** | All practice-generating subsystems. |
| **Failure Cases** | See §8.33. |
| **Validation Rules** | See §8.33. |
| **Business Rules** | See §8.33. |
| **Priority** | P0 |
| **Acceptance Criteria** | See §8.33. |

### 8.23 Notifications

| Field | Specification |
|---|---|
| **Purpose** | Timely, relevant alerts: due revisions, plan deviations, AI Mentor recommendations, mock test reminders. |
| **Inputs** | Triggers from Revision Engine, AI Mentor, Study Planner. |
| **Outputs** | In-app and (optionally) system-level notifications. |
| **Dependencies** | AI Mentor, Revision Engine, Study Planner. |
| **Failure Cases** | Notification fatigue from over-triggering; missed critical notifications (e.g., large overdue backlog) due to under-triggering or dedup logic being too aggressive. |
| **Validation Rules** | Notification frequency must be rate-limited per category with student-configurable thresholds (Settings). |
| **Business Rules** | Overdue-revision and exam-proximity notifications are never fully disabled below a minimum floor (student may reduce frequency but not silence entirely) — this is a deliberate guardrail against the student disabling the exact signal most useful under time pressure; the student can override this in Settings with an explicit confirmation step. |
| **Priority** | P1 |
| **Acceptance Criteria** | Configuring notification frequency to "minimal" still surfaces a critical overdue-revision alert within the defined floor interval. |

### 8.24 Settings

| Field | Specification |
|---|---|
| **Purpose** | Central configuration for notification preferences, study-hour availability, accessibility options, sync/offline behavior, and data export. |
| **Inputs** | Student configuration choices. |
| **Outputs** | Configuration object read by dependent subsystems. |
| **Dependencies** | Every configurable subsystem. |
| **Failure Cases** | Setting change not propagated to a dependent subsystem until restart (must be avoided — settings should apply live where feasible). |
| **Validation Rules** | Out-of-range values (e.g., 0 study hours/day) are rejected with guidance, not silently clamped. |
| **Business Rules** | Destructive settings actions (e.g., disabling backups) require explicit confirmation with consequence explained in-line. |
| **Priority** | P1 |
| **Acceptance Criteria** | Changing study-hour availability immediately affects the next Study Planner regeneration without requiring app restart. |

### 8.25 Backup & Restore

| Field | Specification |
|---|---|
| **Purpose** | Guarantee the student can never permanently lose months of study data (ties directly to BG-4). |
| **Inputs** | Full local data state (profile, mastery, notes, mistake notebook, ingested content index). |
| **Outputs** | Portable backup artifact; restore operation reconstructing full state. |
| **Dependencies** | All data-owning subsystems. |
| **Failure Cases** | Partial/corrupted backup; restore that silently loses recent unsynced changes; backup taken mid-write producing an inconsistent snapshot. |
| **Validation Rules** | Backups must be taken from a consistent snapshot point (no partial-write states); every backup must be verifiable (integrity check) before being considered valid. |
| **Business Rules** | Automatic backups run on a defined schedule **and** the student can trigger manual backups before high-risk operations (e.g., before a bulk PDF re-ingest). |
| **Priority** | P0 |
| **Acceptance Criteria** | A restore from a verified backup reproduces mastery scores, mistake notebook state, and notes byte-for-byte equivalent to the backup point; a corrupted backup is detected and rejected at restore time, not silently applied. |

### 8.26 Offline Mode

| Field | Specification |
|---|---|
| **Purpose** | Full core study functionality (practice, revision, mock tests, AI Tutor against cached content, notes) without network connectivity. |
| **Inputs** | Locally cached Knowledge Base, Question Bank, Concept Graph, and (where feasible) a local/on-device AI capability or clearly degraded AI Tutor behavior. |
| **Outputs** | Fully functional local session state queued for sync. |
| **Dependencies** | Sync Engine, local storage layer. |
| **Failure Cases** | AI Tutor/Mentor features that hard-require network must fail gracefully with a clear "requires connectivity" state, never a silent hang or crash. |
| **Validation Rules** | Every core study action (practice, mock test, revision, note-taking) must be verified functional with network disabled. |
| **Business Rules** | Offline actions are never lost — they are queued and reconciled by Sync Engine, never discarded. |
| **Priority** | P0 |
| **Acceptance Criteria** | A full offline study session (practice set + mock test + notes) survives an app restart while offline and syncs correctly once connectivity returns. |

### 8.27 Sync Engine

| Field | Specification |
|---|---|
| **Purpose** | Reconcile state changes made across devices and offline sessions into a single consistent source of truth. |
| **Inputs** | Local change logs from each device/session. |
| **Outputs** | Reconciled canonical state, conflict-resolution prompts where automatic merge is unsafe. |
| **Dependencies** | Offline Mode, Notes, Mastery Tracking, Revision Engine (interval recalculation post-sync). |
| **Failure Cases** | Interrupted Sync (see §9.6); conflicting edits merged incorrectly (data corruption); sync loop re-applying already-applied changes (double-counting a mock test score, for example). |
| **Validation Rules** | Every synced event must be idempotent (safe to reapply) and carry a stable identifier to prevent double-application. |
| **Business Rules** | Conflicts that cannot be safely auto-merged (e.g., simultaneous note edits) are surfaced to the student; conflicts that can be safely merged (e.g., two devices logging different completed practice items) are merged automatically as a union, never as a last-write-wins overwrite of study history. |
| **Priority** | P0 |
| **Acceptance Criteria** | Completing different practice sets offline on two devices, then syncing both, results in both sets of results being present (union), not one overwriting the other; an interrupted sync resumes cleanly without data duplication or loss. |

### 8.28 (Reserved — Cross-cutting Sync/Offline validation covered above)

*Note: Sections 8.26–8.27 jointly satisfy the "Offline Mode" and "Sync Engine" subsystems listed in the PRD; no additional subsystem is defined here to avoid redundant/overlapping specification.*

---

## 8.29 AI Engine Requirements (Cross-Subsystem)

These requirements govern the AI/ML behavior underlying AI Tutor, AI Mentor, Adaptive Learning Engine, and Revision Engine collectively.

| ID | Capability | Requirement |
|---|---|---|
| AI-001 | Concept Understanding | The System must represent each concept with enough structure (definition, prerequisites, common misconceptions, linked formulas) that explanations can be grounded rather than generated from unstructured model memory alone. |
| AI-002 | Adaptive Learning | Practice item selection must weight: (a) mastery gap, (b) time-since-last-review, (c) prerequisite readiness, (d) exam proximity (higher-yield topics weighted up as exam date nears). |
| AI-003 | Weakness Detection | A concept is flagged "weak" when recent accuracy on tagged questions falls below a configurable threshold over a rolling window (not a single data point), to avoid false positives from one bad session. |
| AI-004 | Mastery Tracking | Mastery is modeled as a continuous score per concept (not binary mastered/unmastered), updated via a decay-aware model that reduces confidence over time without practice. |
| AI-005 | Learning Path Generation | Paths must be generated as prerequisite-respecting topological orderings of the Concept Graph, weighted by mastery gap and exam-yield. |
| AI-006 | Question Recommendation | Recommended questions must match the target concept's current difficulty band for the student (see AI-009), not a fixed global difficulty. |
| AI-007 | Revision Scheduling | Spaced repetition intervals must adjust per-item based on recall success/failure history (e.g., SM-2-style or equivalent adaptive interval algorithm), not fixed intervals identical across all content. |
| AI-008 | Confidence Tracking | Where the student self-reports confidence (e.g., "I was sure" vs. "guessed"), the System must track confidence-vs-accuracy calibration per concept and surface miscalibration (EG-5). |
| AI-009 | Difficulty Adjustment | Question difficulty must be modeled per-question (from Question System, §8.31) and matched against a per-concept, per-student ability estimate — not a single global difficulty label applied uniformly. |
| AI-010 | Prerequisite Detection | When ingesting new content or defining new concept nodes, the System should propose candidate prerequisite edges (from co-occurrence/reference patterns in source material) for student/maintainer confirmation, not auto-commit unverified edges. |
| AI-011 | Concept Dependency Engine | Maintains the validated DAG (Concept Graph, §8.8) and exposes a query interface: "what must be mastered before concept X" and "what does mastering X unlock." |
| AI-012 | Error Classification | Every incorrect answer must be classified into at least one category (conceptual gap, careless/silly mistake, time-pressure, misread question, formula error) — inferred from available signal (time spent, answer pattern, or student self-tag) and used to differentiate remediation strategy. |
| AI-013 | Retrieval Practice | The System must default to active-recall formats (answer-then-reveal, not read-then-acknowledge) for revision content wherever the content type supports it (EG-2). |
| AI-014 | Interleaved Practice | Practice sets generated by the Adaptive Engine should mix concepts/topics rather than pure blocked practice by default, configurable if the student prefers blocked practice for a specific weak area. |
| AI-015 | Spaced Repetition | See AI-007; additionally, the algorithm's parameters must be inspectable (not a total black box) so the Learning Scientist/maintainer can validate its behavior against known spaced-repetition research. |
| AI-016 | Explainability | Every AI Mentor recommendation and every Adaptive Engine question selection must be traceable to the specific inputs that produced it, retrievable by the student on request ("why this question?"). |

### 8.29.1 Hard Gating Rule (Non-Negotiable)

> **The Adaptive Learning Engine and Study Planner must never advance the student to an advanced concept before its prerequisite concept(s) reach the required mastery threshold**, as defined by the Concept Graph and a configurable mastery threshold (default: 70% mastery score, tunable in Settings by an advanced/maintainer mode only, not casually by the student mid-panic before an exam).

This is enforced as a **hard constraint** at the point of plan generation and question recommendation, not a soft-scored preference. Any subsystem proposing to violate this rule (e.g., "show me advanced content anyway") must route through an explicit student override action that is logged, not a default path.

**Acceptance Criteria:** Given a concept graph edge `Integration by Parts → depends on → Basic Integration` where Basic Integration mastery is 40% (below the 70% threshold), the Planner and Adaptive Engine must not surface Integration by Parts as a recommended new-study item; an explicit "study anyway" override is available but requires a distinct confirmation action and is logged in Analytics as an override event.

---

## 8.30 PDF Requirements (Detailed)

| ID | Capability | Requirement |
|---|---|---|
| PDF-001 | Supported Sources | JELET PYQs, JEE Main PYQs, Mathematics/Physics/Chemistry/Engineering-subject textbooks, personal notes (typed or scanned). |
| PDF-002 | OCR | Per §8.11; confidence-scored, low-confidence flagged for review. |
| PDF-003 | Text Extraction | Digital-native (non-scanned) PDFs must extract text directly (no OCR pass needed) for accuracy and performance; the pipeline must auto-detect which extraction path a given PDF/page needs. |
| PDF-004 | Formula Extraction | Mathematical notation extracted into a structured representation (e.g., LaTeX-equivalent) feeding the Formula Library, distinct from plain OCR text. |
| PDF-005 | Diagram Detection | Diagrams/figures (circuit diagrams, graphs, geometric figures) must be detected and preserved as linked image assets attached to the relevant question/concept, not lost or flattened into unusable OCR text. |
| PDF-006 | Chapter Detection | Structural detection of chapter/unit boundaries from headings/formatting cues, feeding Concept Graph tagging. |
| PDF-007 | Topic Detection | Finer-grained than chapter detection; maps content sections to specific Concept Graph nodes. |
| PDF-008 | Semantic Indexing | Ingested content is embedded/indexed for semantic search (§8.21), in addition to keyword indexing. |
| PDF-009 | Citation Support | Every Knowledge Base/Formula Library entry retains a pointer (document, page, region) back to its source PDF, enabling AI Tutor to cite sources (§8.4). |
| PDF-010 | Duplicate Detection | Near-duplicate content across multiple uploaded PDFs (e.g., same PYQ appearing in two compilation books) must be detected and flagged, with the student choosing which to treat as canonical rather than the System silently picking one. |
| PDF-011 | Version Tracking | Re-uploading a corrected/updated version of a previously ingested PDF must be tracked as a new version linked to the prior one, preserving history rather than creating an unrelated duplicate. |
| PDF-012 | Resumable Pipeline | Each pipeline stage (OCR → extraction → detection → indexing) is independently resumable; a failure at any stage does not require re-running successful prior stages. |

**Acceptance Criteria (subsystem-level):** Ingesting a 300-page scanned PYQ compilation completes with a per-page status report (success / low-confidence / failed); at least the chapter and topic structure is correctly detected for a defined accuracy benchmark on a test set; a duplicate PYQ uploaded in a second compilation is flagged before being added to the active Question Bank pool.

---

## 8.31 Question System Requirements (Detailed)

| ID | Capability | Requirement |
|---|---|---|
| QS-001 | Question Tagging | Every question must be tagged with subject, chapter, topic, and one-or-more Concept Graph node IDs before being eligible for adaptive selection or mock inclusion. |
| QS-002 | Difficulty Estimation | Initial difficulty estimated from source metadata (e.g., historical PYQ performance data if available) or heuristics (question length, concept depth), then refined over time using actual student performance — but see QS-009 below on per-student vs. global difficulty. |
| QS-003 | Concept Mapping | Many-to-many mapping between questions and concepts (a question may require multiple concepts). |
| QS-004 | Formula Mapping | Questions link to the specific Formula Library entries they require. |
| QS-005 | Estimated Solve Time | Per-question estimated solve time, used by Mock Test Engine for pacing analysis and by Study Planner for time-boxing practice sessions. |
| QS-006 | Learning Objective | Each question tagged with the specific skill/objective it assesses (e.g., "apply integration by parts to trigonometric integrands"), more granular than concept tagging alone. |
| QS-007 | Explanation Quality | Every question must have a verified solution/explanation before being eligible for the active pool; explanations extracted via OCR must be flagged for review like other OCR content. |
| QS-008 | Related Questions | Questions are linked to others sharing concept/objective tags, surfaced by AI Tutor ("similar solved example") and usable for building practice sets. |
| QS-009 | Alternative Solutions | Where multiple valid solution methods exist (common in JELET-style math/physics), the System should support recording more than one method, since exposing the student to alternative approaches supports transfer. |
| QS-010 | Question Versioning | Corrections to a question (e.g., a typo or an OCR fix) are versioned, preserving the ability to see what a student actually attempted historically (important — do not retroactively rewrite history the student's attempt data is tied to). |

**Note on difficulty modeling:** A single global "difficulty" label is necessary for content curation, but the Adaptive Engine (§8.29, AI-009) additionally maintains a **per-student ability-vs-item difficulty estimate**, since a diploma-holder student's effective difficulty on a given topic may diverge meaningfully from a generic 10+2 cohort baseline (§7).

**Acceptance Criteria:** A question missing a verified solution is excluded from mock-test assembly; editing a question's text creates a new version while preserving the original text associated with any prior student attempt records.

---

## 8.32 Mock Test Requirements (Detailed)

### 8.32.1 Supported Test Modes

| Mode | Description |
|---|---|
| Chapter Test | Single chapter, all difficulty levels |
| Topic Test | Single topic (finer than chapter) |
| Mixed Test | Multiple chapters/topics, student- or system-selected |
| Adaptive Test | Question difficulty adjusts in-session based on running performance |
| Weak Topic Test | Auto-assembled from currently flagged weak concepts (AI-003) |
| Speed Test | Compressed time-per-question, trains pacing |
| Formula Test | Formula recall/application focus, shorter format |
| PYQ Test | Assembled exclusively from tagged PYQ pool, filterable by year range |
| Full JELET Simulation | Exact official pattern: question count, time limit, negative marking, section structure |

### 8.32.2 Cross-Mode Requirements

| ID | Requirement |
|---|---|
| MT-001 | **Timer:** Every timed mode enforces a countdown; Full Simulation mode timer must exactly match official JELET timing. |
| MT-002 | **Auto Submit:** On timer expiry, the session auto-submits with whatever is answered; this must be reliable even if the app was backgrounded (mobile) — auto-submit logic must not depend on the app being in foreground at expiry. |
| MT-003 | **Review:** Post-test, every question is reviewable with the student's answer, correct answer, and full explanation (per QS-007). |
| MT-004 | **Performance Report:** Score, section-wise breakdown, and comparison against the student's own historical average for that test mode/topic. |
| MT-005 | **Topic Analysis:** Accuracy broken down per topic/concept within the test. |
| MT-006 | **Time Analysis:** Actual time spent per question vs. Estimated Solve Time (QS-005), flagging questions where excessive time was spent relative to estimate. |
| MT-007 | **Accuracy Analysis:** Accuracy trend across attempts of the same test mode over time, feeding Analytics. |
| MT-008 | **Negative Marking:** Configurable per mode; Full Simulation mode must default to and be locked to the current official JELET negative-marking scheme. |
| MT-009 | **Question Randomization:** Question order (and, where applicable, option order) randomized per session to avoid the student memorizing positional patterns rather than content. |
| MT-010 | **Resumability:** An interrupted test session (app crash, connectivity loss) must resume from the last saved answer state with the timer correctly reflecting elapsed real time, not reset. |

**Acceptance Criteria:** A Full JELET Simulation run with the app backgrounded through timer expiry still auto-submits correctly; a test interrupted mid-session and resumed shows the correct remaining time and all previously entered answers intact.

---

## 8.33 Analytics Requirements (Detailed)

| ID | Metric | Requirement |
|---|---|---|
| AN-001 | Concept Mastery | Per-concept mastery score (AI-004), viewable as a full syllabus heatmap. |
| AN-002 | Retention | Estimated retention per concept based on spaced-repetition recall history and decay model. |
| AN-003 | Study Hours | Logged actual study time vs. planned, per day/week/month. |
| AN-004 | Daily/Weekly/Monthly Progress | Rollups of concepts studied, practice volume, mock tests taken. |
| AN-005 | Learning Velocity | Rate of mastery gain over time, per subject, used to project whether syllabus completion is on pace for the exam date. |
| AN-006 | Accuracy | Overall and per-concept/per-topic accuracy trends. |
| AN-007 | Speed | Actual vs. estimated solve time trends (ties to MT-006). |
| AN-008 | Confidence | Confidence-vs-accuracy calibration trend (AI-008). |
| AN-009 | Mistake Types | Distribution of Error Classification categories (AI-012) over time — is the student mostly making conceptual errors, careless errors, or time-pressure errors, and is that shifting? |
| AN-010 | Revision Completion | Percentage of due spaced-repetition items actually completed on time vs. overdue. |
| AN-011 | Heatmaps | Visual heatmaps for mastery-by-topic and time-spent-by-topic. |
| AN-012 | Trend Analysis | Multi-week trend lines for the above metrics, not just point-in-time snapshots — single data points must never be presented without their trend context, to avoid the student over-reacting to one bad session. |
| AN-013 | Readiness Score | Composite score derived from: syllabus completion %, mastery-weighted by exam topic yield, recent mock test performance (weighted toward Full Simulation mode results), and pacing (time analysis). The composite formula must be documented and inspectable, not an opaque single number. |

**Validation Rules:** All analytics must be computed from the canonical post-sync state; any analytics view rendered from offline/pre-sync data must be explicitly labeled as provisional.

**Business Rules:** The Readiness Score (AN-013) is advisory and must never be presented without its contributing factors visible on request — a single unexplained number close to exam day could cause disproportionate anxiety or false confidence, either of which is harmful; explainability is a requirement, not a nicety, for this specific metric.

**Acceptance Criteria:** Given a mastery snapshot, syllabus completion percentage, and three prior Full Simulation mock scores, the Readiness Score is deterministically reproducible from documented inputs, and each contributing factor is individually inspectable.

---

## 9. Non-Functional Requirements

### 9.1 Reliability

| ID | Requirement |
|---|---|
| NFR-REL-001 | No user-visible data loss under any single-component failure (app crash, OS kill, network drop) — every write path must be crash-safe (write-ahead or equivalent durability strategy). |
| NFR-REL-002 | The System must recover to a consistent state after an unclean shutdown without manual intervention. |
| NFR-REL-003 | Sync conflicts are resolved per §8.27 rules (union-merge for compatible data, explicit prompt for incompatible data) — never silent data loss. |

### 9.2 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-PERF-001 | Search response time | Sub-300ms for keyword search against local index on typical study-session data volumes |
| NFR-PERF-002 | PDF page load (already-ingested) | Sub-500ms per page from local cache |
| NFR-PERF-003 | AI Tutor response (network available) | First token/response segment within a target latency budget (e.g., 2–4s) with a visible "thinking" state beyond that, never a silent freeze |
| NFR-PERF-004 | Dashboard cold load | Sub-1s from cached state |
| NFR-PERF-005 | Memory footprint | Bounded and profiled explicitly for sustained multi-hour study sessions on the student's actual device class — this is a single-device-class optimization target, not a broad device-matrix target, consistent with the single-user scope |
| NFR-PERF-006 | Sync reliability | Sync operations must be resumable and must not block core study functionality while in progress |

### 9.3 Offline Availability

Per §8.26 — restated here as a non-functional constraint: core study functionality (practice, revision, mock tests against cached question pool, notes, flashcards) must have zero hard dependency on network connectivity.

### 9.4 Accessibility

| ID | Requirement |
|---|---|
| A11Y-001 | Full keyboard navigability for all core flows (no mouse/touch-only interactions for essential tasks). |
| A11Y-002 | Dark mode as a first-class, fully-styled theme (not an inverted-color hack), given expected extended evening study sessions. |
| A11Y-003 | Typography must maintain readable contrast and scalable font sizing for sustained multi-hour reading sessions. |
| A11Y-004 | Responsive layout across the student's actual device set (desktop + mobile at minimum, per single-device-class scope). |
| A11Y-005 | Color must never be the sole encoding channel for meaning (e.g., mastery heatmaps must pair color with a numeric/textual value), supporting color-vision-deficient use and general clarity under low light. |

### 9.5 Security

| ID | Requirement |
|---|---|
| SEC-001 | All personal data, notes, study history, analytics, and uploaded PDFs must be encrypted at rest. |
| SEC-002 | API keys (e.g., for any external AI service used by AI Tutor/Mentor) must never be stored client-side in plaintext or embedded in distributable app code; they must be proxied through a controlled backend boundary. |
| SEC-003 | Authentication sessions must expire and require re-validation on a defined interval; session tokens must not be logged in plaintext anywhere (crash reports, logs). |
| SEC-004 | Backups (§8.25) must be encrypted with the same rigor as live data, not treated as a lower-security artifact. |
| SEC-005 | Even though this is a single-user system, the security posture must not assume a trusted network — all sync traffic must be transport-encrypted (TLS or equivalent) end to end. |
| SEC-006 | The single-profile constraint (§8.1, §10) must not be treated as a substitute for authentication — device loss/theft must not equal data compromise, per SEC-001. |

### 9.6 Error Handling

| Scenario | Required Behavior |
|---|---|
| Network Failure | Fall back to Offline Mode transparently; queue actions for Sync Engine; never block core study UI on a network call without a visible loading/offline state. |
| Corrupted PDF | Reject at ingestion with a specific, actionable error (not a generic failure); do not partially ingest a corrupted file into the Knowledge Base. |
| OCR Failure | Page-level failure is isolated — one bad page must not fail the entire document's ingestion; failed pages are queued for retry or manual text entry. |
| AI Timeout | Surface a clear timeout state with a retry option; never leave the student staring at an indefinite spinner; where feasible, fall back to a non-AI grounded answer (e.g., direct Knowledge Base lookup) rather than a bare failure. |
| Missing Files | If a referenced source PDF is missing (e.g., deleted outside the app, corrupted storage), dependent Knowledge Base/Formula Library entries remain accessible but are flagged "source unavailable," not deleted. |
| Duplicate Upload | Detected per PDF-010; student is prompted to choose canonical version, never silently auto-resolved in a way that could discard a corrected version. |
| Interrupted Sync | Resumable from last confirmed checkpoint; partial sync state is never presented as if it were fully reconciled. |
| Database Failure | Local database corruption triggers automatic fallback to the most recent verified backup checkpoint with the student explicitly informed of the recovery point, never a silent partial-data resume. |

### 9.7 Quality Attributes Summary

| Attribute | How It Is Addressed in This Document |
|---|---|
| Maintainability | Single-user scope removes multi-tenant complexity (§10); subsystem boundaries kept distinct (e.g., AI Tutor vs. AI Mentor, §8.4–8.5) to avoid responsibility blur. |
| Scalability | Deliberately *not* optimized for user-count scale; optimized instead for data-volume-per-user scale (years of study history, thousands of questions, hundreds of PDFs) — see §10 and §13. |
| Reliability | §9.1, §9.6. |
| Performance | §9.2. |
| Security | §9.5. |
| Usability | Dashboard-centric design (§8.3), explainable AI (AI-016, AN-013). |
| Observability | Every AI recommendation and analytics figure must be traceable to its inputs (AI-016, AN-013) — this doubles as both a trust requirement (§7) and an engineering observability requirement, since a maintainer must be able to debug "why did the System recommend X" the same way the student needs to understand it. |
| Testability | Every functional requirement above specifies concrete Acceptance Criteria; hard rules (e.g., prerequisite gating, §8.29.1) are stated as testable invariants, not aspirational guidance. |

---

## 10. System Constraints

| ID | Constraint | Rationale |
|---|---|---|
| CON-001 | Exactly one user profile; the System must actively reject creation of a second profile. | Single-user scope is a deliberate simplification, not an accidental limitation — relaxing it later is a scope change requiring re-review, not a silent capability to leave dormant. |
| CON-002 | No multi-tenant data isolation, load balancing, or horizontal scaling infrastructure is to be built. | Explicitly rejected per mission statement — building this would be wasted engineering effort against BG-3. |
| CON-003 | Device/performance targets are scoped to the student's actual device class, not a broad compatibility matrix. | Consistent with single-user optimization philosophy. |
| CON-004 | The System must operate within a maintenance budget sustainable by a single maintainer (or the student themself, if technically inclined). | BG-3. |
| CON-005 | No source code, database schema, or UI mockups are in scope for this document. | Explicit instruction; those artifacts are produced in a subsequent engineering phase referencing this SRS. |

---

## 11. Assumptions

| ID | Assumption | Impact if Invalid |
|---|---|---|
| ASM-001 | The student has access to at least one internet-connected device regularly (even if not constantly), sufficient for periodic sync and initial content ingestion. | If false, ingestion pipeline and AI-network-dependent features need a fully offline-capable redesign beyond current Offline Mode scope. |
| ASM-002 | The official JELET exam pattern (timing, negative marking, section structure) is knowable and stable enough to hard-code into Full Simulation mode, with periodic manual updates if the pattern changes. | If the pattern changes mid-preparation, Mock Test Engine configuration (not architecture) must be updated — this is treated as a config change, not a redesign. |
| ASM-003 | The student's diploma-level background means some standard 10+2 prerequisite assumptions in typical JELET material do not hold uniformly, justifying diagnostic (not assumed) prerequisite mastery per concept (§7). | If false (student's background is closer to standard), the System still functions correctly — diagnostic assessment is a superset behavior, not a narrower one. |
| ASM-004 | A single student's data volume (years of PDFs, thousands of questions, mastery history) fits comfortably within local-device and lightweight backend storage without specialized big-data infrastructure. | If false, storage/indexing architecture would need revisiting, though this is unlikely given known JELET syllabus scope. |
| ASM-005 | Some form of AI/LLM capability (local or networked) is available to power AI Tutor/Mentor; full functionality is not guaranteed on a fully air-gapped device. | Offline Mode's AI degradation behavior (§8.26) already accounts for this; a fully local model is a future scalability consideration (§13), not a current requirement. |

---

## 12. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RISK-001 | OCR/extraction quality on poor-quality scanned PYQ compilations is low, corrupting downstream Knowledge Base/Question Bank quality. | Medium | High | Confidence-scored flagging (§8.11) and mandatory review queue before content enters the "trusted/active" pool. |
| RISK-002 | AI hallucination in AI Tutor undermines trust and could teach incorrect concepts under exam pressure. | Medium | High | Hard grounding requirement (AI-Tutor validation rules, §8.4) — every factual/formula claim must trace to Concept Graph/Knowledge Base/PDF citation. |
| RISK-003 | Prerequisite gating (§8.29.1) is too rigid and frustrates the student in a genuine edge case (e.g., they actually do know a concept but it's untested in-System). | Low–Medium | Medium | Explicit, logged override path exists; override events are visible in Analytics for later review, keeping the System honest about how often gating is being bypassed. |
| RISK-004 | Sync conflicts silently corrupt mastery/analytics history, undermining every downstream recommendation (compounding risk given BG-4/EG-3). | Low | High | Union-merge-by-default + explicit conflict prompts only where unsafe (§8.27); idempotent, ID-stamped sync events. |
| RISK-005 | Single-maintainer operational model means a critical bug during peak exam-prep weeks has no backup responder. | Medium | High | Emphasis on reliability/error-handling requirements (§9.1, §9.6) reduces the *frequency* of situations requiring urgent manual intervention; backup/restore (§8.25) bounds the *severity* of any data-related incident. |
| RISK-006 | Readiness Score (AN-013) is misinterpreted by the student as more precise/authoritative than it is, causing miscalibrated confidence close to exam day. | Medium | Medium | Mandatory factor-breakdown visibility (§8.33 business rules) rather than a bare number. |
| RISK-007 | JELET exam pattern changes between now and 2027 without the System being updated in time. | Low | Medium | Mock Test Engine pattern parameters are treated as externally-configurable data, not hard-coded logic (ties to ASM-002), enabling fast updates. |

---

## 13. Future Scalability

Although horizontal/multi-user scaling is explicitly out of scope (§5.2, §10), the architecture should not preclude the following possible future directions, which should inform interface boundaries even if not implemented now:

- **Additional exam targets:** If the student (or a future user) needs to prepare for a different exam, the Concept Graph, Question Bank, and Mock Test Engine should be structured so that syllabus/pattern configuration is data, not hard-coded logic — minimizing rework.
- **On-device/local AI capability:** To reduce the offline-AI degradation described in §8.26 and ASM-005, a future iteration could incorporate a local model for at least basic AI Tutor grounding, reducing network dependency further.
- **Multi-user support (post-JELET):** Should the System ever be generalized beyond this one student, the current single-profile constraint (CON-001) should be an isolated, well-bounded assumption in the data model (e.g., a profile identifier that is currently always constant) rather than deeply hard-coded — this reduces, without requiring now, the cost of a future multi-user migration.
- **Expanded content types:** Video or audio content ingestion is not currently in scope but the Knowledge Base's concept-addressable design (§8.7) should not structurally assume PDF-only sourcing.

These are documented as forward-looking architectural awareness, not current requirements — no engineering effort should be spent building unused generality today (this would directly conflict with BG-3 and CON-002).

---

## 14. Acceptance Criteria (System-Level)

The System is considered to meet this SRS when, at minimum:

1. **AC-1:** A single profile can be created, used across at least two devices via Sync Engine, and fully restored from backup with zero data loss, including offline-generated data.
2. **AC-2:** A representative set of PYQ PDFs (mixed digital-native and scanned) can be ingested end-to-end into a tagged, searchable Question Bank and Knowledge Base, with low-confidence extractions correctly flagged rather than silently trusted.
3. **AC-3:** The Adaptive Learning Engine and Study Planner never recommend an advanced concept ahead of an under-threshold prerequisite, verified against the hard gating rule (§8.29.1), except via a logged explicit override.
4. **AC-4:** AI Tutor explanations are grounded and citable to Concept Graph/Knowledge Base/PDF sources for a defined test set of queries, with no unsourced factual claims on core syllabus content.
5. **AC-5:** A Full JELET Simulation mock test correctly enforces official timing and negative marking, auto-submits reliably on timer expiry (including backgrounded-app scenarios), and produces a performance report with topic, time, and accuracy analysis.
6. **AC-6:** Revision Engine correctly prioritizes overdue spaced-repetition items over new content in the Study Planner's generated plan, in a directly verifiable trace.
7. **AC-7:** The Readiness Score is reproducible from documented inputs and its contributing factors are inspectable by the student on request.
8. **AC-8:** All core study functionality (practice, revision, mock tests against cached content, notes, flashcards) functions fully with network connectivity disabled, and reconciles correctly on reconnection with no data loss, verified specifically for concurrent-offline-edit scenarios (§8.27).
9. **AC-9:** All data at rest (personal data, notes, study history, analytics, PDFs, API keys, session tokens) meets the encryption and handling requirements of §9.5 with no exceptions found in a security review pass.
10. **AC-10:** Every error scenario enumerated in §9.6 has been deliberately induced in testing and produces the specified required behavior, not a crash or silent failure.

---

## Appendix A — Glossary

Precise, shared vocabulary matters here more than in a typical multi-team project, since a single small engineering team (or one maintainer) will be moving between subsystems constantly. Ambiguous terms are the most common source of silent spec drift.

| Term | Definition |
|---|---|
| **Concept Graph** | The directed acyclic graph (DAG) of syllabus concepts and their prerequisite ("depends-on") edges. Single source of truth for sequencing (§8.8). |
| **Mastery Score** | A continuous (not binary) per-concept score reflecting the student's current estimated command of that concept, decay-adjusted over time without practice (AI-004). |
| **Mastery Threshold** | The configurable mastery score (default 70%) a prerequisite concept must reach before a dependent concept becomes eligible for standard scheduling (§8.29.1). |
| **Readiness Score** | The composite, documented, and factor-inspectable estimate of exam preparedness (AN-013). Never presented without its contributing factors. |
| **Eligible Pool** | The subset of the Question Bank that has passed tagging and solution-verification (QS-001, QS-007) and is therefore usable by the Adaptive Engine and Mock Test Engine. Untagged/unverified questions are quarantined outside this pool. |
| **Due Item** | Any Revision Engine or Flashcard item whose spaced-repetition interval has elapsed and requires review; "overdue" means past-due beyond the scheduled date. |
| **Canonical Version** | The version of a duplicate/near-duplicate PDF or question record that the student has designated as authoritative after a Duplicate Detection flag (PDF-010). |
| **Grounded Explanation** | An AI Tutor output where every factual/formula claim traces to a specific Concept Graph node, Knowledge Base entry, Formula Library entry, or cited PDF passage — as opposed to unsourced generation from model memory. |
| **Override Event** | A logged, explicit student action that bypasses the hard prerequisite-gating rule (§8.29.1) for a specific study session. Always visible in Analytics. |
| **Union-Merge** | The Sync Engine's default conflict-resolution strategy for compatible concurrent data (e.g., two devices logging different completed practice items): both are kept, neither overwrites the other. |
| **Provisional Analytics** | Any analytics view computed from pre-sync/offline data, explicitly labeled as such until reconciled into canonical post-sync state. |

---

## Appendix B — Requirements Traceability Matrix

Maps each Business Goal (§3) and Educational Goal (§4) to the primary requirement IDs/subsystems that satisfy it, so that removing or descoping a subsystem later has a visible, checkable blast radius.

| Goal | Primary Satisfying Requirements |
|---|---|
| **BG-1** (Maximize probability of clearing JELET 2027) | AI-002, AI-005, §8.29.1 (gating), §8.32 (Mock Test Engine), AN-013 (Readiness Score) |
| **BG-2** (Minimize wasted study time) | AI-003 (Weakness Detection), AI-006/AI-009 (targeted difficulty), §8.6 (Study Planner time-fit), AN-005 (Learning Velocity) |
| **BG-3** (Single-maintainer operability) | §10 (Constraints, CON-001–CON-004), §9.7 (Maintainability) |
| **BG-4** (Zero tolerance for data loss) | §8.25 (Backup & Restore), §8.27 (Sync Engine), NFR-REL-001–003 |
| **BG-5** (Usable with unreliable internet) | §8.26 (Offline Mode), §8.27 (Sync Engine), NFR-PERF-006 |
| **EG-1** (Prerequisite-first learning) | §8.29.1 (hard gating rule), AI-005, AI-011 (Concept Dependency Engine) |
| **EG-2** (Retrieval over passive review) | AI-013 (Retrieval Practice), §8.18 (Flashcards) |
| **EG-3** (Individualized spaced repetition) | AI-007/AI-015, §8.16 (Revision Engine) |
| **EG-4** (Diagnose *why* a question was missed) | AI-012 (Error Classification), §8.17 (Mistake Notebook) |
| **EG-5** (Confidence calibration) | AI-008, AN-008 |
| **EG-6** (Real exam-constraint simulation) | §8.32 (Mock Test Engine, esp. Full JELET Simulation mode, MT-001/MT-008) |

Any future change request that proposes removing or simplifying a subsystem listed above should be checked against this table before approval, to confirm which top-level goal(s) would be affected.

---

*End of Software Requirements Specification.*
