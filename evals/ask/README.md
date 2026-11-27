# Ask evaluation

This folder shows how the changes to `/ask` were measured. Nothing in the app imports it, so it is safe to delete.

- `questions.json` holds 38 questions with what a good answer needs: facts it must mention, the kind of source it must cite, or that it should decline.
- `results/baseline.json` has the answers from the engine before the change.
- `results/after.json` has the answers after the change.

A question passes when the answer is present (or correctly absent), mentions the expected facts, cites the right kind of source, has a citation in every sentence, and leaks nothing it was told not to.
