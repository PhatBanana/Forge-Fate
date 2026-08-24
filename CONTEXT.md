# Domain glossary

The words this codebase uses for its multiplayer half, so a term reads the
same in code, comments, HISTORY and reviews. Deeper reasoning lives in
`docs/HISTORY.md` under the § each term names.

- **The table** — the shared fight: one DM device holding all authority
  (§92). Its screen is the battle screen (`TableTab`).
- **Host** — the role the battle screen plays on the wire: applies
  operations, broadcasts truth, answers hellos. One host, ever.
- **Seat** — a player's view of the table (§93), phone-sized, and the role
  it plays on the wire: proposes, never writes. Carries their sheet as
  well as their play card since §142, which is where a check-call lands.
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
- **Check-call** — the DM asking the table something (§141, §143). A
  **check** names a skill: "who has the highest Perception". It travels
  host → seats only and the answer is a hand going up in the room. A
  **save** names an ability and a DC: everybody rolls where they are
  sitting, and the totals come back as proposals the DM reads. Truth
  rather than an operation either way, so a phone that reconnects
  mid-question is asked it again.

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
- **Reading** — one of the four ways a character is shown (§138):
  guided, sheet, paper, dense page. Not a destination — the menu is
  still the only navigation (§35). The tab is derived from the reading,
  never tracked beside it.
- **Pending band** — the line above every reading (`PendingBand`, §138):
  the §123 sections, each with what it is still waiting on and a way to
  it. What §33.4's rail and §33.5's "Next choices" panel became, once
  they turned out to be the same list twice.
- **Waiting choice** — one decision still unanswered (`waitingChoices`,
  §138): which section owns it, how many of it are outstanding, the box
  on the sheet it fills, and whether it is a *ranking* or a *form*. The
  band's five counts are a sum over these, so the two grains cannot
  disagree.
- **Step** — one question the guided flow asks (`flowSteps.ts`, §138).
  The list is derived, never held, which is what makes answering one
  advance the flow: the list is a step shorter and the same index is the
  next question.
- **Ranked pick** — the shape four scorers share (§138): a score, signed
  reasons, the strongest of them as a headline, and why it cannot be
  taken. Feats, class options, skills and spells all answer it, which is
  why one card draws all four.
- **The two readings of a sheet** (§138) — *paper* (`CharacterSheet`) is
  ink on cream in both themes, the sheet of record, and the one that
  prints; *screen* (`ScreenSheet`) is on the app's palette, abridged, and
  never prints. The ink conceit was always an argument about print, so it
  stayed with the reading that prints.
- **Lit box** — the box on the screen reading that the current step names
  (§138). `--ring` and an inset accent rule, and nothing else. Every
  ranked step's `target` must be a box that exists there, or the step
  card is pointing at nothing.
- **Section row** — one of §123's five on the dense page (§140): what it
  holds, what it is still waiting on, and the readouts its own edits
  move, all inside it. What §33.4's rail was keyed to, now that there is
  no rail.
- **The foot** — damage per round and the build review, under every
  reading (`FlowFoot`, §140). A glance, not a panel: the figure and the
  shape of the curve, with `DamagePanel` on the dense page for when the
  glance raises a question.

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
