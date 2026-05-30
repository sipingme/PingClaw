/**
 * Cron Page
 * Manage scheduled tasks
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Clock,
  Play,
  Trash2,
  RefreshCw,
  X,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
  History,
  Pause,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSelect, type FormSelectGroup } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { hostApiFetch } from '@/lib/host-api';
import { useCronStore } from '@/stores/cron';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { useChatStore } from '@/stores/chat';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { formatRelativeTime, cn } from '@/lib/utils';
import { ACCENT_ICON_LG, ACCENT_ICON_SM, SELECTABLE_ACTIVE, SELECTABLE_ACTIVE_OUTLINE, STATUS_SUCCESS } from '@/lib/ui-patterns';
import { toast } from 'sonner';
import type { CronJob, CronJobCreateInput, ScheduleType } from '@/types/cron';
import { CHANNEL_ICONS, CHANNEL_NAMES, type ChannelType } from '@/types/channel';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// Common cron schedule presets
const schedulePresets: { key: string; value: string; type: ScheduleType }[] = [
  { key: 'everyMinute', value: '* * * * *', type: 'interval' },
  { key: 'every5Min', value: '*/5 * * * *', type: 'interval' },
  { key: 'every15Min', value: '*/15 * * * *', type: 'interval' },
  { key: 'everyHour', value: '0 * * * *', type: 'interval' },
  { key: 'daily9am', value: '0 9 * * *', type: 'daily' },
  { key: 'daily6pm', value: '0 18 * * *', type: 'daily' },
  { key: 'weeklyMon', value: '0 9 * * 1', type: 'weekly' },
  { key: 'monthly1st', value: '0 9 1 * *', type: 'monthly' },
];

// Parse cron schedule to human-readable format
// Handles both plain cron strings and Gateway CronSchedule objects:
//   { kind: "cron", expr: "...", tz?: "..." }
//   { kind: "every", everyMs: number }
//   { kind: "at", at: "..." }
function parseCronSchedule(schedule: unknown, t: TFunction<'cron'>): string {
  // Handle Gateway CronSchedule object format
  if (schedule && typeof schedule === 'object') {
    const s = schedule as { kind?: string; expr?: string; tz?: string; everyMs?: number; at?: string };
    if (s.kind === 'cron' && typeof s.expr === 'string') {
      return parseCronExpr(s.expr, t);
    }
    if (s.kind === 'every' && typeof s.everyMs === 'number') {
      const ms = s.everyMs;
      if (ms < 60_000) return t('schedule.everySeconds', { count: Math.round(ms / 1000) });
      if (ms < 3_600_000) return t('schedule.everyMinutes', { count: Math.round(ms / 60_000) });
      if (ms < 86_400_000) return t('schedule.everyHours', { count: Math.round(ms / 3_600_000) });
      return t('schedule.everyDays', { count: Math.round(ms / 86_400_000) });
    }
    if (s.kind === 'at' && typeof s.at === 'string') {
      try {
        return t('schedule.onceAt', { time: new Date(s.at).toLocaleString() });
      } catch {
        return t('schedule.onceAt', { time: s.at });
      }
    }
    return String(schedule);
  }

  // Handle plain cron string
  if (typeof schedule === 'string') {
    return parseCronExpr(schedule, t);
  }

  return String(schedule ?? t('schedule.unknown'));
}

// Parse a plain cron expression string to human-readable text
function parseCronExpr(cron: string, t: TFunction<'cron'>): string {
  const preset = schedulePresets.find((p) => p.value === cron);
  if (preset) return t(`presets.${preset.key}` as const);

  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  if (minute === '*' && hour === '*') return t('presets.everyMinute');
  if (minute.startsWith('*/')) return t('schedule.everyMinutes', { count: Number(minute.slice(2)) });
  if (hour === '*' && minute === '0') return t('presets.everyHour');
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    return t('schedule.weeklyAt', { day: dayOfWeek, time: `${hour}:${minute.padStart(2, '0')}` });
  }
  if (dayOfMonth !== '*') {
    return t('schedule.monthlyAtDay', { day: dayOfMonth, time: `${hour}:${minute.padStart(2, '0')}` });
  }
  if (hour !== '*') {
    return t('schedule.dailyAt', { time: `${hour}:${minute.padStart(2, '0')}` });
  }

  return cron;
}

function estimateNextRun(scheduleExpr: string): string | null {
  const now = new Date();
  const next = new Date(now.getTime());

  if (scheduleExpr === '* * * * *') {
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === '*/5 * * * *') {
    const delta = 5 - (next.getMinutes() % 5 || 5);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + delta);
    return next.toLocaleString();
  }

  if (scheduleExpr === '*/15 * * * *') {
    const delta = 15 - (next.getMinutes() % 15 || 15);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + delta);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 * * * *') {
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 9 * * *' || scheduleExpr === '0 18 * * *') {
    const targetHour = scheduleExpr === '0 9 * * *' ? 9 : 18;
    next.setSeconds(0, 0);
    next.setHours(targetHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 9 * * 1') {
    next.setSeconds(0, 0);
    next.setHours(9, 0, 0, 0);
    const day = next.getDay();
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
    next.setDate(next.getDate() + daysUntilMonday);
    return next.toLocaleString();
  }

  if (scheduleExpr === '0 9 1 * *') {
    next.setSeconds(0, 0);
    next.setDate(1);
    next.setHours(9, 0, 0, 0);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    return next.toLocaleString();
  }

  return null;
}

interface DeliveryChannelAccount {
  accountId: string;
  name: string;
  isDefault: boolean;
}

interface DeliveryChannelGroup {
  channelType: string;
  defaultAccountId: string;
  accounts: DeliveryChannelAccount[];
}

interface ChannelTargetOption {
  value: string;
  label: string;
  kind: 'user' | 'group' | 'channel';
}

function isKnownChannelType(value: string): value is ChannelType {
  return value in CHANNEL_NAMES;
}

function getChannelDisplayName(value: string): string {
  return isKnownChannelType(value) ? CHANNEL_NAMES[value] : value;
}

function getDeliveryAccountDisplayName(account: DeliveryChannelAccount, t: TFunction): string {
  return account.accountId === 'default' && account.name === account.accountId
    ? t('channels:account.mainAccount')
    : account.name;
}

const TESTED_CRON_DELIVERY_CHANNELS = new Set<string>(['feishu', 'telegram', 'qqbot', 'wecom', 'wechat']);

function isSupportedCronDeliveryChannel(channelType: string): boolean {
  return TESTED_CRON_DELIVERY_CHANNELS.has(channelType);
}

const CRON_DIALOG_LABEL = 'text-xs font-medium text-foreground/90';
const CRON_DIALOG_INPUT =
  'h-9 rounded-lg border-border/60 bg-surface-input text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40';
const CRON_DIALOG_SELECT = CRON_DIALOG_INPUT;
const CRON_DIALOG_TEXTAREA = cn(
  CRON_DIALOG_INPUT,
  'h-auto min-h-[84px] resize-none py-2 leading-relaxed md:text-xs',
);
const CRON_DIALOG_SECTION = 'space-y-3 rounded-xl border border-border/60 bg-card/30 p-4';

function DialogSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={CRON_DIALOG_SECTION}>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && <p className="text-2xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// Create/Edit Task Dialog
interface TaskDialogProps {
  job?: CronJob;
  configuredChannels: DeliveryChannelGroup[];
  onClose: () => void;
  onSave: (input: CronJobCreateInput) => Promise<void>;
}

function TaskDialog({ job, configuredChannels, onClose, onSave }: TaskDialogProps) {
  const { t } = useTranslation('cron');
  const [saving, setSaving] = useState(false);
  const agents = useAgentsStore((s) => s.agents);

  const [name, setName] = useState(job?.name || '');
  const [message, setMessage] = useState(job?.message || '');
  const [selectedAgentId, setSelectedAgentId] = useState(job?.agentId || useChatStore.getState().currentAgentId);
  // Extract cron expression string from CronSchedule object or use as-is if string
  const initialSchedule = (() => {
    const s = job?.schedule;
    if (!s) return '0 9 * * *';
    if (typeof s === 'string') return s;
    if (typeof s === 'object' && 'expr' in s && typeof (s as { expr: string }).expr === 'string') {
      return (s as { expr: string }).expr;
    }
    return '0 9 * * *';
  })();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [customSchedule, setCustomSchedule] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [deliveryMode, setDeliveryMode] = useState<'none' | 'announce'>(job?.delivery?.mode === 'announce' ? 'announce' : 'none');
  const [deliveryChannel, setDeliveryChannel] = useState(job?.delivery?.channel || '');
  const [deliveryTarget, setDeliveryTarget] = useState(job?.delivery?.to || '');
  const [selectedDeliveryAccountId, setSelectedDeliveryAccountId] = useState(job?.delivery?.accountId || '');
  const [channelTargetOptions, setChannelTargetOptions] = useState<ChannelTargetOption[]>([]);
  const [loadingChannelTargets, setLoadingChannelTargets] = useState(false);
  const schedulePreview = estimateNextRun(useCustom ? customSchedule : schedule);
  const selectableChannels = configuredChannels.filter((group) => isSupportedCronDeliveryChannel(group.channelType));
  const availableChannels = selectableChannels.some((group) => group.channelType === deliveryChannel)
    ? selectableChannels
    : (
      deliveryChannel && isSupportedCronDeliveryChannel(deliveryChannel)
        ? [...selectableChannels, configuredChannels.find((group) => group.channelType === deliveryChannel) || { channelType: deliveryChannel, defaultAccountId: 'default', accounts: [] }]
        : selectableChannels
    );
  const effectiveDeliveryChannel = deliveryChannel
    || (deliveryMode === 'announce' ? (availableChannels[0]?.channelType || '') : '');
  const unsupportedDeliveryChannel = !!effectiveDeliveryChannel && !isSupportedCronDeliveryChannel(effectiveDeliveryChannel);
  const selectedChannel = availableChannels.find((group) => group.channelType === effectiveDeliveryChannel);
  const deliveryAccountOptions = (selectedChannel?.accounts ?? []).map((account) => ({
    accountId: account.accountId,
    displayName: getDeliveryAccountDisplayName(account, t),
  }));
  const hasCurrentDeliveryTarget = !!deliveryTarget;
  const currentDeliveryTargetOption = hasCurrentDeliveryTarget
    ? {
      value: deliveryTarget,
      label: `${t('dialog.currentTarget')} (${deliveryTarget})`,
      kind: 'user' as const,
    }
    : null;
  const effectiveDeliveryAccountId = selectedDeliveryAccountId
    || selectedChannel?.defaultAccountId
    || deliveryAccountOptions[0]?.accountId
    || '';
  const showsAccountSelector = (selectedChannel?.accounts.length ?? 0) > 0;
  const selectedResolvedAccountId = effectiveDeliveryAccountId || undefined;
  const availableTargetOptions = currentDeliveryTargetOption
    ? [currentDeliveryTargetOption, ...channelTargetOptions.filter((option) => option.value !== deliveryTarget)]
    : channelTargetOptions;

  const agentOptions = useMemo(
    () => agents.map((agent) => ({ value: agent.id, label: agent.name })),
    [agents],
  );

  const deliveryChannelOptions = useMemo(
    () => availableChannels.map((group) => ({
      value: group.channelType,
      label: !isSupportedCronDeliveryChannel(group.channelType)
        ? `${getChannelDisplayName(group.channelType)} (${t('dialog.channelUnsupportedTag')})`
        : getChannelDisplayName(group.channelType),
      disabled: !isSupportedCronDeliveryChannel(group.channelType),
    })),
    [availableChannels, t],
  );

  const deliveryTargetGroups = useMemo((): FormSelectGroup[] => {
    if (availableTargetOptions.length === 0) return [];

    const pinnedCurrent = hasCurrentDeliveryTarget
      && !channelTargetOptions.some((option) => option.value === deliveryTarget)
      ? [{
        value: deliveryTarget,
        label: `${t('dialog.currentTarget')} (${deliveryTarget})`,
      }]
      : [];

    const users = channelTargetOptions
      .filter((option) => option.kind === 'user')
      .map((option) => ({ value: option.value, label: option.label }));

    const chats = channelTargetOptions
      .filter((option) => option.kind === 'group' || option.kind === 'channel')
      .map((option) => ({ value: option.value, label: option.label }));

    const groups: FormSelectGroup[] = [];
    if (pinnedCurrent.length > 0) {
      groups.push({ label: t('dialog.deliveryTargetGroupDefault'), options: pinnedCurrent });
    }
    if (users.length > 0) {
      groups.push({ label: t('dialog.deliveryTargetGroupUsers'), options: users });
    }
    if (chats.length > 0) {
      groups.push({ label: t('dialog.deliveryTargetGroupChats'), options: chats });
    }

    if (groups.length > 0) return groups;

    return [{
      label: t('dialog.deliveryTarget'),
      options: availableTargetOptions.map((option) => ({ value: option.value, label: option.label })),
    }];
  }, [availableTargetOptions, channelTargetOptions, deliveryTarget, hasCurrentDeliveryTarget, t]);

  useEffect(() => {
    if (deliveryMode !== 'announce') {
      setSelectedDeliveryAccountId('');
      return;
    }

    if (!selectedDeliveryAccountId && selectedChannel?.defaultAccountId) {
      setSelectedDeliveryAccountId(selectedChannel.defaultAccountId);
    }
  }, [deliveryMode, selectedChannel?.defaultAccountId, selectedDeliveryAccountId]);

  useEffect(() => {
    if (deliveryMode !== 'announce' || !effectiveDeliveryChannel || unsupportedDeliveryChannel) {
      setChannelTargetOptions([]);
      setLoadingChannelTargets(false);
      return;
    }

    if (showsAccountSelector && !selectedResolvedAccountId) {
      setChannelTargetOptions([]);
      setLoadingChannelTargets(false);
      return;
    }

    let cancelled = false;
    setLoadingChannelTargets(true);
    const params = new URLSearchParams({ channelType: effectiveDeliveryChannel });
    if (selectedResolvedAccountId) {
      params.set('accountId', selectedResolvedAccountId);
    }
    void hostApiFetch<{ success: boolean; targets?: ChannelTargetOption[]; error?: string }>(
      `/api/channels/targets?${params.toString()}`,
    ).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        throw new Error(result.error || 'Failed to load channel targets');
      }
      setChannelTargetOptions(result.targets || []);
    }).catch((error) => {
      if (!cancelled) {
        console.warn('Failed to load channel targets:', error);
        setChannelTargetOptions([]);
      }
    }).finally(() => {
      if (!cancelled) {
        setLoadingChannelTargets(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [deliveryMode, effectiveDeliveryChannel, selectedResolvedAccountId, showsAccountSelector, unsupportedDeliveryChannel]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('toast.nameRequired'));
      return;
    }
    if (!message.trim()) {
      toast.error(t('toast.messageRequired'));
      return;
    }

    const finalSchedule = useCustom ? customSchedule : schedule;
    if (!finalSchedule.trim()) {
      toast.error(t('toast.scheduleRequired'));
      return;
    }

    setSaving(true);
    try {
      const finalDelivery = deliveryMode === 'announce'
        ? {
          mode: 'announce' as const,
          channel: effectiveDeliveryChannel.trim(),
          ...(selectedResolvedAccountId
            ? { accountId: effectiveDeliveryAccountId }
            : {}),
          to: deliveryTarget.trim(),
        }
        : { mode: 'none' as const };

      if (finalDelivery.mode === 'announce') {
        if (!finalDelivery.channel) {
          toast.error(t('toast.channelRequired'));
          return;
        }
        if (!isSupportedCronDeliveryChannel(finalDelivery.channel)) {
          toast.error(t('toast.deliveryChannelUnsupported', { channel: getChannelDisplayName(finalDelivery.channel) }));
          return;
        }
        if (!finalDelivery.to) {
          toast.error(t('toast.deliveryTargetRequired'));
          return;
        }
      }

      await onSave({
        name: name.trim(),
        message: message.trim(),
        schedule: finalSchedule,
        delivery: finalDelivery,
        enabled,
        agentId: selectedAgentId,
      });
      onClose();
      toast.success(job ? t('toast.updated') : t('toast.created'));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-xl backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={ACCENT_ICON_SM}>
              <Clock className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {job ? t('dialog.editTitle') : t('dialog.createTitle')}
              </h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">{t('dialog.description')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <DialogSection title={t('dialog.sectionBasic')} description={t('dialog.sectionBasicDesc')}>
            <div className="space-y-1.5">
              <Label htmlFor="name" className={CRON_DIALOG_LABEL}>{t('dialog.taskName')}</Label>
              <Input
                id="name"
                placeholder={t('dialog.taskNamePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={CRON_DIALOG_INPUT}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message" className={CRON_DIALOG_LABEL}>{t('dialog.message')}</Label>
              <Textarea
                id="message"
                placeholder={t('dialog.messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className={CRON_DIALOG_TEXTAREA}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent" className={CRON_DIALOG_LABEL}>{t('dialog.agent')}</Label>
              <FormSelect
                id="agent"
                value={selectedAgentId}
                onValueChange={setSelectedAgentId}
                options={agentOptions}
                className={CRON_DIALOG_SELECT}
              />
            </div>
          </DialogSection>

          <DialogSection title={t('dialog.schedule')} description={t('dialog.sectionScheduleDesc')}>
            {!useCustom ? (
              <div className="grid grid-cols-2 gap-2">
                {schedulePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSchedule(preset.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                      schedule === preset.value
                        ? SELECTABLE_ACTIVE_OUTLINE
                        : 'border-border/60 bg-surface-input text-foreground/80 hover:border-primary/25 hover:bg-primary/5',
                    )}
                  >
                    <Timer className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <span className="truncate">{t(`presets.${preset.key}` as const)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Input
                placeholder={t('dialog.cronPlaceholder')}
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                className={cn(CRON_DIALOG_INPUT, 'font-mono text-xs')}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-2xs text-muted-foreground">
                {schedulePreview ? `${t('card.next')}: ${schedulePreview}` : t('dialog.cronPlaceholder')}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUseCustom(!useCustom)}
                className="h-7 shrink-0 px-2 text-2xs text-muted-foreground hover:text-foreground"
              >
                {useCustom ? t('dialog.usePresets') : t('dialog.useCustomCron')}
              </Button>
            </div>
          </DialogSection>

          <DialogSection title={t('dialog.deliveryTitle')} description={t('dialog.deliveryDescription')}>
            <div className="grid grid-cols-2 gap-2">
              {[{
                mode: 'none' as const,
                title: t('dialog.deliveryModeNone'),
                desc: t('dialog.deliveryModeNoneDesc'),
              }, {
                mode: 'announce' as const,
                title: t('dialog.deliveryModeAnnounce'),
                desc: t('dialog.deliveryModeAnnounceDesc'),
              }].map(({ mode, title, desc }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDeliveryMode(mode)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-left transition-colors',
                    deliveryMode === mode
                      ? cn('rounded-lg border px-3 py-2.5 text-left transition-colors', SELECTABLE_ACTIVE_OUTLINE)
                      : 'border-border/60 bg-surface-input hover:border-primary/25 hover:bg-primary/5',
                  )}
                >
                  <div className={cn('text-xs font-medium', deliveryMode === mode ? 'text-primary' : 'text-foreground')}>
                    {title}
                  </div>
                  <div className="mt-0.5 text-2xs text-muted-foreground">{desc}</div>
                </button>
              ))}
            </div>

            {deliveryMode === 'announce' && (
              <div className="space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="delivery-channel" className={CRON_DIALOG_LABEL}>
                    {t('dialog.deliveryChannel')}
                  </Label>
                  <FormSelect
                    id="delivery-channel"
                    value={effectiveDeliveryChannel}
                    onValueChange={(value) => {
                      setDeliveryChannel(value);
                      setSelectedDeliveryAccountId('');
                      setDeliveryTarget('');
                    }}
                    placeholder={t('dialog.selectChannel')}
                    options={deliveryChannelOptions}
                    className={CRON_DIALOG_SELECT}
                  />
                  {availableChannels.length === 0 && (
                    <p className="text-2xs text-muted-foreground">{t('dialog.noChannels')}</p>
                  )}
                  {unsupportedDeliveryChannel && (
                    <p className="text-2xs text-destructive">{t('dialog.deliveryChannelUnsupported', { channel: getChannelDisplayName(effectiveDeliveryChannel) })}</p>
                  )}
                  {selectedChannel && (
                    <p className="text-2xs text-muted-foreground">
                      {t('dialog.deliveryDefaultAccountHint', { account: selectedChannel.defaultAccountId })}
                    </p>
                  )}
                </div>

                {showsAccountSelector && (
                  <div className="space-y-1.5">
                    <Label htmlFor="delivery-account" className={CRON_DIALOG_LABEL}>
                      {t('dialog.deliveryAccount')}
                    </Label>
                    <FormSelect
                      id="delivery-account"
                      value={effectiveDeliveryAccountId}
                      onValueChange={(value) => {
                        setSelectedDeliveryAccountId(value);
                        setDeliveryTarget('');
                      }}
                      placeholder={t('dialog.selectDeliveryAccount')}
                      disabled={deliveryAccountOptions.length === 0}
                      options={deliveryAccountOptions.map((option) => ({
                        value: option.accountId,
                        label: option.displayName,
                      }))}
                      className={CRON_DIALOG_SELECT}
                    />
                    <p className="text-2xs text-muted-foreground">{t('dialog.deliveryAccountDesc')}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="delivery-target-select" className={CRON_DIALOG_LABEL}>
                    {t('dialog.deliveryTarget')}
                  </Label>
                  <FormSelect
                    id="delivery-target-select"
                    value={deliveryTarget}
                    onValueChange={setDeliveryTarget}
                    placeholder={loadingChannelTargets ? t('dialog.loadingTargets') : t('dialog.selectDeliveryTarget')}
                    disabled={loadingChannelTargets || availableTargetOptions.length === 0}
                    groups={deliveryTargetGroups}
                    className={CRON_DIALOG_SELECT}
                  />
                  <p className="text-2xs text-muted-foreground">
                    {availableTargetOptions.length > 0
                      ? t('dialog.deliveryTargetDescAuto')
                      : t('dialog.noDeliveryTargets', { channel: getChannelDisplayName(effectiveDeliveryChannel) })}
                  </p>
                </div>
              </div>
            )}
          </DialogSection>

          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/30 px-4 py-3">
            <div>
              <Label className={CRON_DIALOG_LABEL}>{t('dialog.enableImmediately')}</Label>
              <p className="mt-0.5 text-2xs text-muted-foreground">{t('dialog.enableImmediatelyDesc')}</p>
            </div>
            <Switch size="sm" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-3 text-xs">
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving} className="h-8 px-3 text-xs">
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('common:status.saving')}
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {job ? t('dialog.saveChanges') : t('dialog.createTitle')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Job Card Component
interface CronJobCardProps {
  job: CronJob;
  deliveryAccountName?: string;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => Promise<void>;
}

function CronJobCard({ job, deliveryAccountName, onToggle, onEdit, onDelete, onTrigger }: CronJobCardProps) {
  const { t } = useTranslation('cron');
  const [triggering, setTriggering] = useState(false);
  const agents = useAgentsStore((s) => s.agents);
  const agentName = agents.find((a) => a.id === job.agentId)?.name ?? job.agentId;

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTriggering(true);
    try {
      await onTrigger();
      toast.success(t('toast.triggered'));
    } catch (error) {
      console.error('Failed to trigger cron job:', error);
      toast.error(t('toast.failedTrigger', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setTriggering(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const deliveryChannel = typeof job.delivery?.channel === 'string' ? job.delivery.channel : '';
  const deliveryLabel = deliveryChannel ? getChannelDisplayName(deliveryChannel) : '';
  const deliveryIcon = deliveryChannel && isKnownChannelType(deliveryChannel)
    ? CHANNEL_ICONS[deliveryChannel]
    : null;

  return (
    <div
      data-testid={`cron-job-card-${job.id}`}
      className="group cursor-pointer rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/30 hover:bg-card/70"
      onClick={onEdit}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            job.enabled
              ? STATUS_SUCCESS
              : 'border-border/50 bg-muted/30 text-muted-foreground',
          )}
        >
          <Clock className="h-4 w-4" strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h3
                  data-testid={`cron-job-card-title-${job.id}`}
                  className="truncate text-sm font-medium text-foreground"
                >
                  {job.name}
                </h3>
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    job.enabled ? 'bg-primary' : 'bg-muted-foreground/50',
                  )}
                  title={job.enabled ? t('stats.active') : t('stats.paused')}
                />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
                <Timer className="h-3 w-3 shrink-0" />
                <span className="truncate">{parseCronSchedule(job.schedule, t)}</span>
              </p>
            </div>
            <div data-testid={`cron-job-card-switch-${job.id}`} onClick={(e) => e.stopPropagation()}>
              <Switch checked={job.enabled} onCheckedChange={onToggle} />
            </div>
          </div>

          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-foreground/75">
            {job.message}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5">
              <Bot className="h-3 w-3" />
              {agentName}
            </span>

            {job.delivery?.mode === 'announce' && deliveryChannel && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5">
                {deliveryIcon}
                <span className="truncate">{deliveryLabel}</span>
                {(deliveryAccountName || job.delivery.to) && (
                  <span className="truncate opacity-80">
                    {deliveryAccountName || job.delivery.to}
                  </span>
                )}
              </span>
            )}

            {job.lastRun && (
              <span className="inline-flex items-center gap-1">
                <History className="h-3 w-3" />
                {t('card.last')}: {formatRelativeTime(job.lastRun.time)}
                {job.lastRun.success ? (
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
              </span>
            )}

            {job.nextRun && job.enabled && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {t('card.next')}: {new Date(job.nextRun).toLocaleString()}
              </span>
            )}
          </div>

          {job.lastRun && !job.lastRun.success && job.lastRun.error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-2.5 py-2 text-2xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">{job.lastRun.error}</span>
            </div>
          )}

          <div className="mt-3 flex justify-end gap-1.5 border-t border-border/40 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTrigger}
              disabled={triggering}
              className="h-7 px-2.5 text-2xs text-foreground/80 hover:text-foreground"
            >
              {triggering ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Play className="mr-1 h-3 w-3" />
              )}
              {t('card.runNow')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="h-7 px-2.5 text-2xs text-destructive/80 hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              {t('common:actions.delete')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Cron() {
  const { t } = useTranslation('cron');
  const { jobs, loading, error, fetchJobs, createJob, updateJob, toggleJob, deleteJob, triggerJob } = useCronStore();
  const gatewayStatus = useGatewayStore((state) => state.status);
  const [showDialog, setShowDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | undefined>();
  const [jobToDelete, setJobToDelete] = useState<{ id: string } | null>(null);
  const [configuredChannels, setConfiguredChannels] = useState<DeliveryChannelGroup[]>([]);

  const isGatewayRunning = gatewayStatus.state === 'running';

  const fetchConfiguredChannels = useCallback(async () => {
    try {
      const response = await hostApiFetch<{ success: boolean; channels?: DeliveryChannelGroup[]; error?: string }>(
        '/api/channels/accounts',
      );
      if (!response.success) {
        throw new Error(response.error || 'Failed to load delivery channels');
      }
      setConfiguredChannels(response.channels || []);
    } catch (fetchError) {
      console.warn('Failed to load delivery channels:', fetchError);
      setConfiguredChannels([]);
    }
  }, []);

  // Fetch jobs on mount
  useEffect(() => {
    if (isGatewayRunning) {
      fetchJobs();
    }
  }, [fetchJobs, isGatewayRunning]);

  useEffect(() => {
    void fetchConfiguredChannels();
  }, [fetchConfiguredChannels]);

  // Statistics
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const activeJobs = safeJobs.filter((j) => j.enabled);
  const pausedJobs = safeJobs.filter((j) => !j.enabled);
  const failedJobs = safeJobs.filter((j) => j.lastRun && !j.lastRun.success);

  const handleSave = useCallback(async (input: CronJobCreateInput) => {
    if (editingJob) {
      await updateJob(editingJob.id, input);
    } else {
      await createJob(input);
    }
  }, [editingJob, createJob, updateJob]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      await toggleJob(id, enabled);
      toast.success(enabled ? t('toast.enabled') : t('toast.paused'));
    } catch {
      toast.error(t('toast.failedUpdate'));
    }
  }, [toggleJob, t]);



  if (loading) {
    return (
      <div className="flex flex-col -m-6 dark:bg-background min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6">
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
              onClick={() => {
                void fetchJobs();
                void fetchConfiguredChannels();
              }}
              disabled={!isGatewayRunning}
              className="h-8 border-border/60 bg-card/40 px-3 text-xs"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t('refresh')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingJob(undefined);
                setShowDialog(true);
              }}
              disabled={!isGatewayRunning}
              className="h-8 px-3 text-xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('newTask')}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {!isGatewayRunning && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
              <span className="text-xs text-yellow-600 dark:text-yellow-400">{t('gatewayWarning')}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="text-xs text-destructive">{error}</span>
            </div>
          )}

          <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { label: t('stats.total'), value: safeJobs.length, icon: Clock, tone: 'primary' as const },
              { label: t('stats.active'), value: activeJobs.length, icon: Play, tone: 'green' as const },
              { label: t('stats.paused'), value: pausedJobs.length, icon: Pause, tone: 'yellow' as const },
              { label: t('stats.failed'), value: failedJobs.length, icon: XCircle, tone: 'red' as const },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div
                key={label}
                className="rounded-xl border border-border/60 bg-card/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xs text-muted-foreground">{label}</p>
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-md',
                      tone === 'primary' && SELECTABLE_ACTIVE,
                      tone === 'green' && SELECTABLE_ACTIVE,
                      tone === 'yellow' && 'bg-yellow-500/10 text-yellow-500',
                      tone === 'red' && 'bg-destructive/10 text-destructive',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {safeJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
              <div className={ACCENT_ICON_LG}>
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1 text-sm font-medium text-foreground">{t('empty.title')}</h3>
              <p className="mb-5 max-w-sm text-xs text-muted-foreground">{t('empty.description')}</p>
              <Button
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={() => {
                  setEditingJob(undefined);
                  setShowDialog(true);
                }}
                disabled={!isGatewayRunning}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('empty.create')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {safeJobs.map((job) => {
                const channelGroup = configuredChannels.find((group) => group.channelType === job.delivery?.channel);
                const account = channelGroup?.accounts.find((item) => item.accountId === job.delivery?.accountId);
                const deliveryAccountName = account ? getDeliveryAccountDisplayName(account, t) : undefined;
                return (
                  <CronJobCard
                    key={job.id}
                    job={job}
                    deliveryAccountName={deliveryAccountName}
                    onToggle={(enabled) => handleToggle(job.id, enabled)}
                    onEdit={() => {
                      setEditingJob(job);
                      setShowDialog(true);
                    }}
                    onDelete={() => setJobToDelete({ id: job.id })}
                    onTrigger={() => triggerJob(job.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      {showDialog && (
        <TaskDialog
          job={editingJob}
          configuredChannels={configuredChannels}
          onClose={() => {
            setShowDialog(false);
            setEditingJob(undefined);
          }}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={!!jobToDelete}
        title={t('common:actions.confirm')}
        message={t('card.deleteConfirm')}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (jobToDelete) {
            await deleteJob(jobToDelete.id);
            setJobToDelete(null);
            toast.success(t('toast.deleted'));
          }
        }}
        onCancel={() => setJobToDelete(null)}
      />
    </div>
  );
}

export default Cron;
