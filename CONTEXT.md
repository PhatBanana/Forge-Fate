# Domain glossary

The words this codebase uses for its multiplayer half, so a term reads the
same in code, comments, HISTORY and reviews. Deeper reasoning lives in
`docs/HISTORY.md` under the § each term names.

- **The table** — the shared fight: one DM device holding all authority
  (§92). Its screen is the battle screen (`TableTab`).
- **Host** — the role the battle screen plays on the wire: applies
  operations, broadcasts truth, answers hellos. One host, ever.
- **Seat** — a player's view of the table (§93), phone-sized, and the role
  it plays on the wire: proposes, never writes.
- **Chair** — a seat claim: which character a player took, name attached
  (§96). An honor system; rejoining is re-sitting.
- **Plan / intent** — what a player will do when their turn comes (§92).
  An operation on the shared queue, run or declined by the DM. Never
  replayed after a dead spot (§95's rule).
- **Truth** — the host's broadcast state: roster, plans, seats. A seat
  takes truth and never dictates it.
- **Wire** — the transport seam (`TableWire`, §94): send, onMessage,
  close. Adapters: BroadcastChannel (same browser), the relay (network),
  paired wires (tests).
- **The relay** — a room that forwards and forgets (§95): no storage, no
  accounts; the room code is the whole secret.
- **Room** — where a table meets on a relay, named by a shout-across-the-
  table code (§96).
- **Session** — the protocol policy behind one seam (`tableSession`,
  §103): role, hello handshake, rejoin re-say, the §96 quarantine of
  incoming truth. App binds it to React state; tests converse with it
  over paired wires.
- **Table roster / own roster** — the §96 quarantine: over a relay,
  incoming truth lands in a separate table roster and never touches the
  characters a device built for itself.
- **Dead spot** — the line down (§97): the wire pockets a device's own
  sit and marks to re-say after the reconnect's hello; operations stay
  dropped.
- **Composer** — the plan form both chairs share (`PlanComposer`, §105):
  kind, cast, target, note. The target list is each screen's own policy
  (§93); the form is not.
- **Map contract** — the one interface all three battlefield renderers
  answer (`mapContract.ts`, §104): shared core plus each projection's
  declared extras, typed at the caller so a dropped prop is a compile
  error.

## The fight

- **Fight view** — the read-side of a fight, bundled so a rules module
  learns one thing rather than four: the encounter, the roster, the
  monster table and the build derivations (planned, ROADMAP §9).
- **Resolution** — what a write-side rule returns: the new roster, and
  the events (lunge, walk, float, banner, toast, log) the screen plays.
  Rules say what happened; they do not do it.
- **Combatant facts** — what is true of one combatant right now:
  conditions, size, exhaustion, ruleset, defences, stance, who holds
  them. Reads from whichever store owns each one (§106).
