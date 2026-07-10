# Synapse Memory Layers - Build Plan

This document breaks the memory feature into phases and explains what each part teaches.

## Goal

Add memory to Synapse in a way that is:
- explicit, not magical
- easy to inspect and debug
- useful across models and providers
- beginner-friendly to build and maintain

The big idea is simple: memory should live in Synapse, not inside the model.  
Synapse stores it, chooses what matters, and injects it into the prompt before the model runs.

---

## Phase 1: Schema Definition

### What we build

Define the database structure for memory.

### Why this phase exists

Before writing logic, we need a stable place to store data.  
The schema is the contract between TypeScript code and the database.

### Recommended schema

Create a `Memory` table with:
- `id`
- `userId`
- `scope`
- `content`
- `source`
- `confidence`
- `importance`
- `enabled`
- `archived`
- `createdAt`
- `updatedAt`
- `lastUsedAt`

### Why these fields

- `id`: unique identifier for one memory row.
- `userId`: ties memory to the owner.
- `scope`: tells us what kind of memory it is.
  - `conversation`: only useful for one thread
  - `user`: stable preference or fact
  - `project`: context for one app/workspace
  - `semantic`: later, for relevance-based retrieval
- `content`: the actual remembered text.
- `source`: where the memory came from.
- `confidence`: how sure we are this memory is accurate.
- `importance`: helps rank important memories higher.
- `enabled`: lets users turn memory off without deleting it.
- `archived`: keeps old memory out of active use.
- `createdAt`: when it was created.
- `updatedAt`: when it was last edited.
- `lastUsedAt`: when it was last injected into a prompt.

### Architectural decision

We keep memory rows as plain text for v1.  
That is easier to understand than embeddings and gives us a clean learning path.

### What this teaches

- database modeling
- data lifecycle design
- how app behavior maps to tables
- how to think about state that must survive across requests

### Dumbed-down note

This phase is just: “what should we save, and where do we keep it?”

---

## Phase 2: Memory CRUD Service

### What we build

Create a TypeScript service that can:
- create memory
- list memory
- update memory
- delete memory

### Why this phase exists

The database stores the data, but the service gives us reusable logic.  
This is where TypeScript starts to matter more: types make the memory operations safer.

### Suggested file split

- `memory/models.ts`
- `memory/service.ts`
- `memory/index.ts`

### What each file teaches

#### `models.ts`
Defines request/response schemas.

Teaches:
- validation
- API contracts
- how backend endpoints protect themselves from bad input

#### `service.ts`
Contains the actual business logic.

Teaches:
- separation of concerns
- reusable functions
- how to keep database logic out of route handlers
- why classes are sometimes used for grouping related operations

#### `index.ts`
Defines the HTTP routes.

Teaches:
- routing
- request handling
- auth checks
- status codes

### Architectural decision

Use a service layer even though the feature is small.  
That keeps route files thin and makes the code easier to test and reason about.

### What this teaches

- TypeScript interfaces and types
- service-layer architecture
- OOP-style grouping with an abstract service class
- API validation with Elysia schemas

### Dumbed-down note

This phase is: “make memory usable through clean backend functions.”

---

## Phase 3: Memory Retrieval

### What we build

Fetch the most relevant memory rows before a chat request runs.

### Why this phase exists

Memory only matters if we can choose the right parts at the right time.  
The model should not see every memory row. It should see a short, useful slice.

### Retrieval rules for v1

- only fetch memory for the current user
- only fetch enabled and non-archived rows
- sort by importance and recency
- keep the result small
- optionally filter by scope

### Architectural decision

Do not use embeddings in v1.  
Use simple sorting first so the behavior is easy to understand.

This keeps the system debuggable:
- you can see why something was chosen
- you can explain it without ML jargon
- you can later upgrade to semantic retrieval

### What this teaches

- query design
- filtering and ranking
- tradeoffs between simple logic and “smart” logic
- token budget thinking

### Dumbed-down note

This phase is: “pick the few memory notes that actually matter right now.”

---

## Phase 4: Prompt Assembly

### What we build

Turn memory rows into plain text and prepend them to the prompt.

### Why this phase exists

Models do not magically know your app state.  
We have to tell them what to remember by placing memory into the request itself.

### Shape of the memory prefix

Example:

```text
Relevant memory:
- [user] User prefers short backend explanations.
- [project] This app is called Synapse.
- [conversation] We are building memory layers next.
```

### Architectural decision

Inject memory as prompt text, not as a hidden model feature.

Why:
- works across providers
- easy to debug
- easy to disable
- easy to inspect in logs

### What this teaches

- prompt engineering
- request composition
- why LLM apps are mostly data-assembly systems
- how to keep provider logic provider-agnostic

### Dumbed-down note

This phase is: “before asking the model the question, remind it of the useful facts.”

---

## Phase 5: API Contract Update

### What we build

Add a memory toggle to `/api/v1/chat/completions`.

### Why this phase exists

Developers should control whether memory is used.  
Memory should be a choice, not a surprise.

### Recommended request shape

Add:
- `memory: true | false`

### Architectural decision

Make memory explicit in the API contract.

This teaches:
- backward-compatible API design
- feature flags in request bodies
- control surfaces for developers

### What this teaches

- API version thinking
- how request bodies become product behavior
- why explicit knobs are better than hidden magic

### Dumbed-down note

This phase is: “let the caller decide if memory should be used.”

---

## Phase 6: Playground UI

### What we build

Add UI controls to test memory from the logged-in playground.

### Why this phase exists

If users cannot see memory working, they will not trust it.  
The playground should make the feature visible and testable.

### Suggested UI pieces

- memory enable/disable toggle
- current memory list
- memory creation form
- “used memory” preview in the request panel

### Architectural decision

Keep the UI honest and readable.  
Do not hide what the app is sending to the model.

### What this teaches

- frontend state
- forms and toggles
- UI as a debugging tool
- how backend features need a visible surface

### Dumbed-down note

This phase is: “give the user a place to see and control memory.”

---

## Phase 7: Memory Management and Safety

### What we build

Add ways to inspect, edit, disable, and delete memory.

### Why this phase exists

Memory without control becomes confusing fast.  
Users need to trust what is being remembered.

### Features to add

- list memory entries
- edit memory content
- disable memory without deleting it
- archive old memory
- delete memory permanently

### Architectural decision

Prefer reversible actions first.

Why:
- safer for users
- easier to debug
- easier to learn from mistakes

### What this teaches

- data stewardship
- safe product design
- when to soft-delete vs hard-delete
- how to build trust into a system

### Dumbed-down note

This phase is: “give people a way to fix or remove memory they no longer want.”

---

## Phase 8: Later Upgrade - Semantic Retrieval

### What we build

Add embeddings or similarity search to retrieve memory by relevance.

### Why this is later

This is powerful, but not the right first move.  
It adds complexity and hides the logic unless the basics are already clear.

### When to use it

- user memory grows large
- project memory becomes dense
- exact sorting is no longer enough

### What this teaches

- vector search concepts
- similarity vs recency
- advanced retrieval design
- system scaling

### Dumbed-down note

This phase is: “find memory by meaning, not just by date.”

---

## Overall Architecture Summary

Memory should flow like this:

1. user creates or updates memory
2. memory is stored in the DB
3. chat request arrives
4. app fetches relevant memory
5. app adds memory to the prompt
6. model answers with that context
7. app can later show what memory was used

This keeps Synapse simple, explainable, and provider-agnostic.

---

## Final teaching note

The whole feature is really about one idea:

**Synapse should not just send messages to models. It should understand the request enough to carry useful context forward.**

That is what makes it different from a plain router.
