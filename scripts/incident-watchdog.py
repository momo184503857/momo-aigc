#!/usr/bin/env python3
"""Independent, read-only localhost probes and bounded local incident evidence (stdlib only)."""
import argparse
import collections
import concurrent.futures
import datetime as dt
import fcntl
import json
import math
import os
from pathlib import Path
import re
import signal
import socket
import time
import uuid

MAX_HTTP_BYTES = 65536
MAX_LOG_BYTES = 2 * 1024 * 1024
MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
SAFE_EVENTS = {'request_start', 'request_end', 'operation_start', 'operation_end', 'metrics', 'database_slow', 'diagnostics_start'}
SAFE_ERROR_CODES = {'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENOSPC', 'EACCES', 'EROFS', 'SQLITE_BUSY', 'SQLITE_LOCKED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'AbortError', 'TimeoutError', 'operation_error'}


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds')


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def sanitize_app(entry, depth=0):
    """Explicit schema; never copy arbitrary response/log fields or exception strings."""
    if not isinstance(entry, dict) or not isinstance(entry.get('event'), str) or entry['event'] not in SAFE_EVENTS:
        return None
    out = {'event': entry['event']}
    for key in ('pid', 'elapsedMs', 'status', 'httpStatus', 'bytes', 'requestCount', 'operationCount', 'sampleElapsedMs', 'cpuPercent', 'rssBytes', 'heapUsedBytes', 'eventLoopMaxMs', 'eventLoopUtilization', 'droppedLogs', 'uptimeSeconds'):
        if numeric(entry.get(key)):
            out[key] = entry[key]
    for key in ('slow', 'failed', 'disconnected'):
        if isinstance(entry.get(key), bool):
            out[key] = entry[key]
    for key in ('requestId', 'operationId'):
        if isinstance(entry.get(key), str) and re.fullmatch(r'[a-f0-9-]{36}', entry[key]):
            out[key] = entry[key]
    if isinstance(entry.get('timestamp'), str) and re.fullmatch(r'[0-9T:.+Z-]{20,40}', entry['timestamp']):
        out['timestamp'] = entry['timestamp']
    if isinstance(entry.get('method'), str) and entry['method'] in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'}:
        out['method'] = entry['method']
    if isinstance(entry.get('phase'), str) and entry['phase'] in {'submit', 'poll', 'result_import', 'image_proxy', 'upstream_headers'}:
        out['phase'] = entry['phase']
    if isinstance(entry.get('taskNo'), str) and re.fullmatch(r'gen-\d{12,20}', entry['taskNo']):
        out['taskNo'] = entry['taskNo']
    if numeric(entry.get('providerId')):
        out['providerId'] = entry['providerId']
    if isinstance(entry.get('errorKind'), str) and entry['errorKind'] in SAFE_ERROR_CODES:
        out['errorKind'] = entry['errorKind']
    if isinstance(entry.get('outcome'), str) and entry['outcome'] in {'ok', 'error'}:
        out['outcome'] = entry['outcome']
    if isinstance(entry.get('fingerprint'), str) and re.fullmatch(r'[a-f0-9]{16}', entry['fingerprint']):
        out['fingerprint'] = entry['fingerprint']
    if isinstance(entry.get('operation'), str) and entry['operation'] in {'run', 'get', 'all'}:
        out['operation'] = entry['operation']
    # Routes consist exclusively of fixed public endpoint names and placeholders.
    parts = {'api', 'other', ':value', 'auth', 'me', 'oss', 'templates', 'tasks', 'generations', 'models', 'prompts', 'admin', 'toolbox', 'feature-prompts', 'proxy', 'toapis', 'points', 'canvas', 'canvas-ai', 'photography', 'buyer-show', 'buyer-show-batch', 'files', 'thumbnails', 'status', 'summary', 'reimport', 'image', 'catalog', 'stats', 'daily', 'activity', 'users', 'login', 'register'}
    route = entry.get('route')
    if isinstance(route, str) and len(route) < 180 and all(p in parts for p in route.split('/') if p):
        out['route'] = route
    for key in ('trackedRequests', 'trackedOperations'):
        if depth == 0 and isinstance(entry.get(key), list):
            rows = []
            for row in entry[key][:24]:
                if isinstance(row, dict):
                    safe = sanitize_app({**row, 'event': 'operation_start' if key == 'trackedOperations' else 'request_start'}, depth=1)
                    safe.pop('event', None)
                    if isinstance(row.get('id'), str) and re.fullmatch(r'[a-f0-9-]{36}', row['id']):
                        safe['id'] = row['id']
                    rows.append(safe)
            out[key] = rows
    return out


def probe(port, endpoint, token, timeout=2):
    """One total monotonic deadline (including headers/body); bounded Content-Length JSON."""
    started = time.monotonic()
    deadline = started + timeout
    result = {'ok': False, 'reason': 'probe_error'}
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=timeout) as sock:
            sock.settimeout(max(0.001, deadline - time.monotonic()))
            sock.sendall((f'GET {endpoint} HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Monitor-Token: {token}\r\nConnection: close\r\n\r\n').encode('ascii'))
            data = bytearray()
            body_at = None
            length = None
            status = None
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError()
                sock.settimeout(remaining)
                chunk = sock.recv(min(8192, MAX_HTTP_BYTES + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_HTTP_BYTES:
                    raise ValueError()
                if body_at is None and b'\r\n\r\n' in data:
                    headers, _ = data.split(b'\r\n\r\n', 1)
                    body_at = len(headers) + 4
                    status = int(headers.split(b'\r\n', 1)[0].split()[1])
                    if status != 200:
                        result = {'ok': False, 'reason': 'http_status', 'httpStatus': status}
                        break
                    match = re.search(br'(?im)^content-length:\s*(\d+)\s*$', headers)
                    if not match:
                        raise ValueError()
                    length = int(match[1])
                    if length > MAX_HTTP_BYTES - body_at:
                        raise ValueError()
                if body_at is not None and len(data) >= body_at + length:
                    payload = json.loads(data[body_at:body_at + length])
                    if not isinstance(payload, dict) or payload.get('ok') is not True:
                        raise ValueError()
                    safe = sanitize_app({**payload, 'event': 'metrics'})
                    safe.pop('event', None)
                    result = {'ok': True, 'reason': 'ok', 'diagnostics': safe}
                    break
    except (TimeoutError, socket.timeout):
        result = {'ok': False, 'reason': 'timeout'}
    except ConnectionRefusedError:
        result = {'ok': False, 'reason': 'connection_refused'}
    except (ValueError, UnicodeError, IndexError, TypeError, RecursionError):
        result = {'ok': False, 'reason': 'invalid_response'}
    except OSError:
        result = {'ok': False, 'reason': 'network_error'}
    result['elapsedMs'] = round((time.monotonic() - started) * 1000)
    return result


class LocalStore:
    def __init__(self, root, budget_bytes=300 * 1024 * 1024, retention_seconds=7 * 86400):
        self.root = Path(root).absolute()
        # Refuse a root or existing managed subdirectory that redirects via symlink.
        if self.root == Path('/') or self.root.is_symlink():
            raise ValueError('unsafe_monitor_directory')
        # Canonicalize OS aliases such as macOS /var -> /private/var; the leaf must not redirect.
        self.root = self.root.resolve()
        if self.root == Path('/'):
            raise ValueError('unsafe_monitor_directory')
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        for name in ('watchdog', 'incidents', 'app'):
            directory = self.root / name
            if directory.is_symlink():
                raise ValueError('unsafe_monitor_directory')
            directory.mkdir(mode=0o700, exist_ok=True)
        self.budget = budget_bytes
        self.retention = retention_seconds
        self.last_warning = -float("inf")

    def warning(self, message='local_write_failed; evidence may be incomplete'):
        if time.monotonic() - self.last_warning > 60:
            self.last_warning = time.monotonic()
            print('[incident-watchdog] ' + message, flush=True)

    def atomic(self, target, value):
        temporary = target.with_name(target.name + '.tmp')
        try:
            data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
            if len(data) > MAX_SNAPSHOT_BYTES or target.is_symlink() or temporary.is_symlink():
                raise ValueError('snapshot_limit')
            with open(temporary, 'wb') as file:
                os.chmod(temporary, 0o600)
                file.write(data)
            os.replace(temporary, target)
            return True
        except (OSError, ValueError):
            self.warning()
            return False

    def append(self, entry):
        target = self.root / 'watchdog' / 'alerts.jsonl'
        try:
            if target.is_symlink():
                raise ValueError('unsafe_log')
            if target.exists() and target.stat().st_size >= MAX_LOG_BYTES:
                os.replace(target, target.with_name(f'alerts-{time.time_ns()}.jsonl'))
            with open(target, 'a', encoding='utf-8') as file:
                os.chmod(target, 0o600)
                file.write(json.dumps(entry, ensure_ascii=False, allow_nan=False) + '\n')
            return True
        except (OSError, ValueError):
            self.warning()
            return False

    def app_tail(self):
        target = self.root / 'app' / 'events.jsonl'
        try:
            if target.is_symlink():
                return []
            with open(target, 'rb') as file:
                file.seek(max(0, target.stat().st_size - 256 * 1024))
                lines = file.read(256 * 1024).splitlines()[-300:]
            out = []
            for line in lines:
                try:
                    safe = sanitize_app(json.loads(line))
                    if safe:
                        out.append(safe)
                except (ValueError, UnicodeError, TypeError, RecursionError):
                    continue
            return out
        except OSError:
            return []

    def cleanup(self, active_id=None):
        """Only recognized monitor-owned files. Never follow links/delete unrelated files."""
        files = []
        protected = {'events.jsonl', 'alerts.jsonl', 'state.json', f'{active_id}.json'}
        now = time.time()
        patterns = {'app': r'events(?:-\d+-[a-f0-9-]+)?\.jsonl',
                    'watchdog': r'(?:alerts(?:-\d+)?\.jsonl|state\.json(?:\.tmp)?)',
                    'incidents': r'[a-f0-9-]{36}\.json(?:\.tmp)?'}
        try:
            for folder, pattern in patterns.items():
                directory = self.root / folder
                if directory.is_symlink():
                    continue
                # Normal pruning keeps these small; refuse unbounded traversal.
                for index, target in enumerate(directory.iterdir()):
                    if index >= 10000:
                        break
                    if target.is_symlink() or not target.is_file() or not re.fullmatch(pattern, target.name):
                        continue
                    info = target.stat()
                    if target.name not in protected and now - info.st_mtime > self.retention:
                        target.unlink()
                    else:
                        files.append((info.st_mtime, info.st_size, target))
            total = sum(size for _, size, _ in files)
            for _, size, target in sorted(files):
                if total <= self.budget:
                    break
                if target.name not in protected:
                    target.unlink()
                    total -= size
            if total > self.budget:
                # Active files are bounded by writers; never truncate a live business log.
                self.warning('storage_budget_exceeded; active evidence preserved')
        except OSError:
            self.warning()


def nginx_tail(filename):
    """Read only structured timing logs; never copy nginx's raw error/access logs."""
    if not filename:
        return []
    try:
        target = Path(filename)
        if target.is_symlink():
            return []
        with open(target, 'rb') as file:
            file.seek(max(0, target.stat().st_size - 128 * 1024))
            lines = file.read(128 * 1024).splitlines()[-200:]
        out = []
        routes = {'/other', '/api/generations', '/api/proxy', '/api/admin', '/api/models', '/api/points', '/api/auth', '/api/oss'}
        for line in lines:
            try:
                entry = json.loads(line)
                if not isinstance(entry, dict) or entry.get('event') != 'nginx_request':
                    continue
                safe = {'event': 'nginx_request'}
                if isinstance(entry.get('route'), str) and entry['route'] in routes:
                    safe['route'] = entry['route']
                for key in ('status', 'bytes'):
                    if numeric(entry.get(key)):
                        safe[key] = entry[key]
                for key in ('requestSeconds', 'connectSeconds', 'headerSeconds', 'upstreamSeconds'):
                    value = entry.get(key)
                    if isinstance(value, str) and re.fullmatch(r'\d{1,8}(?:\.\d{1,6})?', value):
                        safe[key] = float(value)
                for key, pattern in (('requestId', r'[a-f0-9]{32}'), ('backendRequestId', r'[a-f0-9-]{36}'),
                                     ('timestamp', r'[0-9T:.+Z-]{20,40}')):
                    if isinstance(entry.get(key), str) and re.fullmatch(pattern, entry[key]):
                        safe[key] = entry[key]
                if isinstance(entry.get('method'), str) and entry['method'] in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'}:
                    safe['method'] = entry['method']
                out.append(safe)
            except (ValueError, UnicodeError, TypeError, RecursionError):
                continue
        return out
    except OSError:
        return []


def process_snapshot(pid):
    if not isinstance(pid, int) or pid <= 0 or pid > 2 ** 31:
        return None
    try:
        base = Path('/proc') / str(pid)
        info = {'pid': pid}
        for line in (base / 'status').read_text().splitlines():
            key, raw = line.split(':', 1)
            if key in {'VmRSS', 'VmSize', 'Threads'}:
                info[key] = int(raw.split()[0])
            elif key == 'State':
                info['state'] = raw.strip().split()[0]
        # Linux stat: strip comm in parentheses rather than exposing it or splitting on its spaces.
        fields = (base / 'stat').read_text().rsplit(')', 1)[1].split()
        info['userCpuTicks'] = int(fields[11])
        info['systemCpuTicks'] = int(fields[12])
        info['startTimeTicks'] = int(fields[19])
        info['ioBytes'] = {}
        for line in (base / 'io').read_text().splitlines():
            key, raw = line.split(':', 1)
            if key in {'read_bytes', 'write_bytes'}:
                info['ioBytes'][key] = int(raw.strip())
        return info
    except (OSError, ValueError, IndexError):
        return {'pid': pid, 'state': 'unavailable'}


def resource_snapshot(root):
    result = {}
    try:
        result['loadAverage'] = list(os.getloadavg())
        stat = os.statvfs(root)
        result['diskAvailableBytes'] = stat.f_bavail * stat.f_frsize
    except OSError:
        pass
    try:
        memory = {}
        for line in Path('/proc/meminfo').read_text().splitlines():
            key, value = line.split(':', 1)
            if key in {'MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'}:
                memory[key + 'Bytes'] = int(value.split()[0]) * 1024
        result['memory'] = memory
        result['cpuTicks'] = [int(n) for n in Path('/proc/stat').read_text().splitlines()[0].split()[1:]]
        result['networkBytes'] = {}
        for line in Path('/proc/net/dev').read_text().splitlines()[2:]:
            interface, raw = line.split(':', 1)
            values = raw.split()
            if re.fullmatch(r'[a-zA-Z0-9_.-]{1,32}', interface.strip()):
                result['networkBytes'][interface.strip()] = {'rx': int(values[0]), 'tx': int(values[8])}
        result['ioCounters'] = Path('/proc/pressure/io').read_text()[:256]
        counts = collections.Counter()
        for family in ('tcp', 'tcp6'):
            with open('/proc/net/' + family) as file:
                next(file)
                for index, line in enumerate(file):
                    if index >= 20000:
                        break
                    state = line.split()[3]
                    if re.fullmatch(r'[0-9A-F]{2}', state):
                        counts[state] += 1
        result['tcpStates'] = dict(counts)
    except (OSError, ValueError, IndexError):
        pass
    return result


class Watchdog:
    def __init__(self, store, failures=3, recoveries=3, nginx_log=None):
        self.store = store
        self.nginx_log = nginx_log
        self.failures = failures
        self.recoveries = recoveries
        self.failure_count = 0
        self.success_count = 0
        self.active = None
        self.onset_samples = []
        self.onset_events = []
        self.last_backend = None
        self.samples = collections.deque(maxlen=60)
        self.ticks = 0
        try:
            state_path = store.root / 'watchdog' / 'state.json'
            if state_path.is_symlink() or state_path.stat().st_size > MAX_SNAPSHOT_BYTES:
                raise ValueError()
            state = json.loads(state_path.read_text())
            if isinstance(state, dict) and re.fullmatch(r'[a-f0-9-]{36}', state.get('incidentId', '')):
                dt.datetime.fromisoformat(state['openedAt'])
                self.active = {'incidentId': state['incidentId'], 'openedAt': state['openedAt']}
                prior_path = store.root / 'incidents' / (state['incidentId'] + '.json')
                if prior_path.is_file() and not prior_path.is_symlink() and prior_path.stat().st_size <= MAX_SNAPSHOT_BYTES:
                    prior = json.loads(prior_path.read_text())
                    self.onset_samples = prior.get('onsetSamples', [])[:60]
                    self.onset_events = [safe for row in prior.get('onsetAppEvents', [])[:300] if (safe := sanitize_app(row))]
        except (OSError, ValueError, TypeError, KeyError, RecursionError, AttributeError):
            pass

    def step(self, probes, resources=None):
        now = timestamp()
        resources = resources if resources is not None else resource_snapshot(self.store.root)
        backend = probes.get('backend', {})
        if backend.get('ok') and backend.get('diagnostics'):
            self.last_backend = backend['diagnostics']
        if self.last_backend:
            resources['backendProcess'] = process_snapshot(self.last_backend.get('pid'))
        # Keep historical cycles compact; full current/last-good diagnostic inventories live in the snapshot.
        compact = {}
        for name, result in probes.items():
            compact[name] = {k: v for k, v in result.items() if k != 'diagnostics'}
            if result.get('diagnostics'):
                compact[name]['diagnostics'] = {k: v for k, v in result['diagnostics'].items() if k not in ('trackedRequests', 'trackedOperations')}
        sample = {'timestamp': now, 'probes': compact, 'resources': resources}
        self.samples.append(sample)
        failed = [name for name, result in probes.items() if not result['ok']]
        self.failure_count = self.failure_count + 1 if failed else 0
        self.success_count = 0 if failed else self.success_count + 1
        opened = False
        if self.active is None and self.failure_count >= self.failures:
            self.active = {'incidentId': str(uuid.uuid4()), 'openedAt': now}
            opened = True
            self.onset_samples = list(self.samples)
            self.onset_events = self.store.app_tail()
            self.store.append({'timestamp': now, 'event': 'incident_open', **self.active,
                               'failedProbes': failed, 'consecutiveFailures': self.failure_count})
            self.store.atomic(self.store.root / 'watchdog' / 'state.json', self.active)
        if self.active and (opened or self.ticks % 6 == 0):
            target = self.store.root / 'incidents' / (self.active['incidentId'] + '.json')
            self.store.atomic(target, {**self.active, 'updatedAt': now, 'status': 'open',
                                      'onsetSamples': self.onset_samples, 'onsetAppEvents': self.onset_events,
                                      'lastSuccessfulBackendDiagnostics': self.last_backend, 'currentProbes': probes,
                                      'nginxEvents': nginx_tail(self.nginx_log),
                                      'recentSamples': list(self.samples), 'appEvents': self.store.app_tail()})
        if self.active and self.success_count >= self.recoveries:
            try:
                seconds = max(0, (dt.datetime.fromisoformat(now) - dt.datetime.fromisoformat(self.active['openedAt'])).total_seconds())
            except (ValueError, TypeError):
                seconds = None
            self.store.append({'timestamp': now, 'event': 'incident_recovered', **self.active, 'durationSeconds': seconds})
            self.store.atomic(self.store.root / 'incidents' / (self.active['incidentId'] + '.json'),
                              {**self.active, 'recoveredAt': now, 'status': 'recovered', 'durationSeconds': seconds,
                               'onsetSamples': self.onset_samples, 'onsetAppEvents': self.onset_events,
                                      'lastSuccessfulBackendDiagnostics': self.last_backend, 'currentProbes': probes,
                                      'nginxEvents': nginx_tail(self.nginx_log),
                                      'recentSamples': list(self.samples), 'appEvents': self.store.app_tail()})
            self.active = None
            self.store.atomic(self.store.root / 'watchdog' / 'state.json', {})
        # Independent history survives a blocked application and monitor restarts.
        self.store.append({'timestamp': now, 'event': 'probe_sample', 'incidentId': self.active['incidentId'] if self.active else None,
                           'probes': compact, 'resources': resources})
        self.store.cleanup(self.active['incidentId'] if self.active else None)
        self.ticks += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--once', action='store_true', help='one read-only probe cycle; still saves local evidence')
    args = parser.parse_args()
    # Config errors deliberately do not echo config values or secrets.
    try:
        config = json.loads(Path(args.config).read_text())
        token = Path(config['token_file']).read_text().strip()
        if not re.fullmatch(r'[a-fA-F0-9]{64}', token):
            raise ValueError()
        backend_port = int(config.get('backend_port', 3000))
        nginx_port = int(config.get('nginx_port', 80))
        if not all(1 <= port <= 65535 for port in (backend_port, nginx_port)):
            raise ValueError()
        interval = float(config.get('interval_seconds', 5))
        timeout = float(config.get('timeout_seconds', 2))
        if not (1 <= interval <= 60 and 0.1 <= timeout <= 10):
            raise ValueError()
        if not isinstance(config['directory'], str) or not Path(config['directory']).is_absolute():
            raise ValueError()
        if config.get('nginx_log') is not None and (not isinstance(config['nginx_log'], str) or not Path(config['nginx_log']).is_absolute()):
            raise ValueError()
        store = LocalStore(config['directory'])
        # flock remains held for the process lifetime; a manual --once cannot race the daemon.
        descriptor = os.open(store.root / 'watchdog' / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        lock_file = os.fdopen(descriptor, 'w')
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        watchdog = Watchdog(store, nginx_log=config.get('nginx_log'))
    except BlockingIOError:
        print('[incident-watchdog] already_running', flush=True)
        return 2
    except (OSError, ValueError, TypeError, KeyError, OverflowError):
        print('[incident-watchdog] invalid_or_unreadable_config', flush=True)
        return 2
    stop = False
    def shutdown(_signal, _frame):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    # Loopback HTTP only: never call image generation or a paid upstream API.
    targets = {'backend': (backend_port, '/api/internal/monitor/health'),
               'nginx': (nginx_port, '/api/internal/monitor/health'),
               'database': (backend_port, '/api/internal/monitor/database')}
    store.append({'timestamp': timestamp(), 'event': 'watchdog_start'})
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        while not stop:
            started = time.monotonic()
            futures = {name: pool.submit(probe, port, endpoint, token, timeout) for name, (port, endpoint) in targets.items()}
            watchdog.step({name: future.result() for name, future in futures.items()})
            if args.once:
                break
            # No overlapping cycles, including when collection is slow.
            remaining = interval - (time.monotonic() - started)
            while remaining > 0 and not stop:
                time.sleep(min(remaining, 0.25))
                remaining = interval - (time.monotonic() - started)
    lock_file.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
