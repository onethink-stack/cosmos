/** @jsxImportSource react */
// Adaptado de shadcn/ui, MIT.
import type { ComponentProps } from 'react'
import { cn } from './utils'
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn('h-10 w-full min-w-0 rounded-xl border bg-transparent px-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40', className)} {...props} />
}
