/** @jsxImportSource react */
// Adaptado de shadcn/ui, MIT. Fonte e licença em THIRD_PARTY_NOTICES.md.
import type { ComponentProps } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-4', {
  variants: {
    variant: { default: 'product-button', outline: 'product-button-outline', ghost: 'product-button-ghost' },
    size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-xs', icon: 'h-10 w-10' },
  }, defaultVariants: { variant: 'default', size: 'default' },
})
export function Button({ className, variant, size, asChild = false, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
