import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Bot, Cpu, Plus, RefreshCw, Settings2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FormSelect } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAgentsStore } from '@/stores/agents';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { hostApiFetch } from '@/lib/host-api';
import { subscribeHostEvent } from '@/lib/host-events';
import { CHANNEL_ICONS, CHANNEL_NAMES, type ChannelType } from '@/types/channel';
import type { AgentSummary } from '@/types/agent';
import {
  buildRuntimeProviderOptions,
  splitModelRef,
  type RuntimeProviderOption,
} from '@/lib/model-options';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ACCENT_ICON_LG, ACCENT_ICON_SM } from '@/lib/ui-patterns';
import telegramIcon from '@/assets/channels/telegram.svg';
import discordIcon from '@/assets/channels/discord.svg';
import whatsappIcon from '@/assets/channels/whatsapp.svg';
import wechatIcon from '@/assets/channels/wechat.svg';
import dingtalkIcon from '@/assets/channels/dingtalk.svg';
import feishuIcon from '@/assets/channels/feishu.svg';
import wecomIcon from '@/assets/channels/wecom.svg';
import qqIcon from '@/assets/channels/qq.svg';

interface ChannelAccountItem {
  accountId: string;
  name: string;
  configured: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastError?: string;
  isDefault: boolean;
  agentId?: string;
}

interface ChannelGroupItem {
  channelType: string;
  defaultAccountId: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  accounts: ChannelAccountItem[];
}

export function Agents() {
  const { t } = useTranslation('agents');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const refreshProviderSnapshot = useProviderStore((state) => state.refreshProviderSnapshot);
  const lastGatewayStateRef = useRef(gatewayStatus.state);
  const {
    agents,
    loading,
    error,
    fetchAgents,
    createAgent,
    deleteAgent,
  } = useAgentsStore();
  const [channelGroups, setChannelGroups] = useState<ChannelGroupItem[]>([]);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(() => agents.length > 0);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<AgentSummary | null>(null);

  const fetchChannelAccounts = useCallback(async () => {
    try {
      const response = await hostApiFetch<{ success: boolean; channels?: ChannelGroupItem[] }>('/api/channels/accounts');
      setChannelGroups(response.channels || []);
    } catch {
      // Keep the last rendered snapshot when channel account refresh fails.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([fetchAgents(), fetchChannelAccounts(), refreshProviderSnapshot()]).finally(() => {
      if (mounted) {
        setHasCompletedInitialLoad(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [fetchAgents, fetchChannelAccounts, refreshProviderSnapshot]);

  useEffect(() => {
    const unsubscribe = subscribeHostEvent('gateway:channel-status', () => {
      void fetchChannelAccounts();
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [fetchChannelAccounts]);

  useEffect(() => {
    const previousGatewayState = lastGatewayStateRef.current;
    lastGatewayStateRef.current = gatewayStatus.state;

    if (previousGatewayState !== 'running' && gatewayStatus.state === 'running') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchChannelAccounts();
    }
  }, [fetchChannelAccounts, gatewayStatus.state]);

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId) ?? null,
    [activeAgentId, agents],
  );

  const visibleAgents = agents;
  const visibleChannelGroups = channelGroups;
  const isUsingStableValue = loading && hasCompletedInitialLoad;
  const handleRefresh = () => {
    void Promise.all([fetchAgents(), fetchChannelAccounts()]);
  };

  if (loading && !hasCompletedInitialLoad) {
    return (
      <div className="flex flex-col -m-6 dark:bg-background min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div data-testid="agents-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="mb-6 flex shrink-0 items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="h-8 border-border/60 bg-card/40 px-3 text-xs"
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isUsingStableValue && 'animate-spin')} />
              {t('refresh')}
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddDialog(true)}
              className="h-8 border border-transparent px-3 text-xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('addAgent')}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {gatewayStatus.state !== 'running' && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                {t('gatewayWarning')}
              </span>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="text-xs text-destructive">
                {error}
              </span>
            </div>
          )}

          <div className="space-y-2">
            {visibleAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
                <div className={ACCENT_ICON_LG}>
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-1 text-sm font-medium text-foreground">{t('emptyTitle')}</h3>
                <p className="mb-5 max-w-sm text-xs text-muted-foreground">{t('emptyDescription')}</p>
                <Button size="sm" className="h-8 px-4 text-xs" onClick={() => setShowAddDialog(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t('addAgent')}
                </Button>
              </div>
            ) : (
              visibleAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  channelGroups={visibleChannelGroups}
                  onOpenSettings={() => setActiveAgentId(agent.id)}
                  onDelete={() => setAgentToDelete(agent)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {showAddDialog && (
        <AddAgentDialog
          onClose={() => setShowAddDialog(false)}
          onCreate={async (name, options) => {
            await createAgent(name, options);
            setShowAddDialog(false);
            toast.success(t('toast.agentCreated'));
          }}
        />
      )}

      {activeAgent && (
        <AgentSettingsModal
          agent={activeAgent}
          channelGroups={visibleChannelGroups}
          onClose={() => setActiveAgentId(null)}
        />
      )}

      <ConfirmDialog
        open={!!agentToDelete}
        title={t('deleteDialog.title')}
        message={agentToDelete ? t('deleteDialog.message', { name: agentToDelete.name }) : ''}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!agentToDelete) return;
          try {
            await deleteAgent(agentToDelete.id);
            const deletedId = agentToDelete.id;
            setAgentToDelete(null);
            if (activeAgentId === deletedId) {
              setActiveAgentId(null);
            }
            toast.success(t('toast.agentDeleted'));
          } catch (error) {
            toast.error(t('toast.agentDeleteFailed', { error: String(error) }));
          }
        }}
        onCancel={() => setAgentToDelete(null)}
      />
    </div>
  );
}

function AgentCard({
  agent,
  channelGroups,
  onOpenSettings,
  onDelete,
}: {
  agent: AgentSummary;
  channelGroups: ChannelGroupItem[];
  onOpenSettings: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('agents');
  const boundChannels = channelGroups.flatMap((group) =>
    group.accounts
      .filter((account) => account.agentId === agent.id)
      .map((account) => ({
        channelType: group.channelType as ChannelType,
        accountId: account.accountId,
        channelName: CHANNEL_NAMES[group.channelType as ChannelType] || group.channelType,
        accountLabel:
          account.accountId === 'default'
            ? t('settingsDialog.mainAccount')
            : account.name || account.accountId,
      })),
  );
  const modelNotConfigured = /not configured|未配置/i.test(agent.modelDisplay);

  return (
    <div
      className={cn(
        'group flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/30 hover:bg-card/70',
        agent.isDefault && 'border-primary/25 bg-primary/5',
      )}
      onClick={onOpenSettings}
    >
      <div
        className={cn(
          ACCENT_ICON_SM,
          agent.isDefault && 'ring-primary/30 bg-primary/15',
        )}
      >
        <Bot className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="mt-0 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-medium text-foreground">{agent.name}</h2>
              {agent.isDefault && (
                <Badge className="h-5 shrink-0 border-0 bg-primary/15 px-1.5 py-0 text-2xs font-medium text-primary shadow-none hover:bg-primary/15">
                  {t('defaultBadge')}
                </Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs',
                  modelNotConfigured
                    ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                    : 'border-border/50 bg-background/50 text-muted-foreground',
                )}
              >
                <Cpu className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {agent.modelDisplay}
                  {agent.inheritedModel ? ` · ${t('inherited')}` : ''}
                </span>
              </span>

              {boundChannels.length > 0 ? (
                boundChannels.map((channel) => (
                  <span
                    key={`${channel.channelType}-${channel.accountId}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/50 bg-background/50 px-1.5 py-0.5 text-2xs text-muted-foreground"
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-hidden rounded-sm">
                      <ChannelLogo type={channel.channelType} compact />
                    </span>
                    <span className="truncate text-foreground/80">{channel.channelName}</span>
                    <span className="truncate opacity-70">· {channel.accountLabel}</span>
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/50 bg-background/30 px-1.5 py-0.5 text-2xs text-muted-foreground">
                  {t('card.noChannels')}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {!agent.isDefault && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                onClick={onDelete}
                title={t('deleteAgent')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                !agent.isDefault && 'opacity-0 transition-opacity group-hover:opacity-100',
              )}
              onClick={onOpenSettings}
              title={t('settings')}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const AGENTS_DIALOG_LABEL = 'text-xs font-medium text-foreground/90';
const AGENTS_DIALOG_INPUT =
  'h-9 rounded-lg border-border/60 bg-surface-input text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40';
const AGENTS_DIALOG_SELECT = AGENTS_DIALOG_INPUT;
const AGENTS_DIALOG_SECTION = 'space-y-3 rounded-xl border border-border/60 bg-card/30 p-4';

function DialogSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={AGENTS_DIALOG_SECTION}>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && <p className="text-2xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ChannelLogo({ type, compact = false }: { type: ChannelType; compact?: boolean }) {
  const className = compact ? 'h-3 w-3 dark:invert' : 'h-[20px] w-[20px] dark:invert';
  switch (type) {
    case 'telegram':
      return <img src={telegramIcon} alt="Telegram" className={className} />;
    case 'discord':
      return <img src={discordIcon} alt="Discord" className={className} />;
    case 'whatsapp':
      return <img src={whatsappIcon} alt="WhatsApp" className={className} />;
    case 'wechat':
      return <img src={wechatIcon} alt="WeChat" className={className} />;
    case 'dingtalk':
      return <img src={dingtalkIcon} alt="DingTalk" className={className} />;
    case 'feishu':
      return <img src={feishuIcon} alt="Feishu" className={className} />;
    case 'wecom':
      return <img src={wecomIcon} alt="WeCom" className={className} />;
    case 'qqbot':
      return <img src={qqIcon} alt="QQ" className={className} />;
    default:
      return <span className={compact ? 'text-xs leading-none' : 'text-xl leading-none'}>{CHANNEL_ICONS[type] || '💬'}</span>;
  }
}

function AddAgentDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, options: { inheritWorkspace: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation('agents');
  const [name, setName] = useState('');
  const [inheritWorkspace, setInheritWorkspace] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), { inheritWorkspace });
    } catch (error) {
      toast.error(t('toast.agentCreateFailed', { error: String(error) }));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-xl backdrop-blur-sm">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={ACCENT_ICON_SM}>
              <Plus className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">{t('createDialog.title')}</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">{t('createDialog.description')}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name" className={AGENTS_DIALOG_LABEL}>{t('createDialog.nameLabel')}</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('createDialog.namePlaceholder')}
              className={AGENTS_DIALOG_INPUT}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/30 px-4 py-3">
            <div>
              <Label htmlFor="inherit-workspace" className={AGENTS_DIALOG_LABEL}>{t('createDialog.inheritWorkspaceLabel')}</Label>
              <p className="mt-0.5 text-2xs text-muted-foreground">{t('createDialog.inheritWorkspaceDescription')}</p>
            </div>
            <Switch id="inherit-workspace" size="sm" checked={inheritWorkspace} onCheckedChange={setInheritWorkspace} />
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-3 text-xs">
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={saving || !name.trim()} className="h-8 px-3 text-xs">
            {saving ? (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('creating')}
              </>
            ) : (
              t('common:actions.save')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AgentSettingsModal({
  agent,
  channelGroups,
  onClose,
}: {
  agent: AgentSummary;
  channelGroups: ChannelGroupItem[];
  onClose: () => void;
}) {
  const { t } = useTranslation('agents');
  const { updateAgent, defaultModelRef } = useAgentsStore();
  const [name, setName] = useState(agent.name);
  const [savingName, setSavingName] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    setName(agent.name);
  }, [agent.name]);

  const hasNameChanges = name.trim() !== agent.name;

  const handleRequestClose = () => {
    if (savingName || hasNameChanges) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === agent.name) return;
    setSavingName(true);
    try {
      await updateAgent(agent.id, name.trim());
      toast.success(t('toast.agentUpdated'));
    } catch (error) {
      toast.error(t('toast.agentUpdateFailed', { error: String(error) }));
    } finally {
      setSavingName(false);
    }
  };

  const assignedChannels = channelGroups.flatMap((group) =>
    group.accounts
      .filter((account) => account.agentId === agent.id)
      .map((account) => ({
        channelType: group.channelType as ChannelType,
        accountId: account.accountId,
        name:
          account.accountId === 'default'
            ? t('settingsDialog.mainAccount')
            : account.name || account.accountId,
        error: account.lastError,
      })),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-xl backdrop-blur-sm">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={ACCENT_ICON_SM}>
              <Settings2 className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">{t('settingsDialog.title', { name: agent.name })}</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">{t('settingsDialog.description')}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRequestClose} className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <DialogSection title={t('settingsDialog.nameLabel')}>
            <div className="flex gap-2">
              <Input
                id="agent-settings-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                readOnly={agent.isDefault}
                className={AGENTS_DIALOG_INPUT}
              />
              {!agent.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSaveName()}
                  disabled={savingName || !name.trim() || name.trim() === agent.name}
                  className="h-9 shrink-0 border-border/60 bg-card/40 px-3 text-xs"
                >
                  {savingName ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    t('common:actions.save')
                  )}
                </Button>
              )}
            </div>
          </DialogSection>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1 rounded-xl border border-border/60 bg-card/30 p-3">
              <p className="text-2xs font-medium text-muted-foreground">{t('settingsDialog.agentIdLabel')}</p>
              <p className="font-mono text-xs text-foreground">{agent.id}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowModelModal(true)}
              className="space-y-1 rounded-xl border border-border/60 bg-card/30 p-3 text-left transition-colors hover:border-primary/30 hover:bg-card/50"
            >
              <p className="text-2xs font-medium text-muted-foreground">{t('settingsDialog.modelLabel')}</p>
              <p className="text-xs text-foreground">
                {agent.modelDisplay}
                {agent.inheritedModel ? ` (${t('inherited')})` : ''}
              </p>
              <p className="break-all font-mono text-2xs text-muted-foreground">
                {agent.modelRef || defaultModelRef || '-'}
              </p>
            </button>
          </div>

          <DialogSection title={t('settingsDialog.channelsTitle')} description={t('settingsDialog.channelsDescription')}>
            {assignedChannels.length === 0 && agent.channelTypes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-background/40 px-3 py-4 text-xs text-muted-foreground">
                {t('settingsDialog.noChannels')}
              </div>
            ) : (
              <div className="space-y-2">
                {assignedChannels.map((channel) => (
                  <div key={`${channel.channelType}-${channel.accountId}`} className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
                        <ChannelLogo type={channel.channelType} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{channel.name}</p>
                        <p className="text-2xs text-muted-foreground">
                          {CHANNEL_NAMES[channel.channelType]} · {channel.accountId === 'default' ? t('settingsDialog.mainAccount') : channel.accountId}
                        </p>
                        {channel.error && (
                          <p className="mt-0.5 text-2xs text-destructive">{channel.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {assignedChannels.length === 0 && agent.channelTypes.length > 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 bg-background/40 px-3 py-4 text-xs text-muted-foreground">
                    {t('settingsDialog.channelsManagedInChannels')}
                  </div>
                )}
              </div>
            )}
          </DialogSection>
        </div>
      </div>
      {showModelModal && (
        <AgentModelModal
          agent={agent}
          onClose={() => setShowModelModal(false)}
        />
      )}
      <ConfirmDialog
        open={showCloseConfirm}
        title={t('settingsDialog.unsavedChangesTitle')}
        message={t('settingsDialog.unsavedChangesMessage')}
        confirmLabel={t('settingsDialog.closeWithoutSaving')}
        cancelLabel={t('common:actions.cancel')}
        onConfirm={() => {
          setShowCloseConfirm(false);
          setName(agent.name);
          onClose();
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}

function AgentModelModal({
  agent,
  onClose,
}: {
  agent: AgentSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation('agents');
  const providerAccounts = useProviderStore((state) => state.accounts);
  const providerStatuses = useProviderStore((state) => state.statuses);
  const providerVendors = useProviderStore((state) => state.vendors);
  const providerDefaultAccountId = useProviderStore((state) => state.defaultAccountId);
  const { updateAgentModel, defaultModelRef } = useAgentsStore();
  const [selectedRuntimeProviderKey, setSelectedRuntimeProviderKey] = useState('');
  const [modelIdInput, setModelIdInput] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const runtimeProviderOptions = useMemo<RuntimeProviderOption[]>(
    () => buildRuntimeProviderOptions(
      providerAccounts,
      providerStatuses,
      providerVendors,
      providerDefaultAccountId,
    ),
    [providerAccounts, providerDefaultAccountId, providerStatuses, providerVendors],
  );

  useEffect(() => {
    const override = splitModelRef(agent.overrideModelRef);
    if (override) {
      setSelectedRuntimeProviderKey(override.providerKey);
      setModelIdInput(override.modelId);
      return;
    }

    const effective = splitModelRef(agent.modelRef || defaultModelRef);
    if (effective) {
      setSelectedRuntimeProviderKey(effective.providerKey);
      setModelIdInput(effective.modelId);
      return;
    }

    setSelectedRuntimeProviderKey(runtimeProviderOptions[0]?.runtimeProviderKey || '');
    setModelIdInput('');
  }, [agent.modelRef, agent.overrideModelRef, defaultModelRef, runtimeProviderOptions]);

  const selectedProvider = runtimeProviderOptions.find((option) => option.runtimeProviderKey === selectedRuntimeProviderKey) || null;
  const trimmedModelId = modelIdInput.trim();
  const nextModelRef = selectedRuntimeProviderKey && trimmedModelId
    ? `${selectedRuntimeProviderKey}/${trimmedModelId}`
    : '';
  const normalizedDefaultModelRef = (defaultModelRef || '').trim();
  const isUsingDefaultModelInForm = Boolean(normalizedDefaultModelRef) && nextModelRef === normalizedDefaultModelRef;
  const currentOverrideModelRef = (agent.overrideModelRef || '').trim();
  const desiredOverrideModelRef = nextModelRef && nextModelRef !== normalizedDefaultModelRef
    ? nextModelRef
    : null;
  const modelChanged = (desiredOverrideModelRef || '') !== currentOverrideModelRef;

  const handleRequestClose = () => {
    if (savingModel || modelChanged) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleSaveModel = async () => {
    if (!selectedRuntimeProviderKey) {
      toast.error(t('toast.agentModelProviderRequired'));
      return;
    }
    if (!trimmedModelId) {
      toast.error(t('toast.agentModelIdRequired'));
      return;
    }
    if (!modelChanged) return;
    if (!nextModelRef.includes('/')) {
      toast.error(t('toast.agentModelInvalid'));
      return;
    }

    setSavingModel(true);
    try {
      await updateAgentModel(agent.id, desiredOverrideModelRef);
      toast.success(desiredOverrideModelRef ? t('toast.agentModelUpdated') : t('toast.agentModelReset'));
      onClose();
    } catch (error) {
      toast.error(t('toast.agentModelUpdateFailed', { error: String(error) }));
    } finally {
      setSavingModel(false);
    }
  };

  const handleUseDefaultModel = () => {
    const parsedDefault = splitModelRef(normalizedDefaultModelRef);
    if (!parsedDefault) {
      setSelectedRuntimeProviderKey('');
      setModelIdInput('');
      return;
    }
    setSelectedRuntimeProviderKey(parsedDefault.providerKey);
    setModelIdInput(parsedDefault.modelId);
  };

  const providerSelectOptions = useMemo(
    () => runtimeProviderOptions.map((option) => ({
      value: option.runtimeProviderKey,
      label: option.label,
    })),
    [runtimeProviderOptions],
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-xl backdrop-blur-sm">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{t('settingsDialog.modelLabel')}</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {t('settingsDialog.modelOverrideDescription', { defaultModel: defaultModelRef || '-' })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRequestClose} className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-model-provider" className={AGENTS_DIALOG_LABEL}>{t('settingsDialog.modelProviderLabel')}</Label>
            <FormSelect
              id="agent-model-provider"
              value={selectedRuntimeProviderKey}
              onValueChange={(nextProvider) => {
                setSelectedRuntimeProviderKey(nextProvider);
                if (!modelIdInput.trim()) {
                  const option = runtimeProviderOptions.find((candidate) => candidate.runtimeProviderKey === nextProvider);
                  setModelIdInput(option?.configuredModelId || '');
                }
              }}
              placeholder={t('settingsDialog.modelProviderPlaceholder')}
              options={providerSelectOptions}
              className={AGENTS_DIALOG_SELECT}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-model-id" className={AGENTS_DIALOG_LABEL}>{t('settingsDialog.modelIdLabel')}</Label>
            <Input
              id="agent-model-id"
              value={modelIdInput}
              onChange={(event) => setModelIdInput(event.target.value)}
              placeholder={selectedProvider?.modelIdPlaceholder || selectedProvider?.configuredModelId || t('settingsDialog.modelIdPlaceholder')}
              className={cn(AGENTS_DIALOG_INPUT, 'font-mono')}
            />
          </div>
          {!!nextModelRef && (
            <p className="break-all font-mono text-2xs text-muted-foreground">
              {t('settingsDialog.modelPreview')}: {nextModelRef}
            </p>
          )}
          {runtimeProviderOptions.length === 0 && (
            <p className="text-2xs text-yellow-600 dark:text-yellow-400">
              {t('settingsDialog.modelProviderEmpty')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUseDefaultModel}
            disabled={savingModel || !normalizedDefaultModelRef || isUsingDefaultModelInForm}
            className="h-8 border-border/60 bg-card/40 px-3 text-xs"
          >
            {t('settingsDialog.useDefaultModel')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRequestClose} className="h-8 px-3 text-xs">
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSaveModel()}
            disabled={savingModel || !selectedRuntimeProviderKey || !trimmedModelId || !modelChanged}
            className="h-8 px-3 text-xs"
          >
            {savingModel ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t('common:actions.save')
            )}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={showCloseConfirm}
        title={t('settingsDialog.unsavedChangesTitle')}
        message={t('settingsDialog.unsavedChangesMessage')}
        confirmLabel={t('settingsDialog.closeWithoutSaving')}
        cancelLabel={t('common:actions.cancel')}
        onConfirm={() => {
          setShowCloseConfirm(false);
          onClose();
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}

export default Agents;
