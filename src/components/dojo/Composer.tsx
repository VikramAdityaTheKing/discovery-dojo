/**
 * Message box used by both roles:
 *   rep      talks to the buyer
 *   manager  steps into the call; the buyer hears them as the rep's boss
 *
 * Files go to DeepSpace's app-scoped R2 storage with useR2Files. For small
 * text files (.txt .md .csv .json) we also read the text in the browser and
 * send it as `excerpt`, so the buyer can actually react to what it says.
 * For PDFs and images the buyer only sees the file name and the message.
 */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useR2Files } from 'deepspace'
import { Paperclip, Send, X } from 'lucide-react'
import { Button, Textarea, useToast } from '@/components/ui'
import type { Attachment } from '../../dojo/types'

const TEXT_TYPES = /\.(txt|md|markdown|csv|json)$/i
const MAX_EXCERPT = 4000

export interface ComposerHandle {
  fill: (text: string) => void
}

interface Props {
  placeholder: string
  disabled: boolean
  busy: boolean
  onSend: (content: string, attachment: Attachment | null) => Promise<boolean>
  onTyping?: (typing: boolean) => void
  tone?: 'rep' | 'manager'
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { placeholder, disabled, busy, onSend, onTyping, tone = 'rep' },
  ref,
) {
  const toast = useToast()
  const { upload } = useR2Files({ scope: 'app' })
  const fileInput = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [uploading, setUploading] = useState(false)

  // Lets the live coach's "Use" button load a suggestion into this box.
  useImperativeHandle(ref, () => ({
    fill: (text: string) => {
      setDraft(text)
      onTyping?.(true)
      textRef.current?.focus()
    },
  }))

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const res = await upload(file, file.name)
      if (!res.success || !res.url) throw new Error('Upload failed')
      const excerpt = TEXT_TYPES.test(file.name) ? (await file.text()).slice(0, MAX_EXCERPT) : ''
      setAttachment({ name: file.name, url: res.url, note: '', excerpt })
    } catch (e) {
      toast.error('Could not attach the file', (e as Error).message)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const send = async () => {
    const content = draft.trim()
    if ((!content && !attachment) || busy) return
    setDraft('')
    onTyping?.(false)
    const ok = await onSend(content, attachment)
    if (ok) setAttachment(null)
    else setDraft(content) // give the words back so nothing is lost
  }

  return (
    <div className="mt-3">
      {attachment && (
        <div className="mb-2 flex w-fit items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs">
          <Paperclip className="h-3.5 w-3.5" />
          {attachment.name}
          {attachment.excerpt ? <span className="text-muted-foreground">(buyer can read it)</span> : null}
          <button aria-label="Remove attachment" onClick={() => setAttachment(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
        <Button
          variant="outline"
          aria-label="Attach a file"
          disabled={disabled || uploading}
          loading={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip />
        </Button>
        <Textarea
          ref={textRef}
          data-testid={tone === 'rep' ? 'composer' : 'manager-composer'}
          rows={2}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            onTyping?.(e.target.value.length > 0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          className={tone === 'manager' ? 'flex-1 resize-none border-amber-500/40' : 'flex-1 resize-none'}
        />
        <Button aria-label="Send" disabled={disabled || (!draft.trim() && !attachment)} loading={busy} onClick={() => void send()}>
          <Send />
        </Button>
      </div>
    </div>
  )
})
