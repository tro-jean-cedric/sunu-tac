import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { SignInView } from '@vionhub/design-system/auth';
import { Iconify, SplashScreen } from '@vionhub/design-system/components';

import { api, ApiError } from '../shared/api';
import type { Me } from '../shared/types';
import { resetCaches } from './lib';
import { SessionContext } from './session';
import { Shell } from './Shell';
import { DashboardPage } from './pages/DashboardPage';
import { RespondentsPage } from './pages/RespondentsPage';
import { ImportPage } from './pages/ImportPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { AdminPage } from './pages/AdminPage';
import { AssistantPage } from './pages/AssistantPage';
import { QuestionnairesPage } from './pages/QuestionnairesPage';
import { QuestionnaireEditorPage } from './pages/questionnaire/EditorPage';

type AuthState = { status: 'loading' } | { status: 'anon' } | { status: 'ok'; me: Me };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((me) => alive && setAuth({ status: 'ok', me }))
      .catch(() => alive && setAuth({ status: 'anon' }));
    const onUnauthorized = () => {
      resetCaches();
      setAuth({ status: 'anon' });
    };
    window.addEventListener('tac:unauthorized', onUnauthorized);
    return () => {
      alive = false;
      window.removeEventListener('tac:unauthorized', onUnauthorized);
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* session already gone */
    }
    resetCaches();
    setAuth({ status: 'anon' });
  }, []);

  const session = useMemo(() => (auth.status === 'ok' ? { me: auth.me, signOut } : null), [auth, signOut]);

  if (auth.status === 'loading') return <SplashScreen />;

  if (auth.status === 'anon') {
    return (
      <SignInView
        logoSrc="/logo/logo-full.png"
        logoAlt="SUNU"
        title="Console DRH"
        subtitle="Test d'Alignement Culturel SUNU"
        usernamePlaceholder="Identifiant"
        passwordPlaceholder="Mot de passe"
        buttonLabel="Se connecter"
        accentColor="#A6192E"
        poweredBy={null}
        onSignIn={async ({ username, password }) => {
          try {
            const me = await api.login(username, password);
            setAuth({ status: 'ok', me });
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) throw new Error('Identifiant ou mot de passe incorrect.');
            throw e;
          }
        }}
      />
    );
  }

  if (!auth.me.is_hr) return <NoAccess me={auth.me} onSignOut={signOut} />;

  return (
    <SessionContext.Provider value={session}>
      <Shell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/repondants" element={<RespondentsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/campagnes" element={<CampaignsPage />} />
          <Route path="/questionnaires" element={<QuestionnairesPage />} />
          <Route path="/questionnaires/:id" element={<QuestionnaireEditorPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/admin" element={auth.me.is_hr_admin ? <AdminPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </SessionContext.Provider>
  );
}

function NoAccess({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: 'background.neutral',
      }}
    >
      <Card sx={{ p: { xs: 3, sm: 5 }, maxWidth: 480, width: 1, textAlign: 'center' }}>
        <Stack spacing={2.5} alignItems="center">
          <Box component="img" src="/logo/logo-full.png" alt="SUNU" sx={{ height: 48 }} />
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.lighter',
              color: 'primary.main',
            }}
          >
            <Iconify icon="solar:lock-keyhole-bold-duotone" width={40} />
          </Box>
          <Typography variant="h4">Accès réservé à la DRH</Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            Vous êtes connecté en tant que <strong>{me.name}</strong>. Cette console est réservée à la DRH Groupe et
            aux DRH d'entité. Si vous pensez devoir y accéder, adressez-vous à la DRH Groupe.
          </Typography>
          <Button
            variant="contained"
            color="inherit"
            size="large"
            onClick={onSignOut}
            startIcon={<Iconify icon="solar:logout-2-bold-duotone" />}
          >
            Se déconnecter
          </Button>
        </Stack>
      </Card>
    </Box>
  );
}
