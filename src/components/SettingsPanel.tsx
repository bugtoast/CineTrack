import { useEffect, useRef, useState } from 'react'
import { ARCHIVE_NAME_MAX_LENGTH, DEFAULT_ARCHIVE_NAME, LANGUAGES, THEMES, useSettings } from '../lib/settings'
import { loggedEpisodeCount, MAX_LIBRARY_FILE_BYTES, minutesWatched, parseLibraryImport, useLibrary } from '../lib/library'
import { Chip, CloseButton, ConfirmDialog, SETTINGS_PANEL_ID, handleRadioGroupKeyDown, useBodyScrollLock, useFocusTrap } from './ui'
import { useToast } from './Toast'

export default function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, set } = useSettings()
  const { entries, replaceAll, clear } = useLibrary()
  const { toast } = useToast()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)
  useFocusTrap(panelRef, open)

  // Because this panel is lazy-mounted the first time it opens, its closed pose
  // (offscreen to the right) must paint before `data-open` flips — otherwise the
  // browser has no starting frame to transition from on that very first open.
  // Two rAFs: the first lets the resting pose be committed on screen, the second
  // latches `shown` so the slide-in runs from a painted start. Exit mirrors via
  // `shown` dropping to false while the sheet stays mounted.
  useEffect(() => {
    if (!open) {
      setShown(false)
      return
    }
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [open])


  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) setConfirmWipe(false)
  }, [open])

  const exportLibrary = () => {
    try {
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `cinetrack-${new Date().toISOString().slice(0, 10)}.json`
      try {
        document.body.append(anchor)
        anchor.click()
      } finally {
        anchor.remove()
        // Let the browser start reading the Blob before releasing its URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      toast('Shelf exported', 'success')
    } catch {
      toast('Export failed', 'error')
    }
  }

  const importLibrary = async (file: File) => {
    if (file.size > MAX_LIBRARY_FILE_BYTES) {
      toast('File too large — max 80 MB.', 'error')
      return
    }
    try {
      const text = await file.text()
      const { merged, imported, skipped, combined } = parseLibraryImport(text, entries)
      replaceAll(merged)
      toast(
        `Imported ${imported} titles${combined ? `, combined ${combined} with existing (kept your data)` : ''}${skipped ? `, skipped ${skipped} invalid` : ''}`,
        skipped ? 'info' : 'success',
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That file could not be read as a CineTrack export.', 'error')
    }
  }

  const counts = {
    movie: entries.filter((e) => e.mediaType === 'movie').length,
    tv: entries.filter((e) => e.mediaType === 'tv').length,
    total: entries.length,
  }

  const episodes = entries.reduce((s, e) => s + loggedEpisodeCount(e), 0)
  const minutes = minutesWatched(entries)
  const hours = Math.round(minutes / 60)
  const days = (minutes / 1440).toFixed(1)
  const archiveNameLength = Array.from(settings.archiveName).length
  const archiveWords = settings.archiveName.trim().split(/\s+/).filter(Boolean)
  const italicWordIndices = settings.archiveItalicWordIndices

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-[rgba(20,19,15,0.42)] transition-opacity duration-[var(--dur-quick)] ${
          shown ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        data-open={shown}
      />
      <aside
        ref={panelRef}
        id={SETTINGS_PANEL_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        inert={!open}
        className="drawer-sheet quiet-scroll fixed right-0 top-0 z-50 h-full w-full max-w-[420px] overflow-y-auto border-l border-border bg-background"
        data-open={shown}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
          <span className="rule-label">Settings · Preferences</span>
          <CloseButton onClick={onClose} label="Close settings" />
        </header>

        <div className="divide-y divide-border">
          <Group title="Appearance" note="Choose the color palette for CineTrack.">
            <div className="grid grid-cols-4 gap-3">
              {THEMES.map((t) => {
                const active = settings.theme === t.id
                const [ground, ink, accent] = t.swatch
                return (
                  <span key={t.id} className="min-w-0">
                    <button
                      onClick={() => set('theme', t.id)}
                      title={`${t.name} — ${t.note}`}
                      aria-label={`${t.name} theme`}
                      aria-pressed={active}
                      className="press flex aspect-square w-full items-center justify-center overflow-hidden border transition-[filter] duration-200 hover:brightness-[0.96]"
                      style={{
                        background: ground,
                        borderColor: active ? accent : `${ink}24`,
                        boxShadow: active ? `inset 0 0 0 1px ${accent}` : undefined,
                      }}
                    >
                      <span aria-hidden className="flex">
                        <span className="block h-6 w-6" style={{ background: ink }} />
                        <span aria-hidden className="block h-6 w-6" style={{ background: accent }} />
                      </span>
                    </button>
                    <span className="mt-2 flex items-center justify-center gap-1">
                      <span
                        className={`truncate font-sans text-[10px] uppercase tracking-[0.14em] ${
                          active ? '' : 'text-muted-foreground'
                        }`}
                        style={active ? { color: accent } : undefined}
                      >
                        {t.name}
                      </span>
                      {active && (
                        <span aria-hidden className="font-sans text-[10px]" style={{ color: accent }}>
                          ✓
                        </span>
                      )}
                    </span>
                  </span>
                )
              })}
            </div>
          </Group>

          <Group title="Archive identity" note="Choose the name shown in the masthead.">
            <div>
              <label htmlFor="archive-name" className="block text-[13px]">Archive name</label>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span id="archive-name-hint" className="rule-label">Shown in the home masthead</span>
                <span
                  id="archive-name-count"
                  aria-label={`${archiveNameLength} of ${ARCHIVE_NAME_MAX_LENGTH} characters`}
                  className="font-sans text-[10px] tabular-nums text-muted-foreground"
                >
                  {archiveNameLength}/{ARCHIVE_NAME_MAX_LENGTH}
                </span>
              </div>
              <input
                id="archive-name"
                value={settings.archiveName}
                onChange={(e) => set('archiveName', e.target.value)}
                maxLength={ARCHIVE_NAME_MAX_LENGTH * 2}
                spellCheck={false}
                autoComplete="off"
                aria-describedby="archive-name-hint archive-name-count"
                onBlur={(e) => {
                  const normalized = e.currentTarget.value.trim()
                  if (normalized !== settings.archiveName) set('archiveName', normalized)
                }}
                placeholder="Enter an archive name"
                className="mt-2 h-10 w-full border border-border bg-card px-3 font-display text-[16px] text-foreground outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-muted-foreground focus:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]"
              />
              {archiveWords.length > 0 && (
                <div className="mt-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span id="archive-highlight-label" className="block text-[13px]">Masthead highlights</span>
                    <span className="rule-label">{italicWordIndices.length} of {archiveWords.length} selected</span>
                  </div>
                  <span id="archive-highlight-hint" className="rule-label mt-0.5 block">Choose one or more words to italicize and color with your accent.</span>
                  <div role="group" aria-labelledby="archive-highlight-label" aria-describedby="archive-highlight-hint" className="mt-2 flex flex-wrap gap-1.5">
                    {archiveWords.map((word, index) => {
                      const selected = italicWordIndices.includes(index)
                      return (
                        <button
                          key={`${index}-${word}`}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          onClick={() => set('archiveItalicWordIndices', selected
                            ? italicWordIndices.filter((wordIndex) => wordIndex !== index)
                            : [...italicWordIndices, index])}
                          className={`press border px-2.5 py-1.5 font-sans text-[11px] transition-colors ${
                            selected
                              ? 'border-[var(--primary)] bg-[var(--primary)]/10 italic text-[var(--primary)]'
                              : 'border-border text-muted-foreground hover:border-[var(--foreground)] hover:text-foreground'
                          }`}
                        >
                          {word}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-1 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => set('archiveItalicWordIndices', archiveWords.map((_, index) => index))}
                      className="press min-h-7 font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-[var(--primary)]"
                    >
                      Highlight all
                    </button>
                    <button
                      type="button"
                      onClick={() => set('archiveItalicWordIndices', [])}
                      className="press min-h-7 font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-[var(--primary)]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
              {settings.archiveName !== DEFAULT_ARCHIVE_NAME && (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      set('archiveName', DEFAULT_ARCHIVE_NAME)
                      set('archiveItalicWordIndices', [2])
                    }}
                    className="press min-h-8 px-1 font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
                  >
                    Reset to default
                  </button>
                </div>
              )}
            </div>
          </Group>

          <Group title="Layout & display" note="Adjust shelf grids and supporting details.">
            <Toggle
              label="Shortcut hints"
              note="Show keyboard hints in the navigation bar."
              value={settings.showNavHints}
              onChange={(v) => set('showNavHints', v)}
            />
            <NumberChoices
              label="Shelf items per row"
              note="Columns in shelf plates grid"
              value={settings.libraryColumns}
              min={3}
              max={10}
              onChange={(v) => set('libraryColumns', v)}
            />
            <NumberChoices
              label="Discover items per row"
              note="Columns in discover plates grid"
              value={settings.discoverColumns}
              min={3}
              max={10}
              onChange={(v) => set('discoverColumns', v)}
            />
            <NumberChoices
              label="For You suggestions per row"
              note="Each category shelf stacks two rows"
              value={settings.shelfColumns}
              min={3}
              max={10}
              onChange={(v) => set('shelfColumns', v)}
            />
            <OptionsRow
              label="Poster image quality"
              note="Data-saver fetches smaller artwork"
              value={settings.posterQuality}
              options={[
                { id: 'standard', label: 'Standard' },
                { id: 'saver', label: 'Data-saver' },
              ]}
              onChange={(v) => set('posterQuality', v)}
            />
            <OptionsRow
              label="Ledger dates"
              note="How viewing dates read in Activity"
              value={settings.dateStyle}
              options={[
                { id: 'absolute', label: 'Absolute' },
                { id: 'relative', label: 'Relative' },
              ]}
              onChange={(v) => set('dateStyle', v)}
            />
            <Toggle
              label="Community scores"
              note="Show IMDb vote averages beside release years."
              value={settings.showCommunityScores}
              onChange={(v) => set('showCommunityScores', v)}
            />
          </Group>

          <Group title="Watch tracking" note="Set defaults for new titles and watch progress.">
            <OptionsRow
              label="Default status for new titles"
              note="Starting status when a title is added"
              value={settings.defaultStatus}
              options={[
                { id: 'planned', label: 'Planned' },
                { id: 'watching', label: 'Watching' },
              ]}
              onChange={(v) => set('defaultStatus', v)}
            />
            <Toggle
              label="Open details after adding"
              note="Open the title page as soon as it is added."
              value={settings.openAfterAdd}
              onChange={(v) => set('openAfterAdd', v)}
            />
            <OptionsRow
              label="Default watch date"
              note="Date to prefill when marking a title Watched"
              value={settings.defaultWatchDate}
              options={[
                { id: 'today', label: 'Today' },
                { id: 'blank', label: 'Blank' },
              ]}
              onChange={(v) => set('defaultWatchDate', v)}
            />
            <Toggle
              label="Mark series Watched automatically"
              note="Set a show to Watched when its final episode is marked."
              value={settings.autoCompleteSeries}
              onChange={(v) => set('autoCompleteSeries', v)}
            />
          </Group>

          <Group title="Episode display" note="Choose what appears in TV episode lists.">
            <Toggle
              label="Hide episode descriptions"
              note="Hide episode synopses in TV details."
              value={settings.hideSpoilers}
              onChange={(v) => set('hideSpoilers', v)}
            />
            <Toggle
              label="Show episode covers"
              note="Display still images in TV episode lists."
              value={!settings.hideEpisodeCovers}
              onChange={(v) => {
                set('hideEpisodeCovers', !v)
                if (!v) set('blurEpisodeCovers', false)
              }}
            />
            {!settings.hideEpisodeCovers && (
              <div className="ml-3 border-l border-border pl-3">
                <Toggle
                  label="Blur episode covers"
                  note="Apply a blur effect to episode stills."
                  value={settings.blurEpisodeCovers}
                  onChange={(v) => set('blurEpisodeCovers', v)}
                />
              </div>
            )}
            <Toggle
              label="Show special episodes"
              note="Include the Specials season in TV episode lists."
              value={settings.showSpecials}
              onChange={(v) => set('showSpecials', v)}
            />
          </Group>

          <Group title="Shelf defaults" note="Choose where and how your shelf opens.">
            <OptionsRow
              label="Default shelf tab"
              note="Tab selected when Shelf opens"
              value={settings.defaultShelfTab}
              options={[
                { id: 'all', label: 'All' },
                { id: 'movie', label: 'Films' },
                { id: 'tv', label: 'TV' },
                { id: 'favorites', label: 'Favourites' },
              ]}
              onChange={(v) => set('defaultShelfTab', v)}
            />
            <OptionsRow
              label="Default sort order"
              note="Sort applied when Shelf opens"
              value={settings.defaultSort}
              options={[
                { id: 'added', label: 'Recently added' },
                { id: 'lastWatched', label: 'Last watched' },
                { id: 'title', label: 'A–Z' },
                { id: 'rating', label: 'My rating' },
                { id: 'year', label: 'Year' },
                { id: 'status', label: 'Status' },
              ]}
              onChange={(v) => set('defaultSort', v)}
            />
          </Group>

          <Group title="Search & catalogue" note="Control search results and title metadata.">
            <Toggle
              label="Show adult titles"
              note="Include adult-rated films and series in search and discover results."
              value={settings.includeAdult}
              onChange={(v) => set('includeAdult', v)}
            />
            <div>
              <span className="block text-[13px]">Metadata language</span>
              <span className="rule-label mt-0.5 block">Titles and synopses served by TMDb</span>
              <div className="relative mt-2">
                <select
                  value={settings.metadataLanguage}
                  onChange={(e) => set('metadataLanguage', e.target.value)}
                  aria-label="Metadata language"
                  className="h-9 w-full cursor-pointer appearance-none border border-border bg-card px-2 pr-9 text-[13px] text-foreground outline-none focus:border-[var(--primary)]"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground"
                >
                  <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </Group>

          <Group title="Library data" note="Review, back up, or manage your local library.">
            <div className="space-y-2">
              <div className="rule-label text-[10px]">Library overview</div>
              <div className="grid grid-cols-3 gap-2 border border-border bg-card p-3">
                <div>
                  <dt className="rule-label text-[9px]">Films</dt>
                  <dd className="mt-1 font-display text-[26px] leading-none tabular-nums text-foreground">{counts.movie}</dd>
                </div>
                <div>
                  <dt className="rule-label text-[9px]">Series</dt>
                  <dd className="mt-1 font-display text-[26px] leading-none tabular-nums text-foreground">{counts.tv}</dd>
                </div>
                <div>
                  <dt className="rule-label text-[9px]">Total</dt>
                  <dd className="mt-1 font-display text-[26px] leading-none tabular-nums text-foreground">{counts.total}</dd>
                </div>
                <div>
                  <dt className="rule-label text-[9px]">Episodes</dt>
                  <dd className="mt-1 font-display text-[26px] leading-none tabular-nums text-foreground">{episodes}</dd>
                </div>
                <div>
                  <dt className="rule-label text-[9px]">Hours</dt>
                  <dd className="mt-1 font-display text-[26px] leading-none tabular-nums text-foreground">{hours}</dd>
                </div>
                <div>
                  <dt className="rule-label text-[9px]">Days</dt>
                  <dd className="mt-1 font-display text-[26px] leading-none tabular-nums text-foreground">{days}</dd>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border">
              <div className="rule-label mb-2 text-[10px]">Backup & restore</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={exportLibrary}
                  className="press flex items-center justify-center border border-border bg-card py-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-foreground hover:border-[var(--foreground)] hover:bg-background"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="press flex items-center justify-center border border-border bg-card py-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-foreground hover:border-[var(--foreground)] hover:bg-background"
                >
                  Import JSON
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importLibrary(file)
                    event.target.value = ''
                  }}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border">
              <div className="rule-label mb-2 text-[10px] text-[var(--destructive)]">Danger Zone</div>
              <button
                type="button"
                onClick={() => setConfirmWipe(true)}
                className="press flex w-full items-center justify-center border border-[var(--destructive)] bg-[var(--destructive)] py-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--destructive-foreground)] hover:opacity-90"
              >
                Erase entire shelf
              </button>
            </div>
          </Group>
        </div>

        <ConfirmDialog
          open={confirmWipe}
          title="Erase Entire Archive"
          message={
            <span>
              This will permanently delete all <strong>{entries.length}</strong> titles and logged episodes from your local database.
              Export a JSON copy first if you want to preserve your records.
            </span>
          }
          confirmLabel="Erase all records"
          onCancel={() => setConfirmWipe(false)}
          onConfirm={() => {
            clear()
            setConfirmWipe(false)
          }}
        />
      </aside>
    </>
  )
}

function Group({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="px-6 py-6">
      <div className="mb-4">
        <h3 className="font-display text-[22px] leading-none">{title}</h3>
        {note && <p className="mt-1 text-[12px] text-muted-foreground">{note}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Toggle({
  label,
  note,
  value,
  onChange,
}: {
  label: string
  note: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-4 text-left"
    >
      <span>
        <span className="block text-[13px]">{label}</span>
        <span className="rule-label">{note}</span>
      </span>
      <span
        className={`relative box-border block h-5 w-10 shrink-0 border transition-colors ${
          value ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-border bg-secondary'
        }`}
      >
        <span
          className={`absolute left-0 top-[2px] block h-[14px] w-[14px] transition-transform duration-200 ${
            value ? 'translate-x-[22px] bg-[var(--primary-foreground)]' : 'translate-x-[2px] bg-background'
          }`}
        />
      </span>
    </button>
  )
}

/** Labelled single-choice chip row bound to a string-union setting. */
function OptionsRow<T extends string>({
  label,
  note,
  value,
  options,
  onChange,
}: {
  label: string
  note?: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div>
      <span className="block text-[13px]">{label}</span>
      {note && <span className="rule-label mt-0.5 block">{note}</span>}
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label} onKeyDown={handleRadioGroupKeyDown}>
        {options.map((o) => (
          <Chip key={o.id} role="radio" active={value === o.id} onClick={() => onChange(o.id)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function NumberChoices({
  label,
  note,
  value,
  min = 3,
  max = 10,
  onChange,
}: {
  label: string
  note?: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  const choices = Array.from({ length: max - min + 1 }, (_, index) => min + index)

  return (
    <div>
      <div>
        <span className="block text-[13px]">{label}</span>
        {note && <span className="rule-label mt-0.5 block text-[10px]">{note}</span>}
      </div>
      <div
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={label}
        onKeyDown={handleRadioGroupKeyDown}
      >
        {choices.map((count) => {
          const active = value === count
          return (
            <button
              key={count}
              type="button"
              role="radio"
              aria-label={`${count} items per row`}
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(count)}
              className={`press flex aspect-square min-w-0 items-center justify-center border font-sans text-base font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
                active
                  ? 'border-[var(--primary)] bg-[var(--primary)] text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-[var(--primary)] hover:text-foreground'
              }`}
            >
              {count}
            </button>
          )
        })}
      </div>
    </div>
  )
}
