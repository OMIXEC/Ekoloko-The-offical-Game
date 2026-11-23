# Define observability and incident response scope

Type: grilling
Status: open
Blocked by: Decide deployment topology for a remote user base

## Question

What signals must exist to know the platform is healthy, and what happens when it is not?

## Current state

Server emits console logs and `/health`; `/ws` frame capture is available with `EKOLOKO_CAPTURE_FRAMES=1`. No metrics destination, alerting, error tracking, on-call rotation or incident procedure exists yet. Needs decisions on log retention, login-failure / socket-drop / redemption-error alerts, severity levels and rollback triggers.
