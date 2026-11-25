import { useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  DebouncedSearchField,
  Iconify,
  Label,
  Scrollbar,
  TableHeadCustom,
  TablePaginationCustom,
  toast,
  useConfirm,
} from '@vionhub/design-system/components';
import { SunuBreadcrumbs } from '../brand';

import { api } from '../../shared/api';
import { fmt } from '../../shared/theme';
import type { AdminUser, Company, RoleGrant } from '../../shared/types';
import { SectionCard } from '../components';
import { errMsg, fDateTime, loadCompanies, useAsync } from '../lib';
import { useSession } from '../session';

const ROLE_LABEL = { HR_ADMIN: 'DRH Groupe', HR_ENTITY: 'DRH Entité' } as const;

const ACTION_LABEL: Record<string, string> = {
  login_hr: 'Connexion à la console',
  view_individual: 'Consultation d’un profil individuel',
  delete_submission: 'Suppression d’une passation',
  export_csv: 'Export CSV',
  import_codes: 'Import de codes',
  import_files: 'Import de fichiers',
  grant_role: 'Attribution de rôle',
  revoke_role: 'Retrait de rôle',
  create_campaign: 'Création de campagne',
  update_campaign: 'Modification de campagne',
  ldap_sync: 'Synchronisation de l’annuaire',
};

export function AdminPage() {
  return (
    <Stack spacing={3}>
      <SunuBreadcrumbs
        heading="Administration"
        links={[{ name: 'Console DRH', href: '/' }, { name: 'Administration' }]}
      />
      <StatusCard />
      <UsersCard />
      <AuditCard />
    </Stack>
  );
}

// ---------------------------------------------------------------- status

function StatusCard() {
  const st = useAsync(() => api.adminStatus(), []);
  const [syncing, setSyncing] = useState(false);
  const s = st.data;

  const sync = async () => {
    setSyncing(true);
    try {
      const rep = await api.ldapSync();
      const parts = Object.entries(rep).map(([k, v]) => `${k} : ${fmt(v)}`);
      toast.success(`Annuaire synchronisé${parts.length ? ` (${parts.join(', ')})` : ''}.`);
      st.reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSyncing(false);
    }
  };

  const syncButton = (
    <Button
      variant="contained"
      onClick={sync}
      disabled={!s?.ldap_enabled || syncing}
      startIcon={<Iconify icon="solar:refresh-bold" />}
    >
      {syncing ? 'Synchronisation…' : 'Synchroniser l’annuaire'}
    </Button>
  );

  return (
    <SectionCard
      title="Annuaire et état du service"
      action={
        s && !s.ldap_enabled ? (
          <Tooltip title="Mode hors réseau : l'annuaire n'est pas joignable, les utilisateurs déjà en base sont utilisés">
            <span>{syncButton}</span>
          </Tooltip>
        ) : (
          syncButton
        )
      }
    >
      {st.error && <Alert severity="error">{st.error}</Alert>}
      {st.loading && !s && <LinearProgress />}
      {s && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Stat
              icon="solar:server-square-bold-duotone"
              label="Annuaire LDAP"
              value={
                <Label color={s.ldap_enabled ? 'success' : 'warning'}>
                  {s.ldap_enabled ? 'Activé' : 'Hors réseau'}
                </Label>
              }
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stat icon="solar:users-group-two-rounded-bold-duotone" label="Utilisateurs" value={fmt(s.users)} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stat icon="solar:buildings-2-bold-duotone" label="Entités" value={fmt(s.companies)} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stat
              icon="solar:clock-circle-bold-duotone"
              label="Dernière synchronisation"
              value={s.last_sync ? fDateTime(s.last_sync) : 'Jamais'}
            />
          </Grid>
        </Grid>
      )}
    </SectionCard>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral', height: 1 }}
    >
      <Iconify icon={icon} width={32} sx={{ color: 'primary.main', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography variant="subtitle1" component="div">
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------- users & roles

const roleText = (r: RoleGrant) =>
  r.role === 'HR_ENTITY' ? `${ROLE_LABEL.HR_ENTITY} · ${r.company_name ?? r.company_id}` : ROLE_LABEL.HR_ADMIN;

function UsersCard() {
  const { me } = useSession();
  const [q, setQ] = useState('');
  const [hrOnly, setHrOnly] = useState(true);
  const users = useAsync(() => api.users(q, hrOnly), [q, hrOnly]);
  const [rows, setRows] = useState<Record<number, AdminUser>>({});
  const [granting, setGranting] = useState<AdminUser | null>(null);
  const confirm = useConfirm();

  // local overrides after grant/revoke, without refetching the whole list
  const list = (users.data ?? []).map((u) => rows[u.id] ?? u);
  const update = (u: AdminUser) => setRows((m) => ({ ...m, [u.id]: u }));

  const revoke = async (u: AdminUser, r: RoleGrant) => {
    const ok = await confirm({
      title: 'Retirer ce rôle ?',
      message: (
        <span>
          <strong>{u.name}</strong> perdra le rôle « {roleText(r)} » et l’accès correspondant à la console.
        </span>
      ),
      confirmText: 'Retirer',
      color: 'error',
    });
    if (!ok) return;
    try {
      update(await api.revokeRole(r.id));
      toast.success('Rôle retiré.');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <Card>
      <Box sx={{ px: 3, pt: 3 }}>
        <Typography variant="h6">Utilisateurs et rôles DRH</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          La DRH Groupe voit toutes les entités et administre la console ; une DRH Entité ne voit que les résultats de
          son entité.
        </Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ p: 3, pb: 2 }}>
        <DebouncedSearchField
          value={q}
          onDebouncedChange={(v) => {
            setQ(v.trim());
            setRows({});
          }}
          placeholder="Rechercher par nom, identifiant ou e-mail…"
          loading={users.loading}
          sx={{ flex: 1, maxWidth: { sm: 440 } }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={hrOnly}
              onChange={(e) => {
                setHrOnly(e.target.checked);
                setRows({});
              }}
            />
          }
          label="Avec un rôle DRH uniquement"
        />
      </Stack>
      {users.error && (
        <Alert severity="error" sx={{ mx: 3, mb: 2 }}>
          {users.error}
        </Alert>
      )}
      <TableContainer>
        <Scrollbar>
          <Table sx={{ minWidth: 820 }}>
            <TableHeadCustom
              headLabel={[
                { id: 'name', label: 'Utilisateur', minWidth: 240 },
                { id: 'company', label: 'Entité', minWidth: 180 },
                { id: 'roles', label: 'Rôles', minWidth: 240 },
                { id: 'actions', label: '', width: 190 },
              ]}
            />
            <TableBody>
              {list.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.lighter', color: 'primary.dark' }}>
                        {u.name.slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>
                          {u.name}
                          {u.id === me.id && (
                            <Label variant="soft" sx={{ ml: 1 }}>
                              vous
                            </Label>
                          )}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="div">
                          {u.username}
                          {u.email ? ` · ${u.email}` : ''}
                          {u.local_account ? ' · compte local' : ''}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{u.company?.name ?? '—'}</Typography>
                    {u.title && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {u.title}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                      {u.roles.length === 0 && (
                        <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                          Aucun
                        </Typography>
                      )}
                      {u.roles.map((r) => (
                        <Chip
                          key={r.id}
                          size="small"
                          color={r.role === 'HR_ADMIN' ? 'primary' : 'secondary'}
                          variant="outlined"
                          label={roleText(r)}
                          onDelete={
                            u.id === me.id && r.role === 'HR_ADMIN' ? undefined : () => revoke(u, r)
                          }
                        />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<Iconify icon="mingcute:add-line" />}
                      onClick={() => setGranting(u)}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      Attribuer un rôle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!users.loading && list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {q ? 'Aucun utilisateur ne correspond à cette recherche.' : 'Aucun utilisateur avec un rôle DRH.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Scrollbar>
      </TableContainer>
      <Box sx={{ height: 16 }} />
      {granting && (
        <GrantDialog
          user={granting}
          onClose={() => setGranting(null)}
          onGranted={(u) => {
            update(u);
            setGranting(null);
          }}
        />
      )}
    </Card>
  );
}

function GrantDialog({
  user,
  onClose,
  onGranted,
}: {
  user: AdminUser;
  onClose: () => void;
  onGranted: (u: AdminUser) => void;
}) {
  const companies = useAsync(loadCompanies, []);
  const [role, setRole] = useState<'HR_ADMIN' | 'HR_ENTITY'>('HR_ENTITY');
  const [company, setCompany] = useState<Company | null>(
    () => (user.company ? { id: user.company.id, name: user.company.name } : null),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const u = await api.grantRole(user.id, role, role === 'HR_ENTITY' ? company?.id : null);
      toast.success(`Rôle « ${ROLE_LABEL[role]} » attribué à ${user.name}.`);
      onGranted(u);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Attribuer un rôle à {user.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <RadioGroup value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <FormControlLabel
              value="HR_ENTITY"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="subtitle2">DRH Entité</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Résultats, répondants et import limités à une entité.
                  </Typography>
                </Box>
              }
              sx={{ mb: 1 }}
            />
            <FormControlLabel
              value="HR_ADMIN"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="subtitle2">DRH Groupe</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Toutes les entités, campagnes et administration de la console.
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
          {role === 'HR_ENTITY' && (
            <Autocomplete
              options={companies.data ?? []}
              loading={companies.loading}
              value={company}
              onChange={(_, v) => setCompany(v)}
              getOptionLabel={(c) => c.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Aucune entité"
              loadingText="Chargement…"
              renderInput={(p) => <TextField {...p} label="Entité" required />}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" variant="outlined" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || (role === 'HR_ENTITY' && !company)}>
          Attribuer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------- audit

function AuditCard() {
  const log = useAsync(() => api.audit(), []);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const rows = log.data ?? [];

  return (
    <Card>
      <Stack direction="row" alignItems="center" sx={{ px: 3, pt: 3, pb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">Journal d’audit</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Connexions, consultations nominatives, exports, imports et changements de droits.
          </Typography>
        </Box>
        <Tooltip title="Actualiser">
          <span>
            <Button color="inherit" onClick={log.reload} disabled={log.loading} sx={{ minWidth: 0 }}>
              <Iconify icon="solar:refresh-bold" />
            </Button>
          </span>
        </Tooltip>
      </Stack>
      {log.loading && <LinearProgress sx={{ height: 2 }} />}
      {log.error && (
        <Alert severity="error" sx={{ mx: 3, mb: 2 }}>
          {log.error}
        </Alert>
      )}
      <TableContainer>
        <Scrollbar>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHeadCustom
              headLabel={[
                { id: 'at', label: 'Date', width: 160 },
                { id: 'actor', label: 'Auteur', width: 160 },
                { id: 'action', label: 'Action', minWidth: 220 },
                { id: 'target', label: 'Objet' },
              ]}
            />
            <TableBody>
              {rows.slice(page * size, page * size + size).map((a, i) => (
                <TableRow key={`${a.at}-${i}`} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fDateTime(a.at)}</TableCell>
                  <TableCell>{a.actor}</TableCell>
                  <TableCell>{ACTION_LABEL[a.action] ?? a.action}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', wordBreak: 'break-word' }}>{a.target ?? '—'}</TableCell>
                </TableRow>
              ))}
              {!log.loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    Journal vide.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Scrollbar>
      </TableContainer>
      <TablePaginationCustom
        count={rows.length}
        page={page}
        rowsPerPage={size}
        rowsPerPageOptions={[10, 25, 50]}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => {
          setSize(Number(e.target.value));
          setPage(0);
        }}
        labelRowsPerPage="Lignes par page :"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`}
      />
    </Card>
  );
}
