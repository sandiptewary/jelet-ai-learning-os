# JELET AI Learning Operating System
## AI Brain — Design Specification (v1.0)

**Document Owner:** Chief AI Architect
**Scope:** Intelligence Layer only (Knowledge, Reasoning, Personalization, Memory, Decisioning)
**Out of Scope:** PRD, SRS, System Architecture, Database Schema, APIs, Code (already completed / not covered here)

---

## 0. Purpose of This Document

This document defines **how JELET thinks** — not how it is built as software, but how it behaves as a teacher. It specifies 20 intelligent engines that together form the "AI Brain": a system that observes a student, builds a private model of what that student knows, doesn't know, and misunderstands, and then makes moment-to-moment and week-to-week decisions about what that student should learn next, how, and why.

Every engine below is written so an AI/ML engineering team can implement it without further clarification on *intent*. Implementation technology (LLM prompts, ML models, rule engines, vector stores, etc.) is intentionally left flexible — this document specifies **behavior, not code**.

### 0.1 Core Teaching Philosophy (applies to every engine)

1. **Diagnosis before instruction.** The AI never teaches without first knowing the student's current state.
2. **Prerequisite integrity.** No concept is taught or tested until its prerequisite concepts cross the mastery threshold.
3. **Evidence over assumption.** Every decision (difficulty, next topic, revision) is backed by observed behavior, not a fixed curriculum order.
4. **Root cause over surface symptom.** A wrong answer is a symptom. The AI's job is to find the disease.
5. **Forgetting is expected, not a failure.** The system is built around the forgetting curve, not against it.
6. **Every student is a different function.** Two students with the same score can have completely different internal models and must receive different treatment.
7. **The AI must be able to explain itself.** Every recommendation must trace back to explicit evidence (auditable reasoning), never an opaque black box decision.

### 0.2 How to Read This Document

Each of the 20 engines is documented with 8 fixed subsections: **Purpose, Responsibilities, Inputs, Outputs, Algorithms, Decision Rules, Edge Cases, Future Improvements.** Section 21 defines cross-cutting Learning Rules. Section 22 defines the Memory Architecture. Section 23 defines how engines communicate as one cognitive system.

---

## 1. Knowledge Graph Engine

### Purpose
Acts as the AI's model of "what exists to be known." Represents the entire subject universe (subjects → chapters → topics → concepts → sub-concepts → formulas) as a connected graph rather than a flat syllabus list, so every other engine can reason about relationships, not just content.

### Responsibilities
- Maintain the canonical structure of all teachable units ("nodes") across every subject.
- Encode relationships between nodes: prerequisite-of, part-of, related-to, applied-in, tested-with.
- Provide a queryable map of "distance" between any two concepts (how many steps apart).
- Serve as the shared vocabulary every other engine references (no engine invents its own concept IDs).
- Version the graph as curriculum content is added or corrected, without breaking historical student records.

### Inputs
- Curriculum/syllabus content (chapters, topics, learning objectives).
- Subject-matter-expert annotations of relationships between concepts.
- Question bank metadata (which concepts a question exercises).
- Textbook/reference structure (for alignment with familiar sequencing).

### Outputs
- A directed graph of nodes and typed edges (prerequisite, related, applied-in).
- Concept metadata: difficulty tier, estimated learning time, exam weightage, tags.
- Neighbor queries: "what feeds into X," "what does X feed into," "what is related to X."

### Algorithms
- **Graph representation:** directed acyclic graph (DAG) for prerequisite edges; general graph for "related" edges.
- **Topological layering:** compute learning "depth" of every node (longest prerequisite chain from foundational root) so the system knows how "deep" a concept is.
- **Similarity clustering:** group concepts that are frequently mistaken for each other or co-occur in questions, to support Interleaved Practice and Mistake Intelligence.
- **Graph versioning:** append-only edge changes with effective-date stamps so past student mastery snapshots remain valid against the graph version they were computed on.

### Decision Rules
- A node cannot be marked "eligible to teach" to a student unless all its direct prerequisite nodes are at or above the mastery threshold for that student (see Mastery Engine).
- If curriculum experts add a new prerequisite edge that a student has already "passed" without it, the student is flagged for a lightweight prerequisite check, not full re-teaching.
- Cycles are not allowed in prerequisite edges; any proposed edge that creates a cycle is rejected at authoring time.

### Edge Cases
- Concepts that are prerequisites in one board/syllabus but not another (e.g., different state boards) — resolved via syllabus-scoped sub-graphs sharing a common core.
- A concept with no clear single prerequisite (foundational/root nodes) — explicitly tagged as "entry point."
- Two experts disagreeing on an edge — resolved via a review workflow, not silently auto-merged.

### Future Improvements
- Auto-suggest missing prerequisite edges by mining patterns of "students who fail A almost always struggle with B."
- Multi-board / multi-syllabus graph merging with automatic equivalence detection.
- Difficulty tiering learned from real student data instead of expert estimate only.

---

## 2. Concept Dependency Engine

### Purpose
Turns the static Knowledge Graph into a live, per-student readiness signal. Where the Knowledge Graph says "these are the prerequisites," this engine answers, in real time, "is *this specific student* actually ready for this specific concept right now?"

### Responsibilities
- Compute a per-student "readiness score" for every not-yet-taught concept.
- Detect prerequisite gaps before a student is exposed to a new concept.
- Trigger prerequisite remediation automatically when a gap is found.
- Prevent premature exposure to advanced material.

### Inputs
- Knowledge Graph edges for the target concept.
- Student's current per-concept Mastery scores (from Mastery Engine).
- Student's Confidence scores (from Confidence Engine).

### Outputs
- Readiness verdict per concept: Ready / Partially Ready / Not Ready.
- List of specific blocking prerequisite concepts, ranked by how far below threshold they are.
- A remediation micro-plan (ordered list of prerequisite concepts to revisit first).

### Algorithms
- **Readiness score** = weighted combination of prerequisite mastery scores, weighted by edge strength (a "hard" prerequisite weighs more than a "soft/related" one).
- **Gate function:** readiness = minimum(prerequisite mastery scores) for hard prerequisites (a single weak link blocks readiness), weighted average for soft prerequisites.
- **Gap ranking:** prerequisites sorted by (threshold − current mastery), largest gap first, to decide remediation order.

### Decision Rules
- If any hard-prerequisite mastery < threshold → concept is "Not Ready," teaching is blocked, remediation is queued first.
- If all hard prerequisites ≥ threshold but soft prerequisites are weak → "Partially Ready," concept is taught but with extra scaffolding/hints.
- If all prerequisites ≥ threshold → "Ready," concept is taught at standard difficulty.

### Edge Cases
- Brand-new student with no mastery history (cold start) → treat all prerequisites as "unknown," run a short diagnostic instead of assuming failure.
- Student who mastered a prerequisite long ago but has since decayed (per Spaced Repetition decay model) → treat decayed mastery as "Partially Ready," not "Ready."
- Concept with no prerequisites (entry point) → always Ready.

### Future Improvements
- Predictive readiness: estimate how many practice items are needed to cross threshold, not just yes/no.
- Cross-subject prerequisite detection (e.g., a physics concept blocked by a math gap).

---

## 3. Learning Path Generator

### Purpose
Converts the Knowledge Graph and a student's current mastery map into a concrete, ordered, personalized syllabus — the sequence in which this specific student should learn concepts to reach their goal fastest without violating prerequisite integrity.

### Responsibilities
- Generate an initial learning path at onboarding based on goal (exam, level, deadline).
- Continuously re-order/re-plan the path as new mastery, weakness, and time data arrives.
- Balance three competing forces: prerequisite order, exam weightage/priority, and student weakness.
- Produce both a macro path (chapters/weeks) and a micro path (today's next 3–5 concepts).

### Inputs
- Knowledge Graph structure.
- Student goal, target date, available study hours/day (from Study Planner).
- Current Mastery, Confidence, and Weakness data.
- Exam weightage/importance metadata from Knowledge Graph.

### Outputs
- Ordered concept sequence (macro path) with target dates.
- Daily/session-level micro path (next best concepts to study today).
- Rationale trace per recommendation ("recommended because prerequisite X is now mastered and this has high exam weight").

### Algorithms
- **Topological sort with weighting:** among all currently "Ready" concepts, rank by (exam weightage × urgency) − (estimated learning time), then pick top-N for the path window.
- **Priority queue re-planning:** every time Mastery/Weakness/Time updates, re-score the frontier of Ready concepts rather than recomputing the whole path from scratch (incremental replanning).
- **Time-boxing:** allocate estimated learning time per concept against Study Planner's available hours to produce realistic dates.

### Decision Rules
- Concepts that are "Not Ready" are never placed in the near-term path; they appear only after their remediation path.
- High-exam-weight weak concepts are prioritized over low-weight strong concepts, even if the low-weight ones are earlier in the traditional syllabus order, as long as prerequisites allow it.
- If the deadline is at risk (Study Planner signals insufficient time), path is compressed by dropping soft/optional nodes first, never by skipping hard prerequisites.

### Edge Cases
- Student goal changes mid-course (e.g., switches target exam) → path is regenerated, but historical mastery is preserved and reused, not discarded.
- Multiple valid orderings with equal priority → tie-break by "closest to a concept already in progress" to preserve learning momentum/context.
- Insufficient time to cover full syllabus before deadline → system explicitly flags this to the student/parent rather than silently under-covering.

### Future Improvements
- Path simulation: show the student 2–3 alternative paths (fast/thorough/balanced) with trade-offs.
- Reinforcement-learning-based path optimization using outcome data across many students (cohort-level learning transferred to path ordering, never to individual mastery claims).

---

## 4. Mastery Engine

### Purpose
The single source of truth for "how well does this student actually know this concept, right now." Every other engine reads from this rather than computing its own notion of knowledge level.

### Responsibilities
- Maintain a continuously updated mastery score per student per concept.
- Distinguish between mastery levels (e.g., Unseen, Learning, Practicing, Proficient, Mastered).
- Update mastery from every relevant learning event (practice, test, revision, mistake correction).
- Apply decay over time (mastery is not permanent — connects to Spaced Repetition).

### Inputs
- Every graded interaction: question attempts (correct/incorrect, time taken, hints used), test results, revision session outcomes.
- Concept metadata (difficulty tier) from Knowledge Graph.
- Elapsed time since last interaction with the concept (for decay).

### Outputs
- Per-concept mastery score (continuous, e.g., 0–100) and discrete band (Unseen/Learning/Practicing/Proficient/Mastered).
- Mastery trend (improving/flat/declining).
- Mastery confidence interval (how much evidence backs this score — 2 data points vs. 50).

### Algorithms
- **Bayesian-style updating (Bayesian Knowledge Tracing family):** each attempt updates a probability-of-mastery estimate, accounting for probability of guessing and probability of a careless slip, rather than simple percent-correct.
- **Recency-weighted scoring:** recent attempts weighted more heavily than old ones, so mastery reflects current state, not lifetime average.
- **Decay function:** mastery score decays over elapsed time since last correct, unaided demonstration, using a forgetting-curve model (tunable per student from Memory Engine's retention profile).
- **Evidence-strength tracking:** mastery scores below a minimum attempt count are marked "low confidence" and treated conservatively (never auto-promoted to Mastered on 1–2 attempts).

### Decision Rules
- A concept is promoted to "Mastered" only when: score ≥ threshold, AND minimum evidence count met, AND at least one demonstration under exam-like conditions (not just practice with hints).
- A single correct answer never fully unlocks mastery; a single wrong answer never fully removes it — updates are incremental.
- If decay drops a "Mastered" concept below the Proficient threshold, it is automatically re-queued into Spaced Repetition, not silently left stale.

### Edge Cases
- Lucky guess on a hard question → guess-probability discounting in the Bayesian model prevents a large mastery jump from a single lucky hit.
- Careless slip on an otherwise-mastered concept → slip-probability discounting prevents a large mastery drop from a single anomalous miss (but repeated "slips" are escalated to Mistake Intelligence for root-cause review).
- Long absence from the platform → decay applied on return, with a short re-diagnostic before resuming forward progress.

### Future Improvements
- Concept-specific decay rates learned from real forgetting data instead of a single global curve.
- Partial-credit modeling for multi-step problems (mastery per sub-skill within a single question).

---

## 5. Confidence Engine

### Purpose
Tracks the *psychological* dimension of learning separately from correctness: how sure the student feels versus how correct they actually are. This gap is one of the most important diagnostic signals in the entire system.

### Responsibilities
- Capture self-reported or inferred confidence per attempt (explicit slider/tag, or inferred from response time and hesitation patterns).
- Compute a Confidence–Competence gap per concept.
- Feed overconfidence and underconfidence signals to Weakness Detection and Study Planner.

### Inputs
- Explicit confidence signal (student taps "Sure / Not sure / Guessing" before or after answering, if UI supports it).
- Implicit signals: response time relative to question norm, answer changes before submit, hint requests.
- Correctness outcome (from Mastery Engine).

### Outputs
- Confidence score per attempt and rolled up per concept.
- Confidence–Competence quadrant label per concept: Confident-Correct, Confident-Incorrect (dangerous overconfidence), Unsure-Correct (underconfidence), Unsure-Incorrect (aware gap).
- Trend of confidence calibration over time (is the student becoming better calibrated?).

### Algorithms
- **Explicit-implicit fusion:** when explicit confidence is given, weight it primarily; blend with implicit signal as a check/adjustment. When explicit is absent, derive confidence purely from implicit signals (fast + no hint + no answer-change ≈ high confidence; slow + hints + multiple changes ≈ low confidence).
- **Calibration scoring:** compare stated confidence distribution to actual correctness rate over a rolling window (well-calibrated student's "sure" answers should be correct ~90%+ of the time, etc.).

### Decision Rules
- Confident-Incorrect concepts are flagged as **highest priority** for intervention — the student doesn't know that they don't know, which is the most dangerous exam-day failure mode.
- Unsure-Correct concepts are flagged for confidence-building (light positive-reinforcement practice), not remediation — the knowledge is fine, the self-trust is not.
- Sustained overconfidence pattern across many concepts triggers a Study Planner nudge toward more self-testing before tests.

### Edge Cases
- Student who never uses the explicit confidence UI → fall back fully to implicit signal, with a wider uncertainty band.
- Culturally/personality-driven under-reporting of confidence (some students always say "not sure") → normalize confidence per-student against their own historical baseline, not an absolute scale.

### Future Improvements
- Voice/typing-pattern-based confidence inference for richer implicit signal.
- Confidence-aware question phrasing (deliberately ask "how sure are you" more often on Confident-Incorrect-prone concepts).

---

## 6. Weakness Detection

### Purpose
Aggregates signals from Mastery, Confidence, and Mistake data into a single ranked list of the student's actual weak points — distinguishing true conceptual weakness from noise, one-off errors, or fatigue.

### Responsibilities
- Continuously scan all concepts for weakness signals.
- Rank weaknesses by severity and exam impact.
- Distinguish persistent weakness from transient/one-off dips.
- Feed prioritized weak concepts to Revision Recommendation, Study Planner, and Learning Path Generator.

### Inputs
- Mastery scores and trends.
- Confidence–Competence quadrant data.
- Mistake Intelligence root-cause tags.
- Exam weightage from Knowledge Graph.

### Outputs
- Ranked weakness list: concept, severity score, root-cause tag, exam-impact weight.
- Weakness category label: Conceptual, Procedural, Speed, Confidence, Retention.

### Algorithms
- **Severity scoring:** severity = f(low mastery, negative trend, Confident-Incorrect flag, exam weightage, persistence over time) — a weighted composite, not a single metric.
- **Persistence filter:** a dip must appear across a minimum number of independent attempts/sessions before being classified as a true weakness (filters out one-off bad days).
- **Root-cause tagging:** pulled directly from Mistake Intelligence's classification per failed attempt, aggregated at concept level.

### Decision Rules
- A concept only enters the "Top Weaknesses" list if it fails the persistence filter check (recurs across ≥ N attempts/≥ N days) — single bad sessions do not trigger full remediation.
- High-exam-weight weaknesses always outrank low-exam-weight weaknesses of similar severity in the ranked list.
- Confidence-only weaknesses (competence is fine) are routed differently from conceptual weaknesses — never merged into the same remediation queue.

### Edge Cases
- Fatigue-driven performance dip late in a long session → time-of-session and session-length metadata used to discount late-session errors before declaring a weakness.
- A "weakness" that is actually a fast-decaying but previously mastered concept → labeled as Retention weakness, routed to Spaced Repetition, not full Concept re-teaching.

### Future Improvements
- Weakness clustering across related concepts to detect a single upstream root cause producing multiple downstream weak concepts.
- Peer-cohort comparison (this weakness is unusually persistent compared to similar students) as an additional severity signal.

---

## 7. Revision Recommendation

### Purpose
Decides what the student should revisit, when, and in what format, turning Weakness Detection's diagnosis and Spaced Repetition's timing into a concrete daily/weekly revision plan.

### Responsibilities
- Select the highest-value concepts to revise given limited time.
- Choose revision format appropriate to the weakness type (quick recall, worked example, full re-teach, formula drill).
- Balance revision load against new-learning load in the daily plan.

### Inputs
- Weakness list (ranked, with category).
- Spaced Repetition due-list.
- Available study time (Study Planner).
- Upcoming test/exam dates (urgency).

### Outputs
- Daily revision queue: concept, recommended format, estimated time, priority reason.
- Weekly revision digest summary.

### Algorithms
- **Priority scoring:** priority = severity × exam-weight × urgency (days to next relevant test) ÷ estimated time cost — a value-per-minute ranking so the plan maximizes score improvement per minute spent.
- **Format selection rule table:** maps weakness category → revision format (e.g., Retention weakness → quick flashcard-style recall; Conceptual weakness → worked example + guided question; Procedural/Formula weakness → formula drill; Speed weakness → timed micro-set).

### Decision Rules
- Revision items due today (Spaced Repetition) are never bumped by lower-urgency new-weakness items unless the daily time budget is insufficient, in which case the oldest-due / highest-severity items win.
- No more than a configurable max share of a session (e.g., ~40%) is devoted to revision by default, unless an exam is imminent, in which case revision share increases automatically.

### Edge Cases
- Too many due items for available time → engine trims to the highest-priority subset and explicitly shows the student what was deferred (transparency, not silent dropping).
- A concept is both "due for spaced repetition" and "actively being newly taught" this week → merge into a single combined session rather than presenting twice.

### Future Improvements
- Auto-generated micro-summaries/cheat-sheets per weak concept as a lightweight revision format.
- Student-controllable revision-vs-new-learning ratio with AI guardrails.

---

## 8. Mistake Intelligence

### Purpose
The diagnostic core of the system. Every wrong answer is treated as a symptom that must be classified into a root cause, because the correct pedagogical response is completely different depending on *why* the student got it wrong.

### Responsibilities
- Classify every incorrect (and suspicious correct-but-slow) attempt into a root-cause category.
- Detect patterns across multiple mistakes to find systemic issues.
- Feed root-cause tags into Weakness Detection, Study Planner, and direct student feedback.

### Inputs
- Full attempt trace: selected answer, correct answer, time taken, hint usage, answer changes, question type, question difficulty, concept(s) tested.
- Mastery/Confidence context for the concept at time of attempt.
- Historical mistake pattern for this student on this and related concepts.

### Outputs
- Root-cause tag per mistake: **Concept Gap, Formula Error, Calculation Error, Time Management, Guessing, Careless Error.**
- Pattern alerts: "this student makes Calculation Errors specifically under time pressure" or "this student confuses Concept A and Concept B."
- Root-cause distribution report per concept and per student.

### Algorithms
- **Rule-based first pass:** deterministic signals map directly to categories where possible — e.g., correct formula/approach shown in work but wrong final number → Calculation Error; wrong formula selected → Formula Error; answer given in near-zero time with no engagement → Guessing; long time + correct method + wrong final step, inconsistent with the student's usual accuracy → Careless Error.
- **Model-based classification for ambiguous cases:** where rule signals are insufficient (e.g., open-ended/step-shown questions), a classifier (or LLM-based reasoning over the student's shown work) assigns the most likely category with a confidence score.
- **Cross-attempt pattern mining:** sequence and clustering analysis over the student's mistake history to detect recurring category-concept combinations (e.g., "Formula Error" specifically clustered in one chapter → true concept gap, not random).

### Decision Rules
- **Concept Gap** → route to Concept Intelligence for re-teaching; block advancement to dependent concepts.
- **Formula Error** → route to Formula Intelligence for targeted formula drilling; do not re-teach the whole concept.
- **Calculation Error** → route to targeted arithmetic/procedure practice; explicitly reassure that concept understanding is not in question.
- **Time Management** → route to Study Planner/Adaptive Difficulty for timed practice sets; do not touch concept content.
- **Guessing** → do not update mastery meaningfully from this attempt (low-weight/discarded evidence); flag for a supportive check-in ("this one looked hard — want to review it together?").
- **Careless Error** → do not trigger remediation on first occurrence; only escalate if the pattern recurs ≥ N times on the same concept, at which point it is re-classified as possible Concept Gap or Time Management in disguise.

### Edge Cases
- Multiple plausible root causes for one mistake → engine outputs a ranked list with confidence scores rather than forcing a single label; downstream engines use the top label but the ambiguity is logged for review.
- Student self-reports a different cause than the system inferred (e.g., taps "I knew this, just rushed") → self-report is stored alongside the system inference; used to improve personalized classifier calibration over time, not blindly overridden.
- Copy-paste/answer-searching behavior (integrity concern) → flagged separately as an Integrity signal, outside the six pedagogical categories, routed to a human-review flag rather than treated as a learning weakness.

### Future Improvements
- Fine-grained sub-classification within Concept Gap (missing definition vs. missing application skill vs. missing connection to another concept).
- Handwriting/step-work OCR analysis for fully worked-out paper-style solutions to improve Calculation vs. Concept discrimination.

---

## 9. Memory Engine

### Purpose
Gives the AI persistent, structured, long-term memory of the student as a whole person-learner — not just scores, but history, habits, and preferences — so every session feels like a continuation of a relationship, not a cold start.

### Responsibilities
- Persist and organize all learning-relevant memory categories (detailed in Section 22).
- Provide fast retrieval of relevant memory to other engines at decision time (e.g., Study Planner needs "study habits" memory; Question Recommendation needs "learning preferences" memory).
- Summarize/compress long histories into durable "memory facts" so raw event logs don't have to be re-processed every time.
- Protect memory integrity (no silent overwriting of history; corrections are appended, not destructive).

### Inputs
- Every event from every other engine (attempts, mastery updates, mistakes, revisions, confidence signals, planner activity, session metadata).

### Outputs
- Structured, queryable student memory profile (see Section 22 for full schema of categories).
- Compressed "memory summaries" per concept/skill/time-period for efficient reuse.
- Change-log/audit trail of how the student model evolved.

### Algorithms
- **Event sourcing:** raw events are stored immutably; the "current state" (mastery, confidence, etc.) is a derived projection, so nothing is ever truly lost or unexplainable.
- **Progressive summarization:** older raw events are periodically compressed into higher-level summaries (e.g., daily logs → weekly summary → monthly trend) to keep retrieval fast without losing signal.
- **Relevance-weighted retrieval:** when another engine requests memory, retrieval is scoped and ranked by relevance to the current decision (e.g., only pull memory related to the concept/skill in question, not the entire history).

### Decision Rules
- Mastery/confidence corrections are always additive (a new event that supersedes an old inference), never a silent delete — the system must always be able to explain "why did you think I knew this before."
- Memory retrieval for a live decision (e.g., mid-session difficulty adjustment) is time-boxed to only the most relevant, recent, and high-signal memory to avoid decision latency.

### Edge Cases
- Very long-tenured students (years of history) → summarization hierarchy prevents unbounded retrieval cost.
- Conflicting evidence over time (student seemed to master X, then consistently fails X) → both are preserved with timestamps; current state reflects the most recent trend, not an average that hides the decline.

### Future Improvements
- Natural-language memory recall for tutor-style chat ("remind me what I struggled with last month in Trigonometry").
- Cross-subject memory linking (habits/preferences learned in one subject inform delivery in another).

---

## 10. Study Planner

### Purpose
Turns everything the AI knows (path, weaknesses, revision due-list, mastery gaps, and the student's real available time) into an executable day-by-day and week-by-week study schedule.

### Responsibilities
- Build a realistic schedule honoring available time, deadlines, and energy/pace patterns.
- Balance new learning, revision, and practice/testing in each session.
- Detect schedule slippage and replan automatically.
- Communicate trade-offs clearly when the plan and the goal don't fit (not enough time).

### Inputs
- Learning Path (macro + micro).
- Revision queue (from Revision Recommendation / Spaced Repetition).
- Student-declared availability (days/hours) and deadline.
- Observed study habits from Memory Engine (typical session length, time-of-day performance, consistency).

### Outputs
- Daily plan: list of sessions, each with concept/activity, type (new learning / revision / practice / test), and estimated duration.
- Weekly/monthly roadmap view.
- Slippage alerts and replanned schedule when the student falls behind or ahead.

### Algorithms
- **Constraint-based scheduling:** allocate path items and revision items into available time slots subject to constraints (prerequisite order, due dates for spaced repetition, daily time cap, max new concepts per day).
- **Pace modeling:** learn the student's realistic completion pace per concept-difficulty-tier from historical data, rather than using a flat curriculum-estimated time for every student.
- **Adaptive replanning trigger:** if actual completion rate deviates from planned rate beyond a threshold (behind or ahead) for a rolling window, replan is triggered automatically.

### Decision Rules
- Spaced-repetition due items are hard constraints (must be scheduled on/near their due date) — new-learning items are soft constraints (can shift).
- If total remaining required time > time available before deadline, the system proposes explicit trade-offs (extend deadline, reduce scope, increase daily hours) rather than silently compressing quality.
- Session composition defaults to a mix (e.g., new learning + revision + light practice) rather than single-mode sessions, to align with interleaving/spacing principles, unless the student is in a targeted pre-exam sprint.

### Edge Cases
- Student inconsistently logs actual study time → planner falls back to conservative estimates and increases buffer, flags low-confidence schedule.
- Sudden goal/deadline change → full replan triggered, prior plan archived (not deleted) for reference.

### Future Improvements
- Energy-aware scheduling using time-of-day performance patterns (schedule hardest new concepts when the student historically performs best).
- Family/parent-visible plan view with progress-vs-plan transparency.

---

## 11. Question Recommendation

### Purpose
Selects the single next best question (or small batch) for the student to attempt right now, based on what will most efficiently move mastery, confidence calibration, and exam readiness forward.

### Responsibilities
- Select questions matched to current mastery level, weakness priorities, and session goal (new learning vs. revision vs. test-prep).
- Ensure variety across question types/formats and avoid over-repetition of the same items.
- Coordinate with Adaptive Difficulty, Interleaved Practice, and Spaced Repetition for question sequencing within a session.

### Inputs
- Target concept(s) for this session (from Study Planner/Learning Path).
- Student mastery/confidence for target and related concepts.
- Question bank metadata (concept tags, difficulty, type, past usage by this student).
- Session goal/mode.

### Outputs
- Ordered queue of recommended questions for the session, each tagged with the reason it was chosen.

### Algorithms
- **Candidate filtering:** filter question bank to items tagged with the target concept(s) and appropriate difficulty band (from Adaptive Difficulty), excluding items already mastered-and-overused for this student.
- **Multi-objective ranking:** rank candidates by a blended score of (diagnostic value — does this question best test the specific weak sub-skill), (novelty — not recently seen), (format variety), and (exam-style relevance for PYQ alignment where applicable).
- **Exposure control:** cap how often any single question is reused per student to avoid memorized-answer false positives.

### Decision Rules
- If a Confident-Incorrect flag exists on a concept, prioritize questions that specifically probe the misconception, not just any question on that concept.
- During pure revision sessions, prefer previously-seen questions (recall-strengthening); during new-learning sessions, prefer fresh questions.
- Never present a question on a "Not Ready" concept (hard gate from Concept Dependency Engine).

### Edge Cases
- Thin question bank for a niche concept → widen the difficulty band or fall back to closely related-concept questions with a clear label that it's an approximation.
- Student repeatedly disengages with a question type (e.g., always skips diagrams) → flag to Analytics/Study Planner rather than silently avoiding it (avoidance could itself be a weakness).

### Future Improvements
- Generative question creation for underpopulated concept/difficulty combinations, expert-reviewed before release.
- Real-time diagnostic questioning ("Socratic probe" follow-up question chosen based on the specific wrong option selected).

---

## 12. Adaptive Difficulty

### Purpose
Continuously tunes the difficulty of what the student sees so they stay in a productive challenge zone — hard enough to build skill, easy enough to avoid frustration or false confidence.

### Responsibilities
- Set the starting difficulty for a new concept based on prior related performance.
- Adjust difficulty in real time within a session based on recent performance.
- Prevent both "too easy → boredom/false confidence" and "too hard → frustration/guessing" states.

### Inputs
- Recent attempt outcomes (correct/incorrect, time taken) within the current session.
- Mastery score and evidence-strength for the concept.
- Confidence signals (to avoid confusing a fast confident correct streak with true mastery vs. lucky pattern-matching).

### Outputs
- Current target difficulty band for next question(s).
- Difficulty-adjustment log/rationale for transparency.

### Algorithms
- **Elo/IRT-style adaptive model:** treat each question as having a difficulty rating and the student as having an ability rating; after each attempt, update both using an item-response-theory-style update so difficulty selection converges toward the student's true ability zone quickly.
- **Streak-based micro-adjustment:** short-term nudge rules layered on top of the ability estimate (e.g., N consecutive correct at current band → step up one band; N consecutive incorrect → step down one band) to keep responsiveness fast within a single session.

### Decision Rules
- Target success rate is kept in a productive-challenge band (not too high, not too low) rather than optimizing for 100% correctness or maximum difficulty.
- Difficulty step-ups are only allowed within a concept the student is already "Ready" for (never used to sneak in harder prerequisite-violating content).
- After a Careless Error or Guessing classification (Mistake Intelligence), that attempt is excluded from difficulty-adjustment calculations so a single anomalous event doesn't wrongly shift the band.

### Edge Cases
- High variance performance (alternating correct/incorrect) → widen confidence interval on ability estimate, slow down adjustment speed, and flag for Confidence Engine review (may indicate guessing rather than a true skill boundary).
- New concept with no prior data → start at a conservative default band tied to the concept's authored difficulty tier, then adapt from there.

### Future Improvements
- Cross-concept ability transfer (initial difficulty for a new concept informed by performance on related concepts, not just a flat default).
- Difficulty personalization by question *type* (a student can be "hard" at word problems but "easy" at direct formula application within the same concept).

---

## 13. Retrieval Practice

### Purpose
Deliberately prompts the student to recall previously learned information from memory (rather than re-reading/re-watching), because active recall is one of the most effective mechanisms for durable learning.

### Responsibilities
- Insert recall-based prompts (quick questions, "explain in your own words," flash-style recall) at appropriate intervals, independent of formal testing.
- Balance retrieval difficulty (recall should be effortful but achievable) with frustration avoidance.
- Feed recall success/failure back into Mastery and Spaced Repetition.

### Inputs
- Concepts eligible for retrieval practice (previously taught, not brand new).
- Time since last retrieval attempt per concept.
- Current mastery/decay estimate.

### Outputs
- Retrieval prompts scheduled into sessions (quick-fire recall questions, cued recall, free recall summary prompts).
- Recall success signal feeding Mastery Engine and Spaced Repetition scheduling.

### Algorithms
- **Desirable-difficulty targeting:** select retrieval prompts timed so recall is neither trivially easy (too soon after learning) nor near-impossible (too long after, total forgetting) — targeting the effortful-but-achievable zone using the decay estimate from Mastery Engine.
- **Format rotation:** rotate between recognition-based (multiple choice), cued-recall (fill in the blank/formula), and free-recall (explain/derive) formats to strengthen different retrieval pathways.

### Decision Rules
- Retrieval practice is prioritized over passive review (re-reading notes) whenever a concept has any prior mastery evidence, per the core philosophy that active recall beats passive review.
- Failed retrieval attempts trigger a brief correct-answer reveal plus one guided re-attempt, not immediate full re-teaching (retrieval failure itself is a valuable learning event, not just an error).

### Edge Cases
- Concept just taught minutes ago → too soon for meaningful retrieval practice; deferred to next session at minimum.
- Student consistently fails free-recall but succeeds recognition-based → flagged as a depth-of-understanding signal to Weakness Detection (recognition without recall suggests shallow encoding).

### Future Improvements
- AI-evaluated open-ended free-recall responses (semantic similarity scoring against a model answer) rather than only structured-format recall.

---

## 14. Interleaved Practice

### Purpose
Deliberately mixes practice across multiple concepts/topics within a session (instead of blocked, one-topic-at-a-time practice), because interleaving improves the ability to discriminate between similar concepts and apply the right method under exam-like mixed conditions.

### Responsibilities
- Construct mixed-concept practice sets from the student's active learning set and revision due-list.
- Deliberately include concepts that are commonly confused with each other (from Knowledge Graph similarity clustering).
- Balance interleaving with the need for initial focused practice on brand-new concepts.

### Inputs
- Active concept set for the student (currently learning + due for revision).
- Concept similarity/confusion clusters (Knowledge Graph).
- Session type/goal.

### Outputs
- Interleaved question sequence for a session, deliberately ordered to avoid long same-concept blocks.

### Algorithms
- **Confusion-aware interleaving:** when selecting the mix, preferentially include pairs of concepts flagged as commonly confused, so the session directly trains discrimination.
- **Anti-blocking sequencer:** enforce a rule that no more than K consecutive questions come from the same concept, reshuffling the queue to satisfy this constraint while respecting priority order from Question Recommendation.

### Decision Rules
- Brand-new concepts (first exposure) get a short initial blocked-practice phase before entering the interleaved mix — interleaving is for consolidation, not first learning.
- Pre-exam sessions increase interleaving intensity to simulate real exam conditions (mixed-topic papers).

### Edge Cases
- Student has only one active concept (very early stage) → interleaving degrades gracefully to blocked practice with a note that interleaving will begin once more concepts are active.
- Interleaving reveals a specific confusion pair the student consistently mixes up → escalated directly to Mistake Intelligence as a likely Concept Gap between the two, not just two independent weaknesses.

### Future Improvements
- Difficulty-aware interleaving spacing (avoid stacking two very hard concepts back-to-back even if not the same concept).

---

## 15. Spaced Repetition

### Purpose
Schedules *when* each learned concept should be revisited to maximize long-term retention with minimum review time, based on individual forgetting patterns rather than a fixed calendar.

### Responsibilities
- Compute and update the next-due date for every concept with any learning history.
- Adjust intervals based on actual recall performance at each review.
- Feed due items into Revision Recommendation and Study Planner.

### Inputs
- Mastery Engine's decay model output per concept.
- Retrieval Practice / Mistake Intelligence outcomes at each review (successful recall vs. failed recall).
- Concept difficulty tier (harder concepts decay faster, generally).

### Outputs
- Per-concept next-due-date and current interval.
- Due-today / due-this-week lists.

### Algorithms
- **Spaced-repetition interval model (SM-2/Leitner-family, personalized):** each successful recall increases the next interval by a multiplier; each failed recall resets or shrinks the interval; multipliers are personalized per student based on their observed retention rate rather than using a single fixed global multiplier for everyone.
- **Difficulty-adjusted base interval:** initial interval after first mastery is shorter for harder-tier concepts, longer for easier ones.

### Decision Rules
- A failed recall at a scheduled review always shrinks the interval (never expands it), regardless of how long the previous streak of successes was.
- Concepts with high exam weightage get slightly compressed intervals near exam dates (reviewed a bit more often than pure forgetting-curve math would suggest) — exam-readiness bias is intentional.

### Edge Cases
- Student stops using the platform for an extended period → on return, due-list is not dumped all at once; it's throttled into a catch-up plan across several days to avoid overwhelming the student.
- Concept mastered through external means (e.g., school class) reflected via a strong first-attempt success on the platform → still enters the spaced repetition cycle, just starting from a higher initial interval given the strong initial evidence.

### Future Improvements
- Personalized forgetting-curve parameter learning per student per subject (some students retain math longer than history, etc.).

---

## 16. Formula Intelligence

### Purpose
A specialized sub-system for formulas and procedural rules (as distinct from conceptual understanding), since formula mastery has its own failure modes: memorization without understanding, correct memorization but wrong application, and understanding without recall fluency.

### Responsibilities
- Track mastery of each formula separately from the broader concept it belongs to (recall fluency, correct application, derivation understanding).
- Detect formula-specific error patterns (wrong formula selected, right formula wrong substitution, sign/unit errors).
- Recommend targeted formula drills.

### Inputs
- Formula bank linked to Knowledge Graph concepts.
- Attempt-level data where a formula was expected to be applied (from Mistake Intelligence's Formula Error tag).

### Outputs
- Per-formula mastery/fluency score (separate from parent concept mastery).
- Formula confusion pairs (formulas the student frequently swaps).
- Targeted drill recommendations (recall-only drills vs. application drills vs. derivation walkthroughs).

### Algorithms
- **Three-layer formula mastery model:** (1) Recall — can the student state the formula correctly unaided; (2) Application — can they correctly substitute and compute given a scenario; (3) Derivation/Understanding — can they explain where it comes from or when it applies vs. a similar formula.
- **Confusion-pair detection:** co-occurrence analysis of "expected formula X, applied formula Y" errors to build a formula confusion map, similar in spirit to the Knowledge Graph's concept confusion clusters.

### Decision Rules
- A Formula Error root cause (from Mistake Intelligence) routes to Formula Intelligence, which decides the specific drill layer needed (recall vs. application vs. derivation) based on where in the three-layer model the student is weakest — not a generic "practice more" response.
- If a student can apply a formula correctly but cannot recall it unaided (open-book vs. closed-book gap), this is explicitly flagged as an exam-risk item (most exams are closed-book/closed-formula-sheet).

### Edge Cases
- Formula-sheet-permitted exams (where recall isn't required) → Recall layer is deprioritized for that subject/exam context; Application layer becomes the primary focus.
- Formulas with multiple valid forms (e.g., algebraically rearranged equivalents) → treated as the same underlying formula node with format-variant recognition, not separate formulas.

### Future Improvements
- Symbolic-math-aware answer checking to distinguish true application errors from equivalent-but-differently-formatted correct answers.

---

## 17. Concept Intelligence

### Purpose
Owns deep, conceptual (as opposed to procedural/formula) understanding — the "why" and "how it connects" layer. This is what differentiates true mastery from pattern-matched procedure-following.

### Responsibilities
- Assess depth of conceptual understanding beyond correct answers (can the student explain, apply to a novel scenario, connect to related concepts).
- Generate/select conceptual explanations, analogies, and worked examples tailored to the student's current gap.
- Detect shallow/rote understanding versus deep understanding.

### Inputs
- Concept Gap flags from Mistake Intelligence.
- Free-recall and explanation-style responses (from Retrieval Practice).
- Performance on novel/transfer questions (applying the concept in an unfamiliar context) vs. familiar-format questions.

### Outputs
- Conceptual understanding depth score per concept (Shallow / Working / Deep).
- Targeted explanation/re-teaching content selection (which explanation style/analogy to present).
- Transfer-ability signal (can this concept be applied outside the exact format it was taught in).

### Algorithms
- **Depth classification via transfer performance:** compare accuracy on familiar-format questions vs. novel-context/transfer questions for the same concept; a large gap indicates shallow/rote understanding even if familiar-format accuracy is high.
- **Explanation-style matching:** maintain multiple explanation variants per concept (visual/analogy-based, step-derivation-based, real-world-example-based); select variant based on what has worked for this student on similar past concepts (from Memory Engine's learning-preference profile).

### Decision Rules
- A Concept Gap is not considered resolved just because the student got a follow-up question right in the *same* format as the original error — resolution requires a correct response on a *varied*-format follow-up, to confirm real understanding rather than pattern memorization.
- If depth is "Shallow" despite passing correctness thresholds, the concept is not promoted to full Mastered status (caps at Proficient) until a transfer-question success is observed.

### Edge Cases
- Very abstract concepts with limited real-world analogy availability → fall back to multiple-representation teaching (symbolic + graphical + verbal) rather than forcing a weak analogy.
- Student who understands deeply but explains poorly (language/expression limitation, not conceptual limitation) → cross-check via non-verbal assessment formats (diagrams, multiple choice with distractors targeting misconceptions) before concluding a true conceptual gap.

### Future Improvements
- LLM-based Socratic dialogue for real-time conceptual probing and adaptive explanation generation.
- Misconception library per concept (known common wrong mental models) for faster, more precise diagnosis.

---

## 18. Mock Test Intelligence

### Purpose
Manages full-length or sectional simulated exams as both an assessment tool and a distinct learning event, extracting maximum diagnostic value from every mock test beyond just a score.

### Responsibilities
- Select/assemble mock test content matched to the student's syllabus coverage and target exam pattern.
- Analyze mock performance across multiple dimensions (accuracy, speed, time allocation, question-order strategy, section-wise performance).
- Convert mock test results into concrete updates across Mastery, Weakness Detection, Confidence, and Study Planner.

### Inputs
- Target exam pattern/structure (from Knowledge Graph/PYQ metadata).
- Student's current syllabus coverage (what's fair to include).
- Full attempt-level trace for the entire test (per-question time, order attempted, answer changes).

### Outputs
- Overall and section-wise score report.
- Time-management analysis (time spent vs. question difficulty/marks-weight, questions left unattempted vs. time remaining).
- Updated Mastery/Confidence/Weakness signals derived from exam-condition (not practice-condition) performance.
- Personalized post-mock action plan.

### Algorithms
- **Coverage-constrained assembly:** select questions only from covered/Ready concepts (or explicitly mark "not yet covered" sections as excluded/bonus) so a mock test never unfairly tests untaught material unless explicitly requested as a full-syllabus simulation.
- **Time-allocation analysis:** compare actual time-per-question against ideal time-budget-per-question (derived from total time ÷ question count, weighted by marks) to detect over-investment in low-value questions or under-investment in high-value ones.
- **Exam-condition mastery weighting:** attempts made under mock-test (timed, no-hint, exam-pressure) conditions are weighted more heavily in Mastery Engine updates than untimed practice attempts, since they better predict real exam performance.

### Decision Rules
- A concept that performs well in practice but poorly under mock-test conditions is flagged as a **performance-under-pressure gap**, routed to timed Adaptive Difficulty drills, not conceptual re-teaching.
- Mock test frequency is throttled by Study Planner to avoid over-testing at the expense of learning time — mocks are scheduled at meaningful milestones, not arbitrarily often.

### Edge Cases
- Student abandons a mock test partway → partial data is still analyzed (with a clear "incomplete attempt" label) rather than discarded, since it still contains useful signal for completed sections.
- Mock test taken very early (low syllabus coverage) → results are contextualized as a baseline/diagnostic, not compared against readiness benchmarks meant for later-stage students.

### Future Improvements
- Strategy analysis (optimal question-attempt-order recommendations based on the student's own strength profile, e.g., "attempt your strong sections first next time").
- Predictive score modeling (projected real-exam score range based on mock trend).

---

## 19. PYQ Intelligence (Previous Year Questions)

### Purpose
Extracts maximum strategic and diagnostic value from real historical exam questions — understanding not just "can the student solve this" but "how does this map to actual exam patterns, trends, and weightage."

### Responsibilities
- Tag and structure PYQ bank against the Knowledge Graph (concept, sub-concept, difficulty, frequency).
- Detect exam trend patterns (which concepts/question-types recur most, how weightage shifts year to year).
- Use PYQ performance as a high-signal, exam-realistic diagnostic input distinct from generic practice questions.

### Inputs
- Raw PYQ bank with year/exam metadata.
- Student attempt data on PYQ-tagged items.
- Knowledge Graph concept mapping.

### Outputs
- Concept-wise historical exam frequency/weightage report.
- Student's PYQ-specific performance profile (accuracy and speed specifically on real exam-style questions).
- "High-yield concept" recommendations (frequently tested + currently weak = highest priority).

### Algorithms
- **Frequency/trend analysis:** aggregate PYQ tagging over multiple years per concept to compute historical weightage and trend direction (rising/falling/stable importance).
- **High-yield scoring:** combine PYQ frequency-weight with current Weakness severity to produce a distinct "exam-ROI" ranking, feeding into Learning Path Generator and Revision Recommendation prioritization alongside (not replacing) the standard weakness-severity ranking.
- **Pattern-style clustering:** group PYQs by question archetype (not just concept) to detect recurring "trick" patterns or commonly tested angles within a concept.

### Decision Rules
- PYQ-derived exam-weight is treated as a strong but not absolute prioritization signal — it augments Knowledge Graph's expert-authored weightage rather than overriding it outright, since curricula/patterns can shift.
- PYQ attempts are treated with the same exam-condition weighting logic as Mock Test Intelligence when the student attempts them in timed mode; treated as regular practice weighting when attempted untimed/open.

### Edge Cases
- Syllabus/exam pattern change makes some historical PYQs no longer representative → such items are tagged "legacy pattern" and down-weighted in trend analysis, still usable for concept practice.
- Very low sample size for a niche recurring pattern → confidence-banded trend reporting (don't overstate a pattern from 2 data points across years).

### Future Improvements
- Predictive "likely to appear this year" concept shortlist based on multi-year trend modeling (communicated with appropriate uncertainty, never as a guarantee).

---

## 20. Analytics Intelligence

### Purpose
The observability and reporting layer of the AI Brain — turning everything the other 19 engines know into clear, actionable insight for the student, parent, and educators, and into feedback that helps the AI itself improve.

### Responsibilities
- Aggregate cross-engine data into human-readable dashboards and reports (progress, weaknesses, time spent, trends).
- Detect anomalies in engagement or performance that warrant attention (sudden drop, disengagement, burnout signals).
- Provide the feedback loop that measures whether the AI's own recommendations are actually working (closing the loop on system self-improvement).

### Inputs
- All events and derived state from every other engine.
- Session/engagement metadata (login frequency, session length, time-of-day, device).

### Outputs
- Student-facing progress dashboard (mastery map, streaks, milestones).
- Parent/educator-facing summary reports.
- Internal system-health metrics: recommendation effectiveness, prediction accuracy of Mastery/Adaptive Difficulty models, engagement trend alerts.

### Algorithms
- **Cross-engine aggregation pipeline:** scheduled roll-ups that compile per-student, per-cohort, and per-content-item summaries at multiple time granularities (daily/weekly/monthly).
- **Anomaly detection:** statistical/trend-based detection of significant deviations from a student's own baseline (engagement drop, sudden accuracy drop, sudden confidence drop) that trigger a proactive check-in rather than waiting for a scheduled report.
- **Recommendation-effectiveness feedback loop:** track outcomes following AI recommendations (e.g., did mastery actually improve after a recommended revision session) to produce effectiveness metrics per engine, feeding a continuous improvement process for the algorithms themselves.

### Decision Rules
- Anomaly alerts are tiered by severity — minor dips are logged and monitored silently; significant/sustained anomalies (e.g., a multi-week engagement or performance decline) surface a proactive, supportive prompt to the student and, where enabled, a parent/educator notice.
- System-health metrics are reviewed against thresholds to detect when an engine's model (e.g., Adaptive Difficulty's ability estimates) is systematically miscalibrated for a cohort, triggering a model-review workflow rather than silent degradation.

### Edge Cases
- Very new students with insufficient data for trend/anomaly detection → dashboards clearly show "building your profile" states rather than misleading sparse-data conclusions.
- Metrics that could be misread as purely punitive (e.g., "weakest subject") → framed constructively in all student-facing surfaces ("biggest opportunity area") while internal/educator views can retain more clinical framing.

### Future Improvements
- Predictive early-warning system for at-risk students (disengagement or falling-behind prediction with enough lead time for intervention).
- A/B testable recommendation strategies with rigorous effectiveness measurement feeding back into engine algorithm tuning.

---

## 21. Cross-Cutting Learning Rules (Global Policy Layer)

These rules apply across all engines and take precedence over any single engine's local logic.

### 21.1 Prerequisite Integrity Rule
No engine may present, teach, or test a concept to a student unless the Concept Dependency Engine has returned a "Ready" or "Partially Ready" verdict for that student. This rule is enforced as a hard gate, not a soft suggestion — Learning Path Generator, Question Recommendation, and Study Planner all must check this gate before finalizing content.

### 21.2 Repeated-Failure Root Cause Protocol
When a student fails the same concept repeatedly (threshold: configurable, e.g., 3+ failures within a rolling window), the system must not simply "show it again." It must invoke the following diagnostic and response protocol, driven by Mistake Intelligence's root-cause classification:

| Root Cause | Diagnostic Signal | AI Response |
|---|---|---|
| **Concept Gap** | Consistent errors across formats, including transfer questions; low Concept Intelligence depth score | Re-teach from a different explanation style/analogy; re-check prerequisites via Concept Dependency Engine; do not simply repeat the same content |
| **Formula Error** | Correct approach/concept shown, wrong or misapplied formula | Route to Formula Intelligence for targeted recall/application/derivation drilling on the specific formula |
| **Calculation Error** | Correct method and formula, wrong final numeric result, inconsistent with usual accuracy | Targeted arithmetic/procedural accuracy practice; explicit reassurance that concept is understood |
| **Time Management** | Correct when untimed/early in session, incorrect/unattempted when time-pressured or late in a timed set | Timed practice sets via Adaptive Difficulty; Study Planner adjusts pacing practice; no concept content change |
| **Guessing** | Near-zero response time, no hint engagement, answer pattern inconsistent with any partial reasoning | Low-weight/discard this evidence in Mastery Engine; gentle supportive check-in; do not escalate to full remediation on the guess itself |
| **Careless Error** | Isolated single miss inconsistent with strong surrounding performance; not persistent | No remediation on first occurrence; monitor. If it recurs, re-classify as possible Concept Gap or Time Management, not treated as "careless" indefinitely |

This protocol is executed by Mistake Intelligence and enforced by Weakness Detection's persistence filter and Revision Recommendation's format-selection rule table (Sections 6–8).

### 21.3 No Silent Overwriting Rule
No engine may silently discard prior evidence about a student. All updates to mastery, confidence, or habit models are additive/event-sourced (Memory Engine, Section 9), with full traceability.

### 21.4 Evidence-Proportional Confidence Rule
No engine may make a high-confidence pedagogical decision (e.g., "Mastered," "concept fully resolved") on thin evidence. Minimum evidence thresholds apply system-wide before any concept/skill can be promoted to its highest state.

### 21.5 Explainability Rule
Every AI-generated recommendation (path item, revision item, difficulty change, mock test insight) must carry a machine-readable rationale trace, so the student/parent/educator-facing layer can always answer "why was I told to do this."

---

## 22. Memory Architecture

The Memory Engine (Section 9) organizes everything the AI knows about a student into the following durable categories. This is the schema of *meaning*, not a database schema — actual storage/table design belongs to the Database Design document already completed.

### 22.1 Learning History
- Full timeline of concepts taught, in what order, on what dates.
- Time-on-task per concept, number of sessions to reach each mastery band.
- Path deviations (planned vs. actual sequence) and reasons (replans, goal changes).

### 22.2 Mistakes
- Every incorrect/flagged attempt with its root-cause classification (Section 8).
- Recurring mistake patterns and confusion pairs (concept-level and formula-level).
- Resolution history: how each identified weakness was eventually resolved, and how long it took.

### 22.3 Revision
- Full spaced-repetition schedule history: intervals, due dates, actual review dates, outcomes.
- Revision format history (what formats have been used for which concepts) to avoid staleness/repetition.
- Revision effectiveness per concept (did revision actually raise mastery/retention).

### 22.4 Confidence
- Confidence–competence quadrant history per concept over time.
- Calibration trend (is the student's self-assessment becoming more accurate).
- Emotional/motivational signals inferred from confidence patterns (e.g., sustained low confidence despite good performance → possible anxiety signal, routed to a supportive, non-clinical nudge, not a diagnosis).

### 22.5 Study Habits
- Session frequency, typical duration, consistency (streaks/gaps).
- Time-of-day and day-of-week performance patterns.
- Plan-adherence rate (planned vs. completed sessions).
- Device/context patterns if relevant to engagement quality.

### 22.6 Learning Preferences
- Which explanation styles/analogy types have historically worked best (from Concept Intelligence's explanation-matching outcomes).
- Preferred question formats and format-specific performance differences.
- Preferred session composition (e.g., responds better to shorter, frequent sessions vs. longer, less frequent ones).

### 22.7 Memory Retrieval Principle
Every engine that needs student context queries Memory Engine for **only the relevant slice** at decision time (e.g., Study Planner requests Study Habits + current Path state; it does not need full Mistake history). This keeps every decision fast, focused, and explainable.

---

## 23. Engine Orchestration — How the Brain Works as One System

While each engine is independently specified, they form a single cognitive loop. The canonical flow for a single learning session:

1. **Study Planner** determines today's session composition (new learning / revision / practice) using Learning Path, Revision queue, and Study Habits memory.
2. **Concept Dependency Engine** gates which "new learning" candidates are actually eligible.
3. **Question Recommendation**, informed by **Adaptive Difficulty**, **Interleaved Practice**, and **Retrieval Practice**, builds the actual sequence of items for the session.
4. As the student attempts items, **Mastery Engine**, **Confidence Engine**, and **Mistake Intelligence** update in real time, attempt by attempt.
5. **Mistake Intelligence**'s root-cause tags feed **Weakness Detection**, which re-ranks priorities live if a significant new weakness emerges mid-session.
6. **Adaptive Difficulty** adjusts the next item's difficulty based on the rolling outcome.
7. At session end, **Spaced Repetition** recalculates due-dates for everything touched; **Memory Engine** persists the full event trace; **Analytics Intelligence** rolls the session into dashboards and system-health metrics.
8. **Learning Path Generator** and **Study Planner** incrementally replan the near-term path/schedule based on the updated mastery/weakness state, ready for the next session.

**Formula/Concept/Mock/PYQ Intelligence** act as specialized lenses invoked contextually within this loop (e.g., Formula Intelligence is invoked specifically when Mistake Intelligence tags a Formula Error; Mock/PYQ Intelligence are invoked around scheduled assessment events) rather than running continuously — they are expert consultants the core loop calls in as needed.

This orchestration ensures the system behaves like a single attentive teacher rather than 20 disconnected tools: it diagnoses, teaches, watches, remembers, and re-plans in a continuous cycle around one student.

---

## 24. Closing Note for the Engineering Team

This specification defines *what the AI must decide and why*. Implementation choices — which models, which storage, which orchestration framework — are deliberately left open so the engineering team can choose the best technical approach for each engine while preserving the pedagogical intent documented here. The single most important invariant to preserve through implementation is Section 21: prerequisite integrity, root-cause-driven response, evidence-proportional confidence, no silent overwriting, and explainability. If an implementation detail ever conflicts with one of these five rules, the rule wins.

---
---

# PART II — DEEP FOUNDATIONS
## (Cognitive Science, Formal Models, and the Mastery Lifecycle)

Part I specified *what* each engine does. Part II goes one level deeper: the **learning-science theory each engine is actually built on**, the **formal/mathematical models** behind the black-box-sounding "Algorithms" sections, and the **lifecycle state machine** that ties every engine's output into one coherent notion of "how a student moves from not-knowing to mastery." This is the layer that separates a generic adaptive-quiz app from a system that "thinks like a teacher."

---

## 25. Cognitive Science Foundations — Why Each Engine Works

Every engine in Part I is a computational implementation of an established learning-science principle. Naming the theory explicitly matters because it tells the engineering team *what NOT to break* when optimizing an engine — the metric to protect is the underlying cognitive effect, not just a proxy score.

| Engine | Grounding Theory | The Principle | What Must Never Be Violated |
|---|---|---|---|
| Knowledge Graph / Concept Dependency | **Gagné's Learning Hierarchies** | Complex skills decompose into ordered prerequisite sub-skills; higher skills cannot form without lower ones in place. | Never let path optimization "shortcut" a prerequisite edge for the sake of speed. |
| Learning Path Generator | **Vygotsky's Zone of Proximal Development (ZPD)** | Optimal learning happens just beyond what a student can do alone but within reach with support — not in what they already know, not in what's far beyond them. | Path items must land in the ZPD band, not just "next in syllabus." |
| Mastery Engine | **Bayesian Knowledge Tracing (Corbett & Anderson)** | Mastery is a hidden (latent) probabilistic state inferred from noisy observed behavior, not a directly observed fact. | Never treat one observation as ground truth for the latent state. |
| Confidence Engine | **Dunning–Kruger effect & Metacognitive Calibration theory** | Accurate self-assessment (calibration) is itself a trainable skill and a predictor of real-world exam failure independent of raw competence. | Never conflate "feels confident" with "is correct" — track both, separately. |
| Weakness Detection | **Signal Detection Theory** | Distinguish a true signal (real weakness) from noise (random variance) using persistence and multiple independent observations, not one data point. | Never flag a weakness from a single low-N event. |
| Mistake Intelligence | **Error Analysis / Diagnostic Teaching (Ashlock)** | Errors are systematic and rule-governed, not random; the same wrong answer can come from different "buggy rules," each needing a different fix. | Never treat "wrong answer" as one category — the buggy rule must be found. |
| Retrieval Practice | **Testing Effect (Roediger & Karpicke)** | Actively retrieving information from memory strengthens retention far more than re-exposure/re-reading of the same material. | Never substitute passive review for active recall when recall is possible. |
| Interleaved Practice | **Interleaving Effect (Rohrer & Taylor)** | Mixing related-but-distinct problem types improves the brain's ability to *select* the right method, not just *execute* a known method. | Never let interleaving happen before at least minimal blocked practice on a brand-new skill. |
| Spaced Repetition | **Ebbinghaus Forgetting Curve + Spacing Effect** | Memory decays exponentially over time without reinforcement; spaced, expanding review intervals combat this far more efficiently than massed review ("cramming"). | Never allow interval growth after a failed recall — decay resets must be honored. |
| Adaptive Difficulty | **Desirable Difficulties (Bjork & Bjork) + Flow Theory (Csikszentmihalyi)** | Learning is maximized in a narrow "challenge band" — hard enough to require effort, not so hard it causes anxiety/abandonment or so easy it causes boredom. | Never optimize purely for correctness rate; optimize for sustained engagement in the challenge band. |
| Concept Intelligence | **Dual Coding Theory (Paivio) + SOLO Taxonomy (Biggs & Collis)** | Deep understanding requires multiple representations (verbal + visual + symbolic) and progresses through describable structural stages, not a single "got it / didn't get it" state. | Never certify "deep" understanding from a single-representation, single-format success. |
| Formula Intelligence | **Procedural vs. Declarative Knowledge distinction (Anderson's ACT-R)** | Knowing a fact (declarative: "the formula is...") and being able to fluently execute it (procedural) are separate cognitive systems that must be assessed and trained separately. | Never assume application skill from recall success, or vice versa. |
| Mock/PYQ Intelligence | **Ecological Validity in Assessment** | Performance under realistic conditions (time pressure, mixed topics, exam stakes) is a better predictor of real exam outcomes than performance under practice conditions. | Never weight untimed practice equally with timed, exam-condition performance when predicting exam readiness. |
| Memory Engine | **Constructivist Learner Modeling** | The system's model of the student is itself a constructed, evolving hypothesis — not a fixed record — and must remain revisable as new evidence arrives. | Never treat the "student model" as more certain than the evidence actually supports. |

---

## 26. Formal / Mathematical Model Layer

This section gives the precise mathematical shape of the four engines whose "Algorithms" sections in Part I are the most decision-critical: **Mastery Engine, Adaptive Difficulty, Spaced Repetition, and Weakness Detection.** These are specified conceptually/formally (not as code) so the engineering team can select a concrete library/implementation with full clarity on intended behavior.

### 26.1 Mastery Engine — Bayesian Knowledge Tracing Formalization

Let a concept have a latent mastery state `M ∈ {Not Mastered, Mastered}` with:

- `P(M₀)` — prior probability the student already knows the concept before any observation (initialized from prerequisite readiness and cohort priors).
- `P(T)` — probability of transitioning from Not Mastered → Mastered after one learning opportunity ("learn rate").
- `P(G)` — probability of guessing correctly despite Not Mastered ("guess rate").
- `P(S)` — probability of an incorrect slip despite Mastered ("slip rate").

After each observed attempt (correct/incorrect), the posterior probability of mastery is updated via Bayes' rule, then advanced one step by the learn-rate transition before the next opportunity. This produces a continuously updated `P(Mastered)` — this *is* the Mastery Score — rather than a raw percent-correct.

**Why this matters conceptually:** a naive "percent correct" system cannot distinguish a lucky guesser from a true master, nor a careless slip from real ignorance. BKT structurally separates these four probabilities, which is precisely why Section 4's Decision Rules can safely discount guesses and slips instead of over-reacting to them.

**Personalization layer:** `P(T)`, `P(G)`, `P(S)` are not fixed constants — they are per-student, per-concept-difficulty-tier parameters, re-estimated periodically from the student's own historical calibration (a fast learner has higher `P(T)`; a careless-prone student has higher `P(S)`). This is what makes two students with identical raw scores receive different mastery trajectories.

### 26.2 Adaptive Difficulty — Item Response Theory (IRT) Formalization

Each question `i` has a difficulty parameter `bᵢ` (and optionally discrimination `aᵢ`). Each student has an ability parameter `θ`. The probability of a correct response is modeled as a logistic function of `(θ − bᵢ)`: the closer the student's ability is to the item's difficulty, the closer the success probability sits near the productive-challenge midpoint rather than near-certain success or near-certain failure.

After each attempt, `θ` is updated (maximum-likelihood or Bayesian update) based on the observed outcome relative to the expected probability for that item's difficulty. The **next item selection rule** targets the difficulty `bᵢ` whose expected success probability falls inside the desirable-difficulty band (not the theoretical IRT-optimal "50% success" point in isolation — see 26.2.1).

**26.2.1 Why not pure 50% targeting:** Pure information-theoretic IRT selection (targeting ~50% success probability) maximizes *measurement precision*, which is correct for a pure assessment engine but wrong for a *teaching* engine — a student who is 50%-likely-correct on every item can experience high frustration. JELET's Adaptive Difficulty therefore targets a **wider productive band** (e.g., an expected success probability range, tuned by session type: higher for new-learning sessions to build confidence momentum, lower/wider for pre-exam sessions to build resilience) — a deliberate pedagogical override of the pure psychometric optimum.

### 26.3 Spaced Repetition — Exponential Decay + Expanding Interval Formalization

Retention probability at elapsed time `t` since last successful review is modeled as an exponentially decaying function of `t` relative to a **stability parameter** `S` (the memory's current resistance to decay — larger `S` means slower forgetting). Each successful recall at review increases `S` (interval expands, e.g., by a personalized multiplicative factor); each failed recall sharply decreases `S` (interval contracts).

**Personalization of `S`'s growth factor:** the multiplier applied to `S` after a success is not a global constant — it is fit per student per subject from the gap between predicted-retention and observed-recall-success over time, so JELET's forgetting-curve model becomes measurably more accurate the longer a student uses the system.

**Scheduling rule:** the next-due date is the elapsed time `t*` at which predicted retention probability crosses a minimum-acceptable-retention threshold — i.e., the system schedules review right when the concept is about to be forgotten, not arbitrarily earlier (wasteful) or later (risks real forgetting).

### 26.4 Weakness Detection — Composite Severity Formalization

Severity for a concept is not a single metric but a weighted composite: it combines (inverse) mastery level, negative mastery trend, the presence of a Confident-Incorrect flag, exam weightage from Knowledge Graph/PYQ trend data, and a persistence multiplier that scales severity up the more independent sessions/attempts have confirmed the weakness (and scales it toward zero if evidence is thin). This composite — not any single input — is what determines rank order in Weakness Detection's output and, downstream, in Learning Path Generator's and Revision Recommendation's prioritization.

**Design intent:** this formalization exists so severity ranking is *auditable* — for any two concepts, the engineering team (and eventually the student-facing "why this?" explanation) can show exactly which factor made one outrank the other, satisfying the Explainability Rule (21.5).

---

## 27. Concept Depth Taxonomy (SOLO Model) — Deepening Concept Intelligence

Section 17 introduced a three-band depth score (Shallow / Working / Deep). At a deeper conceptual level, this is formalized using the **SOLO Taxonomy** (Structure of Observed Learning Outcomes), giving Concept Intelligence a five-stage structural model instead of three coarse bands:

1. **Prestructural** — no coherent grasp; response is irrelevant or based on unrelated prior knowledge.
2. **Unistructural** — grasps one relevant aspect/fact but cannot connect it to others (can state a definition, cannot apply it).
3. **Multistructural** — grasps several relevant aspects independently but cannot integrate them (can apply the concept in isolation, cannot connect it to related concepts or choose it correctly among alternatives).
4. **Relational** — integrates multiple aspects into a coherent whole; can apply the concept correctly in context and explain *why*, including distinguishing it from confusable neighbors.
5. **Extended Abstract** — generalizes the concept to entirely novel domains/hypothetical extensions beyond what was directly taught.

**Mapping to system behavior:**
- Mastery Engine's "Mastered" state should require at minimum **Relational**-level evidence (transfer-question success + correct discrimination from confusable neighbors), not just Multistructural (isolated correct application) — this is the formal justification behind the transfer-question gate already specified in Section 17's Decision Rules.
- **Extended Abstract** evidence, when observed, is a strong signal for Learning Path Generator to accelerate pacing for that student on related concept clusters.
- Concept Intelligence's explanation-style selection is SOLO-stage-aware: a student stuck at Unistructural needs a different intervention (build isolated facts first) than one stuck at Multistructural (needs integration/connection scaffolding, e.g., explicit "how does this relate to X" prompting) — a single generic "re-explain the concept" is not sufficient at every stage.

---

## 28. The Mastery Lifecycle — Formal State Machine

Every concept, for every student, moves through a well-defined state machine. This is the unifying model that ties Mastery Engine, Spaced Repetition, Concept Dependency Engine, and Weakness Detection into one coherent lifecycle rather than five independent trackers.

**States:**
`Locked → Unlocked → Introduced → Practicing → Proficient → Mastered → Decaying → Lapsed → (re-enters Practicing)`

**Transition conditions (illustrative, not exhaustive):**

- **Locked → Unlocked:** Concept Dependency Engine readiness verdict becomes "Ready" or "Partially Ready" (Section 2).
- **Unlocked → Introduced:** Learning Path Generator schedules and Question Recommendation delivers first exposure content.
- **Introduced → Practicing:** first attempt recorded; BKT posterior initialized beyond prior.
- **Practicing → Proficient:** BKT posterior mastery ≥ proficiency threshold AND minimum evidence count met AND SOLO stage ≥ Multistructural.
- **Proficient → Mastered:** additionally requires ≥ Relational SOLO stage (transfer-question success) AND at least one exam-condition (timed, unaided) correct demonstration (Section 18's exam-condition weighting).
- **Mastered → Decaying:** Spaced Repetition's predicted retention probability drops below the high-confidence band due to elapsed time (Section 26.3), even with no new negative evidence.
- **Decaying → Lapsed:** predicted retention crosses below the proficiency threshold without a successful review having occurred.
- **Lapsed → Practicing:** automatically re-queued (Section 4's decision rule); treated as a fast re-acquisition, not a cold restart, because prior learning history is preserved (Memory Engine, Section 9) and typically accelerates re-mastery versus first-time learning.

**Why this matters:** every engine in Part I can be re-read as a function that either (a) reads the current lifecycle state to decide what to do, or (b) supplies the evidence that moves a concept from one state to the next. This state machine is the single conceptual "spine" an engineering team can use to validate that all 20 engines are behaving consistently with one another — if an engine's output would move a concept backward or forward in a way inconsistent with these transition conditions, that is a design bug by definition.

---

## 29. Multi-Timescale Cognitive Loop

Section 23 described a single-session orchestration loop. In reality, JELET's intelligence operates on **four nested timescales simultaneously**, each with a different dominant engine and a different feedback latency:

| Timescale | Dominant Engines | What Gets Decided | Feedback Latency |
|---|---|---|---|
| **Micro (per-question, seconds)** | Adaptive Difficulty, Question Recommendation, Retrieval Practice | Next question, next difficulty step | Immediate (within session) |
| **Session (minutes)** | Interleaved Practice, Mistake Intelligence, Confidence Engine | Question sequencing/mix, live root-cause tagging, in-session confidence tracking | End of session |
| **Daily/Weekly** | Study Planner, Revision Recommendation, Spaced Repetition, Weakness Detection | What to study today/this week, what's due for revision | 1–7 days |
| **Milestone (exam-cycle)** | Learning Path Generator, Mock Test Intelligence, PYQ Intelligence, Analytics Intelligence | Path replanning, exam-readiness assessment, strategic prioritization | Weeks |

**Design principle:** faster loops must never contradict slower loops. For example, Adaptive Difficulty (micro) may push difficulty up mid-session, but it can never do so on a concept the Weekly loop (Weakness Detection) has flagged as an unresolved Concept Gap awaiting remediation — the slower, more diagnostic loop always constrains the faster, more reactive loop. This nested-constraint principle is what prevents the system from feeling reactive/erratic and makes it feel like a single, consistent teacher across a student's entire journey.

---

## 30. Closing Note — Part II

Part II exists to make the "Algorithms" sections in Part I fully specifiable rather than hand-wavy: every core adaptive mechanism (Mastery, Difficulty, Spacing, Weakness ranking) now has a named formal model with a stated pedagogical rationale, every engine is traceable to a peer-reviewed learning-science principle it must not violate, and the entire system is unified under one Mastery Lifecycle state machine operating across four nested timescales. An engineering team implementing this specification should treat Section 25 (theory) as the **why**, Section 26 (formal models) as the **how precisely**, and Section 28 (lifecycle state machine) as the **single source of truth** for whether any two engines' outputs are mutually consistent.

**— End of AI Design Specification —**
