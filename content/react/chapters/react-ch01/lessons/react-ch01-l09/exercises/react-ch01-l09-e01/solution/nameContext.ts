import { createContext } from 'react';
import type { NameContextValue } from './types';

export const NameContext = createContext<NameContextValue | null>(null);
