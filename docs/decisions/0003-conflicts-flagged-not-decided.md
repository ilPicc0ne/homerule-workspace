# 0003 Conflicts between rules are flagged with all sources, not decided by a model

Date: 03.10.2026 · Proposed by: Dimitar Dimitrov · Agreed: Silvan Geser · Status: accepted

## Context
State and local rules overlap. Some yield to each other (a state rent cap yielding to a local rent ordinance), some coexist, and some conflict (a new state act that may preempt local bans).

## Decision
Resolving which rules replace or contradict others is a separate step after extraction; extraction only records where and when a rule applies. Precedence comes from what the law texts themselves say. Where a hard conflict remains, HomeRule flags it and shows all sources. A language model never decides it.

## Alternatives considered
- Letting the model pick the governing rule per question: faster to build, but unverifiable and a step toward legal advice.

## Consequences
- The conflict flag is part of the change-tracking output.
- Hand-written precedence knowledge is used only as a test of the extracted result, not as input.
