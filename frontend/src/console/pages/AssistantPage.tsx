import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';

import { useAiEnabled } from '../../shared/ai';
import { AiAvatar, AiChat } from '../../shared/ai-ui';
import { SunuBreadcrumbs } from '../brand';
import { EmptyState, InternalUse } from '../components';

const FILTER_NAMES: Record<string, string> = {
  campaign_code: 'campagne',
  company_name: 'entité',
  categorie: 'catégorie',
  famille: 'famille',
};

function toolLabel(t: { name: string; input: Record<string, unknown> }) {
  if (t.name === 'list_filters') return 'Filtres disponibles';
  if (t.name === 'get_summary') {
    const f = Object.entries(t.input)
      .filter(([, v]) => v)
      .map(([k, v]) => `${FILTER_NAMES[k] ?? k} : ${String(v)}`);
    return `Données — ${f.length ? f.join(', ') : 'tout le périmètre'}`;
  }
  return t.name;
}

export function AssistantPage() {
  const enabled = useAiEnabled();
  return (
    <Stack spacing={3}>
      <Box>
        <InternalUse />
        <SunuBreadcrumbs heading="Assistant IA" links={[{ name: 'Console DRH' }, { name: 'Assistant IA' }]} sx={{ mt: 1.5 }} />
      </Box>
      {!enabled ? (
        <EmptyState
          title="Assistant IA non activé"
          description="Renseignez ANTHROPIC_API_KEY dans le fichier .env du serveur pour activer l'assistant."
        />
      ) : (
        <Card sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
            <AiAvatar size={44} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                Interrogez vos résultats en langage naturel
              </Typography>
              <Typography variant="caption" color="text.secondary">
                L'assistant consulte les mêmes agrégats que le tableau de bord, dans votre périmètre. Les petits groupes restent masqués ;
                aucune donnée individuelle n'est accessible.
              </Typography>
            </Box>
            <Iconify icon="solar:shield-check-bold-duotone" width={28} sx={{ color: 'success.main', display: { xs: 'none', sm: 'block' } }} />
          </Stack>
          <AiChat
            endpoint="/ai/hr/ask"
            greeting="Bonjour ! Posez-moi une question sur les résultats du TAC : comparaisons entre filiales, dimensions à travailler, évolution entre campagnes, idées d'actions…"
            placeholder="Ex. : Quelle filiale est la plus faible en Autonomie ?"
            toolLabel={toolLabel}
            minHeight={280}
            maxHeight="58vh"
            suggestions={[
              'Quelles sont nos deux dimensions prioritaires, et pourquoi ?',
              'Quelle filiale est la plus faible en Autonomie ?',
              'Compare les managers et les non-managers',
              'Propose 3 actions concrètes pour la Collaboration',
            ]}
          />
        </Card>
      )}
    </Stack>
  );
}
