import { createHash } from 'node:crypto';
import { Db } from './db';
import { loadEnv } from '../config/env';

export function seedId(name: string): string {
  const h = createHash('sha256').update(`shopgo-seed:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export async function seed(db: Db) {
  return db.tx(async (tx) => {
    for (const role of ['customer', 'picker', 'counter', 'manager', 'admin']) {
      const phone = `+8490000000${['customer', 'picker', 'counter', 'manager', 'admin'].indexOf(role)}`;
      await tx.query(
        'INSERT INTO users(id,phone_normalized,display_name,is_admin,can_refund) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [seedId(role), phone, `Demo ${role}`, role === 'admin', role === 'manager'],
      );
    }
    const categoryNames = ['Rau củ', 'Thịt cá', 'Sữa và trứng', 'Đồ khô', 'Đồ uống'];
    for (let c = 0; c < 5; c++)
      await tx.query(
        'INSERT INTO categories(id,name,slug) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [seedId(`category:${c}`), categoryNames[c], `demo-category-${c}`],
      );
    for (let s = 1; s <= 2; s++) {
      const store = seedId(`store:${s}`);
      await tx.query(
        'INSERT INTO stores(id,code,name,address) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [store, `DEMO-${s}`, `ShopGo Demo ${s}`, `Địa chỉ giả lập ${s} — chỉ dùng thử nghiệm`],
      );
      for (const role of ['picker', 'counter', 'manager'])
        await tx.query(
          'INSERT INTO store_memberships(user_id,store_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [seedId(role), store, role.toUpperCase()],
        );
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(3, 0, 0, 0);
      for (let h = 0; h < 4; h++) {
        const start = new Date(date.getTime() + h * 3600000),
          end = new Date(start.getTime() + 3600000);
        await tx.query(
          'INSERT INTO fulfillment_slots(id,store_id,starts_at,ends_at,capacity) VALUES($1,$2,$3,$4,20) ON CONFLICT DO NOTHING',
          [seedId(`slot:${s}:${start.toISOString()}`), store, start, end],
        );
      }
    }
    const names = ['Cà rốt', 'Ức gà', 'Trứng gà', 'Gạo', 'Nước suối'];
    for (let i = 0; i < 50; i++) {
      const sku = seedId(`sku:${i}`),
        product = seedId(`product:${i}`),
        name = `${names[i % 5]} Demo ${i + 1}`;
      await tx.query(
        'INSERT INTO products(id,category_id,name,description) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [
          product,
          seedId(`category:${i % 5}`),
          name,
          'Sản phẩm mẫu, không phải thông tin bán hàng thật.',
        ],
      );
      await tx.query(
        'INSERT INTO skus(id,product_id,code,barcode,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [sku, product, `SKU-${String(i + 1).padStart(3, '0')}`, `DEMO-BARCODE-${i + 1}`, name],
      );
      for (let s = 1; s <= 2; s++) {
        const store = seedId(`store:${s}`);
        const stock = i === 0 ? 0 : i === 1 ? 1 : 100;
        await tx.query(
          'INSERT INTO store_skus(store_id,sku_id,price) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [store, sku, ((i % 10) + 1) * 10000],
        );
        const created = await tx.query(
          'INSERT INTO inventory_balances(store_id,sku_id,on_hand) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING sku_id',
          [store, sku, stock],
        );
        if (created.rowCount)
          await tx.query(
            "INSERT INTO stock_movements(store_id,sku_id,delta_on_hand,delta_reserved,reason,reference_id) VALUES($1,$2,$3,0,'RECEIPT',$4)",
            [store, sku, stock, `seed:${sku}`],
          );
      }
    }
    await tx.query(
      `INSERT INTO vouchers(id,code,discount_type,value,max_discount,min_total,quota,valid_from,valid_until)
      VALUES($1,'DEMO10','PERCENT',10,50000,10000,100,now()-interval '1 day',now()+interval '30 days') ON CONFLICT DO NOTHING`,
      [seedId('voucher')],
    );
    return {
      stores: [seedId('store:1'), seedId('store:2')],
      customerPhone: '+84900000000',
      pickerPhone: '+84900000001',
      counterPhone: '+84900000002',
      managerPhone: '+84900000003',
      adminPhone: '+84900000004',
    };
  });
}
if (require.main === module) {
  const env = loadEnv();
  if (env.NODE_ENV === 'production' || env.SEED_ALLOW !== 'true')
    throw new Error('Seed requires non-production NODE_ENV and SEED_ALLOW=true');
  const db = new Db(env);
  seed(db)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => db.onModuleDestroy());
}
