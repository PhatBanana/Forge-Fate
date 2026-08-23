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

## The battle screen

- **Tool** — what the DM has in hand: an aim, a grab, a light, the mark
  brush, the walk, or a zone placement. Exactly one, or none (§134,
  ADR-0001). Arming one puts the other down; a turn ending, a fight
  ending or the table being cleared empties the hands.
- **Board cursor** — a square being pointed at rather than something
  held (§85). Not a tool: Escape unwinds it after whatever is in hand
  and before the drawer.

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

## The character

- **Sheet view** — the read side of a character in play (`sheetOf`,
  §120): hit points, slots, pact slots, hit dice, held resources and
  ammunition, each with its cap already inside. `BuildContext` holds the
  caps, `PlayState` holds the spending; this is the join. The write side
  stays in `play.ts` and still takes its cap.
- **Section** — one step of the Builder's rail (`sections.ts`, §123):
  identity, abilities, equipment, skills & options, feats. Carries its
  own label and its own count of choices still unmade. The Level Up
  panel points at one rather than reimplementing its pickers.
- **Stored value** — something that survives a reload (`useStored`,
  §124): a key, a hydrate that is the only way in, and the store behind
  `persist.ts`. There is no unguarded stored value.
- **Saving throw** — ability modifier, proficiency if the *starting*
  class grants that save (a dip grants none), plus what the items are
  worth on every save (`saveBonusOf`, §128). One answer, asked by the
  sheet, the play card and the fight.
- **Signed** — how this game writes a modifier: `+3`, `-1`, and `+0`
  rather than `0` (`format.ts`, §131). A sheet says "you add nothing"
  out loud.

## The fight, continued

- **Walk plan** — one combatant's walk, whole (`walkPlanFor`, §121): the
  budget in two tiers, the map, the map with hazards avoided, and the
  price to a square by the route the feet would actually take.
- **Lighting** — the lights, the ambient level, the per-square lookup and
  the gloom the map draws (`lightingOf`, §122), as one value with one
  lifetime. The lookup carries its cache, so the value's lifetime is the
  cache's.
- **Monster instance** — one monster's own state during a fight
  (`monsterInstance.ts`, §126): the write side of §106's rule.
