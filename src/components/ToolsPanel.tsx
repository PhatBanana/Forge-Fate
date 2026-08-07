import type { Build } from '../types';
import { GEAR, GEAR_CATEGORY_LABELS } from '../data/gear';
import type { GearCategory } from '../data/gear';
import { LANGUAGES, LANGUAGE_KIND_LABELS } from '../data/languages';
import type { LanguageKind } from '../data/languages';
import type { BuildContext } from '../engine/character';
import { Panel } from './shared';

/**
 * Tool proficiencies and languages.
 *
 * Both have been on `Build` for phases, both are read by the proficiency
 * engine, and both are printed on the character sheet - and nothing ever wrote
 * to either. The Proficiencies panel would say "2 extra languages to choose"
 * and offer nowhere to choose them, which is an advertised dead end and the
 * worst kind of gap: the app knew what was missing and could not help.
 *
 * The tool list is the gear catalogue filtered to the four categories that are
 * proficiencies rather than objects, so a tool cannot exist in one place and not
 * the other. Nothing here is scored: a tool proficiency is worth what your
 * table makes of it, which is not something the optimizer can know.
 */

const TOOL_CATEGORIES: GearCategory[] = ['kit', 'artisan', 'instrument', 'gaming'];

export function ToolsPanel({
  build,
  ctx,
  patch,
}: {
  build: Build;
  ctx: BuildContext;
  patch: (partial: Partial<Build>) => void;
}) {
  const held = new Set(build.toolIds);
  const spoken = new Set(build.languages);
  const openLanguages = ctx.proficiencies.languages.open;

  const toggleTool = (name: string) =>
    patch({
      toolIds: held.has(name) ? build.toolIds.filter((t) => t !== name) : [...build.toolIds, name],
    });

  const toggleLanguage = (name: string) =>
    patch({
      languages: spoken.has(name)
        ? build.languages.filter((l) => l !== name)
        : [...build.languages, name],
    });

  return (
    <Panel
      title="Tools and languages"
      subtitle={
        openLanguages > 0
          ? `${build.toolIds.length} tool ${build.toolIds.length === 1 ? 'proficiency' : 'proficiencies'}, and ${openLanguages} more ${openLanguages === 1 ? 'language' : 'languages'} to choose.`
          : `${build.toolIds.length} tool ${build.toolIds.length === 1 ? 'proficiency' : 'proficiencies'} and ${build.languages.length} ${build.languages.length === 1 ? 'language' : 'languages'}.`
      }
    >
      {TOOL_CATEGORIES.map((category) => (
        <div key={category} style={{ marginBottom: 12 }}>
          <div className="field-label">{GEAR_CATEGORY_LABELS[category]}</div>
          <div className="chips">
            {GEAR.filter((item) => item.category === category).map((item) => (
              <button
                key={item.id}
                className={`chip-btn ${held.has(item.name) ? 'is-on' : ''}`}
                aria-pressed={held.has(item.name)}
                onClick={() => toggleTool(item.name)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      <p className="muted" style={{ marginTop: -4 }}>
        Proficiency with a tool adds your bonus to checks made with it. Nothing here is ranked — what
        a tool is worth depends entirely on the campaign, which is not something the app can score.
      </p>

      {(['standard', 'exotic', 'secret'] as LanguageKind[]).map((kind) => (
        <div key={kind} style={{ marginTop: 14 }}>
          <div className="field-label">{LANGUAGE_KIND_LABELS[kind]} languages</div>
          <div className="chips">
            {LANGUAGES.filter((language) => language.kind === kind).map((language) => (
              <button
                key={language.name}
                className={`chip-btn ${spoken.has(language.name) ? 'is-on' : ''}`}
                aria-pressed={spoken.has(language.name)}
                title={language.note}
                onClick={() => toggleLanguage(language.name)}
              >
                {language.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      <p className="muted" style={{ marginTop: 12 }}>
        A secret language comes with its class rather than being chosen, so a Rogue already has
        Thieves' Cant and a Druid already has Druidic — they are listed so the sheet can show them.
        Exotic languages are the ones a DM may reasonably rule out for a starting character.
      </p>
    </Panel>
  );
}
