# Sketch admin dashboard information architecture

Type: prototype
Status: open
Blocked by: Define admin identity, roles and authentication, Define subscription and entitlement model

## Question

What should the admin dashboard contain, and which actions must be audited?

## Current state

An `/admin` dashboard already exists in `backend/server/src/admin/routes.ts` with users, codes/gift cards, subscriptions and audit views. A rough IA prototype has not been produced yet; needs review of read-only vs privileged actions, 2FA re-auth and second-approver rules.
