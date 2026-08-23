# One tool in hand at a time

The battle screen can arm six tools — an aim, a grab, a light, the mark brush,
the walk, and a zone placement. Until §134 they were six independent pieces of
state, and holding more than one at once was reachable: arming the light while
aiming left both live, and Escape unwound them through a priority stack. We
decided that arming any tool puts every other one down, which makes "two tools
in hand" a state the app can no longer be in, and then folded the six into one
`Tool` union so it is a state the *type* cannot express either.

## Considered options

The alternative was to leave the six flags alone, which is what §107 decided
after surveying this exact refactor. Its reasoning was sound at the time and is
worth recording, because the code no longer shows it: the tools were **not**
mutually exclusive, so a union would have made a genuinely reachable state
unrepresentable — holding a zone placement under an aim — and that is a
behaviour change wearing a refactor's clothes. §107 declined it and wrote down
the condition for reopening: *"Reopen only with a decision that one tool at a
time is the rule."*

§134 made that decision. The order matters: the product rule changed first, and
the union followed because the rule made it honest. Doing it the other way round
— folding the union to tidy the state and discovering the behaviour change
afterwards — is the mistake this ADR exists to prevent someone repeating in
reverse.

## Consequences

Three put-down points empty the DM's hands entirely rather than dropping one
named tool: a turn ending, a fight ending, and the table being cleared. The
first of those also fixes a latent case where an aim survived into the next
combatant's turn still carrying the previous combatant's `attackerId`.

Two put-down points deliberately keep naming their own tool, and so cost a
conditional rather than saving one: **running an enemy's plan** puts the walk
down at its tail and should not disarm an aim the DM armed for the next
combatant, and **the objective changing away from `reach`** is a domain rule
about the mark brush that should not reach across and drop an unrelated aim.

That distinction is not decoration. The first draft of the fold aliased "put
the walk down" to "put everything down", which is a shorter line and a
different app: it would have emptied the hands at both of these points too,
under cover of a refactor. The setters each drop only their own tool for that
reason.

The **board cursor** (§85) is not a tool and is unaffected. It is a square being
pointed at rather than something held, which is why Escape unwinds it *after*
whatever is in hand and before the drawer.

Reversing this means unpicking the union, not flipping a flag.
