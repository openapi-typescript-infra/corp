import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

const MAX_LOG_LINES = 1200;
const MAX_VISIBLE_LOG_LINES = 400;
const SHUTDOWN_TIMEOUT_MS = 5_000;

type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';

interface ServiceDefinition {
  id: string;
  label: string;
  workspaceName: string;
  packageDir: string;
}

interface ServiceLogLine {
  id: number;
  serviceId: string;
  text: string;
  stream: 'stdout' | 'stderr' | 'meta';
  at: number;
}

interface ServiceState {
  definition: ServiceDefinition;
  status: ServiceStatus;
  pid: number | null;
  restarts: number;
  lastExitCode: number | null;
  lastExitSignal: NodeJS.Signals | null;
}

interface ServiceProcess {
  child: ReturnType<typeof spawn>;
  shutdownTimer: NodeJS.Timeout | null;
}

interface LocalRunnerAppProps {
  rootDir: string;
}

function getDescendantPids(pid: number): number[] {
  try {
    const output = execSync(`pgrep -P ${pid}`, { encoding: 'utf8' }).trim();
    if (!output) {
      return [];
    }

    const children = output
      .split('\n')
      .map((line) => parseInt(line, 10))
      .filter((n) => !isNaN(n));

    const descendants: number[] = [];
    for (const child of children) {
      descendants.push(child, ...getDescendantPids(child));
    }
    return descendants;
  } catch {
    return [];
  }
}

function signalProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (!pid) {
    return;
  }

  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }

  // Collect all descendant PIDs before sending signals, so we don't miss
  // any processes that might be reparented after the parent exits.
  const descendants = getDescendantPids(pid);

  // Signal the process group first
  try {
    process.kill(-pid, signal);
  } catch {
    // ignore
  }

  // Then signal each descendant individually in case any escaped the group
  for (const descendantPid of descendants) {
    try {
      process.kill(descendantPid, signal);
    } catch {
      // ignore — process may have already exited
    }
  }
}

function readServiceDefinitions(rootDir: string): ServiceDefinition[] {
  const servicesDir = path.join(rootDir, 'services');
  const entries = fs.readdirSync(servicesDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packageDir = path.join(servicesDir, entry.name);
      const packageJsonPath = path.join(packageDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
        name?: string;
      };

      return {
        id: entry.name,
        label: entry.name,
        workspaceName: packageJson.name ?? entry.name,
        packageDir,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function statusColor(status: ServiceStatus): string {
  switch (status) {
    case 'running':
      return 'green';
    case 'starting':
    case 'stopping':
      return 'yellow';
    case 'failed':
    case 'stopped':
      return 'red';
    default:
      return 'white';
  }
}

function formatStatus(status: ServiceStatus): string {
  return status.toUpperCase();
}

function fitText(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }

  if (text.length <= width) {
    return text.padEnd(width, ' ');
  }

  if (width <= 1) {
    return text.slice(0, width);
  }

  return `${text.slice(0, width - 1)}…`;
}

function parseLines(
  text: string,
  serviceId: string,
  stream: ServiceLogLine['stream'],
): ServiceLogLine[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      id: index,
      serviceId,
      text: line,
      stream,
      at: Date.now(),
    }));
}

export function LocalRunnerApp({ rootDir }: LocalRunnerAppProps) {
  const definitions = useMemo(() => readServiceDefinitions(rootDir), [rootDir]);
  const [services, setServices] = useState<ServiceState[]>(
    definitions.map((definition) => ({
      definition,
      status: 'stopped',
      pid: null,
      restarts: 0,
      lastExitCode: null,
      lastExitSignal: null,
    })),
  );
  const [logs, setLogs] = useState<ServiceLogLine[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isQuitting, setIsQuitting] = useState(false);
  const [fullscreenLogs, setFullscreenLogs] = useState(false);
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [termSize, setTermSize] = useState({
    cols: stdout?.columns ?? 100,
    rows: stdout?.rows ?? 30,
  });

  const processes = React.useRef(new Map<string, ServiceProcess>());
  const isQuittingRef = React.useRef(false);
  const logSequence = React.useRef(0);

  useEffect(() => {
    const onResize = () => {
      setTermSize({
        cols: stdout?.columns ?? 100,
        rows: stdout?.rows ?? 30,
      });
    };

    stdout?.on('resize', onResize);
    return () => {
      stdout?.off('resize', onResize);
    };
  }, [stdout]);

  useEffect(() => {
    return () => {
      for (const tracked of processes.current.values()) {
        if (tracked.shutdownTimer) {
          clearTimeout(tracked.shutdownTimer);
        }

        try {
          signalProcessTree(tracked.child, 'SIGKILL');
        } catch {
          // ignore teardown failures
        }
      }
    };
  }, [definitions]);

  const appendLogs = (nextLines: ServiceLogLine[]) => {
    if (nextLines.length === 0) {
      return;
    }

    setLogs((current) => {
      const merged = current.concat(
        nextLines.map((line) => ({
          ...line,
          id: ++logSequence.current,
        })),
      );
      if (merged.length <= MAX_LOG_LINES) {
        return merged;
      }

      return merged.slice(merged.length - MAX_LOG_LINES);
    });
  };

  const updateService = (serviceId: string, updater: (service: ServiceState) => ServiceState) => {
    setServices((current) =>
      current.map((service) => (service.definition.id === serviceId ? updater(service) : service)),
    );
  };

  const startService = (serviceId: string) => {
    const definition = definitions.find((entry) => entry.id === serviceId);
    if (!definition || processes.current.has(serviceId)) {
      return;
    }

    updateService(serviceId, (service) => ({
      ...service,
      status: 'starting',
      lastExitCode: null,
      lastExitSignal: null,
    }));

    appendLogs([
      {
        id: 0,
        serviceId,
        text: `Starting ${definition.workspaceName}`,
        stream: 'meta',
        at: Date.now(),
      },
    ]);

    const child = spawn('yarn', ['workspace', definition.workspaceName, 'start'], {
      cwd: rootDir,
      detached: process.platform !== 'win32',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const processState: ServiceProcess = {
      child,
      shutdownTimer: null,
    };
    processes.current.set(serviceId, processState);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string | Buffer) => {
      appendLogs(parseLines(String(chunk), serviceId, 'stdout'));
    });

    child.stderr?.on('data', (chunk: string | Buffer) => {
      appendLogs(parseLines(String(chunk), serviceId, 'stderr'));
    });

    child.on('spawn', () => {
      updateService(serviceId, (service) => ({
        ...service,
        status: 'running',
        pid: child.pid ?? null,
      }));
    });

    child.on('exit', (code, signal) => {
      const tracked = processes.current.get(serviceId);
      if (tracked?.shutdownTimer) {
        clearTimeout(tracked.shutdownTimer);
      }

      processes.current.delete(serviceId);

      const nextStatus: ServiceStatus =
        code === 0 || signal === 'SIGTERM' || signal === 'SIGINT' ? 'stopped' : 'failed';
      updateService(serviceId, (service) => ({
        ...service,
        status: nextStatus,
        pid: null,
        lastExitCode: code,
        lastExitSignal: signal,
      }));

      const exitSummary =
        code !== null ? `exited with code ${code}` : signal ? `terminated by ${signal}` : 'exited';

      appendLogs([
        {
          id: 0,
          serviceId,
          text: `${definition.workspaceName} ${exitSummary}`,
          stream: 'meta',
          at: Date.now(),
        },
      ]);

      if (isQuittingRef.current && processes.current.size === 0) {
        setImmediate(() => {
          exit();
          setTimeout(() => process.exit(0), 100);
        });
      }
    });

    child.on('error', (error) => {
      appendLogs([
        {
          id: 0,
          serviceId,
          text: `Failed to start ${definition.workspaceName}: ${error.message}`,
          stream: 'meta',
          at: Date.now(),
        },
      ]);

      updateService(serviceId, (service) => ({
        ...service,
        status: 'failed',
        pid: null,
      }));
      processes.current.delete(serviceId);
    });
  };

  const stopService = (serviceId: string, force = false) => {
    const tracked = processes.current.get(serviceId);
    if (!tracked) {
      updateService(serviceId, (service) => ({
        ...service,
        status: 'stopped',
        pid: null,
      }));
      return;
    }

    updateService(serviceId, (service) => ({
      ...service,
      status: 'stopping',
    }));

    appendLogs([
      {
        id: 0,
        serviceId,
        text: force ? 'Force stopping service' : 'Stopping service',
        stream: 'meta',
        at: Date.now(),
      },
    ]);

    if (tracked.shutdownTimer) {
      clearTimeout(tracked.shutdownTimer);
    }

    try {
      signalProcessTree(tracked.child, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      processes.current.delete(serviceId);
    }

    if (!force) {
      tracked.shutdownTimer = setTimeout(() => {
        const stillTracked = processes.current.get(serviceId);
        if (!stillTracked) {
          return;
        }

        appendLogs([
          {
            id: 0,
            serviceId,
            text: 'Shutdown timed out, sending SIGKILL',
            stream: 'meta',
            at: Date.now(),
          },
        ]);
        signalProcessTree(stillTracked.child, 'SIGKILL');
      }, SHUTDOWN_TIMEOUT_MS);
    }
  };

  const restartService = (serviceId: string) => {
    const tracked = processes.current.get(serviceId);
    updateService(serviceId, (service) => ({
      ...service,
      restarts: service.restarts + 1,
    }));

    if (!tracked) {
      startService(serviceId);
      return;
    }

    const child = tracked.child;
    child.once('exit', () => {
      startService(serviceId);
    });
    stopService(serviceId);
  };

  const startAllServices = () => {
    services.forEach((service) => {
      if (!processes.current.has(service.definition.id)) {
        startService(service.definition.id);
      }
    });
  };

  const stopAllServices = () => {
    services.forEach((service) => {
      if (processes.current.has(service.definition.id)) {
        stopService(service.definition.id);
      }
    });
  };

  const selectedService = selectedIndex === 0 ? null : services[selectedIndex - 1];

  const requestQuit = () => {
    if (isQuitting) {
      return;
    }

    const activeServices = services.filter((service) =>
      processes.current.has(service.definition.id),
    );
    if (activeServices.length === 0) {
      exit();
      setTimeout(() => process.exit(0), 100);
      return;
    }

    setIsQuitting(true);
    isQuittingRef.current = true;
    appendLogs([
      {
        id: 0,
        serviceId: 'runner',
        text: `Graceful shutdown requested. Waiting for ${activeServices.length} service${activeServices.length === 1 ? '' : 's'} to stop.`,
        stream: 'meta',
        at: Date.now(),
      },
    ]);
    stopAllServices();
  };

  const toggleSelectedService = () => {
    if (!selectedService) {
      const hasRunningServices = services.some((service) =>
        processes.current.has(service.definition.id),
      );
      if (hasRunningServices) {
        stopAllServices();
      } else {
        startAllServices();
      }
      return;
    }

    if (processes.current.has(selectedService.definition.id)) {
      stopService(selectedService.definition.id);
      return;
    }

    startService(selectedService.definition.id);
  };

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (input === 'q') {
      requestQuit();
      return;
    }

    if (isQuitting) {
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(services.length, current + 1));
      return;
    }

    if (key.return) {
      toggleSelectedService();
      return;
    }

    if (input === 'a') {
      startAllServices();
      return;
    }

    if (input === 'x') {
      stopAllServices();
      return;
    }

    if (input === 'r') {
      if (!selectedService) {
        services.forEach((service) => {
          restartService(service.definition.id);
        });
      } else {
        restartService(selectedService.definition.id);
      }
      return;
    }

    if (input === 'f') {
      setFullscreenLogs((current) => !current);
      return;
    }

    if (input === 'c') {
      setLogs([]);
      return;
    }

    if (/^[1-9]$/.test(input)) {
      const index = Number(input) - 1;
      const service = services[index];
      if (service) {
        setSelectedIndex(index + 1);
        if (processes.current.has(service.definition.id)) {
          stopService(service.definition.id);
        } else {
          startService(service.definition.id);
        }
      }
    }
  });

  const focusedServiceId = selectedService?.definition.id ?? null;
  const filteredLogs = focusedServiceId
    ? logs.filter((line) => line.serviceId === focusedServiceId)
    : logs;
  const visibleLogs = filteredLogs.slice(-MAX_VISIBLE_LOG_LINES);

  const runningCount = services.filter((service) => service.status === 'running').length;
  const failedCount = services.filter((service) => service.status === 'failed').length;
  const activeCount = services.filter((service) =>
    processes.current.has(service.definition.id),
  ).length;

  const listWidth = Math.min(44, Math.max(32, Math.floor(termSize.cols * 0.34)));
  const logWidth = fullscreenLogs ? termSize.cols : Math.max(20, termSize.cols - listWidth - 3);
  const bodyHeight = fullscreenLogs
    ? Math.max(8, termSize.rows - 3)
    : Math.max(8, termSize.rows - 7);

  if (fullscreenLogs) {
    return (
      <Box flexDirection="column" width={termSize.cols} height={termSize.rows}>
        <Box height={bodyHeight} flexDirection="column">
          {visibleLogs.length === 0 ? (
            <Text color="white">No log output yet.</Text>
          ) : (
            visibleLogs.map((line) => {
              const prefixColor =
                line.stream === 'stderr' ? 'red' : line.stream === 'meta' ? 'yellow' : 'green';
              const serviceLabel = fitText(line.serviceId, 18);

              return (
                <Text key={line.id}>
                  <Text color={prefixColor}>{serviceLabel}</Text>
                  <Text color="white"> | </Text>
                  <Text>{fitText(line.text, logWidth - 22)}</Text>
                </Text>
              );
            })
          )}
        </Box>

        <Box borderStyle="round" paddingX={1}>
          <Text>
            <Text color="cyan">Fullscreen Logs</Text>
            <Text color="white"> F exit fullscreen, C clear logs, Q graceful quit</Text>
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={termSize.cols} height={termSize.rows}>
      <Box borderStyle="round" paddingX={1} flexDirection="column">
        <Text bold color="cyan">
          Just Tell Me Service Runner
        </Text>
        <Text color="white">
          Use up/down to focus logs. The top Services row shows all logs and controls all services
          at once.
        </Text>
        {isQuitting && (
          <Text bold color="yellow">
            Shutdown requested. Stopping services before exit...
          </Text>
        )}
      </Box>

      <Box height={bodyHeight} marginTop={1}>
        <Box width={listWidth} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold inverse={selectedIndex === 0}>
            <Text color="cyan">Services</Text>
            <Text color="white">{` ${activeCount > 0 ? 'ACTIVE' : 'IDLE'} ${runningCount}/${services.length} up`}</Text>
          </Text>
          {services.map((service, index) => {
            const selected = index + 1 === selectedIndex;
            const shortcut = index < 9 ? String(index + 1) : ' ';
            const linePrefix = selected ? '>' : ' ';
            const pidSuffix = service.pid ? ` pid:${service.pid}` : '';
            const restartSuffix = service.restarts > 0 ? ` r:${service.restarts}` : '';
            const extra = `${pidSuffix}${restartSuffix}`;
            const availableWidth = Math.max(8, listWidth - 18 - extra.length);

            return (
              <Text key={service.definition.id} inverse={selected}>
                <Text color="white">{linePrefix}</Text>
                <Text color="cyan">[{shortcut}]</Text>{' '}
                <Text>{fitText(service.definition.label, availableWidth)}</Text>{' '}
                <Text color={statusColor(service.status)}>{formatStatus(service.status)}</Text>
                <Text color="white">{extra}</Text>
              </Text>
            );
          })}
        </Box>

        <Box
          width={logWidth}
          marginLeft={1}
          flexDirection="column"
          borderStyle="round"
          paddingX={1}>
          <Text bold>Logs {focusedServiceId ? `(${focusedServiceId})` : '(all services)'}</Text>
          {visibleLogs.length === 0 ? (
            <Text color="white">No log output yet.</Text>
          ) : (
            visibleLogs.map((line) => {
              const prefixColor =
                line.stream === 'stderr' ? 'red' : line.stream === 'meta' ? 'yellow' : 'green';
              const serviceLabel = fitText(line.serviceId, 18);

              return (
                <Text key={line.id}>
                  <Text color={prefixColor}>{serviceLabel}</Text>
                  <Text color="white"> | </Text>
                  <Text>{fitText(line.text, logWidth - 24)}</Text>
                </Text>
              );
            })
          )}
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" paddingX={1} flexDirection="column">
        <Text>
          <Text color="cyan">Controls</Text>
        </Text>
        <Text color="white">
          [Enter] - Start/Stop | [R] - Restart | [F] - Fullscreen Logs | [C] - Clear Logs | [Q] -
          Graceful Quit | [A] - Start All | [X] - Stop All
        </Text>
        <Text color="white">
          {isQuitting
            ? `Shutdown in progress. Waiting for ${activeCount} service${activeCount === 1 ? '' : 's'} to exit.`
            : `${runningCount} running, ${failedCount} failed, ${services.length} total`}
        </Text>
      </Box>
    </Box>
  );
}
