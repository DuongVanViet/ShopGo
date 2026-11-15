import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Db, one, rows, Tx } from '../../database/db';
import { ENV, Env } from '../../config/env';
import { Actor } from '../../common/context';
import { expected } from '../../common/access';
import { canonical, constantEqual, hash, hmac, randomToken } from '../../common/crypto';
import { fail, must } from '../../common/errors';
import { idempotent } from '../../common/idempotency';
import { CartService } from '../cart/cart.service';
import { AuthService } from '../auth/auth.service';

export const proposalInput = z
  .object({
    storeId: z.string().uuid(),
    items: z
      .array(
        z
          .object({ skuId: z.string().uuid(), quantity: z.number().int().min(1).max(1000) })
          .strict(),
      )
      .min(1)
      .max(20),
    budget: z.number().int().positive().max(1_000_000_000_000).optional(),
  })
  .strict();
type ProposedItem = z.infer<typeof proposalInput>['items'][number];
const aiReply = z
  .object({
    answer: z.string().min(1).max(5000),
    items: proposalInput.shape.items.optional(),
    documentIds: z.array(z.string().uuid()).max(10).default([]),
    modelVersion: z.string().max(100).optional(),
  })
  .strict();

@Injectable()
export class AiService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(CartService) private readonly cart: CartService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private token(id: string, nonce: string) {
    return hmac(this.env.AUTH_SECRET, `cart-proposal:${id}:${nonce}`);
  }
  private async preview(tx: Tx, cart: any, requested: ProposedItem[], budget?: number) {
    const quantities = new Map<string, number>();
    for (const item of requested) {
      if (quantities.has(item.skuId))
        fail('DUPLICATE_SKU', 'Mỗi SKU chỉ xuất hiện một lần trong đề xuất.', 422);
      quantities.set(item.skuId, item.quantity);
    }
    const existing = await rows(tx, 'SELECT sku_id,quantity FROM cart_items WHERE cart_id=$1', [
      cart.id,
    ]);
    for (const item of existing)
      quantities.set(item.sku_id, (quantities.get(item.sku_id) ?? 0) + item.quantity);
    if (quantities.size > 100) fail('CART_LIMIT', 'Giỏ vượt giới hạn 100 SKU.', 422);
    const skuIds = [...quantities.keys()].sort();
    const products = await rows(
      tx,
      `SELECT ss.sku_id,ss.price,ss.version,s.name,b.on_hand-b.reserved AS available FROM store_skus ss
      JOIN skus s ON s.id=ss.sku_id JOIN inventory_balances b ON b.sku_id=s.id AND b.store_id=ss.store_id
      JOIN stores st ON st.id=ss.store_id WHERE ss.store_id=$1 AND ss.sku_id=ANY($2::uuid[]) AND ss.active AND s.active AND st.status='ACTIVE' ORDER BY ss.sku_id`,
      [cart.store_id, skuIds],
    );
    if (products.length !== skuIds.length)
      fail('SKU_UNAVAILABLE', 'Có SKU không bán ở cửa hàng.', 422);
    const snapshot = products.map((product) => {
      const quantity = quantities.get(product.sku_id)!;
      if (quantity > 1000 || quantity > product.available)
        fail('OUT_OF_STOCK', 'Đề xuất không còn đủ hàng.', 409, { skuId: product.sku_id });
      return {
        skuId: product.sku_id,
        name: product.name,
        quantity,
        unitPrice: product.price,
        priceVersion: product.version,
      };
    });
    const cartTotal = snapshot.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const addedTotal = requested.reduce(
      (sum, item) => sum + item.quantity * snapshot.find((s) => s.skuId === item.skuId)!.unitPrice,
      0,
    );
    if (!Number.isSafeInteger(cartTotal) || cartTotal > 1_000_000_000_000)
      fail('CART_LIMIT', 'Giỏ vượt hạn mức tiền.', 422);
    if (budget !== undefined && addedTotal > budget)
      fail('BUDGET_EXCEEDED', 'Các món đề xuất vượt ngân sách.', 422);
    return { snapshot, addedTotal, cartTotal };
  }
  private async makeProposal(tx: Tx, actor: Actor, input: z.infer<typeof proposalInput>) {
    const cart = await this.cart.active(tx, actor, input.storeId);
    const preview = await this.preview(tx, cart, input.items, input.budget);
    const proposalId = randomUUID(),
      nonce = randomToken();
    const token = this.token(proposalId, nonce);
    const proposal = must(
      await one(
        tx,
        `INSERT INTO cart_proposals(id,user_id,store_id,cart_id,cart_version,items,snapshot,added_total,cart_total,budget,nonce,confirmation_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()+interval '2 minutes') RETURNING id,expires_at`,
        [
          proposalId,
          actor.id,
          input.storeId,
          cart.id,
          cart.version,
          JSON.stringify(input.items),
          JSON.stringify(preview.snapshot),
          preview.addedTotal,
          preview.cartTotal,
          input.budget ?? null,
          nonce,
          hash(token),
        ],
      ),
    );
    return {
      ...proposal,
      cartId: cart.id,
      expectedCartVersion: cart.version,
      items: preview.snapshot,
      addedTotal: preview.addedTotal,
      cartTotal: preview.cartTotal,
      budget: input.budget,
      confirmationToken: token,
      changesCart: false,
      pricesBeforeVoucherAndFees: true,
    };
  }
  create(actor: Actor, input: z.infer<typeof proposalInput>) {
    return this.db.tx((tx) => this.makeProposal(tx, actor, input));
  }
  async get(actor: Actor, proposalId: string) {
    const proposal = must(
      await one(
        this.db.pool,
        'SELECT *,expires_at>clock_timestamp() AS valid FROM cart_proposals WHERE id=$1 AND user_id=$2',
        [proposalId, actor.id],
      ),
    );
    if (!proposal.valid || proposal.applied_at)
      fail('PROPOSAL_EXPIRED', 'Đề xuất đã dùng hoặc hết hạn.', 410);
    return {
      id: proposal.id,
      cartId: proposal.cart_id,
      expectedCartVersion: proposal.cart_version,
      items: proposal.snapshot,
      addedTotal: proposal.added_total,
      cartTotal: proposal.cart_total,
      expiresAt: proposal.expires_at,
      confirmationToken: this.token(proposal.id, proposal.nonce),
      pricesBeforeVoucherAndFees: true,
    };
  }
  apply(
    actor: Actor,
    proposalId: string,
    input: { confirmationToken: string; expectedCartVersion: number },
    key: string | undefined,
  ) {
    return this.db.tx((tx) =>
      idempotent(tx, actor.id, `proposal.apply:${proposalId}`, key, input, async () => {
        const proposal = must(
          await one(
            tx,
            'SELECT *,expires_at>clock_timestamp() AS valid FROM cart_proposals WHERE id=$1 AND user_id=$2 FOR UPDATE',
            [proposalId, actor.id],
          ),
        );
        if (!proposal.valid || proposal.applied_at)
          fail('PROPOSAL_EXPIRED', 'Đề xuất đã dùng hoặc hết hạn.', 410);
        if (!constantEqual(hash(input.confirmationToken), proposal.confirmation_hash))
          fail('CONFIRMATION_REQUIRED', 'Chưa có xác nhận hợp lệ.', 403);
        const cart = must(
          await one(
            tx,
            "SELECT * FROM carts WHERE id=$1 AND user_id=$2 AND status='ACTIVE' FOR UPDATE",
            [proposal.cart_id, actor.id],
          ),
        );
        expected(cart, input.expectedCartVersion);
        expected(cart, proposal.cart_version);
        const current = await this.preview(tx, cart, proposal.items, proposal.budget ?? undefined);
        if (canonical(current.snapshot) !== canonical(proposal.snapshot))
          fail('PRICE_CHANGED', 'Đề xuất đã thay đổi giá hoặc sản phẩm. Vui lòng xem đề xuất mới.');
        for (const item of current.snapshot)
          await tx.query(
            'INSERT INTO cart_items(cart_id,sku_id,quantity) VALUES($1,$2,$3) ON CONFLICT(cart_id,sku_id) DO UPDATE SET quantity=$3',
            [cart.id, item.skuId, item.quantity],
          );
        const updated = await one(
          tx,
          'UPDATE carts SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
          [cart.id],
        );
        await tx.query('UPDATE cart_proposals SET applied_at=clock_timestamp() WHERE id=$1', [
          proposalId,
        ]);
        await tx.query(
          "INSERT INTO ai_tool_runs(actor_id,tool,input_hash,status) VALUES($1,'apply_cart_proposal',$2,'SUCCEEDED')",
          [actor.id, hash(canonical({ proposalId, cartVersion: cart.version }))],
        );
        return this.cart.view(tx, updated);
      }),
    );
  }
  async message(
    actor: Actor,
    conversationId: string,
    input: { message: string; budget?: number; constraints?: string[] },
  ) {
    const conversation = must(
      await one(this.db.pool, 'SELECT * FROM conversations WHERE id=$1 AND user_id=$2', [
        conversationId,
        actor.id,
      ]),
    );
    if (!this.env.AI_SERVICE_URL || !this.env.AI_SERVICE_TOKEN)
      fail('AI_UNAVAILABLE', 'AI service chưa được cấu hình.', 503);
    const allowed = await this.db.tx((tx) => this.auth.rate(tx, `ai:${actor.id}`, 20, 60));
    if (!allowed) fail('RATE_LIMITED', 'Vui lòng chờ trước khi hỏi tiếp.', 429);
    const catalog = await rows(
      this.db.pool,
      `SELECT s.id AS "skuId",s.name,ss.price AS "unitPrice",b.on_hand-b.reserved AS available FROM store_skus ss
      JOIN skus s ON s.id=ss.sku_id JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=s.id
      WHERE ss.store_id=$1 AND ss.active AND s.active AND b.on_hand>b.reserved ORDER BY s.id LIMIT 100`,
      [conversation.store_id],
    );
    let reply: z.infer<typeof aiReply>;
    try {
      const response = await fetch(new URL('/chat', this.env.AI_SERVICE_URL), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.env.AI_SERVICE_TOKEN}`,
        },
        body: JSON.stringify({
          contractVersion: 1,
          message: input.message,
          context: {
            storeId: conversation.store_id,
            budget: input.budget,
            constraints: input.constraints,
          },
          catalog,
        }),
        signal: AbortSignal.timeout(this.env.AI_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('AI upstream unavailable');
      // Bound the response before buffering; do not trust Content-Length from upstream.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty upstream body');
      const chunks: Buffer[] = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) {
          await reader.cancel();
          throw new Error('Upstream body too large');
        }
        chunks.push(Buffer.from(value));
      }
      reply = aiReply.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      fail(
        'AI_UNAVAILABLE',
        'AI service chưa thể trả lời. Vui lòng thử lại hoặc tìm sản phẩm trực tiếp.',
        503,
      );
    }
    if (reply.items?.some((item) => !catalog.some((product) => product.skuId === item.skuId)))
      fail('AI_INVALID_RESPONSE', 'AI đề xuất SKU ngoài danh mục được cung cấp.', 503);
    return this.db.tx(async (tx) => {
      must(
        await one(tx, 'SELECT id FROM conversations WHERE id=$1 AND user_id=$2', [
          conversationId,
          actor.id,
        ]),
      );
      const sources = reply.documentIds.length
        ? await rows(
            tx,
            `SELECT id,title,source_uri,version FROM knowledge_documents WHERE id=ANY($1::uuid[])
        AND status='APPROVED' AND effective_at<=clock_timestamp() AND (store_id IS NULL OR store_id=$2)`,
            [reply.documentIds, conversation.store_id],
          )
        : [];
      if (sources.length !== new Set(reply.documentIds).size)
        fail('AI_INVALID_SOURCE', 'Nguồn trả lời chưa được duyệt hoặc hết hiệu lực.', 503);
      const proposal = reply.items?.length
        ? await this.makeProposal(tx, actor, {
            storeId: conversation.store_id,
            items: reply.items,
            budget: input.budget,
          })
        : null;
      await tx.query(
        "INSERT INTO messages(conversation_id,role,content) VALUES($1,'USER',$2),($1,'ASSISTANT',$3)",
        [conversationId, input.message, reply.answer],
      );
      await tx.query(
        "INSERT INTO ai_tool_runs(conversation_id,actor_id,tool,input_hash,status,model_version) VALUES($1,$2,'chat',$3,'SUCCEEDED',$4)",
        [conversationId, actor.id, hash(input.message), reply.modelVersion ?? null],
      );
      return { answer: reply.answer, sources, proposal, modelVersion: reply.modelVersion };
    });
  }
}
