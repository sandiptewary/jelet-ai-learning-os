# JELET AI Learning Operating System — Database Architecture

**Document Type:** Production Database Design Specification
**Target Engine:** PostgreSQL 15+
**Scope:** Single-student production system (JELET 2027), architected for future multi-exam (JEE Main, JEE Advanced, WBJEE, GATE, NEET) and multi-student expansion
**Author Role:** Principal Database Architect / Data Platform Engineer
**Status:** Implementation-ready (no SQL/DDL — logical + physical design only)

---

## v2 Revision Log

This document was revised after a self-critique pass. Five weaknesses identified in v1 were fixed rather than just flagged:

| # | Issue in v1 | Fix in v2 | Where |
|---|---|---|---|
| 1 | `study_plan_items` and `revision_schedule_items` overlapped — two tables answering "what's scheduled today" | Merged into one `planned_activities` table with a `source` discriminator | §3.8 |
| 2 | `user_roles` table added multi-role complexity no single-user system needs | Removed; `users.account_type` covers it until real multi-role RBAC is needed | §3.1 |
| 3 | Soft-references (`entity_type`/`entity_id`) validated only at the application layer — no DB-level enforcement | Added a shared trigger-function pattern (`fn_validate_entity_reference`) enforced at commit time, with the nightly job kept only as a backstop | §7.8 |
| 4 | `concept_mastery` recomputation was described only as "asynchronous," with no actual formula | Specified a concrete recency-weighted, difficulty-weighted formula with explicit thresholds | §7.2 |
| 5 | JSONB used in several places without a stated rule for when that's appropriate | Added an explicit JSONB usage policy (3 conditions) so future columns follow a consistent rule | §5 |

Table count: **105 → 101** (net −3: −1 `user_roles`, −4 old planning tables +1 `planned_activities`).

---

## 0. Design Principles

1. **Single-user today, multi-tenant tomorrow.** Every user-scoped table carries `user_id` from day one, even though exactly one row exists in `users` initially. This avoids a painful re-key migration when the platform opens to more students.
2. **Multi-exam by construction.** Curriculum, questions, and mastery are modeled against an `exams` taxonomy (JELET, JEE Main, JEE Advanced, WBJEE, GATE, NEET) rather than hard-coded to JELET. A single concept (e.g., "Thevenin's Theorem") can be tagged relevant to multiple exams without duplication.
3. **UUID primary keys everywhere.** Enables offline-first ID generation on the client (mobile/desktop app) before sync, avoids central sequence contention, and prevents ID collisions when merging offline-created rows (mistake notebook entries, flashcards, notes) back into the server.
4. **Append-only history where mastery/state changes over time.** Mastery, confidence, retention, and revision are *time-series* concepts — the design stores snapshots/logs, not just a single mutable "current mastery" column, so the AI system can learn from trajectories.
5. **Separation of authored content vs. attempt/interaction data.** Question banks, formulas, and curriculum are "content" tables (slowly changing, versioned). Attempts, answers, sessions, and AI conversations are "event" tables (append-only, partitionable by time).
6. **Soft delete + tombstones for sync-critical tables.** Any table a user can edit offline (notes, flashcards, mistakes, bookmarks) uses `is_deleted` + `deleted_at` rather than hard deletes, so offline sync can propagate deletions safely without foreign-key orphaning.
7. **Normalized to 3NF/BCNF by default; selectively denormalized for analytics.** OLTP tables are normalized. Analytics domain intentionally stores pre-aggregated snapshots (daily/weekly/monthly) as a deliberate denormalization for read performance — documented in the Normalization Strategy section.
8. **Polymorphic associations avoided in favor of explicit join tables.** Instead of a single generic `attachable_type/attachable_id` pattern, the design uses explicit link tables (`note_links`, `question_topics`, etc.) to preserve full referential integrity — PostgreSQL foreign keys cannot enforce polymorphic references safely.

---
## 1. Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Tables | `snake_case`, plural noun | `mock_tests`, `question_versions` |
| Columns | `snake_case`, singular | `mastery_score`, `created_at` |
| Primary key | `<singular_table>_id` (UUID) | `question_id`, `user_id` |
| Foreign key | same name as referenced PK | `chapter_id` referencing `chapters.chapter_id` |
| Join / link tables | `<table_a>_<table_b>` alphabetically or semantically named | `question_topics`, `flashcard_review_log` |
| Boolean columns | `is_<state>` / `has_<state>` | `is_deleted`, `has_diagram` |
| Timestamp columns | `<verb>_at`, always `TIMESTAMPTZ` | `created_at`, `attempted_at`, `synced_at` |
| Enums / lookup-backed fields | `<name>_type`, `<name>_status`, `<name>_level` | `question_type`, `attempt_status`, `difficulty_level` |
| Indexes | `idx_<table>_<column(s)>` | `idx_questions_chapter_id` |
| Unique constraints | `uq_<table>_<column(s)>` | `uq_users_email` |
| Foreign key constraints | `fk_<table>_<referenced_table>` | `fk_answers_questions` |
| Check constraints | `chk_<table>_<rule>` | `chk_questions_marks_positive` |

### Global Standard Columns (present on every table unless explicitly noted)

| Column | Type | Notes |
|---|---|---|
| `<table>_id` | `UUID DEFAULT gen_random_uuid()` | Primary key |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Row creation time |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Maintained via `BEFORE UPDATE` trigger |

### Sync-Capable Table Additions (offline-editable content: notes, flashcards, mistakes, bookmarks, study plans, settings)

| Column | Type | Notes |
|---|---|---|
| `is_deleted` | `BOOLEAN NOT NULL DEFAULT false` | Soft delete / tombstone |
| `deleted_at` | `TIMESTAMPTZ NULL` | Set when soft-deleted |
| `client_generated_id` | `UUID NULL` | Original offline-generated UUID, preserved even if server reconciles |
| `sync_version` | `INTEGER NOT NULL DEFAULT 1` | Optimistic concurrency / conflict detection |
| `last_synced_at` | `TIMESTAMPTZ NULL` | Last successful sync timestamp |
| `origin_device_id` | `UUID NULL` | FK → `user_devices.device_id` |

These additions are noted per-table below as **"+ Sync Columns"**.

---
## 2. Entity List (101 Tables, 15 Domains — v2, post-revision)

> **v2 change summary:** −1 `user_roles` (deferred as YAGNI, §3.1), −3 `study_plan_items`/`revision_schedule`/`revision_schedule_items` +1 unified `planned_activities` (§3.8) = net −3 tables from the original 105. See revision notes inline in §3.1, §3.8, §7.2, §7.8, §5 for the reasoning.

**A. Identity & Access (7):** users, user_profiles, auth_credentials, auth_sessions, auth_tokens, user_devices, audit_log

**B. Exam & Curriculum Taxonomy (10):** exams, exam_subjects, subjects, chapters, topics, subtopics, concepts, concept_prerequisites, concept_relations, syllabus_versions

**C. Learning Progress & Mastery (11):** learning_sessions, session_activities, chapter_mastery, concept_mastery, topic_mastery, confidence_scores, retention_scores, revision_history, learning_paths, learning_path_items, spaced_repetition_state

**D. Formula Library (4):** formulas, formula_derivations, formula_tags, formula_usage_examples

**E. Question Bank (16):** questions, question_versions, question_types, difficulty_levels, question_topics, question_concepts, question_formulas, solutions, solution_steps, alternative_solutions, hints, learning_objectives, question_learning_objectives, pyq_tags, question_sources, question_media

**F. Mock Test System (9):** mock_tests, mock_test_sections, mock_test_questions, test_attempts, attempt_answers, attempt_section_timing, attempt_question_timing, test_analytics_summary, test_review_notes

**G. Mistake Notebook / Flashcards / Notes / Bookmarks (8):** mistakes, mistake_tags, flashcards, flashcard_decks, flashcard_review_log, notes, note_links, bookmarks

**H. Study Plan & Revision (3):** study_plans, planned_activities, daily_study_goals

**I. Notifications (3):** notifications, notification_preferences, notification_delivery_log

**J. PDF / OCR / Semantic Search (10):** uploaded_pdfs, pdf_pages, ocr_results, extracted_text_blocks, extracted_formulas, extracted_diagrams, extracted_questions, semantic_embeddings, citations, pdf_processing_jobs

**K. AI System (8):** ai_conversations, ai_messages, ai_memory, ai_recommendations, weakness_detections, adaptive_learning_decisions, ai_study_planner_runs, ai_feedback

**L. Analytics (8):** daily_activity_summary, weekly_activity_summary, monthly_activity_summary, accuracy_metrics, speed_metrics, consistency_metrics, mastery_snapshots, retention_snapshots

**M. Settings (2):** user_settings, app_preferences

**N. Offline Sync (3):** sync_log, sync_conflicts, device_sync_state

---
## 3. Table Specifications

### 3.1 Domain A — Identity & Access

#### `users`
- **Purpose:** Root identity record. One row per student today; designed to scale to many.
- **PK:** `user_id` (UUID)
- **Columns:**

| Column | Type | Constraints |
|---|---|---|
| email | CITEXT | NOT NULL, UNIQUE (`uq_users_email`) |
| username | VARCHAR(50) | UNIQUE, NULL |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' — CHECK IN ('active','suspended','deleted') |
| account_type | VARCHAR(20) | NOT NULL DEFAULT 'student' — CHECK IN ('student','admin','parent_viewer') — future roles |
| email_verified_at | TIMESTAMPTZ | NULL |
| last_login_at | TIMESTAMPTZ | NULL |
| timezone | VARCHAR(50) | NOT NULL DEFAULT 'Asia/Kolkata' |
| locale | VARCHAR(10) | NOT NULL DEFAULT 'en-IN' |

- **Relationships:** Parent of virtually every user-scoped table via `user_id`.
- **Indexes:** `uq_users_email`; `idx_users_status`.
- **Validation:** Email format enforced at application layer + `CHECK` regex constraint; `status` transitions logged in `audit_log`.
- **Future Expansion:** Add `organization_id` when platform supports coaching institutes managing multiple students (multi-tenant B2B layer).

#### `user_profiles`
- **Purpose:** Extended personal/academic profile, separated from `users` to keep auth table lean and to allow independent update cadence.
- **PK:** `profile_id` (UUID)
- **Columns:** user_id UUID (FK, UNIQUE, NOT NULL) · full_name VARCHAR(150) NOT NULL · date_of_birth DATE NULL · target_exam_id UUID (FK → exams) · target_exam_year SMALLINT · current_class VARCHAR(20) NULL · school_or_college VARCHAR(200) NULL · phone_number VARCHAR(20) NULL · avatar_url TEXT NULL · bio TEXT NULL · onboarding_completed_at TIMESTAMPTZ NULL
- **Relationships:** 1:1 with `users`; FK → `exams.exam_id` (primary target exam).
- **Indexes:** `uq_user_profiles_user_id`; `idx_user_profiles_target_exam_id`.
- **Validation:** `target_exam_year` CHECK between 2025–2035; `date_of_birth` CHECK < current_date.
- **Future Expansion:** `secondary_target_exams` handled via a future `user_target_exams` M:N table once multi-exam prep is simultaneous.

#### `auth_credentials`
- **Purpose:** Stores password/security credentials separately from `users` for security-boundary isolation (different backup/encryption policy).
- **PK:** `credential_id` (UUID)
- **Columns:** user_id UUID (FK, UNIQUE, NOT NULL) · password_hash TEXT NOT NULL · password_algo VARCHAR(30) NOT NULL DEFAULT 'argon2id' · mfa_enabled BOOLEAN NOT NULL DEFAULT false · mfa_secret_encrypted TEXT NULL · failed_login_attempts SMALLINT NOT NULL DEFAULT 0 · locked_until TIMESTAMPTZ NULL · password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** 1:1 with `users`.
- **Indexes:** `uq_auth_credentials_user_id`.
- **Validation:** `password_hash` never stored/queried in plaintext logs; app-layer enforces min complexity pre-hash.
- **Future Expansion:** OAuth/SSO providers via new `auth_identity_providers` table (Google/Apple login) without touching this table.

#### `auth_sessions`
- **Purpose:** Active login sessions (web/mobile/desktop) for session management and forced logout.
- **PK:** `session_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · device_id UUID (FK → user_devices NULL) · issued_at TIMESTAMPTZ NOT NULL DEFAULT now() · expires_at TIMESTAMPTZ NOT NULL · revoked_at TIMESTAMPTZ NULL · ip_address INET NULL · user_agent TEXT NULL
- **Relationships:** Many sessions per user; FK → `user_devices`.
- **Indexes:** `idx_auth_sessions_user_id`; `idx_auth_sessions_expires_at` (for cleanup jobs).
- **Validation:** `expires_at` > `issued_at`.
- **Future Expansion:** Partition by month once session volume grows (multi-user phase).

#### `auth_tokens`
- **Purpose:** Refresh tokens, email-verification tokens, password-reset tokens — single table with `token_type` discriminator.
- **PK:** `token_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · token_type VARCHAR(20) NOT NULL CHECK IN ('refresh','email_verify','password_reset') · token_hash TEXT NOT NULL · expires_at TIMESTAMPTZ NOT NULL · used_at TIMESTAMPTZ NULL · revoked_at TIMESTAMPTZ NULL
- **Relationships:** Many per user.
- **Indexes:** `idx_auth_tokens_user_id_type`; `uq_auth_tokens_token_hash`.
- **Validation:** Token is single-use — `used_at` set atomically on redemption (SELECT ... FOR UPDATE).
- **Future Expansion:** None required; stable pattern.

#### `user_devices`
- **Purpose:** Registered devices for push notifications and offline-sync device tracking.
- **PK:** `device_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · device_name VARCHAR(100) NULL · platform VARCHAR(20) NOT NULL CHECK IN ('web','android','ios','desktop') · push_token TEXT NULL · last_active_at TIMESTAMPTZ NULL · is_trusted BOOLEAN NOT NULL DEFAULT true
- **Relationships:** Referenced by `auth_sessions`, `device_sync_state`, sync columns across offline-editable tables.
- **Indexes:** `idx_user_devices_user_id`.
- **Validation:** `platform` restricted to supported client set.
- **Future Expansion:** Add `app_version` for staged rollout targeting once app matures.

> **Revision note (v2):** v1 included a separate `user_roles` table (many-to-many roles-per-user with grant tracking) purely to future-proof for admin/parent-viewer/content-reviewer accounts. For a single-student system that table is pure YAGNI — it adds a join and a migration-proofing benefit nobody needs yet. `users.account_type` (already a single column, already CHECK-constrained to `'student'/'admin'/'parent_viewer'`) is sufficient for as long as each user has exactly one role. If true multi-role-per-user RBAC becomes necessary (e.g., one person is both a content reviewer and a parent-viewer across different students), `user_roles` can be added then — it's a pure *additive* migration (new table, backfill `account_type` into it, no existing table touched), so deferring it costs nothing later and simplifies the schema now.

#### `audit_log`
- **Purpose:** Immutable security/compliance trail of sensitive actions (login, password change, data export, account deletion).
- **PK:** `audit_id` (BIGSERIAL — sequential, high-volume append-only table; UUID unnecessary overhead here)
- **Columns:** user_id UUID (FK NULL — nullable for system actions) · action VARCHAR(60) NOT NULL · entity_type VARCHAR(60) NULL · entity_id UUID NULL · metadata JSONB NULL · ip_address INET NULL · occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** Loosely referential (entity_type/entity_id kept as soft-reference by design — audit logs must survive deletion of the referenced row).
- **Indexes:** `idx_audit_log_user_id_occurred_at`; `idx_audit_log_action`.
- **Validation:** Append-only — no UPDATE/DELETE grants at the application role level.
- **Future Expansion:** Partition by month; archive to cold storage after 24 months.

---
### 3.2 Domain B — Exam & Curriculum Taxonomy

#### `exams`
- **Purpose:** Master list of competitive exams the platform supports — the anchor for multi-exam future-proofing.
- **PK:** `exam_id` (UUID)
- **Columns:** exam_code VARCHAR(20) NOT NULL UNIQUE (e.g. 'JELET','JEE_MAIN','JEE_ADV','WBJEE','GATE','NEET') · exam_name VARCHAR(150) NOT NULL · exam_category VARCHAR(30) NOT NULL CHECK IN ('diploma_lateral_entry','engineering','medical','postgraduate') · conducting_body VARCHAR(150) NULL · description TEXT NULL · is_active BOOLEAN NOT NULL DEFAULT true
- **Relationships:** Referenced by `exam_subjects`, `user_profiles`, `pyq_tags`, `mock_tests`, `study_plans`.
- **Indexes:** `uq_exams_exam_code`.
- **Validation:** `exam_code` immutable once referenced elsewhere (app-layer rule).
- **Future Expansion:** This is the row that makes JEE Main/Advanced/WBJEE/GATE/NEET "just data" — adding an exam is an INSERT, not a migration.

#### `exam_subjects`
- **Purpose:** M:N mapping of which subjects belong to which exam, with per-exam weightage.
- **PK:** `exam_subject_id` (UUID)
- **Columns:** exam_id UUID (FK NOT NULL) · subject_id UUID (FK NOT NULL) · weightage_percent NUMERIC(5,2) NULL · is_compulsory BOOLEAN NOT NULL DEFAULT true
- **Relationships:** FK → `exams`, FK → `subjects`.
- **Indexes:** `uq_exam_subjects_exam_id_subject_id`.
- **Validation:** `weightage_percent` CHECK 0–100.
- **Future Expansion:** Add `syllabus_version_id` FK once per-year syllabus weighting is tracked.

#### `subjects`
- **Purpose:** Top-level subject (e.g., Mathematics, Physics, Electrical Technology, Basic Electronics).
- **PK:** `subject_id` (UUID)
- **Columns:** subject_name VARCHAR(100) NOT NULL · subject_code VARCHAR(20) NULL · description TEXT NULL · display_order SMALLINT NOT NULL DEFAULT 0 · is_active BOOLEAN NOT NULL DEFAULT true
- **Relationships:** Parent of `chapters`; linked to exams via `exam_subjects`.
- **Indexes:** `uq_subjects_subject_name`.
- **Validation:** Name uniqueness case-insensitive (CITEXT).
- **Future Expansion:** None — stable top-level node.

#### `chapters`
- **Purpose:** Chapter-level curriculum unit within a subject.
- **PK:** `chapter_id` (UUID)
- **Columns:** subject_id UUID (FK NOT NULL) · chapter_name VARCHAR(200) NOT NULL · chapter_number SMALLINT NULL · description TEXT NULL · estimated_hours NUMERIC(5,1) NULL · display_order SMALLINT NOT NULL DEFAULT 0 · is_active BOOLEAN NOT NULL DEFAULT true
- **Relationships:** FK → `subjects`; parent of `topics`; referenced by `chapter_mastery`.
- **Indexes:** `idx_chapters_subject_id`; `uq_chapters_subject_id_chapter_name`.
- **Validation:** `chapter_number` unique within subject (app-layer + partial unique index).
- **Future Expansion:** `chapter_id` can be shared across exams (e.g., "Rotational Mechanics" used by both JELET and JEE) — no duplication needed since chapters aren't exam-owned, only subject-owned; exam relevance is derived through `question_topics`/`concepts` tagging.

#### `topics`
- **Purpose:** Topic-level unit within a chapter.
- **PK:** `topic_id` (UUID)
- **Columns:** chapter_id UUID (FK NOT NULL) · topic_name VARCHAR(200) NOT NULL · description TEXT NULL · display_order SMALLINT NOT NULL DEFAULT 0 · is_active BOOLEAN NOT NULL DEFAULT true
- **Relationships:** FK → `chapters`; parent of `subtopics`; referenced widely (questions, mastery, notes).
- **Indexes:** `idx_topics_chapter_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `subtopics`
- **Purpose:** Finest curriculum granularity above the atomic "concept" node.
- **PK:** `subtopic_id` (UUID)
- **Columns:** topic_id UUID (FK NOT NULL) · subtopic_name VARCHAR(200) NOT NULL · description TEXT NULL · display_order SMALLINT NOT NULL DEFAULT 0
- **Relationships:** FK → `topics`; parent of `concepts`.
- **Indexes:** `idx_subtopics_topic_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `concepts`
- **Purpose:** Atomic, testable unit of knowledge — the node used by the mastery engine, knowledge graph, and AI weakness detection. This is the most important table in the learning domain.
- **PK:** `concept_id` (UUID)
- **Columns:** subtopic_id UUID (FK NOT NULL) · concept_name VARCHAR(250) NOT NULL · concept_summary TEXT NULL · difficulty_baseline VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK IN ('easy','medium','hard','advanced') · bloom_level VARCHAR(20) NULL CHECK IN ('remember','understand','apply','analyze','evaluate','create') · estimated_learning_minutes SMALLINT NULL · is_active BOOLEAN NOT NULL DEFAULT true
- **Relationships:** FK → `subtopics`; self-referential graph via `concept_prerequisites` and `concept_relations`; central to `concept_mastery`, `question_concepts`, `spaced_repetition_state`.
- **Indexes:** `idx_concepts_subtopic_id`; full-text search index `idx_concepts_name_trgm` (pg_trgm, for AI semantic lookup fallback).
- **Validation:** `concept_name` unique within subtopic.
- **Future Expansion:** Add `concept_id` cross-links to external open knowledge graphs (Wikidata) via a future `concept_external_refs` table.

#### `concept_prerequisites`
- **Purpose:** Directed edges expressing "must understand X before Y" — powers adaptive learning path sequencing.
- **PK:** `concept_prerequisite_id` (UUID)
- **Columns:** concept_id UUID (FK NOT NULL, the dependent concept) · prerequisite_concept_id UUID (FK NOT NULL, the required concept) · strength VARCHAR(20) NOT NULL DEFAULT 'required' CHECK IN ('required','recommended','helpful')
- **Relationships:** Self-referential M:N on `concepts`.
- **Indexes:** `uq_concept_prerequisites_pair`; `idx_concept_prerequisites_prerequisite_concept_id`.
- **Validation:** `CHECK (concept_id <> prerequisite_concept_id)`; cycle detection enforced at application layer (graph traversal on write) since PostgreSQL cannot natively prevent cycles in a self-referential edge table.
- **Future Expansion:** Weight edges numerically (0–1 confidence) once AI-derived prerequisite mining is introduced.

#### `concept_relations`
- **Purpose:** Generic non-hierarchical knowledge-graph edges (`related_to`, `contrasts_with`, `builds_on`, `analogous_to`) beyond strict prerequisites — this is the actual "Knowledge Graph References" requirement.
- **PK:** `concept_relation_id` (UUID)
- **Columns:** source_concept_id UUID (FK NOT NULL) · target_concept_id UUID (FK NOT NULL) · relation_type VARCHAR(30) NOT NULL CHECK IN ('related_to','contrasts_with','builds_on','analogous_to','applies_in') · weight NUMERIC(3,2) NULL CHECK (weight BETWEEN 0 AND 1) · created_by VARCHAR(20) NOT NULL DEFAULT 'system' CHECK IN ('system','ai_generated','manual')
- **Relationships:** Self-referential M:N on `concepts`.
- **Indexes:** `idx_concept_relations_source`; `idx_concept_relations_target`; `uq_concept_relations_triplet` (source, target, relation_type).
- **Validation:** `CHECK (source_concept_id <> target_concept_id)`.
- **Future Expansion:** This table is the seed for a full graph-database export (e.g., to Neo4j/Apache AGE) if graph-traversal queries become performance-critical at scale.

#### `syllabus_versions`
- **Purpose:** Tracks year-over-year syllabus changes per exam (exams revise syllabi periodically).
- **PK:** `syllabus_version_id` (UUID)
- **Columns:** exam_id UUID (FK NOT NULL) · version_year SMALLINT NOT NULL · effective_from DATE NOT NULL · effective_to DATE NULL · notes TEXT NULL
- **Relationships:** FK → `exams`.
- **Indexes:** `uq_syllabus_versions_exam_id_year`.
- **Validation:** `effective_to` NULL or > `effective_from`.
- **Future Expansion:** Link `chapters`/`topics` to `syllabus_version_id` via a future junction table if topics get added/removed across years (currently curriculum is treated as evergreen; this table exists so that future-year syllabus drift doesn't silently invalidate old mock tests).

---
### 3.3 Domain C — Learning Progress & Mastery

#### `learning_sessions`
- **Purpose:** One row per study session (a continuous block of learning activity — reading, AI tutoring, practice).
- **PK:** `session_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · session_type VARCHAR(30) NOT NULL CHECK IN ('reading','ai_tutoring','practice','revision','mock_test','flashcard_review') · started_at TIMESTAMPTZ NOT NULL · ended_at TIMESTAMPTZ NULL · primary_chapter_id UUID (FK → chapters NULL) · primary_concept_id UUID (FK → concepts NULL) · device_id UUID (FK → user_devices NULL) · total_duration_seconds INTEGER NULL
- **Relationships:** FK → `users`, `chapters`, `concepts`, `user_devices`; parent of `session_activities`.
- **Indexes:** `idx_learning_sessions_user_id_started_at`.
- **Validation:** `ended_at` >= `started_at` when present; `total_duration_seconds` recomputed on session close.
- **Future Expansion:** Partition by month once history grows large (append-only event table).

#### `session_activities`
- **Purpose:** Granular event log within a session (e.g., "viewed concept X", "asked AI a question", "solved problem Y") — feeds AI weakness detection and analytics.
- **PK:** `activity_id` (BIGSERIAL)
- **Columns:** session_id UUID (FK NOT NULL) · activity_type VARCHAR(40) NOT NULL · reference_type VARCHAR(30) NULL (e.g. 'concept','question','flashcard') · reference_id UUID NULL · occurred_at TIMESTAMPTZ NOT NULL DEFAULT now() · duration_seconds INTEGER NULL · metadata JSONB NULL
- **Relationships:** FK → `learning_sessions`. `reference_id` is a soft-reference (not FK-enforced) to keep this table generic across content types.
- **Indexes:** `idx_session_activities_session_id`; GIN index on `metadata`.
- **Validation:** `duration_seconds` >= 0.
- **Future Expansion:** High-volume table — candidate for time-based partitioning and eventual archival/rollup into `daily_activity_summary`.

#### `chapter_mastery`
- **Purpose:** Current aggregate mastery state per chapter (materialized rollup of concept mastery for fast dashboard reads).
- **PK:** `chapter_mastery_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · chapter_id UUID (FK NOT NULL) · mastery_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (mastery_score BETWEEN 0 AND 100) · mastery_level VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK IN ('not_started','beginner','developing','proficient','mastered') · last_practiced_at TIMESTAMPTZ NULL · last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`, `chapters`. Computed from `concept_mastery` (weighted average) via a scheduled recompute job or trigger.
- **Indexes:** `uq_chapter_mastery_user_id_chapter_id`.
- **Validation:** Recomputation logic documented in Data Integrity Rules §7.
- **Future Expansion:** None — deliberately kept as a fast-read materialized table.

#### `concept_mastery`
- **Purpose:** Source-of-truth current mastery for each concept per user — the core signal for adaptive learning.
- **PK:** `concept_mastery_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · concept_id UUID (FK NOT NULL) · mastery_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (0–100) · attempts_count INTEGER NOT NULL DEFAULT 0 · correct_count INTEGER NOT NULL DEFAULT 0 · last_attempt_at TIMESTAMPTZ NULL · first_learned_at TIMESTAMPTZ NULL · mastery_trend VARCHAR(15) NULL CHECK IN ('improving','stable','declining')
- **Relationships:** FK → `users`, `concepts`. Feeds `chapter_mastery`, `weakness_detections`, `spaced_repetition_state`.
- **Indexes:** `uq_concept_mastery_user_id_concept_id`; `idx_concept_mastery_mastery_score` (for weakness queries).
- **Validation:** `correct_count` <= `attempts_count`.
- **Future Expansion:** None.

#### `topic_mastery`
- **Purpose:** Mid-tier materialized rollup (between concept and chapter) for topic-level dashboards.
- **PK:** `topic_mastery_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · topic_id UUID (FK NOT NULL) · mastery_score NUMERIC(5,2) NOT NULL DEFAULT 0 · last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`, `topics`.
- **Indexes:** `uq_topic_mastery_user_id_topic_id`.
- **Validation:** Same recompute pattern as `chapter_mastery`.
- **Future Expansion:** None.

#### `confidence_scores`
- **Purpose:** Self-reported / AI-inferred confidence per concept — distinct from measured mastery (a student can be confident but wrong, or accurate but hesitant — both are pedagogically meaningful signals).
- **PK:** `confidence_score_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · concept_id UUID (FK NOT NULL) · confidence_value SMALLINT NOT NULL CHECK (BETWEEN 1 AND 5) · source VARCHAR(20) NOT NULL CHECK IN ('self_reported','ai_inferred') · recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`, `concepts`. Append-only time series.
- **Indexes:** `idx_confidence_scores_user_id_concept_id_recorded_at`.
- **Validation:** Standard.
- **Future Expansion:** Used by AI to detect the "confidently wrong" pattern (high confidence + low mastery) — a key weakness-detection signal.

#### `retention_scores`
- **Purpose:** Time-decayed memory-retention estimate per concept (forgetting-curve model), distinct from raw mastery.
- **PK:** `retention_score_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · concept_id UUID (FK NOT NULL) · retention_estimate NUMERIC(5,2) NOT NULL CHECK (0–100) · decay_model VARCHAR(20) NOT NULL DEFAULT 'sm2' · computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`, `concepts`.
- **Indexes:** `idx_retention_scores_user_id_concept_id_computed_at`.
- **Validation:** Standard.
- **Future Expansion:** Swap `decay_model` values as better forgetting-curve algorithms are introduced (e.g., FSRS) without schema change.

#### `revision_history`
- **Purpose:** Log of every revision event (what was revised, when, and the outcome) — distinct from the *schedule* (see Domain H).
- **PK:** `revision_history_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · concept_id UUID (FK NULL) · chapter_id UUID (FK NULL) · revised_at TIMESTAMPTZ NOT NULL DEFAULT now() · outcome VARCHAR(20) NOT NULL CHECK IN ('recalled','partially_recalled','forgotten') · time_spent_seconds INTEGER NULL
- **Relationships:** FK → `users`, `concepts`, `chapters`.
- **Indexes:** `idx_revision_history_user_id_revised_at`.
- **Validation:** At least one of `concept_id`/`chapter_id` NOT NULL.
- **Future Expansion:** None.

#### `learning_paths`
- **Purpose:** An ordered, personalized sequence of concepts/chapters the student should follow — either AI-generated or manually curated.
- **PK:** `learning_path_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · exam_id UUID (FK NOT NULL) · path_name VARCHAR(150) NOT NULL · generated_by VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK IN ('ai','manual') · status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK IN ('active','completed','archived') · target_completion_date DATE NULL
- **Relationships:** FK → `users`, `exams`; parent of `learning_path_items`.
- **Indexes:** `idx_learning_paths_user_id_status`.
- **Validation:** Only one `active` path per user per exam (partial unique index).
- **Future Expansion:** Multiple concurrent paths supported once multi-exam simultaneous prep is common.

#### `learning_path_items`
- **Purpose:** Ordered steps within a learning path.
- **PK:** `learning_path_item_id` (UUID)
- **Columns:** learning_path_id UUID (FK NOT NULL) · sequence_order INTEGER NOT NULL · concept_id UUID (FK NULL) · chapter_id UUID (FK NULL) · status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK IN ('pending','in_progress','completed','skipped') · completed_at TIMESTAMPTZ NULL
- **Relationships:** FK → `learning_paths`, `concepts`, `chapters`.
- **Indexes:** `idx_learning_path_items_path_id_sequence`.
- **Validation:** `uq_learning_path_items_path_sequence` (path_id, sequence_order).
- **Future Expansion:** None.

#### `spaced_repetition_state`
- **Purpose:** Per-user-per-concept spaced-repetition scheduler state (SM-2/FSRS style) — drives both revision scheduling and flashcard review.
- **PK:** `spaced_repetition_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · concept_id UUID (FK NOT NULL) · ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.5 · interval_days INTEGER NOT NULL DEFAULT 1 · repetitions INTEGER NOT NULL DEFAULT 0 · next_review_date DATE NOT NULL · last_reviewed_at TIMESTAMPTZ NULL
- **Relationships:** FK → `users`, `concepts`. Drives `planned_activities` generation (rows with `source='spaced_repetition'`).
- **Indexes:** `uq_spaced_repetition_user_id_concept_id`; `idx_spaced_repetition_next_review_date`.
- **Validation:** `ease_factor` >= 1.3 (SM-2 floor).
- **Future Expansion:** Algorithm-agnostic column naming allows swapping SM-2 for FSRS or a custom AI-driven scheduler.

---
### 3.4 Domain D — Formula Library

#### `formulas`
- **Purpose:** Canonical formula reference library, independently browsable and linkable from questions/concepts/notes.
- **PK:** `formula_id` (UUID)
- **Columns:** concept_id UUID (FK NOT NULL) · formula_name VARCHAR(200) NOT NULL · formula_latex TEXT NOT NULL · description TEXT NULL · units VARCHAR(100) NULL · variables_json JSONB NULL (variable → meaning map) · is_active BOOLEAN NOT NULL DEFAULT true
- **Relationships:** FK → `concepts`; referenced by `question_formulas`, `formula_derivations`, `formula_tags`, `formula_usage_examples`.
- **Indexes:** `idx_formulas_concept_id`; trigram index on `formula_name` for fuzzy search.
- **Validation:** `formula_latex` must be valid LaTeX (validated at ingestion/AI-generation time).
- **Future Expansion:** Add `formula_id` cross-links between equivalent formulas across subjects (e.g., same math identity appearing in physics) via `concept_relations`-style edge table if needed.

#### `formula_derivations`
- **Purpose:** Step-by-step derivation content for a formula (supports "explain from first principles" learning mode).
- **PK:** `derivation_id` (UUID)
- **Columns:** formula_id UUID (FK NOT NULL) · step_number SMALLINT NOT NULL · step_content TEXT NOT NULL · step_latex TEXT NULL
- **Relationships:** FK → `formulas`.
- **Indexes:** `idx_formula_derivations_formula_id_step_number`.
- **Validation:** `uq_formula_derivations_formula_id_step_number`.
- **Future Expansion:** None.

#### `formula_tags`
- **Purpose:** Flexible tagging for formulas (e.g., "JEE-frequent", "requires-calculus", "unit-conversion-heavy").
- **PK:** `formula_tag_id` (UUID)
- **Columns:** formula_id UUID (FK NOT NULL) · tag VARCHAR(60) NOT NULL
- **Relationships:** FK → `formulas`.
- **Indexes:** `idx_formula_tags_tag`; `uq_formula_tags_formula_id_tag`.
- **Validation:** Standard.
- **Future Expansion:** Could be generalized into a shared `tags` + `taggables` pattern platform-wide once tagging needs multiply (see Future Expansion Strategy §10).

#### `formula_usage_examples`
- **Purpose:** Worked mini-examples showing a formula applied, independent of the full question bank.
- **PK:** `usage_example_id` (UUID)
- **Columns:** formula_id UUID (FK NOT NULL) · example_text TEXT NOT NULL · example_latex TEXT NULL
- **Relationships:** FK → `formulas`.
- **Indexes:** `idx_formula_usage_examples_formula_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

---
### 3.5 Domain E — Question Bank System

#### `question_types` (lookup)
- **Purpose:** Controlled vocabulary of question formats.
- **PK:** `question_type_id` (UUID)
- **Columns:** type_code VARCHAR(30) NOT NULL UNIQUE (e.g. 'MCQ_SINGLE','MCQ_MULTI','NUMERICAL','MATRIX_MATCH','ASSERTION_REASON','SUBJECTIVE') · type_label VARCHAR(100) NOT NULL · description TEXT NULL
- **Relationships:** Referenced by `questions`.
- **Indexes:** `uq_question_types_type_code`.
- **Validation:** Seed data managed as reference data, not user-editable.
- **Future Expansion:** New types (e.g., GATE's multi-select-with-negative-marking variants) added as rows.

#### `difficulty_levels` (lookup)
- **Purpose:** Controlled difficulty vocabulary with numeric weight for algorithmic use (adaptive selection, mastery weighting).
- **PK:** `difficulty_level_id` (UUID)
- **Columns:** level_code VARCHAR(20) NOT NULL UNIQUE ('easy','medium','hard','advanced') · numeric_weight NUMERIC(3,2) NOT NULL (e.g. 1.0/1.5/2.0/2.5) · display_order SMALLINT NOT NULL
- **Relationships:** Referenced by `questions`.
- **Indexes:** `uq_difficulty_levels_level_code`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `questions`
- **Purpose:** The core question bank record — canonical, exam-agnostic question metadata. Actual editable content lives in `question_versions` (see below) to support versioning/correction history.
- **PK:** `question_id` (UUID)
- **Columns:**

| Column | Type | Constraints |
|---|---|---|
| subtopic_id | UUID | FK → subtopics, NOT NULL |
| question_type_id | UUID | FK → question_types, NOT NULL |
| difficulty_level_id | UUID | FK → difficulty_levels, NOT NULL |
| current_version_id | UUID | FK → question_versions, NULL (set after first version created) |
| marks | NUMERIC(4,2) | NOT NULL DEFAULT 1.0, CHECK > 0 |
| negative_marks | NUMERIC(4,2) | NOT NULL DEFAULT 0, CHECK >= 0 |
| estimated_solve_time_seconds | INTEGER | NOT NULL, CHECK > 0 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'draft' CHECK IN ('draft','review','published','archived') |
| is_ai_generated | BOOLEAN | NOT NULL DEFAULT false |

- **Relationships:** FK → `subtopics`, `question_types`, `difficulty_levels`; 1:N with `question_versions`; M:N with `topics`/`concepts`/`formulas` via link tables; 1:1-ish with `solutions`; referenced by `mock_test_questions`, `attempt_answers`, `mistakes`, `pyq_tags`.
- **Indexes:** `idx_questions_subtopic_id`; `idx_questions_difficulty_level_id`; `idx_questions_status`.
- **Validation:** A question cannot be `published` without at least one row in `solutions` (app-layer gate + optional trigger).
- **Future Expansion:** Add `exam_relevance` derived view joining through `question_topics`→`topics`→`chapters`→`exam_subjects` rather than a direct column, keeping questions exam-agnostic and reusable across JELET/JEE/WBJEE/GATE/NEET.

#### `question_versions`
- **Purpose:** Full version history of question content — supports corrections, AI-regeneration, and rollback without losing history (critical since students may have already attempted an older version).
- **PK:** `question_version_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · version_number SMALLINT NOT NULL · question_text TEXT NOT NULL · question_latex TEXT NULL · options_json JSONB NULL (for MCQ: array of {label, text, is_correct}) · correct_answer_text TEXT NULL (for numerical/subjective) · edited_by VARCHAR(20) NOT NULL CHECK IN ('system','ai','manual') · edit_reason TEXT NULL · is_current BOOLEAN NOT NULL DEFAULT false
- **Relationships:** FK → `questions` (many versions per question); `questions.current_version_id` points back to the active row.
- **Indexes:** `uq_question_versions_question_id_version_number`; partial unique index `uq_question_versions_current` on (question_id) WHERE is_current = true.
- **Validation:** Exactly one `is_current = true` row per question (enforced via partial unique index).
- **Future Expansion:** Diff/changelog rendering built from consecutive version rows without additional schema.

#### `question_topics`
- **Purpose:** M:N link between a question and the topics/subtopics it exercises (a question can span multiple topics, e.g., a combined mechanics+calculus problem).
- **PK:** `question_topic_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · topic_id UUID (FK NOT NULL) · relevance_weight NUMERIC(3,2) NOT NULL DEFAULT 1.0
- **Relationships:** FK → `questions`, `topics`.
- **Indexes:** `uq_question_topics_pair`; `idx_question_topics_topic_id`.
- **Validation:** `relevance_weight` CHECK 0–1.
- **Future Expansion:** None.

#### `question_concepts`
- **Purpose:** M:N link between a question and the atomic concepts it tests — this is what drives mastery updates after an attempt.
- **PK:** `question_concept_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · concept_id UUID (FK NOT NULL) · is_primary BOOLEAN NOT NULL DEFAULT false
- **Relationships:** FK → `questions`, `concepts`.
- **Indexes:** `uq_question_concepts_pair`; `idx_question_concepts_concept_id`.
- **Validation:** Exactly one `is_primary = true` per question (partial unique index) — used when only one concept's mastery should be primarily credited.
- **Future Expansion:** None.

#### `question_formulas`
- **Purpose:** M:N link between a question and formulas required to solve it.
- **PK:** `question_formula_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · formula_id UUID (FK NOT NULL)
- **Relationships:** FK → `questions`, `formulas`.
- **Indexes:** `uq_question_formulas_pair`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `solutions`
- **Purpose:** The canonical worked solution for a question.
- **PK:** `solution_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL, UNIQUE) · summary TEXT NULL · final_answer TEXT NOT NULL · explanation_style VARCHAR(20) NOT NULL DEFAULT 'detailed' CHECK IN ('brief','detailed','conceptual')
- **Relationships:** FK → `questions` (1:1); parent of `solution_steps`, `alternative_solutions`.
- **Indexes:** `uq_solutions_question_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `solution_steps`
- **Purpose:** Ordered step-by-step breakdown of the primary solution.
- **PK:** `solution_step_id` (UUID)
- **Columns:** solution_id UUID (FK NOT NULL) · step_number SMALLINT NOT NULL · step_text TEXT NOT NULL · step_latex TEXT NULL · concept_id UUID (FK → concepts NULL, links this step to the concept it demonstrates)
- **Relationships:** FK → `solutions`, `concepts`.
- **Indexes:** `uq_solution_steps_solution_id_step_number`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `alternative_solutions`
- **Purpose:** Additional valid solving approaches (e.g., "shortcut method", "graphical method") beyond the primary solution.
- **PK:** `alternative_solution_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · approach_name VARCHAR(100) NOT NULL · content TEXT NOT NULL · content_latex TEXT NULL · time_efficiency_rating SMALLINT NULL CHECK (1–5)
- **Relationships:** FK → `questions`.
- **Indexes:** `idx_alternative_solutions_question_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `hints`
- **Purpose:** Progressive hint ladder shown before revealing the full solution.
- **PK:** `hint_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · hint_order SMALLINT NOT NULL · hint_text TEXT NOT NULL
- **Relationships:** FK → `questions`.
- **Indexes:** `uq_hints_question_id_hint_order`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `learning_objectives`
- **Purpose:** Explicit, reusable statement of what mastering a question demonstrates (Bloom's-taxonomy-aligned).
- **PK:** `learning_objective_id` (UUID)
- **Columns:** objective_text TEXT NOT NULL · bloom_level VARCHAR(20) NULL CHECK IN ('remember','understand','apply','analyze','evaluate','create')
- **Relationships:** M:N to `questions` via `question_learning_objectives`.
- **Indexes:** none beyond PK.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `question_learning_objectives`
- **Purpose:** M:N link table.
- **PK:** `question_learning_objective_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · learning_objective_id UUID (FK NOT NULL)
- **Relationships:** FK → `questions`, `learning_objectives`.
- **Indexes:** `uq_qlo_pair`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `pyq_tags`
- **Purpose:** Marks a question as a Previous Year Question and records exam-specific provenance (exam, year, shift, set, marks awarded that year).
- **PK:** `pyq_tag_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL) · exam_id UUID (FK NOT NULL) · exam_year SMALLINT NOT NULL · shift VARCHAR(20) NULL · question_paper_set VARCHAR(10) NULL · original_question_number VARCHAR(20) NULL · marks_in_original NUMERIC(4,2) NULL
- **Relationships:** FK → `questions`, `exams`.
- **Indexes:** `idx_pyq_tags_exam_id_exam_year`; `idx_pyq_tags_question_id`.
- **Validation:** `exam_year` CHECK BETWEEN 1990 AND 2035.
- **Future Expansion:** A single question can carry multiple `pyq_tags` rows if reused verbatim across exams (rare but happens, e.g. WBJEE/JELET overlap) — schema already supports this via 1:N.

#### `question_sources`
- **Purpose:** Full provenance/source-tracking record — required for licensing/attribution and for the AI to explain "where this question came from."
- **PK:** `question_source_id` (UUID)
- **Columns:** question_id UUID (FK NOT NULL, UNIQUE) · source_type VARCHAR(30) NOT NULL CHECK IN ('pyq','textbook','ai_generated','user_uploaded_pdf','manual_entry') · source_reference TEXT NULL (book name/PDF id/publisher) · uploaded_pdf_id UUID (FK → uploaded_pdfs NULL) · confidence_score NUMERIC(4,3) NULL (for AI-generated / OCR-extracted, model confidence) · verified_by_user BOOLEAN NOT NULL DEFAULT false
- **Relationships:** FK → `questions` (1:1), `uploaded_pdfs`.
- **Indexes:** `uq_question_sources_question_id`.
- **Validation:** If `source_type = 'user_uploaded_pdf'`, `uploaded_pdf_id` NOT NULL (CHECK/trigger).
- **Future Expansion:** Add `license_type` column if third-party licensed content banks are integrated later.

#### `question_media`
- **Purpose:** Images/diagrams/graphs attached to a question (stored as object-storage references, not BLOBs in Postgres).
- **PK:** `question_media_id` (UUID)
- **Columns:** question_version_id UUID (FK NOT NULL) · media_type VARCHAR(20) NOT NULL CHECK IN ('image','diagram','graph','circuit') · storage_url TEXT NOT NULL · alt_text TEXT NULL · display_order SMALLINT NOT NULL DEFAULT 0
- **Relationships:** FK → `question_versions`.
- **Indexes:** `idx_question_media_question_version_id`.
- **Validation:** `storage_url` must be a valid object-storage (S3-compatible) URI — validated at ingestion.
- **Future Expansion:** None — deliberate object-storage-by-reference pattern applies platform-wide (see Data Integrity Rules §7).

---
### 3.6 Domain F — Mock Test System

#### `mock_tests`
- **Purpose:** A test blueprint (template) — either exam-pattern-based (full JELET/JEE mock) or custom (chapter-wise test).
- **PK:** `mock_test_id` (UUID)
- **Columns:** user_id UUID (FK NULL — NULL for system/global templates, set for user-custom tests) · exam_id UUID (FK NOT NULL) · test_name VARCHAR(200) NOT NULL · test_type VARCHAR(20) NOT NULL CHECK IN ('full_length','chapter_wise','topic_wise','pyq_paper','custom') · total_marks NUMERIC(6,2) NOT NULL · total_duration_minutes INTEGER NOT NULL · instructions TEXT NULL · is_published BOOLEAN NOT NULL DEFAULT false
- **Relationships:** FK → `users`, `exams`; parent of `mock_test_sections`, `mock_test_questions`; referenced by `test_attempts`.
- **Indexes:** `idx_mock_tests_exam_id`; `idx_mock_tests_user_id`.
- **Validation:** `total_marks` must equal SUM of linked `question.marks` (validated at publish time).
- **Future Expansion:** `is_shared` flag + `shared_with` table when tests can be shared across students (coaching-institute scenario).

#### `mock_test_sections`
- **Purpose:** Sections within a test (e.g., Physics / Chemistry / Math, or Section A/B with different marking schemes).
- **PK:** `section_id` (UUID)
- **Columns:** mock_test_id UUID (FK NOT NULL) · section_name VARCHAR(100) NOT NULL · subject_id UUID (FK → subjects NULL) · section_order SMALLINT NOT NULL · duration_minutes INTEGER NULL (NULL = shares overall test timer)
- **Relationships:** FK → `mock_tests`, `subjects`.
- **Indexes:** `idx_mock_test_sections_mock_test_id`.
- **Validation:** `uq_mock_test_sections_test_id_order`.
- **Future Expansion:** None.

#### `mock_test_questions`
- **Purpose:** Ordered set of questions belonging to a test/section — deliberately decoupled from the `questions` table's own metadata so the same question can appear in many tests.
- **PK:** `mock_test_question_id` (UUID)
- **Columns:** mock_test_id UUID (FK NOT NULL) · section_id UUID (FK NULL) · question_id UUID (FK NOT NULL) · question_order SMALLINT NOT NULL · marks_override NUMERIC(4,2) NULL (overrides question's default marks for this specific test)
- **Relationships:** FK → `mock_tests`, `mock_test_sections`, `questions`.
- **Indexes:** `uq_mock_test_questions_test_id_order`; `idx_mock_test_questions_question_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `test_attempts`
- **Purpose:** One row per time a student attempts a mock test (a test can be retaken).
- **PK:** `attempt_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · mock_test_id UUID (FK NOT NULL) · attempt_number SMALLINT NOT NULL · status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK IN ('in_progress','submitted','auto_submitted','abandoned') · started_at TIMESTAMPTZ NOT NULL · submitted_at TIMESTAMPTZ NULL · total_score NUMERIC(6,2) NULL · total_time_taken_seconds INTEGER NULL
- **Relationships:** FK → `users`, `mock_tests`; parent of `attempt_answers`, `attempt_section_timing`, `attempt_question_timing`, `test_analytics_summary`, `test_review_notes`.
- **Indexes:** `idx_test_attempts_user_id_mock_test_id`; `uq_test_attempts_user_test_attemptnum`.
- **Validation:** `submitted_at` >= `started_at`; only one `in_progress` attempt per user per test (partial unique index).
- **Future Expansion:** `proctoring_metadata JSONB` if remote-proctoring is added for shared/multi-user mode.

#### `attempt_answers`
- **Purpose:** Student's answer to each question within an attempt.
- **PK:** `attempt_answer_id` (UUID)
- **Columns:** attempt_id UUID (FK NOT NULL) · question_id UUID (FK NOT NULL) · question_version_id UUID (FK NOT NULL, pins the exact version shown) · selected_option VARCHAR(10) NULL · answer_text TEXT NULL · is_correct BOOLEAN NULL · marks_awarded NUMERIC(4,2) NULL · answer_status VARCHAR(20) NOT NULL DEFAULT 'unattempted' CHECK IN ('answered','unattempted','marked_for_review','answered_and_marked') · answered_at TIMESTAMPTZ NULL
- **Relationships:** FK → `test_attempts`, `questions`, `question_versions`. Also feeds `concept_mastery` update and `mistakes` creation when incorrect.
- **Indexes:** `uq_attempt_answers_attempt_id_question_id`; `idx_attempt_answers_question_id`.
- **Validation:** `is_correct`/`marks_awarded` computed at grading time (trigger or application service) by comparing to `question_versions.correct_answer_text` / `options_json`.
- **Future Expansion:** None.

#### `attempt_section_timing`
- **Purpose:** Time spent per section within an attempt.
- **PK:** `attempt_section_timing_id` (UUID)
- **Columns:** attempt_id UUID (FK NOT NULL) · section_id UUID (FK NOT NULL) · time_spent_seconds INTEGER NOT NULL DEFAULT 0
- **Relationships:** FK → `test_attempts`, `mock_test_sections`.
- **Indexes:** `uq_attempt_section_timing_pair`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `attempt_question_timing`
- **Purpose:** Per-question time-on-task within an attempt — powers the "Speed" analytics metric and reveals rushed/stuck patterns.
- **PK:** `attempt_question_timing_id` (UUID)
- **Columns:** attempt_id UUID (FK NOT NULL) · question_id UUID (FK NOT NULL) · time_spent_seconds INTEGER NOT NULL DEFAULT 0 · revisit_count SMALLINT NOT NULL DEFAULT 0
- **Relationships:** FK → `test_attempts`, `questions`.
- **Indexes:** `uq_attempt_question_timing_pair`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `test_analytics_summary`
- **Purpose:** Post-submission computed analytics for one attempt (materialized so the review screen loads instantly without recomputation).
- **PK:** `test_analytics_id` (UUID)
- **Columns:** attempt_id UUID (FK NOT NULL, UNIQUE) · accuracy_percent NUMERIC(5,2) NULL · avg_time_per_question_seconds NUMERIC(6,2) NULL · strong_topics JSONB NULL · weak_topics JSONB NULL · percentile_estimate NUMERIC(5,2) NULL (self-comparison over time, not cross-user ranking) · section_wise_breakdown JSONB NULL
- **Relationships:** FK → `test_attempts` (1:1).
- **Indexes:** `uq_test_analytics_summary_attempt_id`.
- **Validation:** Computed once at submission; immutable thereafter.
- **Future Expansion:** None — this is intentionally denormalized (see Normalization Strategy §5).

#### `test_review_notes`
- **Purpose:** Student's own annotations while reviewing a completed attempt.
- **PK:** `review_note_id` (UUID)
- **Columns:** attempt_id UUID (FK NOT NULL) · question_id UUID (FK NOT NULL) · note_text TEXT NOT NULL · created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `test_attempts`, `questions`.
- **Indexes:** `idx_test_review_notes_attempt_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

> **Ranking:** Per the requirement, ranking is optional and kept local/self-referential only (`percentile_estimate` above is self-comparison across the user's own attempt history). A future `leaderboards` table is deferred to the multi-user expansion phase (§10) since a single-user system has no peer population to rank against.

---
### 3.7 Domain G — Mistake Notebook / Flashcards / Notes / Bookmarks

#### `mistakes`
- **Purpose:** The Mistake Notebook — captures every wrong/weak answer with root-cause classification for targeted revision. *(+ Sync Columns)*
- **PK:** `mistake_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · question_id UUID (FK NOT NULL) · source_attempt_id UUID (FK → test_attempts NULL) · concept_id UUID (FK → concepts NULL) · mistake_category VARCHAR(30) NOT NULL CHECK IN ('conceptual_gap','calculation_error','misread_question','time_pressure','silly_mistake','formula_confusion') · student_reflection TEXT NULL · resolved_status VARCHAR(20) NOT NULL DEFAULT 'unresolved' CHECK IN ('unresolved','reviewing','resolved') · times_repeated SMALLINT NOT NULL DEFAULT 0
- **Relationships:** FK → `users`, `questions`, `test_attempts`, `concepts`; M:N tags via `mistake_tags`.
- **Indexes:** `idx_mistakes_user_id_resolved_status`; `idx_mistakes_concept_id`.
- **Validation:** Standard.
- **Future Expansion:** `mistake_category` is the AI weakness-detection engine's primary categorical signal — extendable with new categories without migration.

#### `mistake_tags`
- **Purpose:** Freeform tags on mistakes (e.g., "exam-day-panic", "recurring"). *(+ Sync Columns)*
- **PK:** `mistake_tag_id` (UUID)
- **Columns:** mistake_id UUID (FK NOT NULL) · tag VARCHAR(60) NOT NULL
- **Relationships:** FK → `mistakes`.
- **Indexes:** `idx_mistake_tags_mistake_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `flashcard_decks`
- **Purpose:** User-organized or system-generated flashcard collections. *(+ Sync Columns)*
- **PK:** `deck_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · deck_name VARCHAR(150) NOT NULL · chapter_id UUID (FK → chapters NULL) · is_system_generated BOOLEAN NOT NULL DEFAULT false · card_count INTEGER NOT NULL DEFAULT 0
- **Relationships:** FK → `users`, `chapters`; parent of `flashcards`.
- **Indexes:** `idx_flashcard_decks_user_id`.
- **Validation:** `card_count` maintained via trigger on `flashcards` insert/delete.
- **Future Expansion:** None.

#### `flashcards`
- **Purpose:** Individual flashcard (front/back), optionally linked to a concept for mastery integration. *(+ Sync Columns)*
- **PK:** `flashcard_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · deck_id UUID (FK NOT NULL) · concept_id UUID (FK → concepts NULL) · front_text TEXT NOT NULL · back_text TEXT NOT NULL · front_latex TEXT NULL · back_latex TEXT NULL · source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK IN ('manual','ai_generated','from_mistake')
- **Relationships:** FK → `users`, `flashcard_decks`, `concepts`; parent of `flashcard_review_log`.
- **Indexes:** `idx_flashcards_deck_id`; `idx_flashcards_concept_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `flashcard_review_log`
- **Purpose:** Spaced-repetition review history per flashcard (SM-2-style grading: again/hard/good/easy).
- **PK:** `review_log_id` (BIGSERIAL)
- **Columns:** flashcard_id UUID (FK NOT NULL) · user_id UUID (FK NOT NULL) · reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now() · grade VARCHAR(10) NOT NULL CHECK IN ('again','hard','good','easy') · next_review_date DATE NOT NULL
- **Relationships:** FK → `flashcards`, `users`.
- **Indexes:** `idx_flashcard_review_log_flashcard_id_reviewed_at`.
- **Validation:** Standard.
- **Future Expansion:** None — mirrors `spaced_repetition_state` pattern but scoped to flashcards specifically since flashcards can exist independent of a `concept_id`.

#### `notes`
- **Purpose:** Free-form user notes, attachable to any curriculum entity via `note_links`. *(+ Sync Columns)*
- **PK:** `note_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · title VARCHAR(200) NULL · content TEXT NOT NULL · content_format VARCHAR(20) NOT NULL DEFAULT 'markdown' CHECK IN ('markdown','plain_text','rich_text') · is_pinned BOOLEAN NOT NULL DEFAULT false
- **Relationships:** FK → `users`; M:N to concepts/chapters/questions via `note_links`.
- **Indexes:** `idx_notes_user_id`; full-text index on `content`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `note_links`
- **Purpose:** Explicit (non-polymorphic) link table connecting a note to one or more curriculum/content entities.
- **PK:** `note_link_id` (UUID)
- **Columns:** note_id UUID (FK NOT NULL) · linked_entity_type VARCHAR(20) NOT NULL CHECK IN ('concept','chapter','topic','question','formula') · linked_entity_id UUID NOT NULL
- **Relationships:** FK → `notes`. `linked_entity_id` validated at the application layer against the table implied by `linked_entity_type` (Postgres cannot polymorphically FK-enforce this; documented trade-off in §7).
- **Indexes:** `idx_note_links_note_id`; `idx_note_links_entity_type_id`.
- **Validation:** App-layer existence check on write.
- **Future Expansion:** None.

#### `bookmarks`
- **Purpose:** Quick-access saved references to any content entity. *(+ Sync Columns)*
- **PK:** `bookmark_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · entity_type VARCHAR(20) NOT NULL CHECK IN ('question','concept','chapter','formula','flashcard','note','pdf') · entity_id UUID NOT NULL · folder_name VARCHAR(100) NULL
- **Relationships:** FK → `users`. Same soft-polymorphic pattern as `note_links`.
- **Indexes:** `idx_bookmarks_user_id_entity_type`; `uq_bookmarks_user_entity`.
- **Validation:** App-layer existence check on write.
- **Future Expansion:** None.

---
### 3.8 Domain H — Study Plan & Revision Scheduling

> **Revision note (v2):** The original v1 design had two parallel, overlapping planning systems — `study_plan_items` (manual/AI plan) and `revision_schedule_items` (spaced-repetition-driven) — both storing "what to do on what date." A developer implementing this would not know which table to write to for a given task. v2 collapses them into a single `planned_activities` table with a `source` discriminator, so there is exactly one place that answers "what's on my schedule today," regardless of *why* it's scheduled. This is the fix referenced in the earlier critique.

#### `study_plans`
- **Purpose:** A time-bound, named planning container (e.g., "JELET 2027 — 8 Month Plan") that groups activities together and tracks overall progress. Not every activity needs to belong to one — spaced-repetition-only items can have `study_plan_id = NULL`. *(+ Sync Columns)*
- **PK:** `study_plan_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · exam_id UUID (FK NOT NULL) · plan_name VARCHAR(150) NOT NULL · start_date DATE NOT NULL · end_date DATE NOT NULL · generated_by VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK IN ('ai','manual') · status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK IN ('active','completed','archived')
- **Relationships:** FK → `users`, `exams`; parent of `planned_activities` (optional grouping), `daily_study_goals`.
- **Indexes:** `idx_study_plans_user_id_status`.
- **Validation:** `end_date` > `start_date`; only one `active` plan per user per exam (partial unique index).
- **Future Expansion:** None.

#### `planned_activities`
- **Purpose:** **The single unified schedule table.** Every "thing to do on a date" — whether it came from a manually authored plan, an AI-generated plan, or the spaced-repetition engine — lives here as one row. This is the one table both the calendar UI and "what's due today" queries read from.
- **PK:** `planned_activity_id` (UUID)
- **Columns:**

| Column | Type | Constraints |
|---|---|---|
| user_id | UUID | FK → users, NOT NULL |
| study_plan_id | UUID | FK → study_plans, NULL (NULL when not part of a named plan) |
| source | VARCHAR(20) | NOT NULL CHECK IN ('manual_plan','ai_plan','spaced_repetition') |
| activity_type | VARCHAR(20) | NOT NULL CHECK IN ('learn','practice','revise','test') |
| chapter_id | UUID | FK → chapters, NULL |
| concept_id | UUID | FK → concepts, NULL |
| spaced_repetition_id | UUID | FK → spaced_repetition_state, NULL — set only when `source='spaced_repetition'`, links back to the scheduler state that generated this row |
| scheduled_date | DATE | NOT NULL |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' CHECK IN ('pending','in_progress','completed','missed','rescheduled','skipped') |
| completed_at | TIMESTAMPTZ | NULL |

- *(+ Sync Columns)*
- **Relationships:** FK → `users`, `study_plans`, `chapters`, `concepts`, `spaced_repetition_state`.
- **Indexes:** `idx_planned_activities_user_id_scheduled_date` (the primary "what's due today/this week" query path); `idx_planned_activities_status`; `idx_planned_activities_study_plan_id`.
- **Validation:** At least one of `chapter_id`/`concept_id` NOT NULL; if `source='spaced_repetition'` then `spaced_repetition_id` NOT NULL (CHECK/trigger).
- **Future Expansion:** None — this replaces both v1 `study_plan_items` and `revision_schedule`/`revision_schedule_items`. The spaced-repetition engine's own state (ease factor, interval, repetitions) still lives in `spaced_repetition_state` as before; `planned_activities` is just the calendar-facing projection of it, refreshed whenever `spaced_repetition_state.next_review_date` changes (one row upserted per due concept, not a separate scheduling system).

#### `daily_study_goals`
- **Purpose:** Daily target metrics (minutes, questions) — the aggregate commitment, independent of which specific activities fulfill it. *(+ Sync Columns)*
- **PK:** `daily_goal_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · goal_date DATE NOT NULL · target_minutes INTEGER NULL · target_questions INTEGER NULL · actual_minutes INTEGER NOT NULL DEFAULT 0 · actual_questions INTEGER NOT NULL DEFAULT 0 · achieved BOOLEAN NOT NULL DEFAULT false
- **Relationships:** FK → `users`.
- **Indexes:** `uq_daily_study_goals_user_id_date`.
- **Validation:** Standard; `achieved` recomputed via trigger/nightly job comparing actual vs target.
- **Future Expansion:** None.

---

### 3.9 Domain I — Notifications

#### `notifications`
- **Purpose:** In-app/push notification instances (revision due, streak reminder, mock test scheduled, AI insight ready).
- **PK:** `notification_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · notification_type VARCHAR(40) NOT NULL CHECK IN ('revision_due','streak_reminder','mock_test_reminder','ai_insight','mastery_milestone','system_announcement') · title VARCHAR(200) NOT NULL · body TEXT NULL · reference_type VARCHAR(30) NULL · reference_id UUID NULL · is_read BOOLEAN NOT NULL DEFAULT false · read_at TIMESTAMPTZ NULL · scheduled_for TIMESTAMPTZ NULL · sent_at TIMESTAMPTZ NULL
- **Relationships:** FK → `users`. `reference_id` is a soft-reference.
- **Indexes:** `idx_notifications_user_id_is_read`; `idx_notifications_scheduled_for`.
- **Validation:** Standard.
- **Future Expansion:** Partition by month at scale.

#### `notification_preferences`
- **Purpose:** Per-user, per-type opt-in/out and delivery-channel preference.
- **PK:** `notification_preference_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · notification_type VARCHAR(40) NOT NULL · channel VARCHAR(20) NOT NULL CHECK IN ('push','email','in_app') · is_enabled BOOLEAN NOT NULL DEFAULT true · quiet_hours_start TIME NULL · quiet_hours_end TIME NULL
- **Relationships:** FK → `users`.
- **Indexes:** `uq_notification_preferences_user_type_channel`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `notification_delivery_log`
- **Purpose:** Delivery/receipt audit trail per notification per device (debugging push failures).
- **PK:** `delivery_log_id` (BIGSERIAL)
- **Columns:** notification_id UUID (FK NOT NULL) · device_id UUID (FK NULL) · delivery_status VARCHAR(20) NOT NULL CHECK IN ('queued','sent','delivered','failed') · attempted_at TIMESTAMPTZ NOT NULL DEFAULT now() · error_message TEXT NULL
- **Relationships:** FK → `notifications`, `user_devices`.
- **Indexes:** `idx_notification_delivery_log_notification_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

---
### 3.10 Domain J — PDF Upload, OCR & Semantic Search

#### `uploaded_pdfs`
- **Purpose:** Metadata for every PDF the student uploads (textbooks, PYQ papers, notes) — the file bytes live in object storage, not Postgres.
- **PK:** `pdf_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · file_name VARCHAR(255) NOT NULL · storage_url TEXT NOT NULL · file_size_bytes BIGINT NOT NULL · page_count INTEGER NULL · document_type VARCHAR(30) NOT NULL DEFAULT 'unclassified' CHECK IN ('textbook','pyq_paper','notes','reference','unclassified') · processing_status VARCHAR(20) NOT NULL DEFAULT 'uploaded' CHECK IN ('uploaded','queued','processing','completed','failed') · uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`; parent of `pdf_pages`, `pdf_processing_jobs`; referenced by `question_sources`.
- **Indexes:** `idx_uploaded_pdfs_user_id`; `idx_uploaded_pdfs_processing_status`.
- **Validation:** `file_size_bytes` CHECK <= platform max (app-enforced, e.g. 100MB).
- **Future Expansion:** `checksum_sha256` column for de-duplication once library grows large.

#### `pdf_pages`
- **Purpose:** One row per page of an uploaded PDF, anchoring all downstream OCR/extraction to a specific page.
- **PK:** `pdf_page_id` (UUID)
- **Columns:** pdf_id UUID (FK NOT NULL) · page_number INTEGER NOT NULL · page_image_url TEXT NULL (rasterized page image reference) · width_px INTEGER NULL · height_px INTEGER NULL
- **Relationships:** FK → `uploaded_pdfs`; parent of `ocr_results`.
- **Indexes:** `uq_pdf_pages_pdf_id_page_number`.
- **Validation:** `page_number` >= 1.
- **Future Expansion:** None.

#### `ocr_results`
- **Purpose:** Raw OCR engine output per page (before semantic parsing into text blocks/formulas/questions).
- **PK:** `ocr_result_id` (UUID)
- **Columns:** pdf_page_id UUID (FK NOT NULL, UNIQUE) · ocr_engine VARCHAR(30) NOT NULL (e.g. 'tesseract','google_vision','claude_vision') · raw_text TEXT NULL · confidence_score NUMERIC(4,3) NULL · processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `pdf_pages` (1:1); parent of `extracted_text_blocks`, `extracted_formulas`, `extracted_diagrams`, `extracted_questions`.
- **Indexes:** `uq_ocr_results_pdf_page_id`.
- **Validation:** Standard.
- **Future Expansion:** Multiple OCR engine attempts per page supported by relaxing the UNIQUE constraint to (pdf_page_id, ocr_engine) if a multi-engine consensus pipeline is introduced.

#### `extracted_text_blocks`
- **Purpose:** Structured text segments (paragraphs, headings, captions) parsed out of raw OCR output with bounding-box positions.
- **PK:** `text_block_id` (UUID)
- **Columns:** ocr_result_id UUID (FK NOT NULL) · block_type VARCHAR(20) NOT NULL CHECK IN ('paragraph','heading','caption','list_item','table') · block_text TEXT NOT NULL · bounding_box JSONB NULL ({x,y,width,height}) · reading_order SMALLINT NULL
- **Relationships:** FK → `ocr_results`.
- **Indexes:** `idx_extracted_text_blocks_ocr_result_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `extracted_formulas`
- **Purpose:** Formula regions detected within a page, OCR'd via math-specific recognition (e.g., LaTeX-OCR), optionally promoted into the canonical `formulas` table.
- **PK:** `extracted_formula_id` (UUID)
- **Columns:** ocr_result_id UUID (FK NOT NULL) · raw_latex TEXT NULL · bounding_box JSONB NULL · confidence_score NUMERIC(4,3) NULL · promoted_formula_id UUID (FK → formulas NULL) · review_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK IN ('pending','approved','rejected')
- **Relationships:** FK → `ocr_results`, `formulas`.
- **Indexes:** `idx_extracted_formulas_ocr_result_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `extracted_diagrams`
- **Purpose:** Diagram/figure/circuit regions detected within a page — stored as cropped image references with descriptive metadata.
- **PK:** `extracted_diagram_id` (UUID)
- **Columns:** ocr_result_id UUID (FK NOT NULL) · image_url TEXT NOT NULL · bounding_box JSONB NULL · ai_generated_caption TEXT NULL · diagram_type VARCHAR(30) NULL CHECK IN ('graph','circuit','geometric_figure','chart','illustration','other')
- **Relationships:** FK → `ocr_results`.
- **Indexes:** `idx_extracted_diagrams_ocr_result_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `extracted_questions`
- **Purpose:** Staging area for questions parsed out of a PDF (e.g., a PYQ paper upload) before human/AI review and promotion into the canonical `questions` table.
- **PK:** `extracted_question_id` (UUID)
- **Columns:** ocr_result_id UUID (FK NOT NULL) · raw_question_text TEXT NOT NULL · raw_options_json JSONB NULL · detected_question_number VARCHAR(20) NULL · confidence_score NUMERIC(4,3) NULL · review_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK IN ('pending','approved','rejected','needs_edit') · promoted_question_id UUID (FK → questions NULL)
- **Relationships:** FK → `ocr_results`, `questions`.
- **Indexes:** `idx_extracted_questions_ocr_result_id`; `idx_extracted_questions_review_status`.
- **Validation:** On `review_status = 'approved'`, `promoted_question_id` must be set (trigger-enforced).
- **Future Expansion:** This staging pattern (extract → review → promote) is the standard ingestion pipeline reused for formulas and diagrams above, keeping unreviewed OCR noise out of production content tables.

#### `semantic_embeddings`
- **Purpose:** Vector embeddings for semantic search across concepts, questions, notes, and PDF text blocks — powers "find similar questions" and AI retrieval-augmented tutoring.
- **PK:** `embedding_id` (UUID)
- **Columns:** entity_type VARCHAR(30) NOT NULL CHECK IN ('concept','question','note','text_block','formula') · entity_id UUID NOT NULL · embedding_vector VECTOR(1536) NOT NULL (requires `pgvector` extension) · embedding_model VARCHAR(50) NOT NULL · generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** Soft-reference to `entity_id` (polymorphic by design, consistent with `note_links`/`bookmarks` pattern) — application layer resolves the target table via `entity_type`.
- **Indexes:** `idx_semantic_embeddings_entity_type_id`; **HNSW or IVFFlat vector index** on `embedding_vector` (via `pgvector`) for approximate nearest-neighbor search.
- **Validation:** `uq_semantic_embeddings_entity_type_id_model` (one embedding per entity per model version).
- **Future Expansion:** Add `embedding_model` versioning support already built in — re-embedding on model upgrade is a new row, old rows retained until backfill completes, then archived.

#### `citations`
- **Purpose:** Tracks which source (PDF page, textbook, PYQ paper) backs a piece of AI-generated or extracted content — critical for trust/verifiability.
- **PK:** `citation_id` (UUID)
- **Columns:** citing_entity_type VARCHAR(30) NOT NULL CHECK IN ('ai_message','question','formula','solution') · citing_entity_id UUID NOT NULL · pdf_id UUID (FK → uploaded_pdfs NULL) · pdf_page_id UUID (FK → pdf_pages NULL) · external_source_text TEXT NULL (for non-PDF sources) · citation_note TEXT NULL
- **Relationships:** FK → `uploaded_pdfs`, `pdf_pages`; soft-reference on `citing_entity_id`.
- **Indexes:** `idx_citations_citing_entity_type_id`; `idx_citations_pdf_id`.
- **Validation:** At least one of `pdf_id`/`external_source_text` NOT NULL.
- **Future Expansion:** None.

#### `pdf_processing_jobs`
- **Purpose:** Job-queue tracking for the async OCR/extraction pipeline (retry logic, failure diagnostics).
- **PK:** `job_id` (UUID)
- **Columns:** pdf_id UUID (FK NOT NULL) · job_type VARCHAR(30) NOT NULL CHECK IN ('ocr','formula_extraction','diagram_extraction','question_extraction','embedding_generation') · status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK IN ('queued','running','completed','failed','retrying') · attempt_count SMALLINT NOT NULL DEFAULT 0 · error_message TEXT NULL · started_at TIMESTAMPTZ NULL · completed_at TIMESTAMPTZ NULL
- **Relationships:** FK → `uploaded_pdfs`.
- **Indexes:** `idx_pdf_processing_jobs_pdf_id_status`.
- **Validation:** `attempt_count` capped at platform max retries (app-enforced).
- **Future Expansion:** Could be replaced by an external queue (SQS/Celery/BullMQ) with this table retained purely as an audit mirror.

---
### 3.11 Domain K — AI System

#### `ai_conversations`
- **Purpose:** A conversation thread with the AI tutor (session-scoped chat).
- **PK:** `conversation_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · learning_session_id UUID (FK → learning_sessions NULL) · title VARCHAR(200) NULL · context_concept_id UUID (FK → concepts NULL) · started_at TIMESTAMPTZ NOT NULL DEFAULT now() · ended_at TIMESTAMPTZ NULL
- **Relationships:** FK → `users`, `learning_sessions`, `concepts`; parent of `ai_messages`.
- **Indexes:** `idx_ai_conversations_user_id_started_at`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `ai_messages`
- **Purpose:** Individual turn within a conversation.
- **PK:** `message_id` (UUID)
- **Columns:** conversation_id UUID (FK NOT NULL) · role VARCHAR(10) NOT NULL CHECK IN ('user','assistant','system') · content TEXT NOT NULL · message_order INTEGER NOT NULL · referenced_question_id UUID (FK → questions NULL) · referenced_concept_id UUID (FK → concepts NULL) · model_used VARCHAR(50) NULL · created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `ai_conversations`, `questions`, `concepts`.
- **Indexes:** `idx_ai_messages_conversation_id_message_order`.
- **Validation:** Standard.
- **Future Expansion:** High-volume append-only — partition by month once conversation history is large.

#### `ai_memory`
- **Purpose:** Long-term structured memory the AI tutor maintains about the student (learning style, recurring struggles, preferences) — distinct from raw conversation logs, this is *curated, queryable* memory.
- **PK:** `memory_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · memory_type VARCHAR(30) NOT NULL CHECK IN ('learning_style','recurring_struggle','preference','strength','milestone') · memory_key VARCHAR(100) NOT NULL · memory_value TEXT NOT NULL · confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (0–1) · source_conversation_id UUID (FK → ai_conversations NULL) · is_active BOOLEAN NOT NULL DEFAULT true · last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`, `ai_conversations`.
- **Indexes:** `idx_ai_memory_user_id_memory_type`; `uq_ai_memory_user_id_key`.
- **Validation:** Standard.
- **Future Expansion:** This table is the anchor for retrieval-augmented personalization — future vector-embedding of `memory_value` (linked via `semantic_embeddings` with `entity_type='ai_memory'`) enables semantic memory retrieval at scale.

#### `ai_recommendations`
- **Purpose:** Discrete, actionable AI suggestions surfaced to the student (e.g., "Revise Thermodynamics before Friday", "Try 5 more Numericals on Capacitors").
- **PK:** `recommendation_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · recommendation_type VARCHAR(30) NOT NULL CHECK IN ('revise_concept','practice_more','take_mock_test','review_mistake','adjust_pace','take_break') · reference_type VARCHAR(20) NULL · reference_id UUID NULL · reasoning TEXT NULL · priority SMALLINT NOT NULL DEFAULT 3 CHECK (1–5) · status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK IN ('active','accepted','dismissed','expired') · generated_at TIMESTAMPTZ NOT NULL DEFAULT now() · expires_at TIMESTAMPTZ NULL
- **Relationships:** FK → `users`; soft-reference via `reference_id`.
- **Indexes:** `idx_ai_recommendations_user_id_status`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `weakness_detections`
- **Purpose:** AI-identified weakness signals — structured output of the weakness-detection engine, distinct from raw `mistakes` (this is the *pattern*, mistakes are the *instances*).
- **PK:** `weakness_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · concept_id UUID (FK NOT NULL) · weakness_type VARCHAR(30) NOT NULL CHECK IN ('low_accuracy','slow_speed','high_forgetting_rate','confidently_wrong','avoidance_pattern') · severity SMALLINT NOT NULL CHECK (1–5) · evidence_summary TEXT NULL · detected_at TIMESTAMPTZ NOT NULL DEFAULT now() · status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK IN ('open','addressing','resolved')
- **Relationships:** FK → `users`, `concepts`.
- **Indexes:** `idx_weakness_detections_user_id_status`; `idx_weakness_detections_concept_id`.
- **Validation:** Standard.
- **Future Expansion:** Feeds `ai_recommendations` and `learning_paths` regeneration triggers.

#### `adaptive_learning_decisions`
- **Purpose:** Audit log of every adaptive decision the AI engine made (e.g., "selected harder question because mastery > 80%", "inserted revision because retention < 60%") — critical for explainability and debugging the adaptive algorithm.
- **PK:** `decision_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · decision_type VARCHAR(40) NOT NULL · input_signals JSONB NOT NULL (snapshot of mastery/confidence/retention inputs used) · decision_output JSONB NOT NULL (what was chosen) · rationale TEXT NULL · decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`.
- **Indexes:** `idx_adaptive_learning_decisions_user_id_decided_at`.
- **Validation:** Append-only, immutable.
- **Future Expansion:** Training data source if a custom adaptive-policy model is trained later.

#### `ai_study_planner_runs`
- **Purpose:** Records each time the AI (re)generates a study plan, including the inputs considered — enables comparing plan versions and understanding why the plan changed.
- **PK:** `planner_run_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · study_plan_id UUID (FK → study_plans NULL) · trigger_reason VARCHAR(40) NOT NULL CHECK IN ('initial_generation','missed_targets','mastery_update','manual_request','exam_date_change') · input_snapshot JSONB NULL · output_summary TEXT NULL · run_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`, `study_plans`.
- **Indexes:** `idx_ai_study_planner_runs_user_id_run_at`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `ai_feedback`
- **Purpose:** Student feedback (thumbs up/down + optional comment) on AI outputs — recommendations, explanations, generated questions — used to tune future personalization.
- **PK:** `ai_feedback_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · feedback_target_type VARCHAR(30) NOT NULL CHECK IN ('ai_message','recommendation','generated_question','study_plan') · feedback_target_id UUID NOT NULL · rating VARCHAR(10) NOT NULL CHECK IN ('positive','negative') · comment TEXT NULL · created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`; soft-reference via `feedback_target_id`.
- **Indexes:** `idx_ai_feedback_user_id_target_type`.
- **Validation:** Standard.
- **Future Expansion:** None.

---
### 3.12 Domain L — Analytics

> **Design note:** Analytics tables are intentionally denormalized, pre-aggregated snapshots — the exception to the platform's 3NF default (see Normalization Strategy §5). They exist so dashboards never run expensive live aggregation queries over `session_activities`/`attempt_answers`.

#### `daily_activity_summary`
- **Purpose:** One row per user per day, rolling up total study activity.
- **PK:** `daily_summary_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · activity_date DATE NOT NULL · total_study_minutes INTEGER NOT NULL DEFAULT 0 · questions_attempted INTEGER NOT NULL DEFAULT 0 · questions_correct INTEGER NOT NULL DEFAULT 0 · concepts_reviewed INTEGER NOT NULL DEFAULT 0 · mock_tests_taken SMALLINT NOT NULL DEFAULT 0 · streak_day_number INTEGER NOT NULL DEFAULT 0
- **Relationships:** FK → `users`. Derived nightly (or incrementally via trigger) from `session_activities`/`attempt_answers`.
- **Indexes:** `uq_daily_activity_summary_user_id_date`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `weekly_activity_summary`
- **Purpose:** Weekly rollup, derived from `daily_activity_summary`.
- **PK:** `weekly_summary_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · week_start_date DATE NOT NULL · total_study_minutes INTEGER NOT NULL DEFAULT 0 · questions_attempted INTEGER NOT NULL DEFAULT 0 · avg_daily_accuracy NUMERIC(5,2) NULL · chapters_completed SMALLINT NOT NULL DEFAULT 0
- **Relationships:** FK → `users`.
- **Indexes:** `uq_weekly_activity_summary_user_id_week`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `monthly_activity_summary`
- **Purpose:** Monthly rollup for long-range trend charts.
- **PK:** `monthly_summary_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · month_start_date DATE NOT NULL · total_study_minutes INTEGER NOT NULL DEFAULT 0 · questions_attempted INTEGER NOT NULL DEFAULT 0 · avg_accuracy NUMERIC(5,2) NULL · mastery_growth_score NUMERIC(5,2) NULL
- **Relationships:** FK → `users`.
- **Indexes:** `uq_monthly_activity_summary_user_id_month`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `accuracy_metrics`
- **Purpose:** Time-series accuracy measurements at configurable granularity (per chapter/topic/concept/overall).
- **PK:** `accuracy_metric_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · scope_type VARCHAR(20) NOT NULL CHECK IN ('overall','subject','chapter','topic','concept') · scope_id UUID NULL (NULL when scope_type='overall') · period_start DATE NOT NULL · period_end DATE NOT NULL · accuracy_percent NUMERIC(5,2) NOT NULL · sample_size INTEGER NOT NULL
- **Relationships:** FK → `users`; soft-reference `scope_id`.
- **Indexes:** `idx_accuracy_metrics_user_id_scope`.
- **Validation:** `period_end` >= `period_start`.
- **Future Expansion:** None.

#### `speed_metrics`
- **Purpose:** Time-series solve-speed measurements vs. estimated solve time, at configurable scope.
- **PK:** `speed_metric_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · scope_type VARCHAR(20) NOT NULL · scope_id UUID NULL · period_start DATE NOT NULL · period_end DATE NOT NULL · avg_time_seconds NUMERIC(7,2) NOT NULL · avg_estimated_time_seconds NUMERIC(7,2) NULL · speed_ratio NUMERIC(5,2) NULL (actual/estimated)
- **Relationships:** FK → `users`.
- **Indexes:** `idx_speed_metrics_user_id_scope`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `consistency_metrics`
- **Purpose:** Measures variance in performance/study-habit regularity over time (a student who studies erratically scores lower here than one with steady daily habits, even at equal total volume).
- **PK:** `consistency_metric_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · period_start DATE NOT NULL · period_end DATE NOT NULL · study_day_variance NUMERIC(6,3) NULL · accuracy_std_dev NUMERIC(5,2) NULL · consistency_score NUMERIC(5,2) NULL CHECK (0–100)
- **Relationships:** FK → `users`.
- **Indexes:** `idx_consistency_metrics_user_id_period`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `mastery_snapshots`
- **Purpose:** Point-in-time full snapshot of mastery distribution across all concepts — enables "mastery over time" trend charts without replaying all `concept_mastery` updates.
- **PK:** `mastery_snapshot_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · snapshot_date DATE NOT NULL · avg_mastery_score NUMERIC(5,2) NOT NULL · concepts_mastered_count INTEGER NOT NULL · concepts_in_progress_count INTEGER NOT NULL · concepts_not_started_count INTEGER NOT NULL · subject_breakdown JSONB NULL
- **Relationships:** FK → `users`.
- **Indexes:** `uq_mastery_snapshots_user_id_date`.
- **Validation:** Standard.
- **Future Expansion:** None.

#### `retention_snapshots`
- **Purpose:** Point-in-time aggregate retention health across all learned concepts.
- **PK:** `retention_snapshot_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · snapshot_date DATE NOT NULL · avg_retention_score NUMERIC(5,2) NOT NULL · concepts_at_risk_count INTEGER NOT NULL (retention below threshold)
- **Relationships:** FK → `users`.
- **Indexes:** `uq_retention_snapshots_user_id_date`.
- **Validation:** Standard.
- **Future Expansion:** None.

---

### 3.13 Domain M — Settings

#### `user_settings`
- **Purpose:** Application/learning-behavior configuration per user. *(+ Sync Columns)*
- **PK:** `user_setting_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL, UNIQUE) · daily_goal_minutes INTEGER NOT NULL DEFAULT 60 · preferred_difficulty_start VARCHAR(20) NOT NULL DEFAULT 'medium' · ai_tutor_persona VARCHAR(30) NOT NULL DEFAULT 'default' · dark_mode BOOLEAN NOT NULL DEFAULT false · offline_mode_enabled BOOLEAN NOT NULL DEFAULT true · font_size VARCHAR(10) NOT NULL DEFAULT 'medium'
- **Relationships:** FK → `users` (1:1).
- **Indexes:** `uq_user_settings_user_id`.
- **Validation:** Standard.
- **Future Expansion:** New settings added as columns are low-risk given the 1:1 nature; if settings proliferate, migrate to an EAV-style `user_setting_values(user_id, setting_key, setting_value)` table.

#### `app_preferences`
- **Purpose:** Generic key-value preference store for lower-priority, frequently-changing UI preferences that don't warrant dedicated columns (e.g., last-used tab, dismissed-tooltip flags).
- **PK:** `preference_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · preference_key VARCHAR(100) NOT NULL · preference_value JSONB NOT NULL
- **Relationships:** FK → `users`.
- **Indexes:** `uq_app_preferences_user_id_key`.
- **Validation:** Standard.
- **Future Expansion:** Deliberate EAV escape hatch — keeps the schema from bloating with one-off UI-state columns.

---

### 3.14 Domain N — Offline Sync

#### `sync_log`
- **Purpose:** Append-only ledger of every sync operation (push/pull) between a client device and the server — the backbone of offline-first reliability.
- **PK:** `sync_log_id` (BIGSERIAL)
- **Columns:** user_id UUID (FK NOT NULL) · device_id UUID (FK NOT NULL) · direction VARCHAR(10) NOT NULL CHECK IN ('push','pull') · entity_type VARCHAR(50) NOT NULL · entity_id UUID NOT NULL · sync_version INTEGER NOT NULL · status VARCHAR(20) NOT NULL CHECK IN ('success','conflict','failed') · synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
- **Relationships:** FK → `users`, `user_devices`.
- **Indexes:** `idx_sync_log_user_id_synced_at`; `idx_sync_log_entity_type_id`.
- **Validation:** Append-only.
- **Future Expansion:** Partition by month.

#### `sync_conflicts`
- **Purpose:** Records unresolved or auto-resolved conflicts when two devices edit the same row offline before syncing.
- **PK:** `sync_conflict_id` (UUID)
- **Columns:** user_id UUID (FK NOT NULL) · entity_type VARCHAR(50) NOT NULL · entity_id UUID NOT NULL · device_a_id UUID (FK → user_devices NOT NULL) · device_b_id UUID (FK → user_devices NOT NULL) · device_a_version JSONB NOT NULL · device_b_version JSONB NOT NULL · resolution_strategy VARCHAR(30) NOT NULL CHECK IN ('last_write_wins','manual','merged') · resolved_value JSONB NULL · resolved_at TIMESTAMPTZ NULL
- **Relationships:** FK → `users`, `user_devices` (×2).
- **Indexes:** `idx_sync_conflicts_user_id_resolved_at`.
- **Validation:** `resolved_at` NULL until resolution_strategy applied.
- **Future Expansion:** None — this table is what makes the `sync_version`/`last_synced_at` columns on offline-editable tables actually actionable rather than decorative.

#### `device_sync_state`
- **Purpose:** Per-device watermark tracking what has already been synced, to make incremental (delta) sync efficient rather than full-table sync on every reconnect.
- **PK:** `device_sync_state_id` (UUID)
- **Columns:** device_id UUID (FK NOT NULL, UNIQUE) · user_id UUID (FK NOT NULL) · last_full_sync_at TIMESTAMPTZ NULL · last_delta_sync_at TIMESTAMPTZ NULL · sync_cursor JSONB NULL (per-table high-water-mark timestamps/versions)
- **Relationships:** FK → `user_devices` (1:1), `users`.
- **Indexes:** `uq_device_sync_state_device_id`.
- **Validation:** Standard.
- **Future Expansion:** None.

---
## 4. Relationship Description (ERD Narrative)

Rather than a single flat ER diagram (impractical at 105 tables), relationships are described as **five interconnected clusters**, each internally dense and connected to neighboring clusters through a small number of well-defined foreign keys.

### 4.1 Identity Cluster → everything
`users` is the universal root. Every other cluster hangs off `users.user_id`, directly or transitively. This is a strict 1:N star — no table in the system is reachable without passing through a `user_id` foreign key except pure reference/lookup data (`exams`, `subjects`, `chapters`, `topics`, `subtopics`, `concepts`, `question_types`, `difficulty_levels`, `formulas`), which are shared, user-independent content.

### 4.2 Curriculum Cluster (content backbone)
`exams` → `exam_subjects` → `subjects` → `chapters` → `topics` → `subtopics` → `concepts` forms a strict hierarchical tree (1:N at each level). `concepts` additionally participates in two self-referential graphs: `concept_prerequisites` (directed, acyclic by design) and `concept_relations` (directed, cyclic-permitted, typed edges) — together these form the **Knowledge Graph**. `formulas` attaches 1:N below `concepts`. This cluster is exam-agnostic at the leaf level — a `concept` is not owned by an exam, but its *relevance* to an exam is derived transitively through `chapters` → `exam_subjects` → `exams`, which is what allows JEE/WBJEE/GATE/NEET to reuse the same curriculum tree with zero duplication.

### 4.3 Content/Question Cluster
`questions` sits at the center, connected to the Curriculum Cluster via `question_topics` and `question_concepts` (both M:N), and to `formulas` via `question_formulas` (M:N). Each `question` has exactly one `current_version_id` pointing into `question_versions` (1:N with a "current" pointer), and one `solutions` row (1:1) which fans out into `solution_steps` (1:N) and `alternative_solutions` (1:N). `hints` attach 1:N to `questions`. `pyq_tags` (1:N — a question can be tagged as a PYQ for multiple exam/year combinations) and `question_sources` (1:1) provide provenance. This cluster is also user-independent content, shared platform-wide.

### 4.4 Learning & Interaction Cluster (user × content)
This is where `users` meets the Curriculum and Content clusters. `concept_mastery`, `chapter_mastery`, `topic_mastery`, `confidence_scores`, `retention_scores`, and `spaced_repetition_state` are all `(user_id, concept_id or chapter_id or topic_id)` composite-unique tables — the "state" of a specific user against a specific curriculum node. `learning_sessions` and `session_activities` capture time-boxed interaction events. `test_attempts` → `attempt_answers` capture assessment events, and **every `attempt_answer` write is the trigger point** that fans out updates into `concept_mastery`, `mistakes` (on incorrect answers), and eventually `chapter_mastery`/`daily_activity_summary` (via recompute jobs). This is the highest-write-volume cluster and the primary input to the AI Cluster.

### 4.5 AI, Mock Test, PDF, and Support Clusters
- **Mock Test Cluster:** `mock_tests` → `mock_test_sections` → `mock_test_questions` (referencing `questions`) is the blueprint; `test_attempts` → `attempt_answers`/`attempt_section_timing`/`attempt_question_timing` is the instance; `test_analytics_summary` is the derived read-model.
- **PDF Cluster:** `uploaded_pdfs` → `pdf_pages` → `ocr_results` → (`extracted_text_blocks`, `extracted_formulas`, `extracted_diagrams`, `extracted_questions`) is a strict pipeline. The `promoted_*_id` columns on the `extracted_*` tables are the only bridge back into the canonical Curriculum/Content clusters — content never enters production tables without passing through this reviewed promotion path.
- **AI Cluster:** `ai_conversations` → `ai_messages` is the raw chat log; `ai_memory` is curated long-term state; `weakness_detections` and `ai_recommendations` are structured AI outputs, both reading from the Learning & Interaction Cluster and writing recommendations back for the user; `adaptive_learning_decisions` is a pure audit log with no downstream FK dependents (append-only, terminal node).
- **Support tables** (`mistakes`, `flashcards`/`flashcard_decks`, `notes`/`note_links`, `bookmarks`, `study_plans`/`planned_activities`, `notifications`) each hang directly off `users` and reference into the Curriculum/Content clusters via nullable FKs or soft-references, allowing them to exist independently (e.g., a note not tied to any concept). `planned_activities` additionally links back to `spaced_repetition_state` when the AI/spaced-repetition engine (not a manual or AI-authored plan) is the source of a scheduled item — this is the single merged calendar table replacing what were two overlapping systems in the original design (see §3.8 revision note).
- **Analytics Cluster** (`daily/weekly/monthly_activity_summary`, `accuracy_metrics`, `speed_metrics`, `consistency_metrics`, `mastery_snapshots`, `retention_snapshots`) is entirely **derived** — every row here is computable from the Learning & Interaction Cluster and exists purely for read performance. No other table depends on Analytics tables (strict one-way data flow, event tables → analytics tables).
- **Sync Cluster** (`sync_log`, `sync_conflicts`, `device_sync_state`) is orthogonal — it references `user_devices` and generic `(entity_type, entity_id)` pairs across every offline-editable table, rather than living inside any single domain.

---
## 5. Normalization Strategy

**Baseline: 3NF/BCNF for all OLTP (transactional) tables.**

- Every non-key attribute depends on the whole key, and nothing but the key (3NF), verified table-by-table above.
- Composite/derived concepts (e.g., "a question's exam relevance") are deliberately **not** stored as columns but computed through join paths (`question_concepts` → `concepts` → `subtopics` → `topics` → `chapters` → `exam_subjects` → `exams`) — storing exam relevance directly on `questions` would violate 3NF (transitive dependency) and would require N rows or a fragile array column per multi-exam question.
- Lookup tables (`question_types`, `difficulty_levels`) exist specifically to eliminate repeating-group / enum-sprawl anti-patterns and to allow numeric weighting (`difficulty_levels.numeric_weight`) that a plain `CHECK`-constrained VARCHAR could not carry.
- M:N relationships are always resolved through explicit junction tables (`question_topics`, `question_concepts`, `exam_subjects`, etc.) — never through array/JSON columns — so referential integrity, cascading deletes, and indexing all work natively.

**Deliberate, documented denormalization (3 exceptions):**

1. **Analytics Domain (§3.12)** — `daily/weekly/monthly_activity_summary`, `*_metrics`, `*_snapshots` are pre-aggregated read-models. This is classic OLTP/OLAP separation: keeping dashboards fast means not recomputing SUM/AVG over `session_activities`/`attempt_answers` on every page load. These tables are regenerable at any time from source event tables — they hold no information that couldn't be recomputed, which is the safety property that makes denormalization acceptable here.
2. **`chapter_mastery` / `topic_mastery`** — materialized rollups of `concept_mastery`. Same justification: fast dashboard reads, regenerable, recomputed on a defined trigger cadence (see §7).
3. **`test_analytics_summary`** — computed once at test submission and frozen. This is not a "denormalization that must stay in sync" but an **immutable historical snapshot** (the analytics of a *specific completed attempt* shouldn't silently change if scoring logic changes later) — closer to an audit record than a cache.

**JSONB usage discipline (addressing v1 over-reliance):**

> **Revision note (v2):** v1 reached for JSONB in several places (`options_json`, `variables_json`, `input_signals`, `decision_output`, `metadata`) without a stated rule for *when* that's appropriate versus lazy schema design. v2 states the rule explicitly so future columns are added consistently rather than by habit.

JSONB is used **only** when at least one of these is true, and plain columns/junction tables are used otherwise:
1. **The shape is genuinely per-row variable and not queried by individual sub-field in hot paths** — e.g., `question_versions.options_json` (an MCQ has 2–5 options, a numerical question has none; querying "find questions where option C is correct" is never a real access pattern, so JSONB is appropriate here rather than an `options` junction table with 4x the row overhead for no query benefit).
2. **It's a snapshot/audit payload, not live queryable state** — e.g., `adaptive_learning_decisions.input_signals`/`decision_output`, `ai_study_planner_runs.input_snapshot`. These exist purely for "what did the system see when it made this call," read back whole for debugging/explainability, never filtered by sub-field in a `WHERE` clause. Structuring them as columns would mean a migration every time the AI model's input feature set changes — exactly the kind of churn JSONB is meant to absorb.
3. **It's explicitly a deferred/rare-access extension point**, documented as such — e.g., `app_preferences.preference_value` (§3.13) is a deliberate EAV escape hatch for long-tail UI state, not core data.

Everywhere else — anything filtered, joined, aggregated, or constrained in normal application queries (`mastery_score`, `status`, every FK, every enum) — uses typed columns with `CHECK` constraints, never JSONB. `formulas.variables_json` (variable-name → meaning map for display purposes only, never queried) satisfies rule 1 and stays as-is; it is not treated as an exception needing further justification.

**Soft-reference (polymorphic-lite) exception:** `note_links`, `bookmarks`, `session_activities.reference_id`, `notifications.reference_id`, `semantic_embeddings`, and `citations` use an `(entity_type, entity_id)` pattern instead of per-type foreign keys. This is a conscious trade-off: it avoids either (a) a combinatorial explosion of nullable FK columns on tables like `bookmarks` (one column per bookmarkable type), or (b) N near-identical tables (`concept_bookmarks`, `question_bookmarks`, ...). The cost — no database-level FK enforcement, existence validated at the application layer — is accepted because these are low-criticality, user-generated convenience features, not core academic-integrity data (contrast with `attempt_answers`, which *does* use hard FKs throughout because grading correctness must be enforced by the database).

---
## 6. Index Strategy

### 6.1 Default indexing rules applied throughout
- Every **primary key** is automatically indexed (B-tree, UUID).
- Every **foreign key** column receives an explicit B-tree index (`idx_<table>_<fk_column>`) — Postgres does *not* auto-index FKs, and every join path in §4 depends on this.
- Every **composite unique business key** (e.g., `(user_id, concept_id)` on `concept_mastery`) is enforced via a `UNIQUE` constraint, which Postgres backs with an index automatically — this index is also reused for the extremely common "get this user's state for this concept" lookup, so it does double duty as both a constraint and the primary access path.

### 6.2 Specialized index types by workload

| Workload | Index Type | Applied To |
|---|---|---|
| Full-text search over free text | GIN (`tsvector`) | `notes.content`, `concepts.concept_name` (via `pg_trgm` for fuzzy match), `question_versions.question_text` |
| Fuzzy/typo-tolerant search | GIN + `pg_trgm` | `formulas.formula_name`, `concepts.concept_name` |
| Semantic vector similarity | HNSW (`pgvector`) | `semantic_embeddings.embedding_vector` |
| JSONB attribute queries | GIN | `session_activities.metadata`, `test_analytics_summary.weak_topics`, `adaptive_learning_decisions.input_signals` |
| Partial indexes (filtered) | B-tree WHERE clause | `auth_sessions` WHERE `revoked_at IS NULL` (active sessions only); `test_attempts` WHERE `status='in_progress'`; `question_versions` WHERE `is_current=true`; `notifications` WHERE `is_read=false` |
| Time-range queries | B-tree on timestamp, DESC | `session_activities(session_id, occurred_at DESC)`, `ai_messages(conversation_id, created_at DESC)`, `sync_log(user_id, synced_at DESC)` |
| Range-scan lookups | B-tree on date | `planned_activities.scheduled_date`, `spaced_repetition_state.next_review_date` — drive "what's due today" dashboard queries |

### 6.3 High-frequency query paths and their supporting indexes

| Query pattern | Supporting index(es) |
|---|---|
| "What's due for revision today?" | `idx_spaced_repetition_next_review_date` (partial WHERE next_review_date <= today) |
| "Show my weak concepts" | `idx_concept_mastery_mastery_score` (partial WHERE mastery_score < threshold) |
| "Load full question with solution/hints" | `idx_questions_subtopic_id`, PK on `solutions.question_id`, `idx_solution_steps_solution_id_step_number` |
| "Resume in-progress mock test" | partial unique index on `test_attempts` WHERE status='in_progress' |
| "Find similar questions" (AI) | HNSW vector index on `semantic_embeddings` |
| "Dashboard: today/week/month activity" | PKs on `daily/weekly/monthly_activity_summary` (already unique-indexed by user+period) — no scan needed |
| "Sync delta since last checkpoint" | `idx_sync_log_user_id_synced_at`, `sync_version`/`last_synced_at` columns on offline-editable tables |

### 6.4 Index maintenance policy
- All indexes on high-write append-only tables (`session_activities`, `ai_messages`, `audit_log`, `sync_log`) are monitored for bloat; `REINDEX CONCURRENTLY` scheduled monthly.
- Composite indexes are ordered with the highest-selectivity / most-frequently-filtered column first (e.g., `user_id` before `status`), consistent with the query patterns above.
- No more than one full-text/GIN index per large text column to control write amplification on insert-heavy tables.

---
## 7. Data Integrity Rules

### 7.1 Referential integrity
- All hard foreign keys use `ON DELETE RESTRICT` by default for **content tables** (a `chapter` cannot be deleted while `topics` reference it) — prevents silent curriculum corruption.
- **User-owned dependent data** (e.g., `session_activities` when a `learning_session` is deleted, `attempt_answers` when a `test_attempt` is deleted) uses `ON DELETE CASCADE` — deleting the parent event legitimately removes its children.
- **Account deletion (GDPR-style "right to erasure")** is handled via a dedicated soft-delete + scheduled hard-purge workflow, *not* a single `ON DELETE CASCADE` from `users` — a direct cascade from `users` would silently and irreversibly delete years of academic history the moment a `status='deleted'` flag is mis-set. Deletion is: (1) `users.status → 'deleted'` + all sync-capable tables' `is_deleted → true`, (2) 30-day grace period, (3) background job hard-deletes in dependency order.

### 7.2 Mastery/analytics recomputation contract

> **Revision note (v2):** v1 left the actual mastery formula undefined ("recomputed asynchronously," no math). Since `concept_mastery` is the single most important derived value in the system — everything downstream (adaptive question selection, weakness detection, recommendations) depends on it — v2 specifies it concretely.

**`concept_mastery.mastery_score` formula (recomputed synchronously on every graded attempt):**

A simple accuracy ratio is a poor mastery signal on its own — 3/3 correct shouldn't score the same as 30/30 correct, and a correct answer on a `hard` question should count for more than one on an `easy` question. The score is a **recency-weighted, difficulty-weighted accuracy**, computed over the concept's attempt history (joined from `attempt_answers`/practice attempts via `question_concepts`):

```
mastery_score = 100 × Σ(w_i × difficulty_weight_i × correct_i) / Σ(w_i × difficulty_weight_i)

where, for each attempt i on a question testing this concept (most recent N=20 attempts):
  correct_i        = 1 if correct, 0 if incorrect
  difficulty_weight_i = difficulty_levels.numeric_weight for that question (1.0 / 1.5 / 2.0 / 2.5)
  w_i               = recency_decay ^ (rank of attempt i, 0 = most recent)
  recency_decay     = 0.90   (each attempt one step older counts ~10% less)
```

- Only the most recent 20 attempts per concept are considered (older attempts age out of the *current* score but remain in `attempt_answers`/`session_activities` for historical trend charts — nothing is deleted).
- `attempts_count`/`correct_count` on `concept_mastery` remain simple lifetime totals (unweighted), kept separately for "how many times have I practiced this" displays — they are *not* the same number as what feeds `mastery_score`.
- `mastery_level` (the human-readable label) is derived directly from `mastery_score` via fixed thresholds: `not_started` (no attempts) · `beginner` (<40) · `developing` (40–69) · `proficient` (70–89) · `mastered` (≥90).
- `mastery_trend` is set by comparing the current `mastery_score` to the score computed 7 days prior (stored in a rolling `mastery_snapshots`-style lookback): `improving` (+5 or more) · `declining` (−5 or more) · `stable` (otherwise).
- This computation runs **synchronously**, inside the same transaction as the `attempt_answer` write — it is the one derived value that must never be stale, since the AI adaptive engine reads it in near-real-time.

**Rollup formulas (asynchronous, debounced):**
- `topic_mastery.mastery_score` = simple average of `concept_mastery.mastery_score` across all concepts under that topic that have `attempts_count > 0` (concepts never attempted are excluded from the average, not treated as zero — otherwise starting a new topic would crater the score).
- `chapter_mastery.mastery_score` = same averaging pattern, one level up, over `topic_mastery`.
- Both are recomputed via a background job triggered on `concept_mastery` change, debounced to at most once per few minutes per user — acceptable staleness because dashboards, not real-time adaptive decisions, consume them.
- `daily/weekly/monthly_activity_summary`, `mastery_snapshots`, `retention_snapshots` are recomputed on a **fixed schedule** (nightly for daily, weekly cron for weekly, monthly cron for monthly) — never triggered per-event, to bound background job volume.

### 7.3 Versioning integrity
- `question_versions.is_current` is enforced as exactly-one-true-per-question via a partial unique index; any update that sets a new version to current must, in the same transaction, unset the previous current row (application-layer transaction, not a trigger, to keep the write path explicit and testable).
- `attempt_answers.question_version_id` is captured at attempt time and never changes retroactively — a student's graded history reflects the exact question wording they saw, immune to later corrections.

### 7.4 Grading integrity
- `attempt_answers.is_correct` and `marks_awarded` are computed by the application/grading service by comparing the student's answer to `question_versions.options_json`/`correct_answer_text`, then persisted — not computed ad hoc at read time — so historical scores remain stable even if future logic changes.
- `mock_tests.total_marks` must equal the sum of linked question marks at publish time (`is_published=true` gate); unpublished/draft tests are exempt to allow incremental authoring.

### 7.5 Uniqueness / business-key integrity
- Composite unique constraints enforce "one state row per user per curriculum node" throughout (`concept_mastery`, `chapter_mastery`, `confidence_scores` is the exception — intentionally a time series, not unique — see table spec).
- `pyq_tags` intentionally allows multiple rows per question (a question can be a PYQ for more than one exam/year) — no uniqueness constraint beyond `(question_id, exam_id, exam_year, shift)`.

### 7.6 Domain value integrity
- All enumerated status/type columns use `VARCHAR` + `CHECK (... IN (...))` rather than native Postgres `ENUM` types — chosen deliberately because `CHECK` constraints can be altered with a simple migration, whereas native `ENUM` value changes require more invasive `ALTER TYPE` operations that lock differently across Postgres versions. This is a maintainability trade-off documented for future engineers.
- Numeric ranges (`mastery_score BETWEEN 0 AND 100`, `confidence_value BETWEEN 1 AND 5`, etc.) are enforced via `CHECK` constraints at the database level, not solely in application code — defense in depth against bugs in the app/AI layer writing out-of-range values.

### 7.7 Object storage integrity
- No file bytes (PDFs, images, diagrams) are stored as Postgres BLOBs. All such content lives in S3-compatible object storage; Postgres stores only `storage_url` references. This keeps the database backup size manageable and lets storage scale independently (see Backup Strategy §8).

### 7.8 Soft-reference validation

> **Revision note (v2):** v1 relied on "the application checks this" for every `(entity_type, entity_id)` soft-reference (`bookmarks`, `note_links`, `notifications.reference_id`, `session_activities.reference_id`, `semantic_embeddings`, `citations`). That is the weakest point in the whole design — any bug, script, or bulk-import bypassing the application layer produces silent orphans. v2 replaces "trust the app" with an actual database-enforced check.

**Concrete mechanism — a shared validation trigger function:**

A single reusable PL/pgSQL function, `fn_validate_entity_reference(entity_type, entity_id)`, is attached as a `BEFORE INSERT OR UPDATE` trigger on every table using the soft-reference pattern. The function contains a `CASE` over the known `entity_type` values for that table (a small, fixed set per table — e.g., `bookmarks` only ever points to `question | concept | chapter | formula | flashcard | note | pdf`) and runs the matching `EXISTS (SELECT 1 FROM <table> WHERE <pk> = entity_id)` check, `RAISE EXCEPTION` if it fails. This gives real, transaction-level referential integrity — a bad reference simply cannot be committed — while still keeping one physical column pair (`entity_type`, `entity_id`) instead of five nullable FK columns per table.

- This is strictly better than a true polymorphic FK (which Postgres doesn't support natively) and strictly better than app-only validation (which Postgres can't enforce). It costs one small trigger function per table, reused via the same underlying validator with a per-table allowed-type list.
- The previously-proposed nightly orphan-check job is **retained as a defense-in-depth backstop**, not as the primary integrity mechanism — it now exists to catch the one remaining gap (a row in the *referenced* table being hard-deleted after the soft-reference was created, which the trigger can't prevent since it only fires on the *referencing* table's writes). Hard-deletes on referenced content tables are already `ON DELETE RESTRICT` by default (§7.1) precisely to close this gap for content tables; the nightly job covers the rarer case of user-owned entities (e.g., a `flashcard` a `bookmark` points to) that are legitimately soft-deleted.

---
## 8. Backup Strategy

| Layer | Strategy |
|---|---|
| **Continuous protection** | WAL (Write-Ahead Log) archiving enabled; point-in-time recovery (PITR) target: restore to any point within the last 7 days. |
| **Full logical backups** | Nightly `pg_dump` (custom format) of the full database, retained 30 days rolling. |
| **Physical base backups** | Weekly `pg_basebackup` snapshot, retained 90 days, stored in a separate region/availability zone from the primary. |
| **Object storage (PDFs, images, diagrams)** | Versioned bucket with lifecycle policy; backed up independently of Postgres since it's referenced-by-URL, not embedded — losing the DB doesn't lose files, and vice versa is mitigated by keeping `storage_url` references consistent via the citations/media tables. |
| **Critical low-volume tables** (`users`, `auth_credentials`, `question_versions` where `is_current=true`) | Additional daily targeted export as a fast-recovery safety net, independent of the full backup cycle. |
| **High-volume append-only tables** (`session_activities`, `ai_messages`, `audit_log`, `sync_log`) | Backed up via the standard WAL/base-backup cycle but are also the first candidates for partition-level archival to cold storage (see below) — reduces backup window size over time. |
| **Restore testing** | Quarterly restore drills into an isolated environment to validate backup integrity, not just backup completion. |
| **Encryption** | Backups encrypted at rest (AES-256); `auth_credentials` and any PII columns additionally covered by column-level encryption or a dedicated KMS-backed encryption layer at the application boundary. |

---

## 9. Migration Strategy

1. **Tooling:** Versioned, forward-only migrations (e.g., Flyway/Sqitch-style — one file per change, checksummed, applied in order, never edited after merge). Every migration is paired with a rollback script where the operation is safely reversible (most additive changes); destructive changes (drop column/table) require a two-phase deprecate-then-drop pattern instead of a rollback script.
2. **Two-phase pattern for breaking changes:** (a) *Expand* — add new column/table alongside the old, backfill data, dual-write if needed; (b) *Contract* — after application code fully cuts over and a safety window passes, drop the old column/table in a separate migration. This avoids any deploy where schema and application code must change atomically.
3. **Zero-downtime constraints:** New `NOT NULL` columns are added as nullable + backfilled + constrained in a follow-up migration, never as a single blocking `ALTER TABLE ... ADD COLUMN ... NOT NULL` on a large table.
4. **Index creation:** Always via `CREATE INDEX CONCURRENTLY` on tables expected to have production traffic, accepting the trade-off of no transactional wrapping for that statement.
5. **Environment promotion:** migrations run automatically against a staging replica seeded from an anonymized production snapshot before being promoted to production, with the exam-agnostic design (§4.2) meaning most curriculum-expansion "migrations" (e.g., adding GATE) are **data seeds**, not schema migrations — a key benefit of the taxonomy-driven design.
6. **Schema versioning table:** A `schema_migrations` bookkeeping table (migration id, applied_at, checksum) is maintained by the migration tool itself as the single source of truth for "what's actually applied," independent of any ORM's model state.

---

## 10. Future Expansion Strategy

### 10.1 Multi-exam expansion (JEE Main, JEE Advanced, WBJEE, GATE, NEET)
Already structurally supported without migration: insert a new row into `exams`, map relevant `subjects` via `exam_subjects`, and tag existing or new `questions` via `pyq_tags`/`question_topics`. No table in the Curriculum or Content clusters (§4.2, §4.3) is JELET-specific. NEET's biology-heavy syllabus will require new `subjects`/`chapters`/`concepts` rows (data, not schema) — the only genuinely new *structural* need would be a `question_types` row for NEET's specific negative-marking pattern if it differs, which is also pure data.

### 10.2 Multi-student / B2B expansion
`users.account_type` already anticipates `admin`/`parent_viewer` roles. Moving to a coaching-institute model requires: (a) an `organizations` table + `organization_members` join table, (b) an `organization_id` column added to `users` (nullable, additive migration), (c) `mock_tests.is_shared`/a `shared_with` table, and (d) reactivating the deferred `leaderboards` table (§3.6) now that a real peer population exists for percentile ranking. None of this requires restructuring existing tables.

### 10.3 Content scale
- `questions`/`concepts`/`formulas` tables are designed to scale to hundreds of thousands of rows without redesign — all access paths are indexed FK lookups, not full scans.
- `semantic_embeddings` and `pgvector` HNSW indexing is the scaling lever for AI-driven content retrieval as the question bank grows past what keyword search can handle well.

### 10.4 Event-table scale (partitioning roadmap)
`session_activities`, `ai_messages`, `audit_log`, `sync_log`, `notifications`, and `adaptive_learning_decisions` are candidates for **native Postgres range partitioning by month** once row counts justify it (typically >10M rows). The schema already uses append-only, timestamp-anchored designs on these tables specifically so partitioning can be introduced later as a purely physical change with no logical schema impact.

### 10.5 Algorithm evolution
`spaced_repetition_state`'s SM-2-specific columns (`ease_factor`, `interval_days`, `repetitions`) are named after the current algorithm but isolated to that one table — swapping in FSRS or a custom AI-trained scheduler means adding/renaming columns on `spaced_repetition_state` only; `planned_activities` (the calendar-facing projection) is algorithm-agnostic by construction since it just stores dates, not scheduler internals.

### 10.6 Read-scaling
As the single-user system evolves toward more concurrent users, the design supports adding read replicas for the Analytics Cluster (§4.5) with no application changes beyond connection routing, since that cluster is strictly derived and read-heavy.

### 10.7 Search/AI infrastructure evolution
The `entity_type`/`entity_id` soft-reference pattern used by `semantic_embeddings` and `citations` means the embedding index can later be migrated to a dedicated vector database (e.g., Pinecone/Weaviate) with Postgres retaining only the metadata rows — a swap-the-storage-engine change that doesn't touch any other table.

---

*End of Database Architecture Document.*
