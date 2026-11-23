# Create the orimiz developer account with full entitlements

Type: task
Status: closed
Blocked by:

## Question

Which account is used for local and QA playability checks?

## Resolution

`admin/cli.js user:create --username orimiz --password Iorimiz11` created Game account id 4; `user:max --user orimiz` granted coins 9,999,999, credits 999,999, level 999, premium 1, moderator 1, ranger 5, entitlements `premium/pioneer/gold/ranger`, 20 real item IDs and 10 card IDs. HTTP login returns `login_ok_mod`. Used by `tests/qa/session-smoke.mjs` and the Playwright suite.
