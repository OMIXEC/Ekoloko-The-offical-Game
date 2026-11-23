# Preserve the pristine V1 baseline in source/origin/V1

Type: task
Status: open
Blocked by:

## Question

Where is the unmodified original source preserved before further changes?

## Current state

Accepted decisions: rebuild `source/origin/V1` from fresh fetches of the three pinned upstream commits (not the current dirty tree), keep the branch immutable, keep it local/private and never push third-party assets to the public remote. `master` is the working line and flows to builds; nothing merges back into V1. Branch creation itself is still pending — the working repo has no commits yet. Resolving this ticket requires original icons to be remade first and a third-party notices document to be written.
