import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { dojoActions } from './dojo'

export const actions: Record<string, ActionHandler<Env>> = {
  ...dojoActions,
}
