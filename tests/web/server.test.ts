import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHandler, TestBench } from '../../src/web/server';
import { d20, ScriptedRng, testBalance } from '../helpers';

const WIN = [0.5, 0, d20(20), d20(1)];

describe('tela de teste local', () => {
  let server: Server;
  let base: string;
  let rng: ScriptedRng;
  let bench: TestBench;

  beforeEach(async () => {
    rng = new ScriptedRng();
    bench = new TestBench(testBalance(), ':memory:', rng);
    server = createServer(createHandler(bench, () => '<h1>Despertar</h1>'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const command = async (name: string, text: string) =>
    (await (await post('/api/command', { name, text })).json()) as { replies: string[]; ignored: boolean };
  const state = async () => (await (await fetch(base + '/api/state')).json()) as {
    paused: boolean;
    season: { number: number };
    hunters: { name: string; rank: string }[];
  };

  it('administração só pela rota do terminal, nunca pelo chat', async () => {
    expect(await command('ana', '!rpg pausar')).toEqual({ replies: [], ignored: true });
    expect((await state()).paused).toBe(false);
    const r = (await (await post('/api/admin', { action: 'pausar' })).json()) as { replies: string[] };
    expect(r.replies[0]).toContain('pausado');
    expect((await state()).paused).toBe(true);
    expect((await post('/api/admin', { action: 'apagar-tudo' })).status).toBe(400);
    expect((await post('/api/admin', { action: 'portal', portal: 'roxo' })).status).toBe(400);
    expect((await post('/api/admin', { action: 'retomar' })).status).toBe(200);
    // sem ninguém despertado o portal é recusado: 409, e a recusa não vira mensagem de chat
    const refused = await post('/api/admin', { action: 'portal' });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toMatch(/^Recusado: /);
  });

  it('serve a página', async () => {
    const res = await fetch(base + '/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Despertar');
  });

  it('envia comando e mostra o caçador no estado', async () => {
    rng.push(0);
    const r = await command('ana', '!despertar');
    expect(r.replies[0]).toContain('despertou');
    const s = await state();
    expect(s.season.number).toBe(1);
    expect(s.hunters).toEqual([expect.objectContaining({ name: 'ana', rank: 'F' })]);
  });

  it('texto que não é comando é ignorado', async () => {
    expect(await command('ana', 'oi gente')).toEqual({ replies: [], ignored: true });
  });

  it('rejeita nome inválido', async () => {
    const res = await post('/api/command', { name: 'a b<script>', text: '!status' });
    expect(res.status).toBe(400);
  });

  it('avançar o tempo libera o cooldown', async () => {
    rng.push(0);
    await command('ana', '!despertar');
    rng.push(...WIN);
    expect((await command('ana', '!cacar')).replies[0]).toContain('venceu');
    await post('/api/advance', { ms: 3_000 });
    expect((await command('ana', '!cacar')).replies[0]).toContain('descansando');
    await post('/api/advance', { ms: testBalance().hunt.cooldownMs });
    rng.push(...WIN);
    expect((await command('ana', '!cacar')).replies[0]).toContain('venceu');
  });

  it('avançar até o fim da temporada vira a temporada', async () => {
    rng.push(0);
    await command('ana', '!despertar');
    await post('/api/advance', { ms: testBalance().season.durationDays * 86_400_000 });
    const r = await command('ana', '!temporada');
    expect(r.replies[0]).toContain('Temporada 1 encerrada');
    expect((await state()).season.number).toBe(2);
  });

  it('reset apaga tudo', async () => {
    rng.push(0);
    await command('ana', '!despertar');
    await post('/api/reset', {});
    expect((await state()).hunters).toEqual([]);
  });

  it('mostra poções e dá ouro de teste', async () => {
    rng.push(0);
    await command('ana', '!despertar');
    expect((await post('/api/give-gold', { name: 'ana', amount: 500 })).status).toBe(200);
    await command('ana', '!comprar pocao 2');
    const s = (await (await fetch(base + '/api/state')).json()) as { hunters: { potions: number; gold: number }[] };
    expect(s.hunters[0].potions).toBe(2);
    expect((await post('/api/give-gold', { name: 'ninguem', amount: 5 })).status).toBe(404);
    expect((await post('/api/give-gold', { name: 'ana', amount: -5 })).status).toBe(400);
  });

  it('rota desconhecida dá 404', async () => {
    expect((await fetch(base + '/nada')).status).toBe(404);
  });
});
