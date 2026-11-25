import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { SignInView } from '@vionhub/design-system/auth';
import { toast } from '@vionhub/design-system/components';

import { api, ApiError } from '../shared/api';
import { calcul } from '../shared/scoring';
import { encode } from '../shared/codec';
import type { Campaign, Me, SubmissionResult } from '../shared/types';
import { REF, type Referentiel } from '../shared/referentiel';
import { QContext, useQ } from './questionnaire';
import { ExtraStep } from './screens/ExtraStep';
import { TopBar } from './components/TopBar';
import { Confetti } from './components/Confetti';
import { Welcome } from './screens/Welcome';
import { Identity } from './screens/Identity';
import { SituationStep } from './screens/SituationStep';
import { BlocStep } from './screens/BlocStep';
import { LikertStep } from './screens/LikertStep';
import { Results, type LocalFallback } from './screens/Results';
import { clearLocal, hasProgress, initialState, loadLocal, progress, reducer, saveLocal, type FlowState } from './state';

type Phase = 'loading' | 'signin' | 'nocampaign' | 'ready';

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ref, setRef] = useState<Referentiel>(REF);
  const [ldapEnabled, setLdapEnabled] = useState(true);

  const boot = useCallback(async () => {
    try {
      const u = await api.me();
      setMe(u);
      const camps = await api.openCampaigns();
      if (!camps.length) return setPhase('nocampaign');
      setCampaign(camps[0]);
      // the campaign's own questions (versioned in the console); the original bank if they cannot be loaded
      setRef(await api.campaignQuestionnaire(camps[0].id).catch(() => REF));
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setPhase('signin');
      else {
        toast.error(e instanceof Error ? e.message : 'Serveur indisponible');
        setPhase('signin');
      }
    }
  }, []);

  useEffect(() => {
    boot();
    fetch('/api/meta/config')
      .then((r) => r.json())
      .then((c) => setLdapEnabled(!!c.ldap_enabled))
      .catch(() => undefined);
    const onUnauth = () => setPhase('signin');
    window.addEventListener('tac:unauthorized', onUnauth);
    return () => window.removeEventListener('tac:unauthorized', onUnauth);
  }, [boot]);

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setMe(null);
    setPhase('signin');
  };

  if (phase === 'loading')
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );

  if (phase === 'signin')
    return (
      <SignInView
        logoSrc="/logo/logo-full.png"
        logoAlt="SUNU Group"
        title="Test d'Alignement Culturel"
        subtitle={
          ldapEnabled
            ? 'Connectez-vous avec votre identifiant SUNU (session Windows).'
            : 'Mode hors réseau : identifiant SUNU et mot de passe de démonstration.'
        }
        usernamePlaceholder="Identifiant ou e-mail"
        passwordPlaceholder="Mot de passe"
        accentColor="#A6192E"
        poweredBy="SUNU Group · Direction des Ressources Humaines"
        onSignIn={async ({ username, password }) => {
          await api.login(username, password);
          await boot();
        }}
      />
    );

  if (phase === 'nocampaign' || !me || !campaign)
    return (
      <>
        <TopBar me={me} crumb="Test d'Alignement Culturel" progress={0} onSignOut={signOut} />
        <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
          <Typography variant="h4" sx={{ mb: 2 }}>
            Aucune campagne ouverte
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            Le test n'est pas ouvert pour le moment. La DRH vous informera du lancement de la prochaine campagne.
          </Typography>
          <Button variant="outlined" onClick={signOut}>
            Se déconnecter
          </Button>
        </Container>
      </>
    );

  return (
    <QContext.Provider value={ref}>
      <Flow me={me} campaign={campaign} onSignOut={signOut} />
    </QContext.Provider>
  );
}

// ---------------------------------------------------------------------------------------------

const crumbs = (n: number, extrasTitle: string): Record<FlowState['vue'], string> => ({
  accueil: "Test d'Alignement Culturel",
  ident: 'Vous concernant',
  sit: `Partie 1 sur ${n} — Situations`,
  bloc: `Partie 2 sur ${n} — Ce qui vous ressemble`,
  lik: `Partie 3 sur ${n} — Vos pratiques`,
  extra: `Partie 4 sur ${n} — ${extrasTitle}`,
  res: 'Vos résultats',
});
const ANSWERING: FlowState['vue'][] = ['ident', 'sit', 'bloc', 'lik', 'extra'];

function Flow({ me, campaign, onSignOut }: { me: Me; campaign: Campaign; onSignOut: () => void }) {
  const ref = useQ();
  const CRUMBS = useMemo(() => crumbs(ref.extras?.length ? 4 : 3, ref.extrasTitre || 'Questions complémentaires'), [ref]);
  const [s, dispatch] = useReducer(reducer, undefined, initialState);
  const [loaded, setLoaded] = useState(false);
  const [resumable, setResumable] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [fallback, setFallback] = useState<LocalFallback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const saveTimer = useRef<number>();
  const resumeTo = useRef<{ vue: FlowState['vue']; idx: number } | null>(null);

  // initial load: already submitted? draft on server or locally?
  useEffect(() => {
    let alive = true;
    (async () => {
      const [latest, draft] = await Promise.all([
        api.latest(campaign.id).catch(() => null),
        api.getDraft(campaign.id).catch(() => ({ payload: null, updated_at: null })),
      ]);
      if (!alive) return;
      if (latest && !latest.invalide) {
        setResult(latest);
        dispatch({ type: 'go', vue: 'res' });
      } else {
        const local = loadLocal(me.id, campaign.id);
        const serverAt = draft.updated_at ? Date.parse(draft.updated_at) : 0;
        const localAt = local?.savedAt ? Date.parse(local.savedAt) : 0;
        const best = (localAt > serverAt ? local : draft.payload) as Partial<FlowState> | null;
        if (best) {
          if (best.vue && ANSWERING.includes(best.vue)) resumeTo.current = { vue: best.vue, idx: best.idx ?? 0 };
          const { answers, categorie, famille, startedAt, seed } = best;
          dispatch({ type: 'restore', state: { answers, categorie, famille, startedAt, seed, vue: 'accueil', idx: 0 } });
          setResumable(true);
        }
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [campaign.id, me.id]);

  // autosave (debounced) to the server + local mirror
  useEffect(() => {
    // only while answering: saving on the welcome screen would overwrite the resume point
    if (!loaded || !ANSWERING.includes(s.vue)) return;
    saveLocal(me.id, campaign.id, s);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.putDraft(campaign.id, s).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [s, loaded, me.id, campaign.id]);

  // small cheers between the three parts (no effect on answers)
  const prevVue = useRef(s.vue);
  useEffect(() => {
    const from = prevVue.current;
    prevVue.current = s.vue;
    if (from === 'sit' && s.vue === 'bloc')
      toast.success('Partie 1 terminée 🎉', { description: 'Plus que deux parties, vous avancez bien !' });
    else if (from === 'bloc' && s.vue === 'lik')
      toast.success('Partie 2 terminée 💪', {
        description: ref.extras?.length ? 'Encore deux parties : vos pratiques au quotidien.' : 'Dernière ligne droite : vos pratiques au quotidien.',
      });
    else if (from === 'lik' && s.vue === 'extra')
      toast.success('Partie 3 terminée 🚀', { description: 'Dernière ligne droite : quelques questions complémentaires.' });
  }, [s.vue, ref]);

  const go = useCallback((vue: FlowState['vue'], idx = 0) => {
    dispatch({ type: 'go', vue, idx });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const finish = async () => {
    setSubmitting(true);
    const startedAt = s.startedAt ?? new Date().toISOString();
    try {
      const r = await api.submit({
        campaign_id: campaign.id,
        categorie: s.categorie,
        famille: s.famille,
        started_at: startedAt,
        ...s.answers,
      });
      setResult(r);
      setFallback(null);
      setCelebrate(!r.invalide);
      clearLocal(me.id, campaign.id);
      go('res');
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0 && e.status < 500 && e.status !== 404) {
        toast.error(e.message);
      } else {
        // server unreachable: show results locally + restitution code (legacy fallback)
        const duree = Math.round((Date.now() - Date.parse(startedAt)) / 1000);
        const local = calcul(s.answers.sit, s.answers.bloc, s.answers.lik, duree, ref, s.answers.extra);
        const code = encode(
          { matricule: me.username, filiale: me.filliale ?? me.company?.name ?? '', categorie: s.categorie, famille: s.famille, campagne: campaign.code },
          s.answers,
          duree,
          ref,
        );
        setFallback({ result: local, code });
        setResult(null);
        go('res');
        toast.warning("L'envoi automatique n'a pas abouti : transmettez votre code de restitution.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    dispatch({ type: 'reset', keepIdent: true });
    clearLocal(me.id, campaign.id);
    api.deleteDraft(campaign.id).catch(() => undefined);
    setResult(null);
    setFallback(null);
    setCelebrate(false);
    setResumable(false);
  };

  const pct = useMemo(() => progress(s, ref), [s, ref]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.neutral' }}>
      <TopBar me={me} crumb={CRUMBS[s.vue]} progress={pct} onSignOut={onSignOut} campaign={campaign} />
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, sm: 3 } }}>
        {!loaded ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {s.vue === 'accueil' && (
              <Welcome
                me={me}
                campaign={campaign}
                resumable={resumable && hasProgress(s)}
                onStart={() => dispatch({ type: 'start' })}
                onResume={() => go(resumeTo.current?.vue ?? 'ident', resumeTo.current?.idx ?? 0)}
                onRestart={restart}
              />
            )}
            {s.vue === 'ident' && (
              <Identity
                me={me}
                campaign={campaign}
                categorie={s.categorie}
                famille={s.famille}
                onChange={(p) => dispatch({ type: 'ident', ...p })}
                onPrev={() => go('accueil')}
                onNext={() => go('sit', 0)}
              />
            )}
            {s.vue === 'sit' && <SituationStep state={s} dispatch={dispatch} go={go} />}
            {s.vue === 'bloc' && <BlocStep state={s} dispatch={dispatch} go={go} />}
            {s.vue === 'lik' && <LikertStep state={s} dispatch={dispatch} go={go} onFinish={finish} submitting={submitting} />}
            {s.vue === 'extra' && <ExtraStep state={s} dispatch={dispatch} go={go} onFinish={finish} submitting={submitting} />}
            {s.vue === 'res' && celebrate && <Confetti />}
            {s.vue === 'res' && (
              <Results
                me={me}
                campaign={campaign}
                result={result}
                fallback={fallback}
                onRetake={() => {
                  restart();
                  dispatch({ type: 'start' });
                }}
                onSignOut={onSignOut}
              />
            )}
          </>
        )}
      </Container>
    </Box>
  );
}
