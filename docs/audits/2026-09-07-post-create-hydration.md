# Post-create hydration: live local validation

Tested 10 previously flagged catalog books using authenticated local creation and detail APIs, real Google Books/Kakao/Open Library requests, persisted SQLite jobs, and two browser detail checks. Production was not changed.

All 10 creates returned the original description with a running job in **8–174 ms**. Eight descriptions improved, one deliberate owner-edit control was preserved, and one book had no acceptable provider improvement. All final descriptions matched fresh authenticated API reads. Existing local catalog copies were unchanged.

| Book | Characters before → after | Result |
|---|---:|---|
| Love Wins | 250 → 1387 | improved |
| Mary Anne saves the day | 188 → 48 | not-needed |
| The Baby-Sitter's Club: The Truth About Stacey | 161 → 446 | improved |
| Fahrenheit 451 | 55 → 1608 | improved |
| Small Things Like These | 0 → 1708 | improved |
| The Food Lab | 249 → 1359 | improved |
| Learning to See Creatively | 258 → 1121 | improved |
| 성을 알면 달라지는 것들 | 250 → 250 | no-improvement |
| Hansons Marathon Method: Run Your Fastest Marathon the Hansons Way | 60 → 2193 | improved |
| Art of Simple Food | 250 → 1211 | improved |

## Recovery and edit protection

Mary Anne Saves the Day was edited through the API after creation while retrieval was running. Hydration did not overwrite the owner text. A later worker invocation completed the job as `not-needed`; the browser showed the exact owner text.

Art of Simple Food initially hydrated successfully. For the interruption check, its test copy was reset to the historical snippet and the same job was dispatched again. The dev server was terminated while the job was running. After restart, the job remained running with its first-attempt lease. The worker claimed nothing before lease expiry. After the real 60-second lease expired, the same worker used by the scheduler reclaimed it and completed hydration on attempt two in 8.033 seconds.

The scheduler worker was invoked directly against the persisted local database. The combined notification scheduler endpoint was not invoked because it also processes unrelated local loan/notification fixtures. This verifies recovery logic with live providers; it does not verify a hosted five-minute cron tick.

Browser spot checks confirmed the repaired Learning to See Creatively text and the preserved Mary Anne owner edit. All ten were checked by API read-back; this was not ten browser-driven create flows.

## Remaining gap

성을 알면 달라지는 것들 stayed at 250 characters. The worker completed with `no-improvement`; it did not recover the previously reviewed fuller text available outside these configured providers. Scheduling works, but this retrieval gap remains. Small Things Like These now includes publisher marketing and reader-review excerpts along with its synopsis; exact ISBN/language checks pass, but this is not an editorial cleanup of provider prose.

## Cleanup

Removed only the ten test copies, their jobs, and newly created unreferenced editions. Preserved all seven pre-existing local copies and their contents. The local description-job schema and provider configuration remain ready for development. No application-code change was needed.
