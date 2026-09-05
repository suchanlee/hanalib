'use client';

import { createContext } from 'react';
import type { HanaAppActions, HanaAppState } from '@/lib/domain/types';

// Keep context identity independent of provider/hook hot updates.
export const HanaContext = createContext<{
  state: HanaAppState;
  actions: HanaAppActions;
} | null>(null);
