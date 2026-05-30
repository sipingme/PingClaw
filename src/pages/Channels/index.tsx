import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Trash2, AlertCircle, Plus, Copy, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormSelect } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useGatewayStore } from '@/stores/gateway';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { hostApiFetch } from '@/lib/host-api';
import { subscribeHostEvent } from '@/lib/host-events';
import { ChannelConfigModal } from '@/components/channels/ChannelConfigModal';
import { cn } from '@/lib/utils';
import {
  CHANNEL_ICONS,
  CHANNEL_NAMES,
  CHANNEL_META,
  getPrimaryChannels,
  type ChannelType,
} from '@/types/channel';
import { usesPluginManagedQrAccounts } from '@/lib/channel-alias';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
  status: 'connected' | 'connecting' | 'degraded' | 'disconnected' | 'error';
  statusReason?: string;
  lastError?: string;
  isDefault: boolean;
  agentId?: string;
}

interface ChannelGroupItem {
  channelType: string;
  defaultAccountId: string;
  status: 'connected' | 'connecting' | 'degraded' | 'disconnected' | 'error';
  statusReason?: string;
  accounts: ChannelAccountItem[];
}

interface GatewayHealthSummary {
  state: 'healthy' | 'degraded' | 'unresponsive';
  reasons: string[];
  consecutiveHeartbeatMisses: number;
  lastAliveAt?: number;
  lastRpcSuccessAt?: number;
  lastRpcFailureAt?: number;
  lastRpcFailureMethod?: string;
  lastChannelsStatusOkAt?: number;
  lastChannelsStatusFailureAt?: number;
}

interface GatewayDiagnosticSnapshot {
  capturedAt: number;
  platform: string;
  gateway: GatewayHealthSummary & Record<string, unknown>;
  channels: ChannelGroupItem[];
  pingclawLogTail: string;
  gatewayLogTail: string;
  gatewayErrLogTail: string;
}

function isGatewayDiagnosticSnapshot(value: unknown): value is GatewayDiagnosticSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.capturedAt === 'number'
    && typeof snapshot.platform === 'string'
    && typeof snapshot.gateway === 'object'
    && snapshot.gateway !== null
    && Array.isArray(snapshot.channels)
    && typeof snapshot.pingclawLogTail === 'string'
    && typeof snapshot.gatewayLogTail === 'string'
    && typeof snapshot.gatewayErrLogTail === 'string'
  );
}

interface AgentItem {
  id: string;
  name: string;
}

interface DeleteTarget {
  channelType: string;
  accountId?: string;
}

type FetchPageDataOptions = {
  probe?: boolean;
  configOnly?: boolean;
  forceAgentsRefresh?: boolean;
};

function removeDeletedTarget(groups: ChannelGroupItem[], target: DeleteTarget): ChannelGroupItem[] {
  if (target.accountId) {
    return groups
      .map((group) => {
        if (group.channelType !== target.channelType) return group;
        return {
          ...group,
          accounts: group.accounts.filter((account) => account.accountId !== target.accountId),
        };
      })
      .filter((group) => group.accounts.length > 0);
  }

  return groups.filter((group) => group.channelType !== target.channelType);
}

const DEFAULT_GATEWAY_HEALTH: GatewayHealthSummary = {
  state: 'healthy',
  reasons: [],
  consecutiveHeartbeatMisses: 0,
};

const UNASSIGNED_AGENT_VALUE = '__unassigned__';
const CHANNEL_AGENT_SELECT =
  'h-8 w-[116px] shrink-0 rounded-lg border-border/60 bg-surface-input text-2xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40';

function isStaleNotRunningHealthForRunningGateway(
  gatewayHealth: GatewayHealthSummary,
  gatewayState: string,
): boolean {
  return (
    gatewayState === 'running'
    && gatewayHealth.state === 'degraded'
    && gatewayHealth.reasons.includes('gateway_not_running')
  );
}

export function Channels() {
  const { t } = useTranslation('channels');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const lastGatewayStateRef = useRef(gatewayStatus.state);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelGroups, setChannelGroups] = useState<ChannelGroupItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [gatewayHealth, setGatewayHealth] = useState<GatewayHealthSummary>(DEFAULT_GATEWAY_HEALTH);
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState<GatewayDiagnosticSnapshot | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedChannelType, setSelectedChannelType] = useState<ChannelType | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [allowExistingConfigInModal, setAllowExistingConfigInModal] = useState(true);
  const [allowEditAccountIdInModal, setAllowEditAccountIdInModal] = useState(false);
  const [existingAccountIdsForModal, setExistingAccountIdsForModal] = useState<string[]>([]);
  const [initialConfigValuesForModal, setInitialConfigValuesForModal] = useState<Record<string, string> | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const convergenceRefreshTimersRef = useRef<number[]>([]);
  const fetchInFlightRef = useRef(false);
  const queuedFetchOptionsRef = useRef<FetchPageDataOptions | null>(null);
  const agentsFetchInFlightRef = useRef<Promise<void> | null>(null);
  const hasLoadedAgentsRef = useRef(false);

  const displayedChannelTypes = getPrimaryChannels();
  const displayedGatewayHealth = isStaleNotRunningHealthForRunningGateway(gatewayHealth, gatewayStatus.state)
    ? DEFAULT_GATEWAY_HEALTH
    : gatewayHealth;
  const visibleChannelGroups = channelGroups;
  const visibleAgents = agents;
  const agentSelectOptions = useMemo(
    () => [
      { value: UNASSIGNED_AGENT_VALUE, label: t('account.unassigned') },
      ...visibleAgents.map((agent) => ({ value: agent.id, label: agent.name })),
    ],
    [t, visibleAgents],
  );
  const hasStableValue = visibleChannelGroups.length > 0 || visibleAgents.length > 0;
  const isUsingStableValue = hasStableValue && (loading || Boolean(error));

  // Use refs to read current state inside fetchPageData without making it
  // a dependency — keeps the callback reference stable across renders so
  // downstream useEffects don't re-execute every time data changes.
  const channelGroupsRef = useRef(channelGroups);
  channelGroupsRef.current = channelGroups;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  const ensureAgentsLoaded = useCallback(async () => {
    if (hasLoadedAgentsRef.current) return;
    if (agentsFetchInFlightRef.current) {
      await agentsFetchInFlightRef.current;
      return;
    }

    agentsFetchInFlightRef.current = (async () => {
      try {
        const agentsRes = await hostApiFetch<{ success: boolean; agents?: AgentItem[]; error?: string }>('/api/agents');
        if (!agentsRes.success) {
          throw new Error(agentsRes.error || 'Failed to load agents');
        }
        setAgents(agentsRes.agents || []);
        hasLoadedAgentsRef.current = true;
      } catch (agentsError) {
        console.warn(`[channels-ui] load agents failed error=${String(agentsError)}`);
      } finally {
        agentsFetchInFlightRef.current = null;
      }
    })();

    await agentsFetchInFlightRef.current;
  }, []);

  const mergeFetchOptions = (
    base: FetchPageDataOptions | null,
    incoming: FetchPageDataOptions | undefined,
  ): FetchPageDataOptions => {
    if (!base) return incoming ?? {};
    if (!incoming) return base;
    return {
      probe: Boolean(base?.probe) || Boolean(incoming?.probe),
      // If either request needs runtime data, do not keep config-only mode.
      configOnly: Boolean(base?.configOnly) && Boolean(incoming?.configOnly),
      forceAgentsRefresh: Boolean(base?.forceAgentsRefresh) || Boolean(incoming?.forceAgentsRefresh),
    };
  };

  const fetchPageData = useCallback(async (options?: FetchPageDataOptions) => {
    if (fetchInFlightRef.current) {
      queuedFetchOptionsRef.current = mergeFetchOptions(queuedFetchOptionsRef.current, options);
      return;
    }
    fetchInFlightRef.current = true;
    const startedAt = Date.now();
    const probe = options?.probe === true;
    const configOnly = options?.configOnly === true;
    console.info(`[channels-ui] fetch start mode=${configOnly ? 'config' : 'runtime'} probe=${probe ? '1' : '0'}`);
    // Only show loading spinner on first load (stale-while-revalidate).
    const hasData = channelGroupsRef.current.length > 0 || agentsRef.current.length > 0;
    if (!hasData) {
      setLoading(true);
    }
    setError(null);
    if (options?.forceAgentsRefresh) {
      hasLoadedAgentsRef.current = false;
    }
    void ensureAgentsLoaded();
    try {
      const channelsPath = configOnly
        ? '/api/channels/accounts?mode=config'
        : options?.probe
          ? '/api/channels/accounts?probe=1'
          : '/api/channels/accounts';
      const channelsRes = await hostApiFetch<{ success: boolean; channels?: ChannelGroupItem[]; error?: string }>(
        channelsPath
      );

      type ChannelsResponse = {
        success: boolean;
        channels?: ChannelGroupItem[];
        gatewayHealth?: GatewayHealthSummary;
        error?: string;
      };
      const channelsPayload = channelsRes as ChannelsResponse;

      if (!channelsPayload.success) {
        throw new Error(channelsPayload.error || 'Failed to load channels');
      }

      setChannelGroups(channelsPayload.channels || []);
      setGatewayHealth(channelsPayload.gatewayHealth || DEFAULT_GATEWAY_HEALTH);
      setDiagnosticsSnapshot(null);
      setShowDiagnostics(false);
      console.info(
        `[channels-ui] fetch ok mode=${configOnly ? 'config' : 'runtime'} probe=${probe ? '1' : '0'} elapsedMs=${Date.now() - startedAt} view=${(channelsPayload.channels || []).map((item) => `${item.channelType}:${item.status}`).join(',')}`
      );
    } catch (fetchError) {
      // Preserve previous data on error — don't clear channelGroups/agents.
      setError(String(fetchError));
      console.warn(
        `[channels-ui] fetch fail mode=${configOnly ? 'config' : 'runtime'} probe=${probe ? '1' : '0'} elapsedMs=${Date.now() - startedAt} error=${String(fetchError)}`
      );
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
      const queued = queuedFetchOptionsRef.current;
      if (queued) {
        queuedFetchOptionsRef.current = null;
        void fetchPageData(queued);
      }
    }
  // Stable reference — reads state via refs, no deps needed.
   
  }, [ensureAgentsLoaded]);

  const clearConvergenceRefreshTimers = useCallback(() => {
    convergenceRefreshTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    convergenceRefreshTimersRef.current = [];
  }, []);

  const scheduleConvergenceRefresh = useCallback(() => {
    clearConvergenceRefreshTimers();
    // Channel adapters can take time to reconnect after gateway restart.
    // First few rounds use probe=true to force runtime connectivity checks,
    // then fall back to cached pulls to reduce load.
    [
      { delay: 1200, probe: true },
      { delay: 2600, probe: false },
      { delay: 4500, probe: false },
      { delay: 7000, probe: false },
      { delay: 10500, probe: false },
    ].forEach(({ delay, probe }) => {
      const timerId = window.setTimeout(() => {
        void fetchPageData({ probe });
      }, delay);
      convergenceRefreshTimersRef.current.push(timerId);
    });
  }, [clearConvergenceRefreshTimers, fetchPageData]);

  useEffect(() => {
    void fetchPageData({ configOnly: true });
    void fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    return () => {
      clearConvergenceRefreshTimers();
    };
  }, [clearConvergenceRefreshTimers]);

  useEffect(() => {
    // Throttle channel-status events to avoid flooding fetchPageData during AI tasks.
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const unsubscribe = subscribeHostEvent('gateway:channel-status', () => {
      if (throttleTimer) {
        pending = true;
        return;
      }
      void fetchPageData();
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (pending) {
          pending = false;
          void fetchPageData();
        }
      }, 2000);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
    };
  }, [fetchPageData]);

  useEffect(() => {
    const previousGatewayState = lastGatewayStateRef.current;
    lastGatewayStateRef.current = gatewayStatus.state;

    if (previousGatewayState !== 'running' && gatewayStatus.state === 'running') {
      void fetchPageData();
      scheduleConvergenceRefresh();
    }
  }, [fetchPageData, gatewayStatus.state, scheduleConvergenceRefresh]);

  const configuredTypes = useMemo(
    () => visibleChannelGroups.map((group) => group.channelType),
    [visibleChannelGroups],
  );

  const groupedByType = useMemo(() => {
    return Object.fromEntries(visibleChannelGroups.map((group) => [group.channelType, group]));
  }, [visibleChannelGroups]);

  const configuredGroups = useMemo(() => {
    const known = displayedChannelTypes
      .map((type) => groupedByType[type])
      .filter((group): group is ChannelGroupItem => Boolean(group));
    const unknown = visibleChannelGroups.filter((group) => !displayedChannelTypes.includes(group.channelType as ChannelType));
    return [...known, ...unknown];
  }, [visibleChannelGroups, displayedChannelTypes, groupedByType]);

  const unsupportedGroups = displayedChannelTypes.filter((type) => !configuredTypes.includes(type));

  const handleRefresh = () => {
    void fetchPageData({ probe: true, forceAgentsRefresh: true });
  };

  const fetchDiagnosticsSnapshot = useCallback(async (): Promise<GatewayDiagnosticSnapshot> => {
    const response = await hostApiFetch<unknown>('/api/diagnostics/gateway-snapshot');
    if (response && typeof response === 'object') {
      const payload = response as Record<string, unknown>;
      if (payload.success === false || typeof payload.error === 'string') {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to fetch gateway diagnostics snapshot');
      }
    }
    if (!isGatewayDiagnosticSnapshot(response)) {
      throw new Error('Invalid gateway diagnostics snapshot response');
    }
    const snapshot = response;
    setDiagnosticsSnapshot(snapshot);
    return snapshot;
  }, []);

  const handleRestartGateway = async () => {
    try {
      const result = await hostApiFetch<{ success?: boolean; error?: string }>('/api/gateway/restart', {
        method: 'POST',
      });
      if (result?.success !== true) {
        throw new Error(result?.error || 'Failed to restart gateway');
      }
      setDiagnosticsSnapshot(null);
      setShowDiagnostics(false);
      toast.success(t('health.restartTriggered'));
      void fetchPageData({ probe: true });
    } catch (restartError) {
      toast.error(t('health.restartFailed', { error: String(restartError) }));
    }
  };

  const handleCopyDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const snapshot = await fetchDiagnosticsSnapshot();
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      toast.success(t('health.diagnosticsCopied'));
    } catch (copyError) {
      toast.error(t('health.diagnosticsCopyFailed', { error: String(copyError) }));
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const handleToggleDiagnostics = async () => {
    if (showDiagnostics) {
      setShowDiagnostics(false);
      return;
    }
    setDiagnosticsLoading(true);
    try {
      await fetchDiagnosticsSnapshot();
    } catch (diagnosticsError) {
      toast.error(t('health.diagnosticsCopyFailed', { error: String(diagnosticsError) }));
      setDiagnosticsLoading(false);
      return;
    } finally {
      setDiagnosticsLoading(false);
    }
    setShowDiagnostics(true);
  };

  const healthReasonLabel = useMemo(() => {
    const primaryReason = displayedGatewayHealth.reasons[0];
    if (!primaryReason) return '';
    return t(`health.reasons.${primaryReason}`);
  }, [displayedGatewayHealth.reasons, t]);

  const diagnosticsText = useMemo(
    () => diagnosticsSnapshot ? JSON.stringify(diagnosticsSnapshot, null, 2) : '',
    [diagnosticsSnapshot],
  );




  const statusLabel = useCallback((status: ChannelGroupItem['status']) => {
    return t(`account.connectionStatus.${status}`);
  }, [t]);

  const handleBindAgent = async (channelType: string, accountId: string, agentId: string) => {
    try {
      if (!agentId) {
        await hostApiFetch<{ success: boolean; error?: string }>('/api/channels/binding', {
          method: 'DELETE',
          body: JSON.stringify({ channelType, accountId }),
        });
      } else {
        await hostApiFetch<{ success: boolean; error?: string }>('/api/channels/binding', {
          method: 'PUT',
          body: JSON.stringify({ channelType, accountId, agentId }),
        });
      }
      await fetchPageData();
      toast.success(t('toast.bindingUpdated'));
    } catch (bindError) {
      toast.error(t('toast.configFailed', { error: String(bindError) }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const suffix = deleteTarget.accountId
        ? `?accountId=${encodeURIComponent(deleteTarget.accountId)}`
        : '';
      await hostApiFetch(`/api/channels/config/${encodeURIComponent(deleteTarget.channelType)}${suffix}`, {
        method: 'DELETE',
      });
      setChannelGroups((prev) => removeDeletedTarget(prev, deleteTarget));
      toast.success(deleteTarget.accountId ? t('toast.accountDeleted') : t('toast.channelDeleted'));
      // Channel reload is debounced in main process; pull again shortly to
      // converge with runtime state without flashing deleted rows back in.
      window.setTimeout(() => {
        void fetchPageData();
      }, 1200);
    } catch (deleteError) {
      toast.error(t('toast.configFailed', { error: String(deleteError) }));
    } finally {
      setDeleteTarget(null);
    }
  };

  const createNewAccountId = (channelType: string, existingAccounts: string[]): string => {
    // Generate a collision-safe default account id for user editing.
    let nextAccountId = `${channelType}-${crypto.randomUUID().slice(0, 8)}`;
    while (existingAccounts.includes(nextAccountId)) {
      nextAccountId = `${channelType}-${crypto.randomUUID().slice(0, 8)}`;
    }
    return nextAccountId;
  };

  if (loading && !hasStableValue) {
    return (
      <div className="flex flex-col -m-6 dark:bg-background min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div data-testid="channels-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6">
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
              disabled={gatewayStatus.state !== 'running'}
              className="h-8 border-border/60 bg-card/40 px-3 text-xs"
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isUsingStableValue && 'animate-spin')} />
              {t('refresh')}
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

          {gatewayStatus.state === 'running' && displayedGatewayHealth.state !== 'healthy' && (
            <div
              data-testid="channels-health-banner"
              className={cn(
                'mb-4 rounded-xl border px-3 py-2.5',
                displayedGatewayHealth.state === 'unresponsive'
                  ? 'border-destructive/30 bg-destructive/10'
                  : 'border-yellow-500/30 bg-yellow-500/10',
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertCircle
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      displayedGatewayHealth.state === 'unresponsive'
                        ? 'text-destructive'
                        : 'text-yellow-500',
                    )}
                  />
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {t(`health.state.${displayedGatewayHealth.state}`)}
                    </p>
                    {healthReasonLabel && (
                      <p className="mt-0.5 text-2xs text-muted-foreground">{healthReasonLabel}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    data-testid="channels-restart-gateway"
                    size="sm"
                    variant="outline"
                    className="h-8 border-border/60 bg-card/40 px-3 text-xs"
                    onClick={() => { void handleRestartGateway(); }}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {t('health.restartGateway')}
                  </Button>
                  <Button
                    data-testid="channels-copy-diagnostics"
                    size="sm"
                    variant="outline"
                    className="h-8 border-border/60 bg-card/40 px-3 text-xs"
                    disabled={diagnosticsLoading}
                    onClick={() => { void handleCopyDiagnostics(); }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {t('health.copyDiagnostics')}
                  </Button>
                  <Button
                    data-testid="channels-toggle-diagnostics"
                    size="sm"
                    variant="outline"
                    className="h-8 border-border/60 bg-card/40 px-3 text-xs"
                    disabled={diagnosticsLoading}
                    onClick={() => { void handleToggleDiagnostics(); }}
                  >
                    {showDiagnostics ? (
                      <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {showDiagnostics ? t('health.hideDiagnostics') : t('health.viewDiagnostics')}
                  </Button>
                </div>
              </div>

              {showDiagnostics && diagnosticsText && (
                <div className="mt-3 rounded-lg border border-border/60 bg-background/80 p-3">
                  <p className="mb-2 text-2xs font-medium text-muted-foreground">{t('health.diagnosticsTitle')}</p>
                  <pre data-testid="channels-diagnostics" className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all text-2xs text-foreground/85">
                    {diagnosticsText}
                  </pre>
                </div>
              )}
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

          {configuredGroups.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-medium text-foreground">
                {t('configured')}
              </h2>
              <div className="space-y-2">
                {configuredGroups.map((group) => (
                  <div key={group.channelType} className="rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/30 hover:bg-card/70">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
                          <ChannelLogo type={group.channelType as ChannelType} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-medium text-foreground">
                            {CHANNEL_NAMES[group.channelType as ChannelType] || group.channelType}
                          </h3>
                          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                            <span>{group.channelType}</span>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <span className="flex items-center gap-1">
                              <span
                                className={cn(
                                  'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                                  group.status === 'connected' && 'bg-primary',
                                  group.status === 'connecting' && 'animate-pulse bg-sky-500',
                                  group.status === 'degraded' && 'bg-yellow-500',
                                  group.status === 'error' && 'bg-red-500',
                                  group.status === 'disconnected' && 'bg-gray-400',
                                )}
                              />
                              {statusLabel(group.status)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-border/60 bg-card/40 px-3 text-xs"
                          onClick={() => {
                            const shouldUseGeneratedAccountId = !usesPluginManagedQrAccounts(group.channelType);
                            const nextAccountId = shouldUseGeneratedAccountId
                              ? createNewAccountId(
                                group.channelType,
                                group.accounts.map((item) => item.accountId),
                              )
                              : undefined;
                            setSelectedChannelType(group.channelType as ChannelType);
                            setSelectedAccountId(nextAccountId);
                            setAllowExistingConfigInModal(false);
                            setAllowEditAccountIdInModal(shouldUseGeneratedAccountId);
                            setExistingAccountIdsForModal(group.accounts.map((item) => item.accountId));
                            setInitialConfigValuesForModal(undefined);
                            setShowConfigModal(true);
                          }}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          {t('account.add')}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTarget({ channelType: group.channelType })}
                          title={t('account.deleteChannel')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {group.accounts.map((account) => {
                        const displayName =
                          account.accountId === 'default' && account.name === account.accountId
                            ? t('account.mainAccount')
                            : account.name;
                        return (
                        <div key={`${group.channelType}-${account.accountId}`} className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
                              </div>
                              {account.lastError && (
                                <div className="mt-1 text-2xs text-destructive">{account.lastError}</div>
                              )}
                              {!account.lastError && account.statusReason && account.status === 'degraded' && (
                                <div className="mt-1 text-2xs text-yellow-600 dark:text-yellow-400">
                                  {t(`health.reasons.${account.statusReason}`)}
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              <span className="shrink-0 text-2xs text-muted-foreground">{t('account.bindAgentLabel')}</span>
                              <FormSelect
                                size="sm"
                                value={account.agentId || UNASSIGNED_AGENT_VALUE}
                                onValueChange={(value) => {
                                  void handleBindAgent(
                                    group.channelType,
                                    account.accountId,
                                    value === UNASSIGNED_AGENT_VALUE ? '' : value,
                                  );
                                }}
                                options={agentSelectOptions}
                                className={CHANNEL_AGENT_SELECT}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-border/60 bg-card/40 px-3 text-xs"
                                  onClick={() => {
                                    void (async () => {
                                      try {
                                        const accountParam = `?accountId=${encodeURIComponent(account.accountId)}`;
                                        const result = await hostApiFetch<{ success: boolean; values?: Record<string, string> }>(
                                          `/api/channels/config/${encodeURIComponent(group.channelType)}${accountParam}`
                                        );
                                        setInitialConfigValuesForModal(result.success ? (result.values || {}) : undefined);
                                      } catch {
                                        // Fall back to modal-side loading when prefetch fails.
                                        setInitialConfigValuesForModal(undefined);
                                      }
                                      setSelectedChannelType(group.channelType as ChannelType);
                                      setSelectedAccountId(account.accountId);
                                      setAllowExistingConfigInModal(true);
                                      setAllowEditAccountIdInModal(false);
                                      setExistingAccountIdsForModal([]);
                                      setShowConfigModal(true);
                                    })();
                                  }}
                                >
                                {t('account.edit')}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setDeleteTarget({ channelType: group.channelType, accountId: account.accountId })}
                                title={t('account.delete')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-medium text-foreground">
              {t('supportedChannels')}
            </h2>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {unsupportedGroups.map((type) => {
                const meta = CHANNEL_META[type];
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedChannelType(type);
                      setSelectedAccountId(undefined);
                      setAllowExistingConfigInModal(true);
                      setAllowEditAccountIdInModal(false);
                      setExistingAccountIdsForModal([]);
                      setInitialConfigValuesForModal(undefined);
                      setShowConfigModal(true);
                    }}
                    className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-4 text-left transition-colors hover:border-primary/30 hover:bg-card/70"
                  >
                    <div className="mb-0 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
                      <ChannelLogo type={type} />
                    </div>
                    <div className="mt-0 flex min-w-0 flex-1 flex-col py-0.5">
                      <div className="mb-0.5 flex items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-foreground">{meta.name}</h3>
                        {meta.isPlugin && (
                          <Badge variant="secondary" className="shrink-0 rounded-full border-0 bg-muted/50 px-2 py-0.5 font-mono text-2xs font-medium text-muted-foreground shadow-none">
                            {t('pluginBadge')}
                          </Badge>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {t(meta.description.replace('channels:', ''))}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showConfigModal && (
        <ChannelConfigModal
          initialSelectedType={selectedChannelType}
          accountId={selectedAccountId}
          configuredTypes={configuredTypes}
          allowExistingConfig={allowExistingConfigInModal}
          allowEditAccountId={allowEditAccountIdInModal}
          existingAccountIds={existingAccountIdsForModal}
          initialConfigValues={initialConfigValuesForModal}
          showChannelName={false}
          onClose={() => {
            setShowConfigModal(false);
            setSelectedChannelType(null);
            setSelectedAccountId(undefined);
            setAllowExistingConfigInModal(true);
            setAllowEditAccountIdInModal(false);
            setExistingAccountIdsForModal([]);
            setInitialConfigValuesForModal(undefined);
          }}
          onChannelSaved={async () => {
            await fetchPageData({ probe: true });
            scheduleConvergenceRefresh();
            setShowConfigModal(false);
            setSelectedChannelType(null);
            setSelectedAccountId(undefined);
            setAllowExistingConfigInModal(true);
            setAllowEditAccountIdInModal(false);
            setExistingAccountIdsForModal([]);
            setInitialConfigValuesForModal(undefined);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common:actions.confirm')}
        message={deleteTarget?.accountId ? t('account.deleteConfirm') : t('deleteConfirm')}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ChannelLogo({ type }: { type: ChannelType }) {
  switch (type) {
    case 'telegram':
      return <img src={telegramIcon} alt="Telegram" className="w-[22px] h-[22px] dark:invert" />;
    case 'discord':
      return <img src={discordIcon} alt="Discord" className="w-[22px] h-[22px] dark:invert" />;
    case 'whatsapp':
      return <img src={whatsappIcon} alt="WhatsApp" className="w-[22px] h-[22px] dark:invert" />;
    case 'wechat':
      return <img src={wechatIcon} alt="WeChat" className="w-[22px] h-[22px] dark:invert" />;
    case 'dingtalk':
      return <img src={dingtalkIcon} alt="DingTalk" className="w-[22px] h-[22px] dark:invert" />;
    case 'feishu':
      return <img src={feishuIcon} alt="Feishu" className="w-[22px] h-[22px] dark:invert" />;
    case 'wecom':
      return <img src={wecomIcon} alt="WeCom" className="w-[22px] h-[22px] dark:invert" />;
    case 'qqbot':
      return <img src={qqIcon} alt="QQ" className="w-[22px] h-[22px] dark:invert" />;
    default:
      return <span className="text-xl">{CHANNEL_ICONS[type] || '💬'}</span>;
  }
}

export default Channels;
