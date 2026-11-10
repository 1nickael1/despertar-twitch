import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const BALANCE_PATH = fileURLToPath(new URL('../../config/balance.json', import.meta.url));

const probability = z.number().min(0).max(1);
const perRank = z.array(z.number().nonnegative()).length(7);

const classSchema = z.object({
  label: z.string().min(1),
  primary: z.enum(['FOR', 'AGI', 'INT', 'VIT']),
  base: z.number().positive(),
  growth: z.number().nonnegative(),
  vit: z.number().nonnegative(),
  bonusVsHigherRank: z.number().nonnegative(),
  critMin: z.number().int().min(1).max(20).nullable(),
  injuryImmune: z.boolean(),
  fixedInjuryChance: probability.nullable(),
  lossXpFraction: probability,
});

const shopItemSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  priceMultiplier: z.number().positive(),
});

const perPortal = (n: z.ZodNumber) => z.object({ azul: n, vermelho: n, quebra: n });

const raidSchema = z
  .object({
    intervalMs: z.number().int().positive(),
    typeWeights: perPortal(z.number().nonnegative()).refine((w) => w.azul + w.vermelho + w.quebra > 0, {
      message: 'pelo menos um tipo de portal precisa de peso maior que 0',
    }),
    entryMs: z.number().int().positive(),
    battleMs: z.number().int().positive(),
    roundMs: z.number().int().positive(),
    bossHp: perPortal(z.number().int().positive()),
    rewardMultiplier: perPortal(z.number().positive()),
    placeMultipliers: z
      .array(z.number().min(1))
      .refine((m) => m.every((v, i) => i === 0 || v <= m[i - 1]), { message: 'use ordem decrescente (1º ganha mais)' }),
    attackBonus: z.number().nonnegative(),
    knockdownFactor: probability,
    redFallXpHunts: z.number().nonnegative(),
    breakInjuryMs: z.number().int().positive(),
  })
  .refine((r) => r.battleMs % r.roundMs === 0, {
    message: 'battleMs deve ser múltiplo de roundMs',
    path: ['battleMs'],
  });

const rankNames = z.array(z.string().min(1)).length(7);
const perRankInt = z.array(z.number().int().nonnegative()).length(7);
const perRankFactor = z.array(z.number().gt(0).max(1)).length(7);

const equipmentSchema = z.object({
  weapon: z
    .object({ names: rankNames, commonBonus: perRankInt, forgedBonus: perRankInt, priceMultiplier: z.number().positive() })
    .refine((w) => w.forgedBonus.every((f, i) => f > w.commonBonus[i]), {
      message: 'a arma forjada precisa ser mais forte que a da loja em todo rank',
      path: ['forgedBonus'],
    }),
  armor: z
    .object({ names: rankNames, commonFactor: perRankFactor, forgedFactor: perRankFactor, priceMultiplier: z.number().positive() })
    .refine((a) => a.forgedFactor.every((f, i) => f < a.commonFactor[i]), {
      message: 'a armadura forjada precisa proteger mais que a da loja em todo rank',
      path: ['forgedFactor'],
    }),
  fragmentDropChance: probability,
  raidFragments: z.object({
    azul: z.number().int().nonnegative(),
    vermelho: z.number().int().nonnegative(),
    quebra: z.number().int().nonnegative(),
  }),
  raidTopDamageBonusFragments: z.number().int().nonnegative(),
  forge: z.object({ fragments: z.number().int().min(1), goldMultiplier: z.number().nonnegative() }),
});

const duelSchema = z.object({
  acceptMs: z.number().int().positive(),
  cooldownMs: z.number().int().nonnegative(),
  armorDefense: z.object({ comum: z.number().int().nonnegative(), forjada: z.number().int().nonnegative() }),
  roundsToWin: z.number().int().min(1),
  fairRankGap: z.number().int().min(0).max(6),
});

/** Maior múltiplo do ouro base que uma única vitória pode render (crítico dobra). */
export function maxWinGoldMultiplier(b: { classes: Record<string, { critMin: number | null }> }): number {
  return Object.values(b.classes).some((c) => c.critMin !== null) ? 2 : 1;
}

export const balanceSchema = z.object({
  levelCaps: z.array(z.number().int().positive()).length(7),
  xpCurve: z.object({ base: z.number().int().nonnegative(), perLevel: z.number().int().nonnegative() }),
  hunt: z.object({
    cooldownMs: z.number().int().positive(),
    injuryMs: z.number().int().positive(),
    monsterRankChances: z
      .object({ lower: probability, same: probability, higher: probability })
      .refine((c) => Math.abs(c.lower + c.same + c.higher - 1) < 1e-9, {
        message: 'lower + same + higher deve somar 1',
      }),
    xpByRank: perRank,
    goldByRank: perRank,
    difficultyByRank: perRank,
    baseInjuryChance: probability,
    injuryPerVit: z.number().nonnegative(),
    minInjuryChance: probability,
  }),
  reevaluation: z.object({
    successChance: probability,
    failBlockMs: z.number().int().positive(),
    reawakenChance: probability,
    reawakenJump: z.number().int().min(1),
  }),
  season: z.object({ durationDays: z.number().positive(), hallOfFameSize: z.number().int().positive() }),
  chat: z.object({
    messageIntervalMs: z.number().int().nonnegative(),
    duplicateWindowMs: z.number().int().nonnegative(),
  }),
  shop: z.object({
    maxPerPurchase: z.number().int().min(1),
    items: z.object({ pocao: shopItemSchema }),
  }),
  raid: raidSchema,
  equipment: equipmentSchema,
  duel: duelSchema,
  classes: z.object({
    guerreiro: classSchema,
    mago: classSchema,
    assassino: classSchema,
    curandeiro: classSchema,
    tanque: classSchema,
  }),
  monsters: z.array(z.array(z.string().min(1)).min(1)).length(7),
}).superRefine((b, ctx) => {
  // Regra do streamer: uma vitória (nem a crítica) nunca paga um item da loja.
  const maxWin = maxWinGoldMultiplier(b);
  for (const [id, item] of Object.entries(b.shop.items)) {
    if (item.priceMultiplier <= maxWin) {
      ctx.addIssue({
        code: 'custom',
        path: ['shop', 'items', id, 'priceMultiplier'],
        message: `uma vitória não pode pagar o item: use um valor maior que ${maxWin}`,
      });
    }
  }
  for (const slot of ['weapon', 'armor'] as const) {
    if (b.equipment[slot].priceMultiplier <= maxWin) {
      ctx.addIssue({
        code: 'custom',
        path: ['equipment', slot, 'priceMultiplier'],
        message: `uma vitória não pode pagar o item: use um valor maior que ${maxWin}`,
      });
    }
  }
});

export type Balance = z.infer<typeof balanceSchema>;
export type ClassBalance = z.infer<typeof classSchema>;

export function parseBalance(raw: unknown): Balance {
  const result = balanceSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`balance.json inválido:\n${lines.join('\n')}`);
  }
  return result.data;
}

export function loadBalance(path: string): Balance {
  return parseBalance(JSON.parse(readFileSync(path, 'utf8')));
}
