#!/usr/bin/env python3
import concurrent.futures
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import tempfile
import threading
import time
import unittest

SPEC = importlib.util.spec_from_file_location('watchdog', Path(__file__).with_name('incident-watchdog.py'))
watchdog = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(watchdog)
ROOT = Path(__file__).resolve().parent.parent
TOKEN = 'a' * 64


@contextlib.contextmanager
def raw_server(handler):
    server = socket.socket()
    server.bind(('127.0.0.1', 0))
    server.listen(8)
    stopped = threading.Event()
    server.settimeout(0.1)
    workers = []
    def serve():
        while not stopped.is_set():
            try:
                client, _ = server.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            def work(client=client):
                try:
                    client.settimeout(0.5)
                    request = client.recv(8192)
                    handler(client, request)
                except OSError:
                    pass
                finally:
                    client.close()
            thread = threading.Thread(target=work, daemon=True)
            workers.append(thread)
            thread.start()
    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    try:
        yield server.getsockname()[1]
    finally:
        stopped.set()
        server.close()
        thread.join(timeout=1)
        for worker in workers:
            worker.join(timeout=1)


def response(client, payload, status=200):
    body = json.dumps(payload).encode()
    client.sendall(f'HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n'.encode() + body)


def probes(ok):
    return {name: {'ok': ok, 'reason': 'ok' if ok else 'timeout', 'elapsedMs': 2 if ok else 2000}
            for name in ('backend', 'nginx', 'database')}


def log_entries(store):
    return [json.loads(line) for line in (store.root / 'watchdog' / 'alerts.jsonl').read_text().splitlines()]


class WatchdogTests(unittest.TestCase):
    def test_failure_threshold_dedup_recovery_and_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            store = watchdog.LocalStore(directory)
            monitor = watchdog.Watchdog(store)
            monitor.step(probes(True), {})
            monitor.step(probes(False), {})
            monitor.step(probes(False), {})
            self.assertIsNone(monitor.active)
            monitor.step(probes(False), {})
            incident_id = monitor.active['incidentId']
            for _ in range(8):
                monitor.step(probes(False), {})
            # Restart preserves active incident identity; no repeated opening alert.
            monitor = watchdog.Watchdog(store)
            self.assertEqual(monitor.active['incidentId'], incident_id)
            for _ in range(4):
                monitor.step(probes(False), {})
            for _ in range(2):
                monitor.step(probes(True), {})
            self.assertIsNotNone(monitor.active)
            monitor.step(probes(True), {})
            self.assertIsNone(monitor.active)
            entries = log_entries(store)
            self.assertEqual(sum(row['event'] == 'incident_open' for row in entries), 1)
            self.assertEqual(sum(row['event'] == 'incident_recovered' for row in entries), 1)
            snapshot = json.loads((store.root / 'incidents' / (incident_id + '.json')).read_text())
            self.assertEqual(snapshot['status'], 'recovered')
            self.assertGreater(len(snapshot['onsetSamples']), 0)
            self.assertEqual(json.loads((store.root / 'watchdog' / 'state.json').read_text()), {})

    def test_slow_upstream_does_not_trigger_when_local_probes_healthy(self):
        with tempfile.TemporaryDirectory() as directory:
            store = watchdog.LocalStore(directory)
            (store.root / 'app' / 'events.jsonl').write_text(json.dumps({
                'event': 'operation_start', 'phase': 'poll', 'taskNo': 'gen-20261001123456', 'elapsedMs': 120000}) + '\n')
            monitor = watchdog.Watchdog(store)
            for _ in range(5):
                monitor.step(probes(True), {})
            self.assertIsNone(monitor.active)
            self.assertFalse(any(row['event'] == 'incident_open' for row in log_entries(store)))

    def test_total_probe_deadline_status_size_and_redaction(self):
        def healthy(client, request):
            self.assertIn(('X-Monitor-Token: ' + TOKEN).encode(), request)
            response(client, {'ok': True, 'pid': 42, 'requestCount': 4, 'token': 'secret-value', 'prompt': 'secret-prompt', 'trackedRequests': [
                {'id': 'a' * 36, 'route': '/api/generations/:value/status', 'elapsedMs': 4000, 'url': 'https://secret-url'}]})
        with raw_server(healthy) as port:
            result = watchdog.probe(port, '/api/internal/monitor/health', TOKEN)
            self.assertTrue(result['ok'])
            self.assertNotIn('secret', json.dumps(result))
            self.assertEqual(result['diagnostics']['requestCount'], 4)
        with raw_server(lambda c, _: response(c, {'error': 'secret'}, 503)) as port:
            result = watchdog.probe(port, '/api/internal/monitor/health', TOKEN)
            self.assertEqual(result['httpStatus'], 503)
            self.assertNotIn('secret', json.dumps(result))
        with raw_server(lambda c, _: c.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 99999999\r\n\r\n')) as port:
            self.assertEqual(watchdog.probe(port, '/x', TOKEN)['reason'], 'invalid_response')
        def drip(client, _):
            client.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 9999\r\n\r\n')
            for _ in range(30):
                client.sendall(b'x')
                time.sleep(0.04)
        with raw_server(drip) as port:
            started = time.monotonic()
            result = watchdog.probe(port, '/x', TOKEN, 0.15)
            self.assertEqual(result['reason'], 'timeout')
            self.assertLess(time.monotonic() - started, 0.35)
        with raw_server(lambda c, _: response(c, {'ok': True, 'trackedOperations': [{'id': 'b' * 36, 'phase': 'secret', 'taskNo': 'secret'}]})) as port:
            self.assertNotIn('secret', json.dumps(watchdog.probe(port, '/x', TOKEN)))

    def test_untrusted_shapes_and_app_tail_are_safe(self):
        for payload in ({'event': []}, {'event': 'metrics', 'errorKind': [], 'phase': {}, 'operation': []}, {'event': 'request_start', 'route': '/secret', 'timestamp': 'secret'}):
            self.assertNotIn('secret', json.dumps(watchdog.sanitize_app(payload)))
        with tempfile.TemporaryDirectory() as directory:
            store = watchdog.LocalStore(directory)
            (store.root / 'app' / 'events.jsonl').write_text('\n'.join([
                'invalid-json', json.dumps({'event': []}), json.dumps({'event': 'database_slow', 'fingerprint': 'a' * 16, 'sql': 'secret-sql', 'parameters': 'secret-key'}),
                json.dumps({'event': 'operation_end', 'phase': 'poll', 'errorMessage': 'secret-token', 'errorKind': 'ETIMEDOUT'})]))
            self.assertEqual(len(store.app_tail()), 2)
            self.assertNotIn('secret', json.dumps(store.app_tail()))

    def test_rotation_retention_budget_symlinks_and_write_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            store = watchdog.LocalStore(directory, budget_bytes=2000, retention_seconds=1)
            old = store.root / 'app' / ('events-1-' + 'a' * 36 + '.jsonl')
            old.write_text('old')
            os.utime(old, (time.time() - 100, time.time() - 100))
            unrelated = store.root / 'app' / 'untouched.txt'
            unrelated.write_text('preserve')
            outside = Path(directory) / 'outside'
            outside.write_text('preserve')
            link = store.root / 'incidents' / ('a' * 36 + '.json')
            link.symlink_to(outside)
            active_id = 'b' * 36
            active = store.root / 'incidents' / (active_id + '.json')
            active.write_text('active')
            for index in range(3):
                target = store.root / 'incidents' / (f'{index:036x}' + '.json')
                target.write_text('x' * 1100)
            store.cleanup(active_id)
            self.assertFalse(old.exists())
            self.assertTrue(active.exists())
            self.assertEqual(unrelated.read_text(), 'preserve')
            self.assertEqual(outside.read_text(), 'preserve')
            managed_size = sum(p.stat().st_size for p in (store.root / 'incidents').iterdir() if not p.is_symlink())
            self.assertLessEqual(managed_size, 2000)
            self.assertFalse(store.atomic(active, {'tooBig': 'x' * (watchdog.MAX_SNAPSHOT_BYTES + 1)}))
            # A live symlink log cannot overwrite a target, including a token file.
            alerts = store.root / 'watchdog' / 'alerts.jsonl'
            alerts.symlink_to(outside)
            self.assertFalse(store.append({'event': 'test'}))
            self.assertEqual(outside.read_text(), 'preserve')
            alerts.unlink()
            alerts.write_bytes(b'x' * watchdog.MAX_LOG_BYTES)
            self.assertTrue(store.append({'event': 'test'}))
            self.assertTrue(list(alerts.parent.glob('alerts-*.jsonl')))
        with tempfile.TemporaryDirectory() as directory:
            link = Path(directory) / 'link'
            link.symlink_to(Path(directory) / 'real')
            with self.assertRaises(ValueError):
                watchdog.LocalStore(link)

    def test_nginx_timing_evidence_is_schema_filtered(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'nginx.jsonl'
            target.write_text(json.dumps({'event': 'nginx_request', 'timestamp': '2026-10-01T15:12:45+08:00',
                'requestId': 'a' * 32, 'backendRequestId': 'b' * 36, 'route': '/api/proxy', 'method': 'POST',
                'status': 504, 'requestSeconds': '60.001', 'headerSeconds': '60.000', 'bytes': 0,
                'url': 'https://secret-url', 'requestBody': 'secret-prompt', 'token': TOKEN}) + '\n')
            evidence = watchdog.nginx_tail(target)
            self.assertEqual(evidence[0]['status'], 504)
            self.assertEqual(evidence[0]['requestSeconds'], 60.001)
            self.assertNotIn('secret', json.dumps(evidence))
            self.assertNotIn(TOKEN, json.dumps(evidence))

    def test_cli_single_instance_lock_and_once_health(self):
        with tempfile.TemporaryDirectory() as directory:
            token_file = Path(directory) / 'token'
            token_file.write_text(TOKEN)
            config = Path(directory) / 'config.json'
            with raw_server(lambda c, _: response(c, {'ok': True})) as port:
                config.write_text(json.dumps({'token_file': str(token_file), 'directory': directory,
                    'backend_port': port, 'nginx_port': port, 'timeout_seconds': 0.2, 'interval_seconds': 1}))
                result = subprocess.run(['python3', str(ROOT / 'scripts/incident-watchdog.py'), '--config', str(config), '--once'], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                store = watchdog.LocalStore(directory)
                latest = log_entries(store)[-1]
                self.assertTrue(all(p['ok'] for p in latest['probes'].values()))
                with open(store.root / 'watchdog' / 'lock', 'w') as locked:
                    watchdog.fcntl.flock(locked, watchdog.fcntl.LOCK_EX | watchdog.fcntl.LOCK_NB)
                    second = subprocess.run(['python3', str(ROOT / 'scripts/incident-watchdog.py'), '--config', str(config), '--once'], capture_output=True, text=True)
                    self.assertEqual(second.returncode, 2)
                    self.assertNotIn(TOKEN, second.stdout + second.stderr)

    def test_cli_config_failure_never_echoes_secret(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'config.json'
            config.write_text(json.dumps({'token_file': 'secret-path', 'directory': directory}))
            result = subprocess.run(['python3', str(ROOT / 'scripts/incident-watchdog.py'), '--config', str(config), '--once'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn('secret-path', result.stdout + result.stderr)

    def test_independent_monitor_detects_real_node_block_and_saves_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'MONITOR_DIR': directory, 'MONITOR_TOKEN': TOKEN}
            child = subprocess.Popen(['node', '--import', 'tsx', 'scripts/monitor-tests/fixture-server.ts'], cwd=ROOT, env=env,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertTrue(select.select([child.stdout], [], [], 10)[0], 'fixture did not start')
                line = child.stdout.readline()
                port = json.loads(line)['port']
                store = watchdog.LocalStore(directory)
                monitor = watchdog.Watchdog(store)
                def cycle():
                    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                        targets = {'backend': '/api/internal/monitor/health', 'nginx': '/api/internal/monitor/health', 'database': '/api/internal/monitor/database'}
                        futures = {name: pool.submit(watchdog.probe, port, endpoint, TOKEN, 0.15) for name, endpoint in targets.items()}
                        monitor.step({name: future.result() for name, future in futures.items()})
                cycle()
                # Long upstream wait is asynchronous: healthy probe remains responsive.
                import urllib.request
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    waiting = pool.submit(lambda: urllib.request.urlopen(f'http://127.0.0.1:{port}/api/generations/1/status').read())
                    time.sleep(0.1)
                    for _ in range(3):
                        cycle()
                    self.assertIsNone(monitor.active)
                    waiting.result(timeout=3)
                urllib.request.urlopen(f'http://127.0.0.1:{port}/block').read()
                deadline = time.monotonic() + 8
                seen_open = False
                while time.monotonic() < deadline:
                    cycle()
                    if monitor.active:
                        seen_open = True
                    if seen_open and monitor.active is None:
                        break
                    time.sleep(0.12)
                entries = log_entries(store)
                self.assertEqual(sum(e['event'] == 'incident_open' for e in entries), 1)
                self.assertEqual(sum(e['event'] == 'incident_recovered' for e in entries), 1)
                incident = json.loads(next((store.root / 'incidents').glob('*.json')).read_text())
                self.assertEqual(incident['status'], 'recovered')
                self.assertTrue(any(e.get('eventLoopMaxMs', 0) >= 1000 or e.get('sampleElapsedMs', 0) >= 1000 for e in incident['appEvents']))
                self.assertTrue(incident['onsetSamples'])
                self.assertNotIn(TOKEN, json.dumps(incident))
                # The business process exiting cannot stop this independent monitor.
                child.terminate()
                child.wait(timeout=5)
                for _ in range(3):
                    cycle()
                self.assertIsNotNone(monitor.active)
            finally:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait()
                child.stdout.close()
                child.stderr.close()


if __name__ == '__main__':
    unittest.main()
