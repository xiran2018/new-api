/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute } from '@tanstack/react-router'

import { UpdatesPage } from '@/platform/public-pages/updates'

export const Route = createFileRoute('/updates/')({ component: UpdatesPage })
