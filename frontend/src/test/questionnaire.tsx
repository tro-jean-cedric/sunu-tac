/** The questions of the current campaign (loaded from the API; the original bank as fallback). */
import { createContext, useContext } from 'react';

import { REF, type Referentiel } from '../shared/referentiel';

export const QContext = createContext<Referentiel>(REF);
export const useQ = () => useContext(QContext);
