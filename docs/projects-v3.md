# Project Memory V3

Date: 2026-06-15

Purpose: define long-running project memory for LoreBook after graph memory, episodes, biographies, revealed preferences, and trust systems exist. Examples: LoreBook, Amazon, robotics, career, family goals.

## Thesis

A project is not a folder. It is a living arc of effort: goals, decisions, people, documents, setbacks, preferences, identity shifts, progress, and unfinished loops over time.

Project Memory V3 should answer:

1. What is this project?
2. Why does it matter to the user?
3. What has happened so far?
4. What decisions shaped it?
5. Who is involved?
6. What is open, blocked, or changing?
7. How has the project changed the user?

## Project Object V3

Each project should have:

- `name`: LoreBook, Amazon, Robotics, Career, Family goals.
- `type`: work, creative, family, health, relationship, identity, learning, logistics.
- `purpose`: what the user is trying to achieve.
- `why_it_matters`: evidenced connection to values, identity, or goals.
- `status`: active, paused, completed, abandoned, recurring.
- `time_span`: started, active periods, dormant periods.
- `threads`: conversations in scope.
- `episodes`: events and scenes.
- `people`: collaborators, managers, family, mentors.
- `places`: work sites, home, schools, venues.
- `files`: evidence objects.
- `decisions`: important choices and tradeoffs.
- `open_loops`: unresolved questions and next actions.
- `preferences`: stated and revealed work style signals.
- `biography_links`: chapters, arcs, turning points.

## Core Modules

### 1. Project Brief

One screen that explains:

- What this project is.
- Current state.
- Why it matters.
- Last meaningful activity.
- Next known step.
- Biggest unresolved question.

### 2. Project Timeline

Chronological but meaning-aware:

- Start.
- Milestones.
- Pivots.
- Blockers.
- Breakthroughs.
- Pauses.
- Resumptions.
- Ending or current phase.

### 3. Decision Log

Projects accumulate decision debt. LoreBook should preserve:

- Decision.
- Options considered.
- Stated reason.
- Revealed reason if different.
- People involved.
- Outcome.
- Whether user later regretted or reaffirmed it.

This becomes one of the highest-value uses of revealed preferences.

### 4. People And Roles

Project-specific roles:

- collaborator
- mentor
- manager
- gatekeeper
- critic
- beneficiary
- blocker
- emotional support

Roles are per project. A person can be an ally in one project and a source of conflict in another.

### 5. Knowledge Base

Accumulated project knowledge:

- Key facts.
- Requirements.
- Constraints.
- Learnings.
- User preferences.
- Reusable summaries.
- Files and source excerpts.

Every item needs provenance and staleness state.

### 6. Open Loops

Projects need continuity:

- unanswered questions
- pending decisions
- people to follow up with
- unclear dates
- missing source material
- stale assumptions
- risks

Open loops should appear when returning to a project.

### 7. Project Biography

Long projects should generate their own story:

- origin
- early struggle
- turning points
- collaborators
- setbacks
- what the user learned
- current chapter

Example: LoreBook is not just a codebase. It is a creative/career/identity arc about building a memory system while using the user's life as the proving ground.

## Project Memory Modes

- `Global`: project facts can inform the whole Life OS.
- `Project`: prioritized when inside this project.
- `Project-only`: cannot leak into other projects.
- `Private`: no memory write unless approved.
- `Evidence-only`: no interpretation, only sourced recall.

## What Should Happen Automatically

When a project-related thread ends:

- Update project summary.
- Add memory delta.
- Link new people and files.
- Extract decisions.
- Detect changed status.
- Update open loops.
- Flag stale facts.
- Attach sources.
- Suggest timeline events.

When a user returns:

- Show what changed since last visit.
- Surface open loops.
- Recall relevant decisions.
- Warn if assumptions changed.
- Offer "continue from here."

## Example Project: LoreBook

Should accumulate:

- Sprints and design decisions.
- People involved in the story of building it.
- Transcript failures as product evidence.
- Architecture docs and roadmap decisions.
- User's emotional relationship to the project.
- Breakthroughs and doubts.
- Revealed preference signals: building, autonomy, memory, legacy.
- Biography link: "The LoreBook Creation Arc."

Magic moment:

> "You have treated LoreBook less like an app and more like a life mission. The evidence is that it appears across career, family, identity, and legacy threads."

### Example Project: Amazon

Should accumulate:

- Hiring process.
- Interview prep.
- People involved.
- Dates and decisions.
- Emotional stakes.
- Role expectations.
- Relationship to career identity.
- What user learned about work preferences.

Magic moment:

> "Your Amazon thread is not only a job search. It is part of the Career Rebuild chapter."

### Example Project: Robotics

Should accumulate:

- Skill development.
- Materials, tasks, ideas.
- Collaborators.
- Related career goals.
- Periods of activity and dormancy.
- Evidence of genuine interest vs aspirational interest.

Magic moment:

> "Robotics has mostly been stated interest so far; LoreBook has little revealed behavior. Want to create a first concrete step?"

### Example Project: Family Goals

Should accumulate:

- Care responsibilities.
- Abuela, Tío Juan, Mom, family places.
- Recurring obligations.
- Emotional themes.
- Open loops.
- Relationship drift or repair.

Magic moment:

> "Family is your strongest revealed value. This project is where that value becomes action."

## Project Surface Layout

1. Project brief.
2. Continue card.
3. Timeline.
4. Open loops.
5. Decisions.
6. People.
7. Files and sources.
8. Biography/story.
9. Preferences and patterns.
10. Settings and memory mode.

## Success Metrics

- Project return rate.
- Open-loop resolution rate.
- Decision recall success.
- Project search success.
- Project memory correction rate.
- Percentage of project answers with sources.
- User-reported "I did not have to re-explain this project."
- Project-to-biography conversion.

## Non-Goals

- Do not build generic task management.
- Do not compete with Jira, Notion, or Google Drive.
- Do not make projects primarily folders.
- Do not let project-only memory leak globally.
- Do not infer a project is important without evidence.

## Product Principle

A LoreBook project should remember the work, the people, the decisions, and what the work meant to the user's life.
