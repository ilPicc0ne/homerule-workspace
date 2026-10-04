# Chatbot scoreboard

Run 2026-10-04 00:06 UTC. 20 dated city-level questions (`scoreboard/questions.yaml`), built from the six card questions of the address page; answer key from the challenge guide, change tests and brief, written before any chatbot ran. Same model in every arm; grader `typesafe/jev-1.13`, blind to the arm. Not legal advice.

| Arm | Model | Correct | Partly | Wrong |
|---|---|---|---|---|
| Plain chatbot | `openai/gpt-6-luna` | **16/20** | 0 | 4 |
| Plain chatbot + web search | `openai/gpt-6-luna` | **20/20** | 0 | 0 |
| HomeRule | `openai/gpt-6-luna` | **18/20** | 1 | 1 |

| Question | City | Date | Plain chatbot | Plain chatbot + web search | HomeRule |
|---|---|---|---|---|---|
| How much can my rent go up? | Boston, MA | 2026-10-01 | ✓ | ✓ | ✓ |
| How much can my rent go up? | Cambridge, MA | 2026-10-01 | ✓ | ✓ | ~ |
| How much can my rent go up? | San Francisco, CA | 2026-10-01 | ✓ | ✓ | ✓ |
| How much can my rent go up? | San Diego, CA | 2026-10-01 | ✓ | ✓ | ✓ |
| When can they end my tenancy? | San Francisco, CA | 2026-10-01 | ✓ | ✓ | ✓ |
| When can they end my tenancy? | Newark, NJ | 2026-10-01 | ✓ | ✓ | ✓ |
| How much deposit can they ask? | San Diego, CA | 2026-10-01 | ✓ | ✓ | ✓ |
| How much deposit can they ask? | Newark, NJ | 2026-10-01 | ✓ | ✓ | ✓ |
| How much deposit can they ask? | Cambridge, MA | 2026-10-01 | ✓ | ✓ | ✓ |
| What can they charge me to apply? | Jersey City, NJ | 2026-04-30 | ✓ | ✓ | ✓ |
| What can they charge me to apply? | Hoboken, NJ | 2026-10-01 | ✗ | ✓ | ✓ |
| What can they charge me to apply? | Boston, MA | 2026-10-01 | ✓ | ✓ | ✓ |
| What can they check about me? | Jersey City, NJ | 2026-10-01 | ✓ | ✓ | ✓ |
| What can they check about me? | Los Angeles, CA | 2026-10-01 | ✓ | ✓ | ✓ |
| Can rent-setting software be used on my rent? | Los Angeles, CA | 2025-12-31 | ✓ | ✓ | ✓ |
| Can rent-setting software be used on my rent? | Los Angeles, CA | 2026-01-02 | ✓ | ✓ | ✓ |
| Can rent-setting software be used on my rent? | Jersey City, NJ | 2026-10-01 | ✗ | ✓ | ✓ |
| Can rent-setting software be used on my rent? | Newark, NJ | 2026-10-01 | ✗ | ✓ | ✓ |
| Can rent-setting software be used on my rent? | Newark, NJ | 2027-07-02 | ✓ | ✓ | ✗ |
| Can rent-setting software be used on my rent? | Cambridge, MA | 2026-10-01 | ✗ | ✓ | ✓ |
