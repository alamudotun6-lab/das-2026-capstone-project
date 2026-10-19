# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

## Build 1

### Review of the first draft
- **What I asked:** Review and complete Build 1 against `docs/build-1.md`, including input validation, readable references, the demo, and the lookup benchmark.
- **What came back:** The demo and benchmark ran, and the queue/inventory structure was mostly present.
- **What was wrong (or "nothing"):** The required `newReference()` export was missing (the first draft called it `referenceCode()`), and some domain inputs such as `organizerId`, `userId`, store objects, and missing dates were not consistently validated. I added `newReference()` (keeping an alias for compatibility), tightened validation, made the demo name the next waitlisted person and show that cancelling twice fails, and updated the benchmark to use `newReference()`.
