/**
 * Settings Page
 * Application configuration
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  ExternalLink,
  Copy,
  FileText,
  Settings as SettingsIcon,
  Palette,
  Server,
  Code2,
  Download,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useSettingsStore } from '@/stores/settings';
import { useGatewayStore } from '@/stores/gateway';
import { useUpdateStore } from '@/stores/update';
import { UpdateSettings } from '@/components/settings/UpdateSettings';
import {
  getGatewayWsDiagnosticEnabled,
  invokeIpc,
  setGatewayWsDiagnosticEnabled,
  toUserMessage,
} from '@/lib/api-client';
import {
  clearUiTelemetry,
  getUiTelemetrySnapshot,
  subscribeUiTelemetry,
  trackUiEvent,
  type UiTelemetryEntry,
} from '@/lib/telemetry';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { hostApiFetch } from '@/lib/host-api';
import { cn } from '@/lib/utils';
import { PingClawLogo } from '@/components/PingClawLogo';
import {
  ACCENT_ICON_SM,
  ACCENT_ICON_MD,
  segmentButtonClass,
  STATUS_SUCCESS,
  STATUS_SUCCESS_DOT,
} from '@/lib/ui-patterns';
type ControlUiInfo = {
  url: string;
  token: string;
  port: number;
};

const SETTINGS_SECTION =
  'overflow-hidden rounded-xl border border-border/60 bg-card/50 shadow-[0_1px_0_0_hsl(var(--border)/0.4)]';
const SETTINGS_INNER = 'rounded-xl border border-border/60 bg-card/30 p-3';
const SETTINGS_LABEL = 'text-xs font-medium text-foreground/90';
const SETTINGS_DESC = 'mt-0.5 text-2xs text-muted-foreground';
const SETTINGS_INPUT = 'h-9 rounded-lg border-border/60 bg-surface-input text-xs font-mono text-foreground placeholder:text-muted-foreground';
const COMPACT_BTN = 'h-8 border-border/60 bg-card/40 px-3 text-xs';

function SettingsSection({
  title,
  description,
  icon,
  children,
  testId,
  titleTestId,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  titleTestId?: string;
}) {
  return (
    <section data-testid={testId} className={SETTINGS_SECTION}>
      <div className="flex items-start gap-3 border-b border-border/60 bg-card/30 px-4 py-3">
        <div className={cn(ACCENT_ICON_SM, 'h-9 w-9')}>
          {icon}
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 data-testid={titleTestId} className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function SettingsOptionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center rounded-lg border border-border/50 bg-background/20 px-3 py-2.5">
      <Label className={cn(SETTINGS_LABEL, 'mr-3 min-w-[2rem] shrink-0')}>{label}</Label>
      {children}
    </div>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/30">
      {children}
    </div>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3 transition-colors hover:bg-card/20">
      <div className="min-w-0">
        <Label className={SETTINGS_LABEL}>{label}</Label>
        {description ? <p className={SETTINGS_DESC}>{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Settings() {
  const { t } = useTranslation('settings');
  const {
    theme,
    setTheme,
    language,
    setLanguage,
    launchAtStartup,
    setLaunchAtStartup,
    gatewayAutoStart,
    setGatewayAutoStart,
    proxyEnabled,
    proxyServer,
    proxyHttpServer,
    proxyHttpsServer,
    proxyAllServer,
    proxyBypassRules,
    setProxyEnabled,
    setProxyServer,
    setProxyHttpServer,
    setProxyHttpsServer,
    setProxyAllServer,
    setProxyBypassRules,
    autoCheckUpdate,
    setAutoCheckUpdate,
    devModeUnlocked,
    setDevModeUnlocked,
    telemetryEnabled,
    setTelemetryEnabled,
  } = useSettingsStore();

  const { status: gatewayStatus, restart: restartGateway } = useGatewayStore();
  const currentVersion = useUpdateStore((state) => state.currentVersion);
  const [controlUiInfo, setControlUiInfo] = useState<ControlUiInfo | null>(null);
  const [openclawCliCommand, setOpenclawCliCommand] = useState('');
  const [openclawCliError, setOpenclawCliError] = useState<string | null>(null);
  const [proxyServerDraft, setProxyServerDraft] = useState('');
  const [proxyHttpServerDraft, setProxyHttpServerDraft] = useState('');
  const [proxyHttpsServerDraft, setProxyHttpsServerDraft] = useState('');
  const [proxyAllServerDraft, setProxyAllServerDraft] = useState('');
  const [proxyBypassRulesDraft, setProxyBypassRulesDraft] = useState('');
  const [proxyEnabledDraft, setProxyEnabledDraft] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);
  const [wsDiagnosticEnabled, setWsDiagnosticEnabled] = useState(false);
  const [showTelemetryViewer, setShowTelemetryViewer] = useState(false);
  const [telemetryEntries, setTelemetryEntries] = useState<UiTelemetryEntry[]>([]);

  const isWindows = window.electron.platform === 'win32';
  const showCliTools = true;
  const [showLogs, setShowLogs] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [doctorRunningMode, setDoctorRunningMode] = useState<'diagnose' | 'fix' | null>(null);
  const [doctorResult, setDoctorResult] = useState<{
    mode: 'diagnose' | 'fix';
    success: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    command: string;
    cwd: string;
    durationMs: number;
    timedOut?: boolean;
    error?: string;
  } | null>(null);

  const handleShowLogs = async () => {
    try {
      const logs = await hostApiFetch<{ content: string }>('/api/logs?tailLines=100');
      setLogContent(logs.content);
      setShowLogs(true);
    } catch {
      setLogContent('(Failed to load logs)');
      setShowLogs(true);
    }
  };

  const handleOpenLogDir = async () => {
    try {
      const { dir: logDir } = await hostApiFetch<{ dir: string | null }>('/api/logs/dir');
      if (logDir) {
        await invokeIpc('shell:showItemInFolder', logDir);
      }
    } catch {
      // ignore
    }
  };

  const handleRunOpenClawDoctor = async (mode: 'diagnose' | 'fix') => {
    setDoctorRunningMode(mode);
    try {
      const result = await hostApiFetch<{
        mode: 'diagnose' | 'fix';
        success: boolean;
        exitCode: number | null;
        stdout: string;
        stderr: string;
        command: string;
        cwd: string;
        durationMs: number;
        timedOut?: boolean;
        error?: string;
      }>('/api/app/openclaw-doctor', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setDoctorResult(result);
      if (result.success) {
        toast.success(mode === 'fix' ? t('developer.doctorFixSucceeded') : t('developer.doctorSucceeded'));
      } else {
        toast.error(result.error || (mode === 'fix' ? t('developer.doctorFixFailed') : t('developer.doctorFailed')));
      }
    } catch (error) {
      const message = toUserMessage(error) || (mode === 'fix' ? t('developer.doctorFixRunFailed') : t('developer.doctorRunFailed'));
      toast.error(message);
      setDoctorResult({
        mode,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        command: 'openclaw doctor',
        cwd: '',
        durationMs: 0,
        error: message,
      });
    } finally {
      setDoctorRunningMode(null);
    }
  };

  const handleCopyDoctorOutput = async () => {
    if (!doctorResult) return;
    const payload = [
      `command: ${doctorResult.command}`,
      `cwd: ${doctorResult.cwd}`,
      `exitCode: ${doctorResult.exitCode ?? 'null'}`,
      `durationMs: ${doctorResult.durationMs}`,
      '',
      '[stdout]',
      doctorResult.stdout.trim() || '(empty)',
      '',
      '[stderr]',
      doctorResult.stderr.trim() || '(empty)',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(payload);
      toast.success(t('developer.doctorCopied'));
    } catch (error) {
      toast.error(`Failed to copy doctor output: ${String(error)}`);
    }
  };



  const refreshControlUiInfo = async () => {
    try {
      const result = await hostApiFetch<{
        success: boolean;
        url?: string;
        token?: string;
        port?: number;
      }>('/api/gateway/control-ui');
      if (result.success && result.url && result.token && typeof result.port === 'number') {
        setControlUiInfo({ url: result.url, token: result.token, port: result.port });
      }
    } catch {
      // Ignore refresh errors
    }
  };

  const handleCopyGatewayToken = async () => {
    if (!controlUiInfo?.token) return;
    try {
      await navigator.clipboard.writeText(controlUiInfo.token);
      toast.success(t('developer.tokenCopied'));
    } catch (error) {
      toast.error(`Failed to copy token: ${String(error)}`);
    }
  };

  useEffect(() => {
    if (!showCliTools) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await invokeIpc<{
          success: boolean;
          command?: string;
          error?: string;
        }>('openclaw:getCliCommand');
        if (cancelled) return;
        if (result.success && result.command) {
          setOpenclawCliCommand(result.command);
          setOpenclawCliError(null);
        } else {
          setOpenclawCliCommand('');
          setOpenclawCliError(result.error || 'OpenClaw CLI unavailable');
        }
      } catch (error) {
        if (cancelled) return;
        setOpenclawCliCommand('');
        setOpenclawCliError(String(error));
      }
    })();

    return () => { cancelled = true; };
  }, [devModeUnlocked, showCliTools]);

  const handleCopyCliCommand = async () => {
    if (!openclawCliCommand) return;
    try {
      await navigator.clipboard.writeText(openclawCliCommand);
      toast.success(t('developer.cmdCopied'));
    } catch (error) {
      toast.error(`Failed to copy command: ${String(error)}`);
    }
  };

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on(
      'openclaw:cli-installed',
      (...args: unknown[]) => {
        const installedPath = typeof args[0] === 'string' ? args[0] : '';
        toast.success(`openclaw CLI installed at ${installedPath}`);
      },
    );
    return () => { unsubscribe?.(); };
  }, []);

  useEffect(() => {
    setWsDiagnosticEnabled(getGatewayWsDiagnosticEnabled());
  }, []);

  useEffect(() => {
    if (!devModeUnlocked) return;
    setTelemetryEntries(getUiTelemetrySnapshot(200));
    const unsubscribe = subscribeUiTelemetry((entry) => {
      setTelemetryEntries((prev) => {
        const next = [...prev, entry];
        if (next.length > 200) {
          next.splice(0, next.length - 200);
        }
        return next;
      });
    });
    return unsubscribe;
  }, [devModeUnlocked]);

  useEffect(() => {
    setProxyEnabledDraft(proxyEnabled);
  }, [proxyEnabled]);

  useEffect(() => {
    setProxyServerDraft(proxyServer);
  }, [proxyServer]);

  useEffect(() => {
    setProxyHttpServerDraft(proxyHttpServer);
  }, [proxyHttpServer]);

  useEffect(() => {
    setProxyHttpsServerDraft(proxyHttpsServer);
  }, [proxyHttpsServer]);

  useEffect(() => {
    setProxyAllServerDraft(proxyAllServer);
  }, [proxyAllServer]);

  useEffect(() => {
    setProxyBypassRulesDraft(proxyBypassRules);
  }, [proxyBypassRules]);

  const proxySettingsDirty = useMemo(() => {
    return (
      proxyEnabledDraft !== proxyEnabled
      || proxyServerDraft.trim() !== proxyServer
      || proxyHttpServerDraft.trim() !== proxyHttpServer
      || proxyHttpsServerDraft.trim() !== proxyHttpsServer
      || proxyAllServerDraft.trim() !== proxyAllServer
      || proxyBypassRulesDraft.trim() !== proxyBypassRules
    );
  }, [
    proxyAllServer,
    proxyAllServerDraft,
    proxyBypassRules,
    proxyBypassRulesDraft,
    proxyEnabled,
    proxyEnabledDraft,
    proxyHttpServer,
    proxyHttpServerDraft,
    proxyHttpsServer,
    proxyHttpsServerDraft,
    proxyServer,
    proxyServerDraft,
  ]);

  const handleSaveProxySettings = async () => {
    setSavingProxy(true);
    try {
      const normalizedProxyServer = proxyServerDraft.trim();
      const normalizedHttpServer = proxyHttpServerDraft.trim();
      const normalizedHttpsServer = proxyHttpsServerDraft.trim();
      const normalizedAllServer = proxyAllServerDraft.trim();
      const normalizedBypassRules = proxyBypassRulesDraft.trim();
      await invokeIpc('settings:setMany', {
        proxyEnabled: proxyEnabledDraft,
        proxyServer: normalizedProxyServer,
        proxyHttpServer: normalizedHttpServer,
        proxyHttpsServer: normalizedHttpsServer,
        proxyAllServer: normalizedAllServer,
        proxyBypassRules: normalizedBypassRules,
      });

      setProxyServer(normalizedProxyServer);
      setProxyHttpServer(normalizedHttpServer);
      setProxyHttpsServer(normalizedHttpsServer);
      setProxyAllServer(normalizedAllServer);
      setProxyBypassRules(normalizedBypassRules);
      setProxyEnabled(proxyEnabledDraft);

      toast.success(t('gateway.proxySaved'));
      trackUiEvent('settings.proxy_saved', { enabled: proxyEnabledDraft });
    } catch (error) {
      toast.error(`${t('gateway.proxySaveFailed')}: ${toUserMessage(error)}`);
    } finally {
      setSavingProxy(false);
    }
  };

  const telemetryStats = useMemo(() => {
    let errorCount = 0;
    let slowCount = 0;
    for (const entry of telemetryEntries) {
      if (entry.event.endsWith('_error') || entry.event.includes('request_error')) {
        errorCount += 1;
      }
      const durationMs = typeof entry.payload.durationMs === 'number'
        ? entry.payload.durationMs
        : Number.NaN;
      if (Number.isFinite(durationMs) && durationMs >= 800) {
        slowCount += 1;
      }
    }
    return { total: telemetryEntries.length, errorCount, slowCount };
  }, [telemetryEntries]);

  const telemetryByEvent = useMemo(() => {
    const map = new Map<string, {
      event: string;
      count: number;
      errorCount: number;
      slowCount: number;
      totalDuration: number;
      timedCount: number;
      lastTs: string;
    }>();

    for (const entry of telemetryEntries) {
      const current = map.get(entry.event) ?? {
        event: entry.event,
        count: 0,
        errorCount: 0,
        slowCount: 0,
        totalDuration: 0,
        timedCount: 0,
        lastTs: entry.ts,
      };

      current.count += 1;
      current.lastTs = entry.ts;

      if (entry.event.endsWith('_error') || entry.event.includes('request_error')) {
        current.errorCount += 1;
      }

      const durationMs = typeof entry.payload.durationMs === 'number'
        ? entry.payload.durationMs
        : Number.NaN;
      if (Number.isFinite(durationMs)) {
        current.totalDuration += durationMs;
        current.timedCount += 1;
        if (durationMs >= 800) {
          current.slowCount += 1;
        }
      }

      map.set(entry.event, current);
    }

    return [...map.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [telemetryEntries]);

  const handleCopyTelemetry = async () => {
    try {
      const serialized = telemetryEntries.map((entry) => JSON.stringify(entry)).join('\n');
      await navigator.clipboard.writeText(serialized);
      toast.success(t('developer.telemetryCopied'));
    } catch (error) {
      toast.error(`${t('common:status.error')}: ${String(error)}`);
    }
  };

  const handleClearTelemetry = () => {
    clearUiTelemetry();
    setTelemetryEntries([]);
    toast.success(t('developer.telemetryCleared'));
  };

  const handleWsDiagnosticToggle = (enabled: boolean) => {
    setGatewayWsDiagnosticEnabled(enabled);
    setWsDiagnosticEnabled(enabled);
    toast.success(
      enabled
        ? t('developer.wsDiagnosticEnabled')
        : t('developer.wsDiagnosticDisabled'),
    );
  };

  return (
    <div data-testid="settings-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="mb-6 flex shrink-0 items-start gap-3">
          <div className={ACCENT_ICON_MD}>
            <SettingsIcon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-6">
          <SettingsSection
            title={t('appearance.title')}
            description={t('appearance.description')}
            icon={<Palette className="h-4 w-4" strokeWidth={2} />}
          >
            <div className={cn(SETTINGS_INNER, 'space-y-2')}>
              <SettingsOptionRow label={t('appearance.theme')}>
                <div className="inline-flex rounded-lg border border-border/60 bg-card/40 p-0.5">
                  {([
                    ['light', Sun, t('appearance.light')] as const,
                    ['dark', Moon, t('appearance.dark')] as const,
                    ['system', Monitor, t('appearance.system')] as const,
                  ]).map(([value, Icon, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTheme(value)}
                      className={segmentButtonClass(theme === value)}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </SettingsOptionRow>

              <SettingsOptionRow label={t('appearance.language')}>
                <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border/60 bg-card/40 p-0.5">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setLanguage(lang.code)}
                      className={segmentButtonClass(language === lang.code)}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </SettingsOptionRow>
            </div>

            <SettingsGroup>
              <SettingsRow
                label={t('appearance.launchAtStartup')}
                description={t('appearance.launchAtStartupDesc')}
              >
                <Switch size="sm" checked={launchAtStartup} onCheckedChange={setLaunchAtStartup} />
              </SettingsRow>
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection
            title={t('gateway.title')}
            description={t('gateway.description')}
            icon={<Server className="h-4 w-4" strokeWidth={2} />}
          >
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-gradient-to-br from-card/70 to-card/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('gateway.status')}
                </p>
                <p className="mt-1 text-xs font-medium tabular-nums tracking-tight text-foreground">
                  {t('gateway.port')} {gatewayStatus.port}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-2xs font-medium',
                  gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false
                    ? STATUS_SUCCESS
                    : gatewayStatus.state === 'running' || gatewayStatus.state === 'error'
                      ? 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'border-border/60 bg-card/40 text-muted-foreground',
                )}>
                  <div className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false ? cn(STATUS_SUCCESS_DOT, 'animate-pulse')
                      : gatewayStatus.state === 'running' || gatewayStatus.state === 'error' ? 'bg-red-500'
                        : 'bg-muted-foreground',
                  )} />
                  {gatewayStatus.state === 'running' && gatewayStatus.gatewayReady === false ? 'starting' : gatewayStatus.state}
                </div>
                <Button variant="outline" size="sm" onClick={restartGateway} className={COMPACT_BTN}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {t('common:actions.restart')}
                </Button>
                <Button variant="outline" size="sm" onClick={handleShowLogs} className={COMPACT_BTN}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {t('gateway.logs')}
                </Button>
              </div>
            </div>

            {showLogs && (
              <div className="rounded-xl border border-border/60 bg-card/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">{t('gateway.appLogs')}</p>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={handleOpenLogDir}>
                      <ExternalLink className="mr-1 h-3 w-3" />
                      {t('gateway.openFolder')}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={() => setShowLogs(false)}>
                      {t('common:actions.close')}
                    </Button>
                  </div>
                </div>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-card/40 p-3 font-mono text-2xs text-muted-foreground">
                  {logContent || t('chat:noLogs')}
                </pre>
              </div>
            )}

            <SettingsGroup>
              <SettingsRow label={t('gateway.autoStart')} description={t('gateway.autoStartDesc')}>
                <Switch size="sm" checked={gatewayAutoStart} onCheckedChange={setGatewayAutoStart} />
              </SettingsRow>

              <SettingsRow label={t('advanced.devMode')} description={t('advanced.devModeDesc')}>
                <Switch
                  size="sm"
                  checked={devModeUnlocked}
                  onCheckedChange={setDevModeUnlocked}
                  data-testid="settings-dev-mode-switch"
                />
              </SettingsRow>

              <SettingsRow label={t('advanced.telemetry')} description={t('advanced.telemetryDesc')}>
                <Switch size="sm" checked={telemetryEnabled} onCheckedChange={setTelemetryEnabled} />
              </SettingsRow>
            </SettingsGroup>
          </SettingsSection>

          {devModeUnlocked && (
            <SettingsSection
              title={t('developer.title')}
              description={t('developer.description')}
              icon={<Code2 className="h-4 w-4" strokeWidth={2} />}
              testId="settings-developer-section"
              titleTestId="settings-developer-title"
            >
              <div className="space-y-4 rounded-xl border border-border/60 bg-card/30 p-4" data-testid="settings-proxy-section">
                <SettingsRow label={t('gateway.proxyTitle')} description={t('gateway.proxyDesc')}>
                  <Switch
                    size="sm"
                    checked={proxyEnabledDraft}
                    onCheckedChange={setProxyEnabledDraft}
                    data-testid="settings-proxy-toggle"
                  />
                </SettingsRow>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveProxySettings}
                    disabled={savingProxy || !proxySettingsDirty}
                    data-testid="settings-proxy-save-button"
                    className={COMPACT_BTN}
                  >
                    <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', savingProxy && 'animate-spin')} />
                    {savingProxy ? t('common:status.saving') : t('common:actions.save')}
                  </Button>
                  <p className="text-2xs text-muted-foreground">{t('gateway.proxyRestartNote')}</p>
                </div>

                {proxyEnabledDraft && (
                  <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {([
                        ['proxy-server', t('gateway.proxyServer'), proxyServerDraft, setProxyServerDraft, 'http://127.0.0.1:7890', t('gateway.proxyServerHelp')],
                        ['proxy-http-server', t('gateway.proxyHttpServer'), proxyHttpServerDraft, setProxyHttpServerDraft, proxyServerDraft || 'http://127.0.0.1:7890', t('gateway.proxyHttpServerHelp')],
                        ['proxy-https-server', t('gateway.proxyHttpsServer'), proxyHttpsServerDraft, setProxyHttpsServerDraft, proxyServerDraft || 'http://127.0.0.1:7890', t('gateway.proxyHttpsServerHelp')],
                        ['proxy-all-server', t('gateway.proxyAllServer'), proxyAllServerDraft, setProxyAllServerDraft, proxyServerDraft || 'socks5://127.0.0.1:7891', t('gateway.proxyAllServerHelp')],
                      ] as const).map(([id, label, value, onChange, placeholder, help]) => (
                        <div key={id} className="space-y-1.5">
                          <Label htmlFor={id} className={SETTINGS_LABEL}>{label}</Label>
                          <Input
                            id={id}
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            placeholder={placeholder}
                            className={SETTINGS_INPUT}
                          />
                          <p className="text-2xs text-muted-foreground">{help}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="proxy-bypass" className={SETTINGS_LABEL}>{t('gateway.proxyBypass')}</Label>
                      <Input
                        id="proxy-bypass"
                        value={proxyBypassRulesDraft}
                        onChange={(event) => setProxyBypassRulesDraft(event.target.value)}
                        placeholder="<local>;localhost;127.0.0.1;::1"
                        className={SETTINGS_INPUT}
                      />
                      <p className="text-2xs text-muted-foreground">{t('gateway.proxyBypassHelp')}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className={SETTINGS_LABEL}>{t('developer.gatewayToken')}</Label>
                <p className={SETTINGS_DESC}>{t('developer.gatewayTokenDesc')}</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    data-testid="settings-developer-gateway-token"
                    readOnly
                    value={controlUiInfo?.token || ''}
                    placeholder={t('developer.tokenUnavailable')}
                    className={cn(SETTINGS_INPUT, 'min-w-[200px] flex-1')}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={refreshControlUiInfo} disabled={!devModeUnlocked} className={COMPACT_BTN}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    {t('common:actions.load')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyGatewayToken} disabled={!controlUiInfo?.token} className={COMPACT_BTN}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {t('common:actions.copy')}
                  </Button>
                </div>
              </div>

              {showCliTools && (
                <div className="space-y-2">
                  <Label className={SETTINGS_LABEL}>{t('developer.cli')}</Label>
                  <p className={SETTINGS_DESC}>{t('developer.cliDesc')}</p>
                  {isWindows && <p className="text-2xs text-muted-foreground">{t('developer.cliPowershell')}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Input
                      readOnly
                      value={openclawCliCommand}
                      placeholder={openclawCliError || t('developer.cmdUnavailable')}
                      className={cn(SETTINGS_INPUT, 'min-w-[200px] flex-1')}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleCopyCliCommand} disabled={!openclawCliCommand} className={COMPACT_BTN}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {t('common:actions.copy')}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Label className={SETTINGS_LABEL}>{t('developer.doctor')}</Label>
                    <p className={SETTINGS_DESC}>{t('developer.doctorDesc')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleRunOpenClawDoctor('diagnose')} disabled={doctorRunningMode !== null} className={COMPACT_BTN}>
                      <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', doctorRunningMode === 'diagnose' && 'animate-spin')} />
                      {doctorRunningMode === 'diagnose' ? t('common:status.running') : t('developer.runDoctor')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleRunOpenClawDoctor('fix')} disabled={doctorRunningMode !== null} className={COMPACT_BTN}>
                      <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', doctorRunningMode === 'fix' && 'animate-spin')} />
                      {doctorRunningMode === 'fix' ? t('common:status.running') : t('developer.runDoctorFix')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleCopyDoctorOutput} disabled={!doctorResult} className={COMPACT_BTN}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {t('common:actions.copy')}
                    </Button>
                  </div>
                </div>

                {doctorResult && (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-card/30 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={doctorResult.success ? 'secondary' : 'destructive'} className="h-6 rounded-md px-2 text-2xs">
                        {doctorResult.mode === 'fix'
                          ? (doctorResult.success ? t('developer.doctorFixOk') : t('developer.doctorFixIssue'))
                          : (doctorResult.success ? t('developer.doctorOk') : t('developer.doctorIssue'))}
                      </Badge>
                      <Badge variant="outline" className="h-6 rounded-md px-2 text-2xs">
                        {t('developer.doctorExitCode')}: {doctorResult.exitCode ?? 'null'}
                      </Badge>
                      <Badge variant="outline" className="h-6 rounded-md px-2 text-2xs">
                        {t('developer.doctorDuration')}: {Math.round(doctorResult.durationMs)}ms
                      </Badge>
                    </div>
                    <div className="space-y-0.5 break-all font-mono text-2xs text-muted-foreground">
                      <p>{t('developer.doctorCommand')}: {doctorResult.command}</p>
                      <p>{t('developer.doctorWorkingDir')}: {doctorResult.cwd || '-'}</p>
                      {doctorResult.error && <p>{t('developer.doctorError')}: {doctorResult.error}</p>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(['stdout', 'stderr'] as const).map((stream) => (
                        <div key={stream} className="space-y-1.5">
                          <p className="text-2xs font-medium text-foreground/80">
                            {stream === 'stdout' ? t('developer.doctorStdout') : t('developer.doctorStderr')}
                          </p>
                          <pre className="max-h-56 overflow-auto rounded-lg border border-border/60 bg-card/40 p-2 font-mono text-2xs whitespace-pre-wrap break-words">
                            {(stream === 'stdout' ? doctorResult.stdout : doctorResult.stderr).trim() || t('developer.doctorOutputEmpty')}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <SettingsRow label={t('developer.wsDiagnostic')} description={t('developer.wsDiagnosticDesc')}>
                <Switch size="sm" checked={wsDiagnosticEnabled} onCheckedChange={handleWsDiagnosticToggle} />
              </SettingsRow>

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Label className={SETTINGS_LABEL}>{t('developer.telemetryViewer')}</Label>
                  <p className={SETTINGS_DESC}>{t('developer.telemetryViewerDesc')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTelemetryViewer((prev) => !prev)}
                  className={COMPACT_BTN}
                >
                  {showTelemetryViewer ? t('common:actions.hide') : t('common:actions.show')}
                </Button>
              </div>

              {showTelemetryViewer && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-card/30 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="h-6 rounded-md px-2 text-2xs">{t('developer.telemetryTotal')}: {telemetryStats.total}</Badge>
                    <Badge variant={telemetryStats.errorCount > 0 ? 'destructive' : 'secondary'} className="h-6 rounded-md px-2 text-2xs">
                      {t('developer.telemetryErrors')}: {telemetryStats.errorCount}
                    </Badge>
                    <Badge variant="outline" className="h-6 rounded-md px-2 text-2xs">
                      {t('developer.telemetrySlow')}: {telemetryStats.slowCount}
                    </Badge>
                    <div className="ml-auto flex gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={handleCopyTelemetry} className={COMPACT_BTN}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        {t('common:actions.copy')}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={handleClearTelemetry} className={COMPACT_BTN}>
                        {t('common:actions.clear')}
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-auto rounded-lg border border-border/60 bg-card/40">
                    {telemetryByEvent.length > 0 && (
                      <div className="border-b border-border/60 bg-card/30 p-2.5">
                        <p className="mb-2 text-2xs font-medium text-muted-foreground">{t('developer.telemetryAggregated')}</p>
                        <div className="space-y-1 text-2xs">
                          {telemetryByEvent.map((item) => (
                            <div
                              key={item.event}
                              className="grid grid-cols-[minmax(0,1.6fr)_0.7fr_0.9fr_0.8fr_1fr] gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5"
                            >
                              <span className="truncate font-medium" title={item.event}>{item.event}</span>
                              <span className="text-muted-foreground">n={item.count}</span>
                              <span className="text-muted-foreground">
                                avg={item.timedCount > 0 ? Math.round(item.totalDuration / item.timedCount) : 0}ms
                              </span>
                              <span className="text-muted-foreground">slow={item.slowCount}</span>
                              <span className="text-muted-foreground">err={item.errorCount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5 p-2.5 font-mono text-2xs">
                      {telemetryEntries.length === 0 ? (
                        <div className="py-4 text-center text-muted-foreground">{t('developer.telemetryEmpty')}</div>
                      ) : (
                        telemetryEntries.slice().reverse().map((entry) => (
                          <div key={entry.id} className="rounded-md border border-border/60 bg-card/30 p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">{entry.event}</span>
                              <span className="text-muted-foreground">{entry.ts}</span>
                            </div>
                            <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                              {JSON.stringify({ count: entry.count, ...entry.payload }, null, 2)}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </SettingsSection>
          )}

          <SettingsSection
            title={t('updates.title')}
            description={t('updates.description')}
            icon={<Download className="h-4 w-4" strokeWidth={2} />}
          >
            <UpdateSettings />
            <SettingsGroup>
              <SettingsRow label={t('updates.autoCheck')} description={t('updates.autoCheckDesc')}>
                <Switch size="sm" checked={autoCheckUpdate} onCheckedChange={setAutoCheckUpdate} />
              </SettingsRow>
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection
            title={t('about.title')}
            icon={<Info className="h-4 w-4" strokeWidth={2} />}
          >
            <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 via-card/40 to-card/20 p-4">
              <div className="mb-3 flex items-start gap-3">
                <PingClawLogo className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{t('about.appName')}</p>
                    <Badge variant="outline" className="h-5 rounded-md border-primary/20 bg-primary/5 px-1.5 text-2xs text-primary">
                      v{currentVersion}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium text-foreground">{t('about.tagline')}</p>
                  <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">{t('about.description')}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ['https://claw.siping.me/', t('about.docs')],
                  ['https://github.com/sipingme/pingClaw', t('about.github')],
                  ['https://claw.siping.me/faq', t('about.faq')],
                ] as const).map(([url, label]) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => window.electron.openExternal(url)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-card/40 px-2.5 text-2xs text-primary transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

export default Settings;
