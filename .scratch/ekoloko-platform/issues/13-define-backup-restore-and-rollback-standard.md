# Define backup, restore and rollback standard

Type: grilling
Status: open
Blocked by: Decide deployment topology for a remote user base

## Question

What is backed up, how often, where, and how is a restore proven?

## Current state

SQLite runs in WAL mode at `backend/server/database/ekoloko.db` and is gitignored. No off-host backup cadence, restore drill, RPO/RTO target or rollback trigger has been agreed yet. `omni-db-backups` skill is installed for later use.
