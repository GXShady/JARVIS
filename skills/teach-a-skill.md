---
name: teach-a-skill
description: Learn a new routine from the user. Use for "learn this", "when I say X do Y", "new skill", "teach you a routine".
---

1. Ask what it should be called and what should trigger it, if they have not said.
2. Have them describe the steps. Let them finish.
3. Read the steps back in one or two sentences to confirm you have them.
4. On their yes, call `skill_save` with a short hyphenated name, a description that includes the trigger phrases, and the steps numbered, in their words.
5. If `skill_save` is not available, tell them write access must be enabled first, and offer to put the steps on a blade so they can save the file themselves.
