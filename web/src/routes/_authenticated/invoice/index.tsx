import { createFileRoute } from '@tanstack/react-router'
import { InvoiceCenterPage } from '@/platform/user-pages/invoice'

export const Route = createFileRoute('/_authenticated/invoice/')({ component: InvoiceCenterPage })
