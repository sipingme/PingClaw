/**
 * Setup Wizard Page
 * First-time setup experience for new users
 */
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Terminal,
  Sparkles,
  Puzzle,
  Monitor,
  Lightbulb,
  Info,
  CircleCheck,
} from 'lucide-react';
import { TitleBar } from '@/components/layout/TitleBar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ACCENT_ICON_SM, SELECTABLE_ACTIVE, segmentButtonClass } from '@/lib/ui-patterns';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { toast } from 'sonner';
import { invokeIpc } from '@/lib/api-client';
import { hostApiFetch } from '@/lib/host-api';

interface SetupStep {
  id: string;
  title: string;
  description: string;
}

const STEP = {
  WELCOME: 0,
  RUNTIME: 1,
  INSTALLING: 2,
  COMPLETE: 3,
} as const;

const getSteps = (t: TFunction): SetupStep[] => [
  {
    id: 'welcome',
    title: t('steps.welcome.title'),
    description: t('steps.welcome.description'),
  },
  {
    id: 'runtime',
    title: t('steps.runtime.title'),
    description: t('steps.runtime.description'),
  },
  {
    id: 'installing',
    title: t('steps.installing.title'),
    description: t('steps.installing.description'),
  },
  {
    id: 'complete',
    title: t('steps.complete.title'),
    description: t('steps.complete.description'),
  },
];

// Default skills to auto-install (no additional API keys required)
interface DefaultSkill {
  id: string;
  name: string;
  description: string;
}

const getDefaultSkills = (t: TFunction): DefaultSkill[] => [
  { id: 'opencode', name: t('defaultSkills.opencode.name'), description: t('defaultSkills.opencode.description') },
  { id: 'python-env', name: t('defaultSkills.python-env.name'), description: t('defaultSkills.python-env.description') },
  { id: 'code-assist', name: t('defaultSkills.code-assist.name'), description: t('defaultSkills.code-assist.description') },
  { id: 'file-tools', name: t('defaultSkills.file-tools.name'), description: t('defaultSkills.file-tools.description') },
  { id: 'terminal', name: t('defaultSkills.terminal.name'), description: t('defaultSkills.terminal.description') },
];

import { PingClawLogo } from '@/components/PingClawLogo';

function SetupHint({
  children,
  variant = 'info',
  icon,
  className,
}: {
  children: React.ReactNode;
  variant?: 'info' | 'warn' | 'success';
  icon?: React.ReactNode;
  className?: string;
}) {
  const Icon = variant === 'warn' ? AlertCircle : variant === 'success' ? CircleCheck : Lightbulb;
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border px-4 py-3 text-left text-sm leading-relaxed',
        variant === 'info' && 'border-primary/25 bg-primary/5 text-foreground/85',
        variant === 'warn' && 'border-yellow-500/30 bg-yellow-500/5 text-foreground/85',
        variant === 'success' && 'border-primary/25 bg-primary/5 text-foreground/85',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0',
          variant === 'warn' ? 'text-yellow-500/90' : variant === 'success' ? 'text-primary' : 'text-primary',
        )}
      >
        {icon ?? <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

// NOTE: Channel types moved to Settings > Channels page
// NOTE: Skill bundles moved to Settings > Skills page - auto-install essential skills during setup

export function Setup() {
  const { t } = useTranslation(['setup', 'channels']);
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<number>(STEP.WELCOME);

  // Setup state
  // Installation state for the Installing step
  const [installedSkills, setInstalledSkills] = useState<string[]>([]);
  // Runtime check status
  const [runtimeChecksPassed, setRuntimeChecksPassed] = useState(false);

  const steps = getSteps(t);
  const safeStepIndex = Number.isInteger(currentStep)
    ? Math.min(Math.max(currentStep, STEP.WELCOME), steps.length - 1)
    : STEP.WELCOME;
  const step = steps[safeStepIndex] ?? steps[STEP.WELCOME];
  const isFirstStep = safeStepIndex === STEP.WELCOME;
  const isLastStep = safeStepIndex === steps.length - 1;

  const markSetupComplete = useSettingsStore((state) => state.markSetupComplete);

  // Derive canProceed based on current step - computed directly to avoid useEffect
  const canProceed = useMemo(() => {
    switch (safeStepIndex) {
      case STEP.WELCOME:
        return true;
      case STEP.RUNTIME:
        return runtimeChecksPassed;
      case STEP.INSTALLING:
        return false; // Cannot manually proceed, auto-proceeds when done
      case STEP.COMPLETE:
        return true;
      default:
        return true;
    }
  }, [safeStepIndex, runtimeChecksPassed]);

  const handleNext = async () => {
    if (isLastStep) {
      // Complete setup
      markSetupComplete();
      toast.success(t('complete.title'));
      navigate('/');
    } else {
      setCurrentStep((i) => i + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((i) => Math.max(i - 1, 0));
  };

  const handleSkip = () => {
    markSetupComplete();
    navigate('/');
  };

  // Auto-proceed when installation is complete
  const handleInstallationComplete = useCallback((skills: string[]) => {
    setInstalledSkills(skills);
    // Auto-proceed to next step after a short delay
    setTimeout(() => {
      setCurrentStep((i) => i + 1);
    }, 1000);
  }, []);


  return (
    <div data-testid="setup-page" className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="relative flex-1 overflow-auto bg-grid bg-vignette">
        {/* Progress Indicator */}
        <div className="flex justify-center px-4 pt-8">
          <div className="flex w-full max-w-xl items-start">
            {steps.map((s, i) => (
              <Fragment key={s.id}>
                {i > 0 && (
                  <div
                    className={cn(
                      'mt-4 h-0.5 flex-1 transition-colors',
                      i - 1 < safeStepIndex ? 'bg-primary' : 'bg-border',
                    )}
                    aria-hidden="true"
                  />
                )}
                <div className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors',
                      i < safeStepIndex
                        ? 'border-primary bg-primary text-primary-foreground'
                        : i === safeStepIndex
                          ? cn('border-primary', SELECTABLE_ACTIVE)
                          : 'border-muted-foreground/30 text-muted-foreground',
                    )}
                  >
                    {i < safeStepIndex ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-sm font-medium">{i + 1}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'w-full text-center text-xs leading-tight',
                      i === safeStepIndex
                        ? 'font-medium text-primary'
                        : i < safeStepIndex
                          ? 'text-foreground/70'
                          : 'text-muted-foreground',
                    )}
                  >
                    {t(`steps.${s.id}.label`)}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mx-auto max-w-[46.2rem] p-8"
          >
            <div className="mb-8 text-center">
              <h1 className="mb-2 text-2xl font-semibold tracking-tight">{t(`steps.${step.id}.title`)}</h1>
              <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">{t(`steps.${step.id}.description`)}</p>
            </div>

            {/* Step-specific content */}
            <div className="relative rounded-xl border border-border/60 bg-card/80 text-card-foreground shadow-sm backdrop-blur-sm p-8 mb-[22px]">
              {safeStepIndex === STEP.WELCOME && <WelcomeContent />}
              {safeStepIndex === STEP.WELCOME && (
                <SetupLanguageToggle className="absolute right-6 top-6 z-10" />
              )}
              {safeStepIndex === STEP.RUNTIME && <RuntimeContent onStatusChange={setRuntimeChecksPassed} />}
              {safeStepIndex === STEP.INSTALLING && (
                <InstallingContent
                  skills={getDefaultSkills(t)}
                  onComplete={handleInstallationComplete}
                  onSkip={() => setCurrentStep((i) => i + 1)}
                />
              )}
              {safeStepIndex === STEP.COMPLETE && (
                <CompleteContent
                  installedSkills={installedSkills}
                />
              )}
            </div>

            {/* Navigation - hidden during installation step */}
            {safeStepIndex !== STEP.INSTALLING && (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div>
                    {!isFirstStep && (
                      <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={handleBack}>
                        <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
                        {t('nav.back')}
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!isLastStep && safeStepIndex !== STEP.RUNTIME && (
                      <Button
                        data-testid="setup-skip-button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={handleSkip}
                      >
                        {t('nav.skipSetup')}
                      </Button>
                    )}
                    <Button
                      data-testid="setup-next-button"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={handleNext}
                      disabled={!canProceed}
                    >
                      {isLastStep ? (
                        t('nav.getStarted')
                      ) : (
                        <>
                          {t('nav.next')}
                          <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {safeStepIndex === STEP.RUNTIME && !canProceed && (
                  <div className="!mt-8">
                    <SetupHint variant="warn" className="gap-2 px-3 py-2.5 text-xs leading-relaxed">
                      <p>{t('runtime.blockedHint')}</p>
                    </SetupHint>
                  </div>
                )}
                {safeStepIndex === STEP.WELCOME && (
                  <div className="!mt-8">
                    <SetupHint variant="warn" className="gap-2 px-3 py-2.5 text-xs leading-relaxed">
                      <p className="font-medium text-foreground/90">{t('nav.skipSetupHintTitle')}</p>
                      <ul className="mt-1 space-y-1 text-2xs text-muted-foreground">
                        {(t('nav.skipSetupHintItems', { returnObjects: true }) as string[]).map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="shrink-0 text-yellow-500/80">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </SetupHint>
                  </div>
                )}
                {isLastStep && (
                  <p className="text-center text-xs text-muted-foreground">{t('nav.completeHint')}</p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ==================== Step Content Components ====================

function SetupLanguageToggle({ className }: { className?: string }) {
  const { t } = useTranslation('setup');
  const { language, setLanguage } = useSettingsStore();

  return (
    <div
      className={cn('relative flex rounded-md border border-border/50 bg-card/40 p-0.5', className)}
      role="radiogroup"
      aria-label={t('welcome.language')}
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const selected = language === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`setup-language-${lang.code}`}
            onClick={() => setLanguage(lang.code)}
            className={segmentButtonClass(selected)}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}

function WelcomeContent() {
  const { t } = useTranslation('setup');

  const features = [
    { key: 'noCommand', icon: Terminal },
    { key: 'modernUI', icon: Sparkles },
    { key: 'bundles', icon: Puzzle },
    { key: 'crossPlatform', icon: Monitor },
  ] as const;

  return (
    <div data-testid="setup-welcome-step" className="space-y-8">
      <div className="relative text-center">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-32 -translate-y-1/2 bg-primary/10 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" aria-hidden="true" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/25 bg-card/70 shadow-[0_0_40px_-12px_hsl(var(--primary)/0.55)]">
            <PingClawLogo className="h-12 w-12" />
          </div>
        </div>

        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Ping<span className="text-primary">Claw</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {t('welcome.tagline')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {features.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/30 px-4 py-3 text-left"
          >
            <div className={ACCENT_ICON_SM}>
              <Icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <p className="pt-1.5 text-sm font-medium leading-snug text-foreground/85">
              {t(`welcome.features.${key}`)}
            </p>
          </div>
        ))}
      </div>

      <SetupHint>
        <p className="font-medium text-foreground/90">{t('welcome.nextAction')}</p>
        <p className="text-muted-foreground">{t('welcome.nextHint')}</p>
      </SetupHint>
    </div>
  );
}

interface RuntimeContentProps {
  onStatusChange: (canProceed: boolean) => void;
}

function RuntimeContent({ onStatusChange }: RuntimeContentProps) {
  const { t } = useTranslation('setup');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const startGateway = useGatewayStore((state) => state.start);

  const [checks, setChecks] = useState({
    nodejs: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
    openclaw: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
    gateway: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
  });
  const [showLogs, setShowLogs] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [openclawDir, setOpenclawDir] = useState('');
  const gatewayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const runChecks = useCallback(async () => {
    // Reset checks
    setChecks({
      nodejs: { status: 'checking', message: '' },
      openclaw: { status: 'checking', message: '' },
      gateway: { status: 'checking', message: '' },
    });

    // Check Node.js — always available in Electron
    setChecks((prev) => ({
      ...prev,
      nodejs: { status: 'success', message: t('runtime.status.success') },
    }));

    // Check OpenClaw package status
    try {
      const openclawStatus = await invokeIpc('openclaw:status') as {
        packageExists: boolean;
        isBuilt: boolean;
        dir: string;
        version?: string;
      };

      setOpenclawDir(openclawStatus.dir);

      if (!openclawStatus.packageExists) {
        setChecks((prev) => ({
          ...prev,
          openclaw: {
            status: 'error',
            message: t('runtime.status.packageNotFound', { dir: openclawStatus.dir }),
          },
        }));
      } else if (!openclawStatus.isBuilt) {
        setChecks((prev) => ({
          ...prev,
          openclaw: {
            status: 'error',
            message: t('runtime.status.packageNotBuilt'),
          },
        }));
      } else {
        const versionLabel = openclawStatus.version ? ` v${openclawStatus.version}` : '';
        setChecks((prev) => ({
          ...prev,
          openclaw: {
            status: 'success',
            message: t('runtime.status.packageReady', { version: versionLabel }),
          },
        }));
      }
    } catch (error) {
      setChecks((prev) => ({
        ...prev,
        openclaw: { status: 'error', message: t('runtime.status.checkFailed', { error: String(error) }) },
      }));
    }

    // Check Gateway — read directly from store to avoid stale closure
    // Don't immediately report error; gateway may still be initializing
    const currentGateway = useGatewayStore.getState().status;
    if (currentGateway.state === 'running') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'success', message: t('runtime.status.gatewayRunning', { port: currentGateway.port }) },
      }));
    } else if (currentGateway.state === 'error') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'error', message: currentGateway.error || t('runtime.status.error') },
      }));
    } else {
      // Gateway is 'stopped', 'starting', or 'reconnecting'
      // Keep as 'checking' — the dedicated useEffect will update when status changes
      setChecks((prev) => ({
        ...prev,
        gateway: {
          status: 'checking',
          message: currentGateway.state === 'starting'
            ? t('runtime.status.starting')
            : t('runtime.status.waitingGateway'),
        },
      }));
    }
  }, [t]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // Update canProceed when gateway status changes
  useEffect(() => {
    const allPassed = checks.nodejs.status === 'success'
      && checks.openclaw.status === 'success'
      && (checks.gateway.status === 'success' || gatewayStatus.state === 'running');
    onStatusChange(allPassed);
  }, [checks, gatewayStatus, onStatusChange]);

  // Update gateway check when gateway status changes
  useEffect(() => {
    if (gatewayStatus.state === 'running') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'success', message: t('runtime.status.gatewayRunning', { port: gatewayStatus.port }) },
      }));
    } else if (gatewayStatus.state === 'error') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'error', message: gatewayStatus.error || t('runtime.status.startFailed') },
      }));
    } else if (gatewayStatus.state === 'starting' || gatewayStatus.state === 'reconnecting') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'checking', message: t('runtime.status.starting') },
      }));
    }
    // 'stopped' state: keep current check status (likely 'checking') to allow startup time
  }, [gatewayStatus, t]);

  // Gateway startup timeout — show error only after giving enough time to initialize
  useEffect(() => {
    if (gatewayTimeoutRef.current) {
      clearTimeout(gatewayTimeoutRef.current);
      gatewayTimeoutRef.current = null;
    }

    // If gateway is already in a terminal state, no timeout needed
    if (gatewayStatus.state === 'running' || gatewayStatus.state === 'error') {
      return;
    }

    // Set timeout for non-terminal states (stopped, starting, reconnecting)
    gatewayTimeoutRef.current = setTimeout(() => {
      setChecks((prev) => {
        if (prev.gateway.status === 'checking') {
          return {
            ...prev,
            gateway: { status: 'error', message: t('runtime.status.gatewayTimeout') },
          };
        }
        return prev;
      });
    }, 600 * 1000); // 600 seconds — enough for gateway to fully initialize

    return () => {
      if (gatewayTimeoutRef.current) {
        clearTimeout(gatewayTimeoutRef.current);
        gatewayTimeoutRef.current = null;
      }
    };
  }, [gatewayStatus.state, t]);

  const handleStartGateway = async () => {
    setChecks((prev) => ({
      ...prev,
      gateway: { status: 'checking', message: t('runtime.status.starting') },
    }));
    await startGateway();
  };

  const handleShowLogs = async () => {
    try {
      const logs = await hostApiFetch<{ content: string }>('/api/logs?tailLines=100');
      setLogContent(logs.content);
      setShowLogs(true);
    } catch {
      setLogContent(t('runtime.logs.loadFailed'));
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

  const ERROR_TRUNCATE_LEN = 30;
  const gatewayWaiting = checks.gateway.status === 'checking';

  const renderStatus = (status: 'checking' | 'success' | 'error', message: string) => {
    if (status === 'checking') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-yellow-400 whitespace-nowrap">
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
          {message || t('runtime.status.checking')}
        </span>
      );
    }
    if (status === 'success') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-primary whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
          {message}
        </span>
      );
    }

    const isLong = message.length > ERROR_TRUNCATE_LEN;
    const displayMsg = isLong ? message.slice(0, ERROR_TRUNCATE_LEN) : message;

    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400 whitespace-nowrap">
        <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{displayMsg}</span>
        {isLong && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-pointer text-red-300 hover:text-red-200 font-medium">...</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm whitespace-normal break-words text-xs">
              {message}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={handleShowLogs}>
          {t('runtime.viewLogs')}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={runChecks}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          {t('runtime.recheck')}
        </Button>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-muted/50 p-2.5">
          <div className="min-w-0 text-left">
            <span className="text-xs font-medium">{t('runtime.nodejs')}</span>
            <p className="mt-0.5 text-2xs text-muted-foreground">{t('runtime.nodejsHint')}</p>
          </div>
          <div className="flex justify-end">
            {renderStatus(checks.nodejs.status, checks.nodejs.message)}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-muted/50 p-2.5">
          <div className="min-w-0 text-left">
            <span className="text-xs font-medium">{t('runtime.openclaw')}</span>
            <p className="mt-0.5 text-2xs text-muted-foreground">{t('runtime.openclawHint')}</p>
            {openclawDir && (
              <p className="mt-1 font-mono text-2xs text-muted-foreground/80 break-all">
                {openclawDir}
              </p>
            )}
          </div>
          <div className="flex justify-end self-start">
            {renderStatus(checks.openclaw.status, checks.openclaw.message)}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-muted/50 p-2.5">
          <div className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium">{t('runtime.gateway')}</span>
              {checks.gateway.status === 'error' && (
                <Button variant="outline" size="sm" className="h-6 px-2 text-2xs" onClick={handleStartGateway}>
                  {t('runtime.startGateway')}
                </Button>
              )}
            </div>
            <p className="mt-0.5 text-2xs text-muted-foreground">{t('runtime.gatewayHint')}</p>
          </div>
          <div className="flex justify-end self-start">
            {renderStatus(checks.gateway.status, checks.gateway.message)}
          </div>
        </div>
      </div>

      {gatewayWaiting && (
        <SetupHint variant="info" className="gap-2 px-3 py-2.5 text-xs leading-relaxed" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>
          <p>{t('runtime.waitingHint')}</p>
        </SetupHint>
      )}

      {checks.gateway.status === 'error' && (
        <SetupHint variant="warn" className="gap-2 px-3 py-2.5 text-xs leading-relaxed">
          <p className="font-medium">{t('runtime.gatewayErrorHint')}</p>
          <p className="text-2xs text-muted-foreground">{t('runtime.gatewayErrorAction')}</p>
        </SetupHint>
      )}

      {(checks.nodejs.status === 'error' || checks.openclaw.status === 'error') && (
        <div className="rounded-lg border border-red-500/20 bg-red-900/20 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <p className="text-xs font-medium text-red-400">{t('runtime.issue.title')}</p>
              <p className="mt-1 text-2xs text-muted-foreground">
                {t('runtime.issue.desc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Log viewer panel */}
      {showLogs && (
        <div className="mt-4 p-4 rounded-lg bg-black/40 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-foreground text-sm">{t('runtime.logs.title')}</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleOpenLogDir}>
                <ExternalLink className="h-3 w-3 mr-1" />
                {t('runtime.logs.openFolder')}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowLogs(false)}>
                {t('runtime.logs.close')}
              </Button>
            </div>
          </div>
          <pre className="text-xs text-slate-300 bg-black/50 p-3 rounded max-h-60 overflow-auto whitespace-pre-wrap font-mono">
            {logContent || t('runtime.logs.noLogs')}
          </pre>
        </div>
      )}
    </div>
  );
}

// NOTE: ProviderContent component removed - configure providers via Settings > AI Providers


// Installation status for each skill
type InstallStatus = 'pending' | 'installing' | 'completed' | 'failed';

interface SkillInstallState {
  id: string;
  name: string;
  description: string;
  status: InstallStatus;
}

interface InstallingContentProps {
  skills: DefaultSkill[];
  onComplete: (installedSkills: string[]) => void;
  onSkip: () => void;
}

function InstallingContent({ skills, onComplete, onSkip }: InstallingContentProps) {
  const { t } = useTranslation('setup');
  const [skillStates, setSkillStates] = useState<SkillInstallState[]>(
    skills.map((s) => ({ ...s, status: 'pending' as InstallStatus }))
  );
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const installStarted = useRef(false);

  // Real installation process
  useEffect(() => {
    if (installStarted.current) return;
    installStarted.current = true;

    const runRealInstall = async () => {
      try {
        // Step 1: Initialize all skills to 'installing' state for UI
        setSkillStates(prev => prev.map(s => ({ ...s, status: 'installing' })));
        setOverallProgress(10);

        // Step 2: Call the backend to install uv and setup Python
        const result = await invokeIpc('uv:install-all') as {
          success: boolean;
          error?: string
        };

        if (result.success) {
          setSkillStates(prev => prev.map(s => ({ ...s, status: 'completed' })));
          setOverallProgress(100);

          await new Promise((resolve) => setTimeout(resolve, 800));
          onComplete(skills.map(s => s.id));
        } else {
          setSkillStates(prev => prev.map(s => ({ ...s, status: 'failed' })));
          setErrorMessage(result.error || t('installing.unknownError'));
          toast.error(t('installing.toastFailed'));
        }
      } catch (err) {
        setSkillStates(prev => prev.map(s => ({ ...s, status: 'failed' })));
        setErrorMessage(String(err));
        toast.error(t('installing.toastError'));
      }
    };

    runRealInstall();
  }, [skills, onComplete, t]);

  const getStatusIcon = (status: InstallStatus) => {
    switch (status) {
      case 'pending':
        return <div className="h-5 w-5 rounded-full border-2 border-slate-500" />;
      case 'installing':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-400" />;
    }
  };

  const getStatusText = (skill: SkillInstallState) => {
    switch (skill.status) {
      case 'pending':
        return <span className="text-muted-foreground">{t('installing.status.pending')}</span>;
      case 'installing':
        return <span className="text-primary">{t('installing.status.installing')}</span>;
      case 'completed':
        return <span className="text-primary">{t('installing.status.installed')}</span>;
      case 'failed':
        return <span className="text-red-400">{t('installing.status.failed')}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <SetupHint icon={<Info className="h-4 w-4" />}>
        <p className="font-medium text-foreground/90">{t('installing.subtitle')}</p>
        <p className="text-muted-foreground">{t('installing.autoAdvanceHint')}</p>
      </SetupHint>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('installing.progress')}</span>
          <span className="text-primary">{overallProgress}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Skill list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {skillStates.map((skill) => (
          <motion.div
            key={skill.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg',
              skill.status === 'installing' ? 'bg-muted' : 'bg-muted/50'
            )}
          >
            <div className="flex items-center gap-3">
              {getStatusIcon(skill.status)}
              <div>
                <p className="font-medium">{skill.name}</p>
                <p className="text-xs text-muted-foreground">{skill.description}</p>
              </div>
            </div>
            {getStatusText(skill)}
          </motion.div>
        ))}
      </div>

      {/* Error Message Display */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-lg bg-red-900/30 border border-red-500/50 text-red-200 text-sm"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">{t('installing.error')}</p>
              <pre className="text-xs bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap font-monospace">
                {errorMessage}
              </pre>
              <Button
                variant="link"
                className="text-red-400 p-0 h-auto text-xs underline"
                onClick={() => window.location.reload()}
              >
                {t('installing.restart')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {!errorMessage && (
        <p className="text-center text-sm text-muted-foreground">
          {t('installing.wait')}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-muted-foreground/70">{t('installing.skipHint')}</p>
        <Button
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          onClick={onSkip}
        >
          {t('installing.skip')}
        </Button>
      </div>
    </div>
  );
}
interface CompleteContentProps {
  installedSkills: string[];
}

function CompleteContent({ installedSkills }: CompleteContentProps) {
  const { t } = useTranslation(['setup', 'settings']);
  const gatewayStatus = useGatewayStore((state) => state.status);

  const installedSkillNames = getDefaultSkills(t)
    .filter((s: DefaultSkill) => installedSkills.includes(s.id))
    .map((s: DefaultSkill) => s.name)
    .join(', ');

  const gatewayLabel = (() => {
    if (gatewayStatus.state === 'running') {
      return gatewayStatus.gatewayReady !== false
        ? t('complete.running')
        : t('complete.starting');
    }
    if (gatewayStatus.state === 'stopped') {
      return t('complete.gatewayStopped');
    }
    return gatewayStatus.state;
  })();

  const nextSteps = t('complete.nextSteps', { returnObjects: true }) as string[];

  return (
    <div className="space-y-6 text-center">
      <SetupHint variant="success">
        <p className="font-medium text-foreground/90">{t('complete.subtitle')}</p>
      </SetupHint>

      <div className="mx-auto max-w-md space-y-3 text-left">
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <span className="text-sm text-muted-foreground">{t('complete.components')}</span>
          <span className="text-sm font-medium text-primary">
            {installedSkillNames || t('complete.componentsFallback', { count: installedSkills.length })}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <span className="text-sm text-muted-foreground">{t('complete.gateway')}</span>
          <span className={cn(
            'text-sm font-medium',
            gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false
              ? 'text-primary'
              : gatewayStatus.state === 'running'
                ? 'text-yellow-400'
                : 'text-muted-foreground',
          )}>
            {gatewayLabel}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-md rounded-xl border border-border/50 bg-card/30 px-4 py-4 text-left">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('complete.nextStepsTitle')}
        </p>
        <ol className="space-y-2.5">
          {Array.isArray(nextSteps) && nextSteps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-snug text-foreground/85">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default Setup;
