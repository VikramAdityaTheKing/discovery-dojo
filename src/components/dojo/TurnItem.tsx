/**
 * One line of the transcript, plus the coaching notes pinned to it.
 *
 * Managers (coaches) get an "Add note" control on every turn. Notes are
 * written straight from the browser with useMutations('notes').create: the
 * `notes` schema lets members create, and edit/delete only their own, so no
 * server action is needed. RecordRoom then pushes the new note to everyone
 * in the room, including the rep, in real time.
 */

import { useState } from 'react'
import { MessageSquarePlus, Paperclip, Trash2 } from 'lucide-react'
import type { RecordData } from 'deepspace'
import { useMutations } from 'deepspace'
import { Button, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Attachment, NoteRow, TurnRow } from '../../dojo/types'
import { parseJson } from '../../dojo/types'

interface Props {
  turn: RecordData<TurnRow>
  notes: RecordData<NoteRow>[]
  buyerName: string
  canCoach: boolean
  myUserId: string | null
  myName: string
}

export function TurnItem({ turn, notes, buyerName, canCoach, myUserId, myName }: Props) {
  const { data } = turn
  const isRep = data.speaker === 'rep'
  const isManager = data.speaker === 'manager'
  const seller = isRep || isManager
  const file = parseJson<Attachment | null>(data.attachment, null)
  const streaming = data.streaming === 'true'
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const { create, remove, ready } = useMutations<NoteRow>('notes')

  const saveNote = async () => {
    const content = draft.trim()
    if (!content) return
    await create({ sessionId: data.sessionId, turnId: turn.recordId, authorName: myName, content })
    setDraft('')
    setComposing(false)
  }

  return (
    <div data-testid="turn" className={cn('group flex flex-col', seller ? 'items-end' : 'items-start')}>
      <div className="mb-1 px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {isRep
          ? `Rep${data.authorName ? ` · ${data.authorName.split(' ')[0]}` : ''}`
          : isManager
            ? `Manager stepped in · ${(data.authorName || 'Manager').split(' ')[0]}`
            : buyerName || 'Buyer'}
      </div>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isRep
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : isManager
              ? 'rounded-br-sm border border-amber-500/50 bg-amber-500/15 text-foreground'
              : 'rounded-bl-sm bg-card text-card-foreground border border-border',
        )}
      >
        {data.content}
        {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-current" />}
        {streaming && !data.content && <span className="text-muted-foreground">thinking</span>}
        {file && (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex w-fit items-center gap-1.5 rounded-md bg-background/30 px-2 py-1 text-xs underline-offset-2 hover:underline"
          >
            <Paperclip className="h-3.5 w-3.5" /> {file.name}
          </a>
        )}
      </div>

      {/* Coaching notes pinned to this turn */}
      {notes.map((n) => (
        <div
          key={n.recordId}
          data-testid="coach-note"
          className={cn(
            'mt-1.5 flex max-w-[85%] items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200',
          )}
        >
          <span className="font-semibold text-amber-400">{n.data.authorName}:</span>
          <span className="flex-1">{n.data.content}</span>
          {n.createdBy === myUserId && (
            <button
              aria-label="Delete note"
              className="text-amber-400/60 hover:text-amber-300"
              onClick={() => remove(n.recordId)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}

      {canCoach && !streaming && (
        <div className="mt-1 max-w-[85%]">
          {composing ? (
            <div className="flex w-[min(28rem,80vw)] flex-col gap-2 rounded-lg border border-border bg-card p-2">
              <Textarea
                autoFocus
                rows={2}
                value={draft}
                placeholder="Coaching note on this moment..."
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void saveNote()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setComposing(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!ready || !draft.trim()} onClick={() => void saveNote()}>
                  Pin note
                </Button>
              </div>
            </div>
          ) : (
            <button
              data-testid="add-note"
              onClick={() => setComposing(true)}
              className="flex items-center gap-1 px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Add note
            </button>
          )}
        </div>
      )}
    </div>
  )
}
