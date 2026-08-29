import { createFileRoute } from '@tanstack/react-router'
import { InvoiceManagementPage } from '@/platform/admin-pages/invoice'

export const Route = createFileRoute('/_authenticated/invoice-management/')({ component: InvoiceManagementPage })
